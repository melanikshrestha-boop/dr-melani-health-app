import { useEffect, useMemo, useState } from "react";
import type { Page, Workspace } from "./types";
import {
  createPage,
  defaultWorkspace,
  loadWorkspace,
  saveWorkspace,
} from "./storage";
import { Sidebar } from "./components/Sidebar";
import { PageEditor } from "./components/PageEditor";
import "./notion.css";

export default function App() {
  const [ws, setWs] = useState<Workspace>(() => {
    if (typeof window === "undefined") return defaultWorkspace();
    return loadWorkspace();
  });

  // Auto-save whenever workspace changes
  useEffect(() => {
    saveWorkspace(ws);
  }, [ws]);

  const activePage = useMemo(
    () => ws.pages.find((p) => p.id === ws.activePageId) || ws.pages[0],
    [ws]
  );

  function setActive(id: string) {
    setWs((prev) => ({ ...prev, activePageId: id }));
  }

  function updatePage(page: Page) {
    setWs((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === page.id ? page : p)),
    }));
  }

  function addPage() {
    const page = createPage(null);
    setWs((prev) => ({
      ...prev,
      pages: [...prev.pages, page],
      activePageId: page.id,
    }));
  }

  function deletePage(id: string) {
    setWs((prev) => {
      if (prev.pages.length <= 1) return prev;
      const pages = prev.pages.filter((p) => p.id !== id);
      const activePageId =
        prev.activePageId === id ? pages[0].id : prev.activePageId;
      return { ...prev, pages, activePageId };
    });
  }

  function toggleSidebar() {
    setWs((prev) => ({ ...prev, sidebarOpen: !prev.sidebarOpen }));
  }

  if (!activePage) return null;

  const edited = new Date(activePage.updatedAt);
  const editedLabel = `Edited ${edited.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;

  return (
    <div className="app">
      <Sidebar
        workspaceName={ws.name}
        pages={ws.pages}
        activePageId={activePage.id}
        open={ws.sidebarOpen}
        onSelect={setActive}
        onNewPage={addPage}
        onDeletePage={deletePage}
        onClose={() => setWs((p) => ({ ...p, sidebarOpen: false }))}
      />

      <main className="main">
        <header className="topbar">
          {!ws.sidebarOpen && (
            <button
              type="button"
              className="topbar-btn"
              onClick={toggleSidebar}
              title="Open sidebar"
            >
              ☰
            </button>
          )}
          {ws.sidebarOpen && (
            <button
              type="button"
              className="topbar-btn"
              onClick={toggleSidebar}
              title="Close sidebar"
            >
              ☰
            </button>
          )}

          <div className="breadcrumb">
            <span className="breadcrumb-icon">{activePage.icon}</span>
            <span className="breadcrumb-title">
              {activePage.title.trim() || "Untitled"}
            </span>
          </div>

          <div className="topbar-spacer" />
          <span className="topbar-meta">{editedLabel}</span>
          <button type="button" className="topbar-btn" title="Share (demo)">
            Share
          </button>
          <button type="button" className="topbar-btn" title="More">
            ···
          </button>
        </header>

        <PageEditor page={activePage} onUpdatePage={updatePage} />
      </main>
    </div>
  );
}
