import { createPage, newBlock } from "../storage";
import type { BlockType, Page, Workspace } from "../types";
import {
  duplicatePage,
  movePageBefore,
  restorePage,
  setActivePage,
  softDeletePage,
} from "../workspaceOps";
import type {
  MelPageReference,
  MelWorkspaceAction,
  MelWorkspaceActionResult,
} from "./melActions";

export type AppliedMelWorkspaceAction = {
  workspace: Workspace;
  result: MelWorkspaceActionResult;
  changed: boolean;
};

const PROTECTED_PAGE_IDS = new Set(["pg-agents"]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanTitle(value: string | undefined, fallback = "Untitled"): string {
  const title = (value || "")
    .trim()
    .replace(/^["'`]+|["'`.,!?]+$/g, "")
    .trim();
  return title || fallback;
}

function pageScore(page: Page, query: string): number {
  const q = normalize(query);
  const title = normalize(page.title || "Untitled");
  if (!q) return 0;
  if (page.id.toLowerCase() === query.toLowerCase()) return 120;
  if (title === q) return 100;
  if (title.startsWith(q) || q.startsWith(title)) return 82;
  if (title.includes(q) || q.includes(title)) return 70;
  const queryWords = new Set(q.split(" ").filter(Boolean));
  const overlap = title.split(" ").filter((word) => queryWords.has(word)).length;
  return overlap ? 40 + overlap * 5 : 0;
}

function resolvePage(
  workspace: Workspace,
  reference: MelPageReference | undefined,
  includeTrash = false
): Page | undefined {
  if (!reference || reference.current) {
    return workspace.pages.find(
      (page) => page.id === workspace.activePageId && (includeTrash || !page.trashedAt)
    );
  }
  const candidates = workspace.pages.filter((page) => includeTrash || !page.trashedAt);
  if (reference.id) {
    const byId = candidates.find((page) => page.id === reference.id);
    if (byId) return byId;
  }
  if (!reference.title) return undefined;
  return candidates
    .map((page) => ({ page, score: pageScore(page, reference.title || "") }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.page.updatedAt - a.page.updatedAt)[0]?.page;
}

function fail(workspace: Workspace, summary: string): AppliedMelWorkspaceAction {
  return { workspace, changed: false, result: { ok: false, summary } };
}

function success(
  workspace: Workspace,
  summary: string,
  page?: Page,
  data?: unknown,
  changed = true
): AppliedMelWorkspaceAction {
  return {
    workspace,
    changed,
    result: {
      ok: true,
      summary,
      pageId: page?.id,
      pageTitle: page?.title,
      data,
    },
  };
}

function pageLabel(page: Page): string {
  return cleanTitle(page.title);
}

function isDescendant(workspace: Workspace, pageId: string, possibleAncestorId: string): boolean {
  let current = workspace.pages.find((page) => page.id === pageId);
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.parentId === possibleAncestorId) return true;
    current = workspace.pages.find((page) => page.id === current?.parentId);
  }
  return false;
}

function moveAfter(workspace: Workspace, movingId: string, targetId: string): Workspace {
  if (movingId === targetId) return workspace;
  const moving = workspace.pages.find((page) => page.id === movingId);
  const target = workspace.pages.find((page) => page.id === targetId);
  if (!moving || !target) return workspace;
  const pages = workspace.pages.filter((page) => page.id !== movingId);
  const targetIndex = pages.findIndex((page) => page.id === targetId);
  pages.splice(targetIndex + 1, 0, {
    ...moving,
    parentId: target.parentId,
    updatedAt: Date.now(),
  });
  return { ...workspace, pages };
}

function listPageRows(workspace: Workspace): Array<{ id: string; title: string; parent: string | null }> {
  const live = workspace.pages.filter((page) => !page.trashedAt && page.id !== "pg-agents");
  const byId = new Map(live.map((page) => [page.id, page]));
  return live.map((page) => ({
    id: page.id,
    title: pageLabel(page),
    parent: page.parentId ? byId.get(page.parentId)?.title || null : null,
  }));
}

export function applyMelWorkspaceAction(
  workspace: Workspace,
  action: Exclude<MelWorkspaceAction, { kind: "undo-workspace" }>
): AppliedMelWorkspaceAction {
  if (action.kind === "list-pages") {
    const rows = listPageRows(workspace);
    return success(workspace, `You have ${rows.length} workspace pages.`, undefined, rows, false);
  }

  if (action.kind === "create-page") {
    let parentId: string | null = null;
    if (action.asAgent) {
      parentId = "pg-agents";
    } else if (action.parent) {
      const parent = resolvePage(workspace, action.parent);
      if (!parent) return fail(workspace, `I could not find the parent page ${action.parent.title || "you named"}.`);
      parentId = parent.id;
    }
    const page = createPage(parentId);
    page.title = cleanTitle(action.title);
    if (action.asAgent) page.icon = "agent";
    if (action.content?.trim()) page.blocks = [newBlock("paragraph", action.content.trim())];
    const next = setActivePage({ ...workspace, pages: [...workspace.pages, page] }, page.id);
    return success(next, `Created ${page.title} and opened it.`, page);
  }

  const includeTrash = action.kind === "restore-page";
  const target = resolvePage(workspace, action.target, includeTrash);
  if (!target) {
    const label = action.target.title || "that page";
    return fail(workspace, `I could not find ${label} in this workspace.`);
  }

  if (action.kind === "open-page") {
    const next = setActivePage(workspace, target.id);
    return success(next, `Opened ${pageLabel(target)}.`, target, undefined, next !== workspace);
  }

  if (action.kind === "rename-page") {
    const title = cleanTitle(action.title, "");
    if (!title) return fail(workspace, "A page title cannot be empty.");
    const now = Date.now();
    const pages = workspace.pages.map((page) => {
      if (page.id === target.id) return { ...page, title, updatedAt: now };
      const blocks = page.blocks.map((block) =>
        block.type === "page_link" && block.pageId === target.id
          ? { ...block, text: title }
          : block
      );
      return blocks.some((block, index) => block !== page.blocks[index])
        ? { ...page, blocks, updatedAt: now }
        : page;
    });
    const renamed = { ...target, title, updatedAt: now };
    return success({ ...workspace, pages }, `Renamed ${pageLabel(target)} to ${title}.`, renamed);
  }

  if (action.kind === "trash-page") {
    if (PROTECTED_PAGE_IDS.has(target.id)) return fail(workspace, `${pageLabel(target)} is a protected workspace hub.`);
    const next = softDeletePage(workspace, target.id);
    if (next === workspace || !next.pages.find((page) => page.id === target.id)?.trashedAt) {
      return fail(workspace, `${pageLabel(target)} could not be moved to Trash.`);
    }
    return success(next, `Moved ${pageLabel(target)} to Trash. Say "undo that" to restore it.`, target);
  }

  if (action.kind === "restore-page") {
    if (!target.trashedAt) return success(workspace, `${pageLabel(target)} is already restored.`, target, undefined, false);
    const next = restorePage(workspace, target.id);
    return success(next, `Restored ${pageLabel(target)} and opened it.`, target);
  }

  if (action.kind === "duplicate-page") {
    const next = duplicatePage(workspace, target.id);
    const copy = next.pages.find((page) => page.id === next.activePageId);
    if (!copy || copy.id === target.id) return fail(workspace, `${pageLabel(target)} could not be duplicated.`);
    return success(next, `Duplicated ${pageLabel(target)} as ${pageLabel(copy)} and opened it.`, copy);
  }

  if (action.kind === "move-page") {
    const destination = resolvePage(workspace, action.destination);
    if (!destination) return fail(workspace, `I could not find ${action.destination.title || "the destination page"}.`);
    if (target.id === destination.id) return fail(workspace, "A page cannot be moved relative to itself.");
    if (isDescendant(workspace, destination.id, target.id)) {
      return fail(workspace, `${pageLabel(target)} cannot be moved inside one of its own sub-pages.`);
    }
    let next: Workspace;
    if (action.position === "inside") {
      next = {
        ...workspace,
        pages: workspace.pages.map((page) =>
          page.id === target.id
            ? { ...page, parentId: destination.id, updatedAt: Date.now() }
            : page
        ),
      };
    } else if (action.position === "before") {
      next = movePageBefore(workspace, target.id, destination.id);
    } else {
      next = moveAfter(workspace, target.id, destination.id);
    }
    const relation = action.position === "inside" ? "inside" : action.position;
    return success(next, `Moved ${pageLabel(target)} ${relation} ${pageLabel(destination)}.`, target);
  }

  if (action.kind === "write-page") {
    const content = action.content.trim();
    if (!content) return fail(workspace, "There is no text to write.");
    const blockType = (action.blockType || "paragraph") as BlockType;
    const written = newBlock(blockType, content);
    const onlyBlank = target.blocks.length === 1 && !target.blocks[0]?.text.trim();
    const blocks = action.mode === "replace"
      ? [written]
      : onlyBlank
        ? [written]
        : [...target.blocks, written];
    const updated = { ...target, blocks, updatedAt: Date.now() };
    const next = {
      ...workspace,
      pages: workspace.pages.map((page) => (page.id === target.id ? updated : page)),
      activePageId: target.id,
    };
    const verb = action.mode === "replace" ? "Replaced the content on" : "Added that to";
    return success(next, `${verb} ${pageLabel(target)}.`, updated);
  }

  if (action.kind === "clear-page") {
    const updated = {
      ...target,
      blocks: [newBlock("paragraph", "")],
      updatedAt: Date.now(),
    };
    const next = {
      ...workspace,
      pages: workspace.pages.map((page) => (page.id === target.id ? updated : page)),
      activePageId: target.id,
    };
    return success(
      next,
      `Cleared ${pageLabel(target)}. Say "undo that" to restore its content.`,
      updated
    );
  }

  if (action.kind === "favorite-page") {
    const updated = { ...target, favorite: action.favorite, updatedAt: Date.now() };
    const next = {
      ...workspace,
      pages: workspace.pages.map((page) => (page.id === target.id ? updated : page)),
    };
    return success(next, `${action.favorite ? "Favorited" : "Unfavorited"} ${pageLabel(target)}.`, updated);
  }

  return fail(workspace, "That workspace action is not implemented.");
}
