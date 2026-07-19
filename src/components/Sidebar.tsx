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

function PageTreeItem({
  page,
  pages,
  activePageId,
  depth,
  onSelect,
  onDeletePage,
  onToggleFavorite,
}: {
  page: Page;
  pages: Page[];
  activePageId: string;
  depth: number;
  onSelect: (id: string) => void;
  onDeletePage: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const kids = pages.filter((p) => p.parentId === page.id);

  return (
    <>
      <div
        className={`page-row${page.id === activePageId ? " is-active" : ""}`}
        style={{ paddingLeft: 2 + depth * 14 }}
      >
        <button
          type="button"
          className="page-row-main"
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
      {kids.map((child) => (
        <PageTreeItem
          key={child.id}
          page={child}
          pages={pages}
          activePageId={activePageId}
          depth={depth + 1}
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
  const topPages = pages.filter((p) => p.parentId === null);
  const favorites = pages.filter((p) => p.favorite);
  const home = pages.find((p) => p.id === "pg-home") || topPages[0];
  const recentPages = recents
    .map((id) => pages.find((p) => p.id === id))
    .filter(Boolean)
    .slice(0, 5) as Page[];

  const initial = workspaceName.trim().charAt(0).toUpperCase() || "D";

  return (
    <aside className={`sidebar${open ? "" : " is-closed"}`} aria-label="Sidebar">
      <div className="sidebar-top">
        <button type="button" className="workspace-btn" title={workspaceName}>
          <span className="workspace-icon">{initial}</span>
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
          style={{ color: "rgba(55,53,47,0.55)", fontSize: 12 }}
          onClick={onReimport}
        >
          <span>↺</span>
          <span>Re-import Dr. Melani</span>
        </button>
      )}

      <div className="sidebar-footer">
        <div className="sidebar-footer-note">
          Works like Notion · ⌘K search · / blocks · Tab indent
        </div>
      </div>
    </aside>
  );
}
