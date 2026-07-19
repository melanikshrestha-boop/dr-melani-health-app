import { useEffect, useState } from "react";
import type { Page } from "../types";

type Props = {
  workspaceName: string;
  pages: Page[]; // active only
  allPages: Page[];
  recents: string[];
  activePageId: string;
  open: boolean;
  onSelect: (id: string) => void;
  onNewPage: () => void;
  onNewTopPage: () => void;
  onNewDatabase: () => void;
  onDeletePage: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onOpenSearch: () => void;
  onClose: () => void;
  onReimport?: () => void;
};

const COLLAPSE_KEY = "dr-melani-sidebar-collapsed";

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* ignore */
  }
  // Default: Fitness collapsed so Sleep/Meals/Gym/Body stay hidden until toggled
  return { "pg-fitness": true, "pg-hygiene": true, "pg-my-data": true };
}

function saveCollapsed(map: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
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
}) {
  const kids = pages.filter((p) => p.parentId === page.id);
  const hasKids = kids.length > 0;
  const isCollapsed = hasKids && !!collapsed[page.id];

  return (
    <>
      <div
        className={`page-row${page.id === activePageId ? " is-active" : ""}`}
        style={{ paddingLeft: 2 + depth * 12 }}
      >
        {hasKids ? (
          <button
            type="button"
            className={`page-collapse-btn${isCollapsed ? "" : " is-open"}`}
            title={isCollapsed ? "Show sub-pages" : "Hide sub-pages"}
            aria-expanded={!isCollapsed}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(page.id);
            }}
          >
            {isCollapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span style={{ width: 22, flexShrink: 0 }} />
        )}
        <button
          type="button"
          className={`page-row-main${hasKids ? " has-kids" : ""}`}
          onClick={() => onSelect(page.id)}
        >
          <span className="page-emoji">
            {page.kind === "database" ? "▦" : page.icon}
          </span>
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
              if (window.confirm("Move to trash?")) onDeletePage(page.id);
            }}
          >
            ×
          </button>
        </div>
      </div>
      {!isCollapsed &&
        kids.map((child) => (
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
          />
        ))}
    </>
  );
}

export function Sidebar({
  workspaceName,
  pages,
  recents,
  activePageId,
  open,
  onSelect,
  onNewPage,
  onNewTopPage,
  onNewDatabase,
  onDeletePage,
  onToggleFavorite,
  onOpenSearch,
  onClose,
  onReimport,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);

  // Auto-expand parent when you're on a child page (so you can see where you are)
  useEffect(() => {
    const active = pages.find((p) => p.id === activePageId);
    if (active?.parentId && collapsed[active.parentId]) {
      // keep collapsed unless user opens — don't force expand
    }
  }, [activePageId, pages, collapsed]);

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveCollapsed(next);
      return next;
    });
  }

  const topPages = pages.filter((p) => p.parentId === null);
  const favorites = pages.filter((p) => p.favorite);
  const home = pages.find((p) => p.id === "pg-home") || topPages[0];
  const recentPages = recents
    .map((id) => pages.find((p) => p.id === id))
    .filter(Boolean)
    .slice(0, 5) as Page[];

  return (
    <aside className={`sidebar${open ? "" : " is-closed"}`} aria-label="Sidebar">
      <div className="sidebar-top">
        <button type="button" className="workspace-btn" title={workspaceName}>
          <span className="workspace-name">{workspaceName}</span>
        </button>
        <button type="button" className="sidebar-icon-btn" onClick={onClose}>
          «
        </button>
      </div>

      {home && (
        <button
          type="button"
          className={`sidebar-home-pill${activePageId === home.id ? " is-active" : ""}`}
          onClick={() => onSelect(home.id)}
        >
          <span>⌂</span>
          <span>Home</span>
        </button>
      )}

      <button type="button" className="sidebar-search" onClick={onOpenSearch}>
        <span>🔍</span>
        <span>Search</span>
        <span className="sidebar-kbd">⌘K</span>
      </button>

      {favorites.length > 0 && (
        <>
          <div className="sidebar-section-label">Favorites</div>
          <div className="sidebar-scroll" style={{ flex: "0 0 auto", maxHeight: 140 }}>
            {favorites.map((p) => (
              <div
                key={p.id}
                className={`page-row${p.id === activePageId ? " is-active" : ""}`}
              >
                <button
                  type="button"
                  className="page-row-main"
                  onClick={() => onSelect(p.id)}
                >
                  <span className="page-emoji">
                    {p.kind === "database" ? "▦" : p.icon}
                  </span>
                  <span className="page-title-side">
                    {p.title.trim() || "Untitled"}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {recentPages.length > 0 && (
        <>
          <div className="sidebar-section-label">Recents</div>
          <div className="sidebar-scroll" style={{ flex: "0 0 auto", maxHeight: 120 }}>
            {recentPages.map((p) => (
              <div
                key={p.id}
                className={`page-row${p.id === activePageId ? " is-active" : ""}`}
              >
                <button
                  type="button"
                  className="page-row-main"
                  onClick={() => onSelect(p.id)}
                >
                  <span className="page-emoji">
                    {p.kind === "database" ? "▦" : p.icon}
                  </span>
                  <span className="page-title-side">
                    {p.title.trim() || "Untitled"}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sidebar-section-label">Private</div>

      <div className="sidebar-scroll">
        {topPages.map((page) => (
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
          />
        ))}
      </div>

      <button type="button" className="sidebar-new" onClick={onNewPage}>
        <span>+</span>
        <span>New page</span>
      </button>
      <button type="button" className="sidebar-new" onClick={onNewTopPage}>
        <span>+</span>
        <span>New top-level page</span>
      </button>
      <button type="button" className="sidebar-new" onClick={onNewDatabase}>
        <span>▦</span>
        <span>New database</span>
      </button>

      {onReimport && (
        <button
          type="button"
          className="sidebar-new"
          style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}
          onClick={onReimport}
        >
          <span>↺</span>
          <span>Restore full workspace</span>
        </button>
      )}

      <div className="sidebar-footer">
        <div className="sidebar-footer-note">
          Your second brain · health + life · auto-saves · / for blocks
        </div>
      </div>
    </aside>
  );
}
