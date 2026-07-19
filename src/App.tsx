import { useEffect, useMemo, useState } from "react";
import type { Workspace } from "./types";
import { forceImportDrMelani, loadWorkspace, saveWorkspace } from "./storage";
import {
  activePages,
  addChildPage,
  addDatabasePage,
  breadcrumbTrail,
  createSubpageFromBlock,
  duplicatePage,
  emptyTrash,
  restorePage,
  setActivePage,
  softDeletePage,
  toggleFavorite,
  updatePageInWs,
} from "./workspaceOps";
import { Sidebar } from "./components/Sidebar";
import { PageEditor } from "./components/PageEditor";
import { SearchModal } from "./components/SearchModal";
import { isMelaniRichPage, MelaniRichPage } from "./melani/MelaniViews";
import { isFitnessPage } from "./melani/FitnessExact";
import "./notion.css";

export default function App() {
  const [ws, setWs] = useState<Workspace>(() => {
    if (typeof window === "undefined") return forceImportDrMelani();
    return loadWorkspace();
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    saveWorkspace(ws);
  }, [ws]);

  // Global shortcuts — like Notion
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (meta && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (meta && e.key.toLowerCase() === "n" && !e.shiftKey) {
        e.preventDefault();
        setWs((prev) => addChildPage(prev, prev.activePageId));
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setWs((prev) => addChildPage(prev, null));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const live = useMemo(() => activePages(ws), [ws]);
  const activePage = useMemo(
    () => live.find((p) => p.id === ws.activePageId) || live[0],
    [ws, live]
  );

  const childPages = useMemo(
    () =>
      activePage
        ? live.filter((p) => p.parentId === activePage.id)
        : [],
    [live, activePage]
  );

  const crumbs = useMemo(
    () => (activePage ? breadcrumbTrail(ws, activePage.id) : []),
    [ws, activePage]
  );

  function openPage(id: string) {
    setWs((prev) => setActivePage(prev, id));
    setMoreOpen(false);
  }

  if (!activePage) return null;

  const edited = new Date(activePage.updatedAt);
  const editedLabel = `Edited ${edited.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;

  const melaniMode = isMelaniRichPage(activePage.id);
  const fitnessMode = isFitnessPage(activePage.id);

  return (
    <div className="app">
      <Sidebar
        workspaceName={ws.name}
        pages={live}
        allPages={ws.pages}
        recents={ws.recents || []}
        activePageId={activePage.id}
        open={ws.sidebarOpen}
        onSelect={openPage}
        onNewPage={() => setWs((p) => addChildPage(p, p.activePageId))}
        onNewTopPage={() => setWs((p) => addChildPage(p, null))}
        onNewDatabase={() => setWs((p) => addDatabasePage(p, p.activePageId))}
        onDeletePage={(id) => setWs((p) => softDeletePage(p, id))}
        onToggleFavorite={(id) => setWs((p) => toggleFavorite(p, id))}
        onOpenSearch={() => setSearchOpen(true)}
        onClose={() => setWs((p) => ({ ...p, sidebarOpen: false }))}
        onReimport={() => {
          if (
            window.confirm(
              "Re-import full Dr. Melani export? Local edits to the tree may be replaced."
            )
          ) {
            setWs(forceImportDrMelani());
          }
        }}
      />

      <main
        className={`main${melaniMode ? " is-melani" : ""}${
          fitnessMode ? " is-fitness" : ""
        }`}
      >
        {/* Fitness = full-bleed Melani page only (no Notion junk chrome on top) */}
        {fitnessMode ? (
          <>
            <button
              type="button"
              className="fx-menu-btn"
              title="Sidebar"
              onClick={() =>
                setWs((p) => ({ ...p, sidebarOpen: !p.sidebarOpen }))
              }
            >
              ☰
            </button>
            <MelaniRichPage pageId={activePage.id} onGo={openPage} />
          </>
        ) : (
          <>
            <header className="topbar">
              <button
                type="button"
                className="topbar-btn"
                onClick={() =>
                  setWs((p) => ({ ...p, sidebarOpen: !p.sidebarOpen }))
                }
                title="Toggle sidebar"
              >
                ☰
              </button>

              <div className="breadcrumb">
                {crumbs.map((c, i) => (
                  <span key={c.id} className="breadcrumb-seg">
                    {i > 0 && <span className="breadcrumb-sep">/</span>}
                    <button
                      type="button"
                      className="breadcrumb-link"
                      onClick={() => openPage(c.id)}
                    >
                      <span className="breadcrumb-icon">
                        {c.kind === "database" ? "▦" : c.icon}
                      </span>
                      <span className="breadcrumb-title">
                        {c.title.trim() || "Untitled"}
                      </span>
                    </button>
                  </span>
                ))}
              </div>

              <div className="topbar-spacer" />
              <span className="topbar-meta">{editedLabel}</span>
              <button
                type="button"
                className="topbar-btn"
                title="Favorite"
                onClick={() => setWs((p) => toggleFavorite(p, activePage.id))}
              >
                {activePage.favorite ? "★" : "☆"}
              </button>
              <button
                type="button"
                className="topbar-btn"
                title="Search (⌘K)"
                onClick={() => setSearchOpen(true)}
              >
                ⌕
              </button>
              <div className="topbar-more-wrap">
                <button
                  type="button"
                  className="topbar-btn"
                  title="More"
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  ···
                </button>
                {moreOpen && (
                  <div className="more-menu">
                    <button
                      type="button"
                      onClick={() => {
                        setWs((p) => duplicatePage(p, activePage.id));
                        setMoreOpen(false);
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWs((p) => softDeletePage(p, activePage.id));
                        setMoreOpen(false);
                      }}
                    >
                      Move to Trash
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWs((p) => addDatabasePage(p, activePage.id));
                        setMoreOpen(false);
                      }}
                    >
                      New database here
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWs((p) => emptyTrash(p));
                        setMoreOpen(false);
                      }}
                    >
                      Empty trash
                    </button>
                  </div>
                )}
              </div>
            </header>

            {melaniMode ? (
              <MelaniRichPage pageId={activePage.id} onGo={openPage} />
            ) : (
              <PageEditor
                page={activePage}
                allPages={ws.pages}
                childPages={childPages}
                onUpdatePage={(page) => setWs((p) => updatePageInWs(p, page))}
                onOpenPage={openPage}
                onCreateSubpage={(blockIndex) =>
                  setWs((p) =>
                    createSubpageFromBlock(p, activePage.id, blockIndex)
                  )
                }
                onCreateDatabase={() =>
                  setWs((p) => addDatabasePage(p, activePage.id))
                }
              />
            )}
          </>
        )}
      </main>

      {searchOpen && (
        <SearchModal
          ws={ws}
          onOpen={openPage}
          onClose={() => setSearchOpen(false)}
          onRestore={(id) => {
            setWs((p) => restorePage(p, id));
            setSearchOpen(false);
          }}
        />
      )}
    </div>
  );
}
