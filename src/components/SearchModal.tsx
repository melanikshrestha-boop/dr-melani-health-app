import { useEffect, useMemo, useRef, useState } from "react";
import type { Page, Workspace } from "../types";
import { getPage, searchPages, trashedPages } from "../workspaceOps";
import { iconForPage, MinimalIcon } from "./MinimalIcon";

type Props = {
  ws: Workspace;
  onOpen: (id: string) => void;
  onClose: () => void;
  onRestore?: (id: string) => void;
};

function parentPath(ws: Workspace, page: Page): string {
  if (!page.parentId) return "";
  const parent = getPage(ws, page.parentId);
  if (!parent || parent.trashedAt) return "";
  return parent.title.trim() || "Untitled";
}

export function SearchModal({ ws, onOpen, onClose, onRestore }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [showTrash, setShowTrash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchPages(ws, q), [ws, q]);
  const trash = useMemo(() => trashedPages(ws), [ws]);
  const recents = useMemo(() => {
    const ids = ws.recents || [];
    return ids
      .map((id) => ws.pages.find((p) => p.id === id && !p.trashedAt))
      .filter(Boolean) as Page[];
  }, [ws]);

  // Flat list for keyboard nav (recent or results only — not trash)
  const list = q.trim()
    ? results
    : recents.length
      ? recents
      : results.slice(0, 16);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && list[active]) {
        e.preventDefault();
        onOpen(list[active].id);
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [list, active, onOpen, onClose]);

  function Row({
    page,
    index,
    dimmed,
  }: {
    page: Page;
    index?: number;
    dimmed?: boolean;
  }) {
    const path = parentPath(ws, page);
    const isActive = index !== undefined && index === active;
    return (
      <button
        type="button"
        className={`search-row${isActive ? " is-active" : ""}${
          dimmed ? " is-dim" : ""
        }`}
        onMouseEnter={() => {
          if (index !== undefined) setActive(index);
        }}
        onClick={() => {
          onOpen(page.id);
          onClose();
        }}
      >
        <span className="search-row-icon">
          <MinimalIcon name={iconForPage(page)} size={16} />
        </span>
        <span className="search-row-text">
          <span className="search-row-title">
            {page.title.trim() || "Untitled"}
          </span>
          {path ? (
            <span className="search-row-path"> — {path}</span>
          ) : null}
        </span>
      </button>
    );
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="search-modal"
        role="dialog"
        aria-label="Search"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="search-modal-top">
          <MinimalIcon name="search" size={18} className="search-modal-mag" />
          <input
            ref={inputRef}
            className="search-modal-input"
            placeholder="Search pages…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="search-modal-body">
          {!q.trim() && (
            <div className="search-group-label">
              {recents.length ? "Recent" : "Pages"}
            </div>
          )}
          {q.trim() && (
            <div className="search-group-label">
              {results.length ? "Results" : "No results"}
            </div>
          )}

          <div className="search-modal-list">
            {list.length === 0 && q.trim() && (
              <div className="search-modal-empty">No pages match</div>
            )}
            {list.map((p, i) => (
              <Row key={p.id} page={p} index={i} />
            ))}
          </div>

          {trash.length > 0 && !q.trim() && (
            <div className="search-trash-block">
              <button
                type="button"
                className="search-group-toggle"
                onClick={() => setShowTrash((v) => !v)}
              >
                <span className="search-group-label" style={{ margin: 0 }}>
                  Trash
                </span>
                <span className="page-collapse-chev" style={{
                  display: "inline-block",
                  transform: showTrash ? "rotate(90deg)" : "none",
                  transition: "transform 0.2s ease",
                  color: "rgba(255,255,255,0.4)",
                }}>
                  ▸
                </span>
              </button>
              {showTrash &&
                trash.slice(0, 12).map((p) => (
                  <div key={p.id} className="search-trash-row">
                    <span className="search-row-icon">
                      <MinimalIcon name={iconForPage(p)} size={16} />
                    </span>
                    <span className="search-row-title muted">
                      {p.title.trim() || "Untitled"}
                    </span>
                    {onRestore && (
                      <button
                        type="button"
                        className="search-modal-restore"
                        onClick={() => onRestore(p.id)}
                      >
                        Restore
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
