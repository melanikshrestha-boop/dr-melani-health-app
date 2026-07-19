import type { Block, Database, Page, Workspace } from "./types";
import { buildDrMelaniWorkspace, DR_MELANI_EXPORT_VERSION } from "./drMelaniExport";

const KEY = "notion-like-workspace-v4-full";
const VERSION_KEY = "notion-like-export-version";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function emptyDatabase(): Database {
  const titleCol = uid();
  const statusCol = uid();
  const notesCol = uid();
  return {
    columns: [
      { id: titleCol, name: "Name", type: "title" },
      {
        id: statusCol,
        name: "Status",
        type: "select",
        options: ["Not started", "In progress", "Done"],
      },
      { id: notesCol, name: "Notes", type: "text" },
    ],
    rows: [
      {
        id: uid(),
        cells: {
          [titleCol]: "New item",
          [statusCol]: "Not started",
          [notesCol]: "",
        },
      },
    ],
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

function migrateWorkspace(ws: Workspace): Workspace {
  return {
    ...ws,
    recents: ws.recents || [ws.activePageId],
    pages: (ws.pages || []).map((p) => ({
      ...p,
      kind: p.kind || "page",
      favorite: !!p.favorite,
      trashedAt: p.trashedAt ?? null,
      cover: p.cover ?? null,
      blocks: (p.blocks || []).map((b) => ({
        ...b,
        indent: b.indent ?? 0,
      })),
    })),
  };
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
    icon: "📄",
    parentId,
    createdAt: now,
    updatedAt: now,
    blocks: [newBlock("paragraph")],
    kind: "page",
    favorite: false,
    trashedAt: null,
    cover: null,
  };
}

export function createDatabasePage(parentId: string | null = null): Page {
  const now = Date.now();
  return {
    id: uid(),
    title: "New database",
    icon: "▦",
    parentId,
    createdAt: now,
    updatedAt: now,
    blocks: [],
    kind: "database",
    database: emptyDatabase(),
    favorite: false,
    trashedAt: null,
    cover: null,
  };
}
