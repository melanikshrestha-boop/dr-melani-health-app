import type { Block, Page, Workspace } from "./types";

const KEY = "notion-like-workspace-v1";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function newBlock(type: Block["type"] = "paragraph", text = ""): Block {
  return {
    id: uid(),
    type,
    text,
    checked: type === "todo" ? false : undefined,
    open: type === "toggle" ? true : undefined,
    children: type === "toggle" ? [newBlock("paragraph")] : undefined,
  };
}

function seedPages(): Page[] {
  const now = Date.now();
  const homeId = uid();
  const gettingStartedId = uid();
  const tasksId = uid();
  const notesId = uid();

  return [
    {
      id: homeId,
      title: "Home",
      icon: "🏠",
      parentId: null,
      createdAt: now,
      updatedAt: now,
      blocks: [
        newBlock(
          "paragraph",
          "Welcome. This workspace is built to look and feel like Notion — sidebar, pages, and blocks."
        ),
        newBlock("heading2", "Quick start"),
        newBlock("bullet", "Click any page in the left sidebar"),
        newBlock("bullet", "Type / in an empty line for block types"),
        newBlock("bullet", "Press Enter for a new block · Backspace on empty to delete"),
        newBlock("divider"),
        newBlock("callout", "Your pages save in this browser automatically."),
      ],
    },
    {
      id: gettingStartedId,
      title: "Getting Started",
      icon: "✨",
      parentId: null,
      createdAt: now,
      updatedAt: now,
      blocks: [
        newBlock("heading1", "Getting started"),
        newBlock(
          "paragraph",
          "Notion is pages made of blocks. Each line is a block you can turn into a heading, list, todo, and more."
        ),
        newBlock("heading2", "Try these"),
        newBlock("todo", "Rename this page title at the top"),
        newBlock("todo", "Add a new page with + New page in the sidebar"),
        newBlock("todo", "Type /quote or /h1 on a blank line"),
        newBlock("quote", "The best way to predict the future is to invent it."),
      ],
    },
    {
      id: tasksId,
      title: "Tasks",
      icon: "✅",
      parentId: null,
      createdAt: now,
      updatedAt: now,
      blocks: [
        newBlock("heading2", "Today"),
        newBlock("todo", "Review labs"),
        newBlock("todo", "Gym — lower body"),
        newBlock("todo", "Read 10 pages"),
        newBlock("heading2", "Later"),
        newBlock("todo", "Ship neurotech prototype notes"),
      ],
    },
    {
      id: notesId,
      title: "Notes",
      icon: "📝",
      parentId: null,
      createdAt: now,
      updatedAt: now,
      blocks: [
        newBlock("paragraph", "Empty page — start typing…"),
      ],
    },
  ];
}

export function defaultWorkspace(): Workspace {
  const pages = seedPages();
  return {
    name: "Melani's Workspace",
    pages,
    activePageId: pages[0].id,
    sidebarOpen: true,
  };
}

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultWorkspace();
    const data = JSON.parse(raw) as Workspace;
    if (!data.pages?.length) return defaultWorkspace();
    return data;
  } catch {
    return defaultWorkspace();
  }
}

export function saveWorkspace(ws: Workspace): void {
  localStorage.setItem(KEY, JSON.stringify(ws));
}

export function createPage(parentId: string | null = null): Page {
  const now = Date.now();
  return {
    id: uid(),
    title: "Untitled",
    icon: "📄",
    parentId,
    createdAt: now,
    updatedAt: now,
    blocks: [newBlock("paragraph")],
  };
}

export { uid };
