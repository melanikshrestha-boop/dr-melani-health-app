import { useEffect, useMemo, useRef, useState } from "react";
import type { Page, Workspace } from "../types";
import { searchPages, trashedPages } from "../workspaceOps";

type Props = {
  ws: Workspace;
  onOpen: (id: string) => void;
  onClose: () => void;
  onRestore?: (id: string) => void;
};

export function SearchModal({ ws, onOpen, onClose, onRestore }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchPages(ws, q), [ws, q]);
  const trash = useMemo(() => trashedPages(ws), [ws]);
  const recents = useMemo(() => {
    const ids = ws.recents || [];
    return ids
      .map((id) => ws.pages.find((p) => p.id === id && !p.trashedAt))
      .filter(Boolean) as Page[];
  }, [ws]);

  const list = q.trim() ? results : recents.length ? recents : results.slice(0, 12);

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

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="search-modal"
        role="dialog"
        aria-label="Search"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="search-modal-input"
          placeholder="Search pages…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="search-modal-label">
          {q.trim() ? "Results" : recents.length ? "Recent" : "Pages"}
        </div>
        <div className="search-modal-list">
          {list.length === 0 && (
            <div className="search-modal-empty">No pages found</div>
          )}
          {list.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`search-modal-item${i === active ? " is-active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                onOpen(p.id);
                onClose();
              }}
            >
              <span className="search-modal-icon">
                {p.kind === "database" ? "▦" : p.icon || "📄"}
              </span>
              <span className="search-modal-title">
                {p.title.trim() || "Untitled"}
              </span>
              {p.kind === "database" && (
                <span className="search-modal-badge">Database</span>
              )}
            </button>
          ))}
        </div>
        {trash.length > 0 && !q.trim() && (
          <>
            <div className="search-modal-label">Trash</div>
            <div className="search-modal-list">
              {trash.slice(0, 5).map((p) => (
                <div key={p.id} className="search-modal-trash-row">
                  <span className="search-modal-icon">{p.icon || "📄"}</span>
                  <span className="search-modal-title muted">
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
          </>
        )}
        <div className="search-modal-hint">
          ↑↓ navigate · Enter open · Esc close · ⌘K anytime
        </div>
      </div>
    </div>
  );
}
