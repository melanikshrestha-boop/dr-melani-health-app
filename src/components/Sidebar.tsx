import type { Page } from "../types";

type Props = {
  workspaceName: string;
  pages: Page[];
  activePageId: string;
  open: boolean;
  onSelect: (id: string) => void;
  onNewPage: () => void;
  onDeletePage: (id: string) => void;
  onClose: () => void;
};

export function Sidebar({
  workspaceName,
  pages,
  activePageId,
  open,
  onSelect,
  onNewPage,
  onDeletePage,
  onClose,
}: Props) {
  const topPages = pages.filter((p) => p.parentId === null);

  const initial = workspaceName.trim().charAt(0).toUpperCase() || "W";

  return (
    <aside className={`sidebar${open ? "" : " is-closed"}`} aria-label="Sidebar">
      <div className="sidebar-top">
        <button type="button" className="workspace-btn" title={workspaceName}>
          <span className="workspace-icon">{initial}</span>
          <span className="workspace-name">{workspaceName}</span>
        </button>
        <button type="button" className="sidebar-icon-btn" onClick={onClose} title="Close sidebar">
          «
        </button>
      </div>

      <div className="sidebar-search" title="Search (coming soon)">
        <span>🔍</span>
        <span>Search</span>
      </div>

      <div className="sidebar-section-label">Private</div>

      <div className="sidebar-scroll">
        {topPages.map((page) => (
          <div
            key={page.id}
            className={`page-row${page.id === activePageId ? " is-active" : ""}`}
          >
            <button
              type="button"
              className="page-row-main"
              onClick={() => onSelect(page.id)}
            >
              <span className="page-emoji">{page.icon}</span>
              <span className="page-title-side">
                {page.title.trim() || "Untitled"}
              </span>
            </button>
            <div className="page-row-actions">
              <button
                type="button"
                className="page-mini-btn"
                title="Delete page"
                onClick={(e) => {
                  e.stopPropagation();
                  if (pages.length <= 1) return;
                  if (window.confirm("Delete this page?")) onDeletePage(page.id);
                }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="sidebar-new" onClick={onNewPage}>
        <span>+</span>
        <span>New page</span>
      </button>

      <div className="sidebar-footer">
        <button type="button" className="sidebar-new" style={{ margin: 0, width: "100%" }} onClick={onNewPage}>
          <span>👤</span>
          <span style={{ fontSize: 13 }}>Add a page</span>
        </button>
      </div>
    </aside>
  );
}
