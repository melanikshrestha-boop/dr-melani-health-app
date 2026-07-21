import type { Block, Database, Page, Workspace } from "./types";
import { buildDrMelaniWorkspace, DR_MELANI_EXPORT_VERSION } from "./drMelaniExport";

const KEY = "notion-like-workspace-v4-full";
const VERSION_KEY = "notion-like-export-version";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Truly empty table. No seed rows. No Status/Notes junk. */
export function emptyDatabase(): Database {
  const titleCol = uid();
  return {
    columns: [{ id: titleCol, name: "Name", type: "title" }],
    rows: [],
  };
}

export function newBlock(type: Block["type"] = "paragraph", text = ""): Block {
  return {
    id: uid(),
    type,
    text,
    checked: type === "todo" ? false : undefined,
    open: type === "toggle" ? true : undefined,
    indent: 0,
    children: type === "toggle" ? [newBlock("paragraph")] : undefined,
  };
}

export function defaultWorkspace(): Workspace {
  const ws = buildDrMelaniWorkspace() as Workspace;
  return migrateWorkspace(ws);
}

/** Pages that should exist for Notion-style sidebar (never wipe user pages) */
const SIDEBAR_EXTRA_PAGES: {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
}[] = [
  {
    id: "pg-agents",
    title: "Agents",
    icon: "🤖",
    parentId: null,
  },
  {
    id: "pg-library",
    title: "Bookshelf",
    icon: "📚",
    parentId: null,
  },
  {
    id: "pg-my-tasks",
    title: "My Tasks",
    icon: "✅",
    parentId: null,
  },
  {
    id: "pg-help",
    title: "Help",
    icon: "❓",
    parentId: null,
  },
  {
    id: "pg-fashion-os",
    title: "Wardrobe",
    icon: "fashion",
    parentId: "pg-agents",
  },
  {
    id: "pg-agent-weather",
    title: "Weather",
    icon: "weather",
    parentId: "pg-agents",
  },
  {
    id: "pg-agent-gmail",
    title: "Gmail",
    icon: "✉",
    parentId: "pg-agents",
  },
  {
    id: "pg-agent-shopping",
    title: "Shopping",
    icon: "🛒",
    parentId: "pg-agents",
  },
];

/** Pages user asked removed from sidebar permanently */
const PURGE_PAGE_IDS = new Set([
  "pg-home",
  "pg-books",
  "pg-book-innovators",
  "pg-book-photo",
  "pg-body", // Body: weight lives under Gym
  "pg-tests", // Upcoming tests
  "pg-doctor", // My doctor
  "pg-goals", // Goals Tracker
  "pg-todo", // To Do List
  "pg-journal", // Journal
  "pg-75hard", // 75 Hard (not part of the core workspace)
  "pg-personal-life", // Personal Life (kept out of the main tree)
  "pg-neurotech", // Neurotech
  "pg-openneuro", // Downloading OpenNeuro
  "pg-doc-hub", // Document Hub
  "pg-meetings", // Meetings
  "pg-classes", // Classes
  "pg-content", // Content OS
  "pg-finance", // Finance
  "pg-startups", // Startups / Silicon Valley
  "pg-reading-list", // Reading list
  "pg-wearables", // Wearables (WHOOP etc.) — not needed as a page
  "pg-profile",
  "pg-period",
  "pg-period-tracker",
  "pg-labs",
  "pg-analytics", // Health Analytics dump page
]);

/** Exact titles to kill (user-made dupes under Data, etc.) */
const PURGE_PAGE_TITLES = new Set([
  "profile",
  "period tracker",
  "period",
  "labs",
  "wearables",
  "health analytics",
  "new database",
]);

function shouldPurgePage(p: {
  id: string;
  title?: string;
  kind?: string;
  database?: { rows?: unknown[]; columns?: { name?: string }[] };
}): boolean {
  if (PURGE_PAGE_IDS.has(p.id)) return true;
  const t = (p.title || "").trim().toLowerCase();
  if (PURGE_PAGE_TITLES.has(t)) return true;
  // Kill empty stub databases (Name / Status / Notes + New item junk)
  if (p.kind === "database") {
    const names = (p.database?.columns || [])
      .map((c) => (c.name || "").toLowerCase())
      .join("|");
    if (
      names.includes("status") &&
      names.includes("notes") &&
      (t === "" || t === "new database" || t === "untitled")
    ) {
      return true;
    }
  }
  return false;
}

function purgeRemovedPages(ws: Workspace): Workspace {
  const pages = ws.pages.filter((p) => !shouldPurgePage(p));
  if (pages.length === ws.pages.length) return ws;
  let activePageId = ws.activePageId;
  if (shouldPurgePage({ id: activePageId, title: ws.pages.find((x) => x.id === activePageId)?.title })) {
    activePageId = pages.find((p) => !p.trashedAt)?.id || pages[0]?.id || activePageId;
  }
  return {
    ...ws,
    pages,
    activePageId,
    recents: (ws.recents || []).filter((id) => pages.some((p) => p.id === id)),
  };
}

function ensureSidebarPages(ws: Workspace): Workspace {
  const now = Date.now();
  const ids = new Set(ws.pages.map((p) => p.id));
  const extra: Page[] = [];
  for (const spec of SIDEBAR_EXTRA_PAGES) {
    if (ids.has(spec.id)) continue;
    // Never re-add purged pages
    if (PURGE_PAGE_IDS.has(spec.id)) continue;
    extra.push({
      id: spec.id,
      title: spec.title,
      icon: spec.icon,
      parentId: spec.parentId,
      createdAt: now,
      updatedAt: now,
      blocks: [newBlock("paragraph", "")],
      kind: "page",
      favorite: false,
      trashedAt: null,
      cover: null,
    });
  }
  const pages = [...ws.pages, ...extra].map((page) =>
    page.id === "pg-library" ? { ...page, title: "Bookshelf", icon: "books" } : page
  );
  if (!extra.length && pages.every((page, index) => page === ws.pages[index])) return ws;
  return { ...ws, pages };
}

function cleanWorkPageBlocks(blocks: Block[]): Block[] {
  // Drop seed fluff: duplicate H1 "Work", intro paragraph about Dr. Melani tab
  return blocks.filter((b) => {
    const t = (b.text || "").trim();
    if (b.type === "heading1" && /^work$/i.test(t)) return false;
    if (
      b.type === "paragraph" &&
      /from dr\.?\s*melani work tab/i.test(t)
    )
      return false;
    // normalize old em dashes in todos to colon
    return true;
  }).map((b) => ({
    ...b,
    text: (b.text || "")
      .replace(/\u2014/g, ":")
      .replace(/\u2013/g, "-")
      .replace(/—/g, ":")
      .replace(/–/g, "-"),
    indent: b.indent ?? 0,
  }));
}

/** Ensure Life hub exists and Books nests under it (leisure writing docs) */
function ensureLifePages(ws: Workspace): Workspace {
  const now = Date.now();
  let pages = [...ws.pages];
  const byId = new Map(pages.map((p) => [p.id, p]));

  // Top-level Life (sidebar toggle)
  if (!byId.has("pg-life")) {
    pages.push({
      id: "pg-life",
      title: "Life",
      icon: "life",
      parentId: null,
      createdAt: now,
      updatedAt: now,
      blocks: [newBlock("paragraph", "")],
      kind: "page",
      favorite: false,
      trashedAt: null,
      cover: null,
    });
  }

  // Books under Life — free Notion/Google-Docs style page
  const books = pages.find((p) => p.id === "pg-books");
  if (!books) {
    pages.push({
      id: "pg-books",
      title: "Books",
      icon: "📚",
      parentId: "pg-life",
      createdAt: now,
      updatedAt: now,
      blocks: [newBlock("paragraph", "")],
      kind: "page",
      favorite: false,
      trashedAt: null,
      cover: null,
    });
  } else {
    // Re-parent under Life if it was a top-level page
    pages = pages.map((p) =>
      p.id === "pg-books" && p.parentId !== "pg-life"
        ? { ...p, parentId: "pg-life", title: p.title || "Books", updatedAt: now }
        : p
    );
  }

  // Life stays top-level
  pages = pages.map((p) =>
    p.id === "pg-life" ? { ...p, parentId: null, title: "Life" } : p
  );

  const wardrobe = pages.find((p) => p.id === "pg-fashion-os");
  if (!wardrobe) {
    pages.push({
      id: "pg-fashion-os",
      title: "Wardrobe",
      icon: "fashion",
      parentId: "pg-agents",
      createdAt: now,
      updatedAt: now,
      blocks: [newBlock("paragraph", "Your clothes, extracted and organized.")],
      kind: "page",
      favorite: false,
      trashedAt: null,
      cover: null,
    });
  } else {
    pages = pages.map((p) => p.id === "pg-fashion-os"
      ? { ...p, title: "Wardrobe", icon: "fashion", parentId: "pg-agents", trashedAt: null }
      : p);
  }

  return { ...ws, pages };
}

function migrateWorkspace(ws: Workspace): Workspace {
  // Workspace display name (sidebar top) — Wonder, not Dr. Melani
  const name =
    !ws.name ||
    /^dr\.?\s*melani$/i.test(ws.name.trim()) ||
    ws.name.trim() === "Dr Melani"
      ? "Wonder"
      : ws.name;

  const base: Workspace = {
    ...ws,
    name,
    recents: ws.recents || [ws.activePageId],
    pages: (ws.pages || []).map((p) => {
      let blocks: Block[] = (p.blocks || []).map((b) => ({
        ...b,
        indent: b.indent ?? 0,
      }));
      if (p.id === "pg-work") {
        blocks = cleanWorkPageBlocks(blocks);
        if (!blocks.length) blocks = [newBlock("paragraph", "")];
      }
      return {
        ...p,
        kind: p.kind || "page",
        favorite: !!p.favorite,
        trashedAt: p.trashedAt ?? null,
        cover: p.cover ?? null,
        blocks,
      };
    }),
  };
  // Keep your tree; add Life → Books; extras; drop purged pages
  return purgeRemovedPages(ensureSidebarPages(ensureLifePages(base)));
}

export function forceImportDrMelani(): Workspace {
  const ws = migrateWorkspace(buildDrMelaniWorkspace() as Workspace);
  saveWorkspace(ws);
  try {
    localStorage.setItem(VERSION_KEY, String(DR_MELANI_EXPORT_VERSION));
  } catch {
    /* ignore */
  }
  return ws;
}

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // Prefer v2 if user already imported Dr. Melani
      const v2 = localStorage.getItem("notion-like-workspace-v2-dr-melani");
      if (v2) {
        const data = migrateWorkspace(JSON.parse(v2) as Workspace);
        saveWorkspace(data);
        return data;
      }
      return forceImportDrMelani();
    }
    const data = migrateWorkspace(JSON.parse(raw) as Workspace);
    if (!data.pages?.length) return forceImportDrMelani();
    return data;
  } catch {
    return forceImportDrMelani();
  }
}

export function saveWorkspace(ws: Workspace): void {
  localStorage.setItem(KEY, JSON.stringify(ws));
}

export function createPage(parentId: string | null = null): Page {
  const now = Date.now();
  return {
    id: uid(),
    title: "",
    icon: "",
    parentId,
    createdAt: now,
    updatedAt: now,
    // One blank line — no starter fluff
    blocks: [newBlock("paragraph", "")],
    kind: "page",
    favorite: false,
    trashedAt: null,
    cover: null,
  };
}

/** Prefer createPage. If a database is ever needed, it starts blank (no demo rows). */
export function createDatabasePage(parentId: string | null = null): Page {
  const now = Date.now();
  return {
    id: uid(),
    title: "",
    icon: "",
    parentId,
    createdAt: now,
    updatedAt: now,
    blocks: [newBlock("paragraph", "")],
    // Normal page — never auto-spawn the ugly Name/Status/Notes stub table
    kind: "page",
    favorite: false,
    trashedAt: null,
    cover: null,
  };
}
