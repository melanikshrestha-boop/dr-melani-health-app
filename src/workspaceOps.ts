import type { Block, Page, Workspace } from "./types";
import { createDatabasePage, createPage, newBlock, uid } from "./storage";

export function activePages(ws: Workspace): Page[] {
  return ws.pages.filter((p) => !p.trashedAt);
}

export function trashedPages(ws: Workspace): Page[] {
  return ws.pages.filter((p) => !!p.trashedAt);
}

export function getPage(ws: Workspace, id: string): Page | undefined {
  return ws.pages.find((p) => p.id === id);
}

export function breadcrumbTrail(ws: Workspace, pageId: string): Page[] {
  const trail: Page[] = [];
  let cur = getPage(ws, pageId);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    trail.unshift(cur);
    cur = cur.parentId ? getPage(ws, cur.parentId) : undefined;
  }
  return trail;
}

export function pushRecent(ws: Workspace, pageId: string): Workspace {
  const prev = (ws.recents || []).filter((id) => id !== pageId);
  return { ...ws, recents: [pageId, ...prev].slice(0, 12) };
}

export function setActivePage(ws: Workspace, pageId: string): Workspace {
  if (!ws.pages.some((p) => p.id === pageId && !p.trashedAt)) return ws;
  return pushRecent({ ...ws, activePageId: pageId }, pageId);
}

export function updatePageInWs(ws: Workspace, page: Page): Workspace {
  return {
    ...ws,
    pages: ws.pages.map((p) => (p.id === page.id ? page : p)),
  };
}

export function softDeletePage(ws: Workspace, id: string): Workspace {
  const live = activePages(ws);
  if (live.length <= 1 && live[0]?.id === id) return ws;

  const toTrash = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of ws.pages) {
      if (p.parentId && toTrash.has(p.parentId) && !toTrash.has(p.id)) {
        toTrash.add(p.id);
        grew = true;
      }
    }
  }

  const now = Date.now();
  const pages = ws.pages.map((p) =>
    toTrash.has(p.id) ? { ...p, trashedAt: now, favorite: false } : p
  );
  let activePageId = ws.activePageId;
  if (toTrash.has(activePageId)) {
    activePageId =
      pages.find((p) => !p.trashedAt)?.id || pages[0]?.id || activePageId;
  }
  return {
    ...ws,
    pages,
    activePageId,
    recents: (ws.recents || []).filter((r) => !toTrash.has(r)),
  };
}

export function restorePage(ws: Workspace, id: string): Workspace {
  const page = getPage(ws, id);
  if (!page) return ws;
  // restore page + ancestors so it has a path
  const restore = new Set<string>([id]);
  let cur = page;
  while (cur.parentId) {
    restore.add(cur.parentId);
    const parent = getPage(ws, cur.parentId);
    if (!parent) break;
    cur = parent;
  }
  const pages = ws.pages.map((p) =>
    restore.has(p.id) ? { ...p, trashedAt: null } : p
  );
  return setActivePage({ ...ws, pages }, id);
}

export function permanentlyDelete(ws: Workspace, id: string): Workspace {
  const drop = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of ws.pages) {
      if (p.parentId && drop.has(p.parentId) && !drop.has(p.id)) {
        drop.add(p.id);
        grew = true;
      }
    }
  }
  const pages = ws.pages.filter((p) => !drop.has(p.id));
  if (!pages.length) return ws;
  let activePageId = ws.activePageId;
  if (drop.has(activePageId)) {
    activePageId = pages.find((p) => !p.trashedAt)?.id || pages[0].id;
  }
  return {
    ...ws,
    pages,
    activePageId,
    recents: (ws.recents || []).filter((r) => !drop.has(r)),
  };
}

export function emptyTrash(ws: Workspace): Workspace {
  const pages = ws.pages.filter((p) => !p.trashedAt);
  if (!pages.length) return ws;
  let activePageId = ws.activePageId;
  if (!pages.some((p) => p.id === activePageId)) {
    activePageId = pages[0].id;
  }
  return { ...ws, pages, activePageId };
}

export function toggleFavorite(ws: Workspace, id: string): Workspace {
  return {
    ...ws,
    pages: ws.pages.map((p) =>
      p.id === id ? { ...p, favorite: !p.favorite, updatedAt: Date.now() } : p
    ),
  };
}

export function duplicatePage(ws: Workspace, id: string): Workspace {
  const src = getPage(ws, id);
  if (!src || src.trashedAt) return ws;
  const copy: Page = {
    ...JSON.parse(JSON.stringify(src)),
    id: uid(),
    title: `${src.title.trim() || "Untitled"} (copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    trashedAt: null,
    favorite: false,
  };
  // re-id blocks
  copy.blocks = (copy.blocks || []).map((b: Block) => ({
    ...b,
    id: uid(),
  }));
  if (copy.database) {
    copy.database = {
      columns: copy.database.columns.map((c) => ({ ...c, id: uid() })),
      rows: copy.database.rows.map((r) => ({ ...r, id: uid() })),
    };
  }
  return setActivePage(
    { ...ws, pages: [...ws.pages, copy] },
    copy.id
  );
}

/** Notion: New page nested under current page */
export function addChildPage(ws: Workspace, parentId: string | null): Workspace {
  const page = createPage(parentId);
  return setActivePage({ ...ws, pages: [...ws.pages, page] }, page.id);
}

export function addDatabasePage(ws: Workspace, parentId: string | null): Workspace {
  const page = createDatabasePage(parentId);
  return setActivePage({ ...ws, pages: [...ws.pages, page] }, page.id);
}

/** Insert a page_link block and create the child page */
export function createSubpageFromBlock(
  ws: Workspace,
  parentPageId: string,
  blockIndex: number
): Workspace {
  const parent = getPage(ws, parentPageId);
  if (!parent) return ws;
  const child = createPage(parentPageId);
  child.title = "Untitled";
  const linkBlock: Block = {
    ...newBlock("page_link", child.title),
    pageId: child.id,
    text: child.title,
  };
  const blocks = [...parent.blocks];
  // replace current empty block or insert
  if (blocks[blockIndex] && !blocks[blockIndex].text) {
    blocks[blockIndex] = linkBlock;
  } else {
    blocks.splice(blockIndex + 1, 0, linkBlock);
  }
  const updatedParent = {
    ...parent,
    blocks,
    updatedAt: Date.now(),
  };
  return setActivePage(
    {
      ...ws,
      pages: [...ws.pages.map((p) => (p.id === parentPageId ? updatedParent : p)), child],
    },
    child.id
  );
}

export function searchPages(ws: Workspace, query: string): Page[] {
  const q = query.trim().toLowerCase();
  const live = activePages(ws);
  if (!q) return live.slice(0, 20);
  return live
    .map((p) => {
      const title = (p.title || "").toLowerCase();
      const body = (p.blocks || [])
        .map((b) => b.text || "")
        .join(" ")
        .toLowerCase();
      let score = 0;
      if (title === q) score += 100;
      else if (title.startsWith(q)) score += 50;
      else if (title.includes(q)) score += 30;
      if (body.includes(q)) score += 10;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p)
    .slice(0, 30);
}

export function moveBlock(
  blocks: Block[],
  fromIndex: number,
  toIndex: number
): Block[] {
  if (fromIndex === toIndex) return blocks;
  if (fromIndex < 0 || fromIndex >= blocks.length) return blocks;
  const next = [...blocks];
  const [item] = next.splice(fromIndex, 1);
  const clamped = Math.max(0, Math.min(toIndex, next.length));
  next.splice(clamped, 0, item);
  return next;
}
