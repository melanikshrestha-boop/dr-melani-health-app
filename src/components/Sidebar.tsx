import { useEffect, useRef, useState } from "react";
import type { Page } from "../types";
import { iconForPage, MinimalIcon } from "./MinimalIcon";
import {
  MEL_SIDEBAR_ACTION_EVENT,
  type MelSidebarActionRequest,
} from "../melani/melActions";

type Props = {
  workspaceName: string;
  pages: Page[];
  allPages: Page[];
  recents: string[];
  activePageId: string;
  open: boolean;
  onSelect: (id: string) => void;
  onNewPage: () => void;
  onNewTopPage: () => void;
  /** @deprecated Never spawn stub Name/Status/Notes databases */
  onNewDatabase?: () => void;
  onNewAgent: () => void;
  onDeletePage: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onMovePage: (
    movingId: string,
    targetId: string,
    position?: "before" | "inside"
  ) => void;
  onOpenSearch: () => void;
  onClose: () => void;
  onRestorePage?: (id: string) => void;
  onEmptyTrash?: () => void;
  onReimport?: () => void;
};

const COLLAPSE_KEY = "dr-melani-sidebar-collapsed";
const COLLAPSE_VERSION_KEY = "dr-melani-sidebar-collapse-version";
const TRASH_KEY = "dr-melani-show-trash";

// Pages that live in other sidebar sections (not under Private tree)
const SIDEBAR_UTILITY_IDS = new Set([
  "pg-agents",
  "pg-help",
]);

function loadCollapsed(): Record<string, boolean> {
  const defaults = {
    "pg-fitness": true,
    "pg-hygiene": true,
    "pg-life": true,
    "pg-books": true,
  };
  try {
    if (localStorage.getItem(COLLAPSE_VERSION_KEY) !== "2") {
      localStorage.setItem(COLLAPSE_VERSION_KEY, "2");
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) as Record<string, boolean> };
  } catch {
    /* ignore */
  }
  return defaults;
}

function saveCollapsed(map: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function loadFlag(key: string, defaultOn: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* ignore */
  }
  return defaultOn;
}

function saveFlag(key: string, show: boolean) {
  try {
    localStorage.setItem(key, show ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function PageIcon({ page }: { page: Page }) {
  // Always use your minimal line icons — never page emojis in the sidebar
  return (
    <span className="side-icon" aria-hidden>
      <MinimalIcon name={iconForPage(page)} size={16} />
    </span>
  );
}

function PageTreeItem({
  page,
  pages,
  activePageId,
  depth,
  collapsed,
  onToggleCollapse,
  onSelect,
  onDeletePage,
  onToggleFavorite,
  onMovePage,
}: {
  page: Page;
  pages: Page[];
  activePageId: string;
  depth: number;
  collapsed: Record<string, boolean>;
  onToggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
  onDeletePage: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onMovePage: (
    movingId: string,
    targetId: string,
    position?: "before" | "inside"
  ) => void;
}) {
  const kids = pages.filter((p) => p.parentId === page.id);
  const hasKids = kids.length > 0;
  const isCollapsed = hasKids && collapsed[page.id] !== false;
  const lastTapAt = useRef(0);
  const nestTimer = useRef<number | null>(null);
  const dropIntent = useRef<"before" | "inside">("before");
  const [dropState, setDropState] = useState<"before" | "inside" | null>(null);

  function clearDropState() {
    if (nestTimer.current !== null) window.clearTimeout(nestTimer.current);
    nestTimer.current = null;
    dropIntent.current = "before";
    setDropState(null);
  }

  function beginDropState() {
    if (nestTimer.current !== null || dropState) return;
    dropIntent.current = "before";
    setDropState("before");
    nestTimer.current = window.setTimeout(() => {
      dropIntent.current = "inside";
      setDropState("inside");
      nestTimer.current = null;
    }, 650);
  }

  return (
    <div className="page-tree-node">
      <div
        className={`page-row${page.id === activePageId ? " is-active" : ""}${
          hasKids ? " has-kids" : ""
        }${hasKids && !isCollapsed ? " is-open" : ""}${
          dropState === "inside" ? " is-nest-target" : ""
        }${dropState === "before" ? " is-reorder-target" : ""}`}
        style={{ paddingLeft: depth * 12 }}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/wonder-page", page.id);
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          beginDropState();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          beginDropState();
        }}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
          clearDropState();
        }}
        onDrop={(event) => {
          event.preventDefault();
          const movingId = event.dataTransfer.getData("text/wonder-page");
          const position = dropIntent.current;
          clearDropState();
          if (movingId && movingId !== page.id) onMovePage(movingId, page.id, position);
        }}
        onDragEnd={clearDropState}
      >
        {/* No visible toggle. Single tap opens; double tap expands/collapses. */}
        <span className="page-collapse-spacer" aria-hidden />
        <button
          type="button"
          className={`page-row-main${hasKids ? " has-kids" : ""}`}
          aria-expanded={hasKids ? !isCollapsed : undefined}
          title={
            hasKids
              ? "Open page. Double-tap to show or hide sub-pages."
              : undefined
          }
          onClick={() => {
            const now = Date.now();
            const doubleTap = now - lastTapAt.current <= 360;
            lastTapAt.current = doubleTap ? 0 : now;
            onSelect(page.id);
            if (hasKids && doubleTap) onToggleCollapse(page.id);
          }}
        >
          <PageIcon page={page} />
          <span className="page-title-side">
            {page.title.trim() || "Untitled"}
          </span>
        </button>
        <div className="page-row-actions">
          <button
            type="button"
            className="page-mini-btn"
            title={page.favorite ? "Unfavorite" : "Favorite"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(page.id);
            }}
          >
            {page.favorite ? "★" : "☆"}
          </button>
          <button
            type="button"
            className="page-mini-btn"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              if (pages.length <= 1) return;
              onDeletePage(page.id);
            }}
          >
            ×
          </button>
        </div>
      </div>

      {hasKids && (
        <div
          className={`page-tree-kids${isCollapsed ? " is-collapsed" : ""}`}
        >
          <div className="page-tree-kids-inner">
            {kids.map((child) => (
              <PageTreeItem
                key={child.id}
                page={child}
                pages={pages}
                activePageId={activePageId}
                depth={depth + 1}
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                onSelect={onSelect}
                onDeletePage={onDeletePage}
                onToggleFavorite={onToggleFavorite}
                onMovePage={onMovePage}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  workspaceName,
  pages,
  allPages,
  activePageId,
  open,
  onSelect,
  onNewPage,
  onNewAgent,
  onDeletePage,
  onToggleFavorite,
  onMovePage,
  onOpenSearch,
  onClose,
  onRestorePage,
  onEmptyTrash,
  onReimport,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    loadCollapsed
  );
  const [showTrash, setShowTrash] = useState(() => loadFlag(TRASH_KEY, false));

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: prev[id] === false };
      saveCollapsed(next);
      return next;
    });
  }

  useEffect(() => {
    const controlSidebar = (event: Event) => {
      const request = (event as CustomEvent<MelSidebarActionRequest>).detail;
      if (!request?.action) return;

      const parentPages = pages.filter((page) =>
        pages.some((candidate) => candidate.parentId === page.id)
      );

      if (request.action.kind === "collapse-all") {
        const next = Object.fromEntries(parentPages.map((page) => [page.id, true]));
        setCollapsed(next);
        saveCollapsed(next);
        setShowTrash(false);
        saveFlag(TRASH_KEY, false);
        request.result = {
          ok: true,
          summary: `Closed all ${parentPages.length} sidebar sections. They will stay closed until you double-tap one.`,
          data: { count: parentPages.length },
        };
        return;
      }

      const query = request.action.target.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const target = parentPages
        .map((page) => {
          const title = page.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
          const score = title === query ? 100 : title.includes(query) || query.includes(title) ? 70 : 0;
          return { page, score };
        })
        .sort((a, b) => b.score - a.score)[0];
      if (!target?.score) {
        request.result = {
          ok: false,
          summary: `I could not find a sidebar section matching ${request.action.target}.`,
        };
        return;
      }

      const shouldCollapse = request.action.collapsed;
      setCollapsed((previous) => {
        const next = { ...previous, [target.page.id]: shouldCollapse };
        saveCollapsed(next);
        return next;
      });
      request.result = {
        ok: true,
        summary: `${shouldCollapse ? "Closed" : "Opened"} the ${target.page.title} sidebar section.`,
        pageId: target.page.id,
        pageTitle: target.page.title,
      };
    };

    window.addEventListener(MEL_SIDEBAR_ACTION_EVENT, controlSidebar);
    return () => window.removeEventListener(MEL_SIDEBAR_ACTION_EVENT, controlSidebar);
  }, [pages]);


  function toggleTrash() {
    setShowTrash((prev) => {
      const next = !prev;
      saveFlag(TRASH_KEY, next);
      return next;
    });
  }

  // Only child agents under the hidden hub (pg-agents itself is never listed)
  const agentPages = pages.filter((p) => p.parentId === "pg-agents");

  // Private tree = top-level pages you already have (minus home / agents / bottom utils)
  const privateTop = pages.filter(
    (p) => p.parentId === null && !SIDEBAR_UTILITY_IDS.has(p.id)
  );

  const help = pages.find((p) => p.id === "pg-help");
  const trash = allPages.filter((p) => !!p.trashedAt);

  return (
    <aside className={`sidebar${open ? "" : " is-closed"}`} aria-label="Sidebar">
      {/* Workspace name — like “Disciplined” */}
      <div className="sidebar-top">
        <button type="button" className="workspace-btn" title={workspaceName}>
          <span className="workspace-avatar" aria-hidden>
            {(workspaceName || "D").trim().charAt(0).toUpperCase()}
          </span>
          <span className="workspace-name">{workspaceName}</span>
        </button>
        <button type="button" className="sidebar-icon-btn" onClick={onClose}>
          «
        </button>
      </div>

      {/* Search is the only control above Agents. */}
      <div className="sidebar-home-row">
        <button
          type="button"
          className="sidebar-tool-btn"
          title="Search (⌘K)"
          onClick={onOpenSearch}
        >
          <MinimalIcon name="search" size={15} />
        </button>
      </div>

      {/* ── Agents — only real agents (no “Agents” hub page in the list) ── */}
      <div className="sidebar-section-label">Agents</div>
      <div className="sidebar-block">
        {agentPages.map((p) => (
          <div
            key={p.id}
            className={`page-row page-row-agent${
              p.id === activePageId ? " is-active" : ""
            }`}
            draggable
            onDragStart={(event) => event.dataTransfer.setData("text/wonder-page", p.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const movingId = event.dataTransfer.getData("text/wonder-page");
              if (movingId) onMovePage(movingId, p.id);
            }}
          >
            {/* spacer so icon lines up with Private pages (chevron column) */}
            <span className="page-collapse-spacer" aria-hidden />
            <button
              type="button"
              className="page-row-main"
              onClick={() => onSelect(p.id)}
            >
              <PageIcon page={p} />
              <span className="page-title-side">
                {p.title.trim() || "Untitled agent"}
              </span>
            </button>
            {/* Always show delete for agents */}
            <button
              type="button"
              className="page-mini-btn page-agent-delete"
              title="Delete agent"
              onClick={(e) => {
                e.stopPropagation();
                onDeletePage(p.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="sidebar-new-soft" onClick={onNewAgent}>
          <span>+</span>
          <span>New agent</span>
        </button>
      </div>

      {/* ── Private — all your existing pages stay here ── */}
      <div className="sidebar-section-label">Private</div>
      <div className="sidebar-scroll">
        {privateTop.map((page) => (
          <PageTreeItem
            key={page.id}
            page={page}
            pages={pages}
            activePageId={activePageId}
            depth={0}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            onSelect={onSelect}
            onDeletePage={onDeletePage}
            onToggleFavorite={onToggleFavorite}
            onMovePage={onMovePage}
          />
        ))}
        <button type="button" className="sidebar-new" onClick={onNewPage}>
          <span>+</span>
          <span>New page</span>
        </button>
      </div>

      {/* Bottom utility links — like Notion */}
      <div className="sidebar-bottom">
        {help && (
          <button
            type="button"
            className={`sidebar-bottom-link${
              activePageId === help.id ? " is-active" : ""
            }`}
            onClick={() => onSelect(help.id)}
          >
            <span className="side-icon" aria-hidden>
              <MinimalIcon name={iconForPage(help)} size={16} />
            </span>
            <span>Help</span>
          </button>
        )}

        <button
          type="button"
          className="sidebar-section-toggle sidebar-trash-toggle"
          onClick={toggleTrash}
          aria-expanded={showTrash}
        >
          <span
            className={`sidebar-section-chev${showTrash ? " is-open" : ""}`}
            aria-hidden
          >
            ▸
          </span>
          <span className="side-icon" aria-hidden>
            <MinimalIcon name="trash" size={16} />
          </span>
          <span className="sidebar-section-text">
            Trash{trash.length ? ` (${trash.length})` : ""}
          </span>
        </button>
        {showTrash && (
          <div className="sidebar-block">
            {trash.length === 0 && (
              <p className="sidebar-empty-hint">Trash is empty</p>
            )}
            {trash.map((p) => (
              <div key={p.id} className="page-row">
                <button
                  type="button"
                  className="page-row-main"
                  onClick={() => onRestorePage?.(p.id)}
                  title="Restore"
                >
                  <PageIcon page={p} />
                  <span className="page-title-side">
                    {p.title.trim() || "Untitled"}
                  </span>
                </button>
              </div>
            ))}
            {trash.length > 0 && onEmptyTrash && (
              <button
                type="button"
                className="sidebar-new-soft"
                onClick={() => {
                  if (window.confirm("Permanently empty trash?"))
                    onEmptyTrash();
                }}
              >
                Empty trash
              </button>
            )}
          </div>
        )}

        {onReimport && (
          <button
            type="button"
            className="sidebar-new-soft"
            style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}
            onClick={onReimport}
          >
            <span>↺</span>
            <span>Restore full workspace</span>
          </button>
        )}
      </div>
    </aside>
  );
}
