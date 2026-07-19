import { useState } from "react";
import type { Page } from "../types";
import { iconForPage, MinimalIcon } from "./MinimalIcon";

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
  onNewDatabase: () => void;
  onDeletePage: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onOpenSearch: () => void;
  onClose: () => void;
  onReimport?: () => void;
};

const COLLAPSE_KEY = "dr-melani-sidebar-collapsed";
const RECENTS_KEY = "dr-melani-show-recents";

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* ignore */
  }
  return { "pg-fitness": true, "pg-hygiene": true, "pg-books": true };
}

function saveCollapsed(map: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function loadShowRecents(): boolean {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* ignore */
  }
  return false; // default OFF — user asked not to always see recents
}

function saveShowRecents(show: boolean) {
  try {
    localStorage.setItem(RECENTS_KEY, show ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function PageIcon({ page }: { page: Page }) {
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
          <span className="page-collapse-spacer" aria-hidden />
        )}
        <button
          type="button"
          className={`page-row-main${hasKids ? " has-kids" : ""}`}
          onClick={() => onSelect(page.id)}
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
  const [showRecents, setShowRecents] = useState(loadShowRecents);

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveCollapsed(next);
      return next;
    });
  }

  function toggleRecents() {
    setShowRecents((prev) => {
      const next = !prev;
      saveShowRecents(next);
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
          <MinimalIcon name="home" size={15} />
          <span>Home</span>
        </button>
      )}

      <button type="button" className="sidebar-search" onClick={onOpenSearch}>
        <MinimalIcon name="search" size={15} />
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
                  <PageIcon page={p} />
                  <span className="page-title-side">
                    {p.title.trim() || "Untitled"}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Recents — collapsible, default hidden */}
      <button
        type="button"
        className="sidebar-section-toggle"
        onClick={toggleRecents}
        aria-expanded={showRecents}
      >
        <span className="sidebar-section-label" style={{ margin: 0 }}>
          Recents
        </span>
        <span className="page-collapse-btn is-open" aria-hidden>
          {showRecents ? "▾" : "▸"}
        </span>
      </button>
      {showRecents && recentPages.length > 0 && (
        <div className="sidebar-scroll" style={{ flex: "0 0 auto", maxHeight: 160 }}>
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
                <PageIcon page={p} />
                <span className="page-title-side">
                  {p.title.trim() || "Untitled"}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
      {showRecents && recentPages.length === 0 && (
        <p className="sidebar-empty-hint">No recent pages yet</p>
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
        <MinimalIcon name="docs" size={14} />
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
          Recents ▸/▾ · Fitness ▸/▾ hides sub-pages
        </div>
      </div>
    </aside>
  );
}
