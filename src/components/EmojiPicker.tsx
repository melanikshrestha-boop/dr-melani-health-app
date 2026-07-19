import { useEffect, useMemo, useRef, useState } from "react";
import { EMOJI_GROUPS, filterEmojis } from "../emojiCatalog";

type Props = {
  current: string;
  onPick: (emoji: string) => void;
  onClose: () => void;
};

export function EmojiPicker({ current, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState(EMOJI_GROUPS[0]?.id || "dr-melani");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => filterEmojis(query), [query]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // When not searching, show one group at a time (Notion-style tabs)
  const displayGroups = query.trim()
    ? groups
    : EMOJI_GROUPS.filter((g) => g.id === activeGroup).map((g) => ({
        label: g.label,
        emojis: g.emojis,
      }));

  return (
    <div className="emoji-picker" ref={rootRef} role="dialog" aria-label="Choose page icon">
      <div className="emoji-picker-head">
        <input
          ref={searchRef}
          className="emoji-picker-search"
          type="search"
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="emoji-picker-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {!query.trim() && (
        <div className="emoji-picker-tabs" role="tablist">
          {EMOJI_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={activeGroup === g.id}
              className={`emoji-picker-tab${activeGroup === g.id ? " is-active" : ""}`}
              onClick={() => setActiveGroup(g.id)}
              title={g.label}
            >
              {g.emojis[0] || "•"}
            </button>
          ))}
        </div>
      )}

      <div className="emoji-picker-scroll">
        {displayGroups.map((g) => (
          <div key={g.label} className="emoji-picker-section">
            <div className="emoji-picker-section-label">{g.label}</div>
            <div className="emoji-picker-grid">
              {g.emojis.map((em) => (
                <button
                  key={`${g.label}-${em}`}
                  type="button"
                  className={`emoji-picker-cell${em === current ? " is-current" : ""}`}
                  onClick={() => onPick(em)}
                  title={em}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        ))}
        {displayGroups.length === 0 && (
          <div className="emoji-picker-empty">No matches — try “health”, “gym”, or “food”</div>
        )}
      </div>

      <div className="emoji-picker-foot">
        <button
          type="button"
          className="emoji-picker-remove"
          onClick={() => onPick("📄")}
        >
          Reset to 📄
        </button>
      </div>
    </div>
  );
}
