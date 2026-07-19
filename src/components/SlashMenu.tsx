import { useEffect, useRef } from "react";
import type { SlashCommand } from "../slashCommands";

type Props = {
  items: SlashCommand[];
  activeIndex: number;
  onPick: (cmd: SlashCommand) => void;
  onClose: () => void;
  // position under the block
  top: number;
  left: number;
};

export function SlashMenu({ items, activeIndex, onPick, onClose, top, left }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current?.querySelector(".slash-item.is-active") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  if (!items.length) {
    return (
      <div className="slash-menu" ref={ref} style={{ top, left }}>
        <div className="slash-menu-label">No results</div>
      </div>
    );
  }

  return (
    <div className="slash-menu" ref={ref} style={{ top, left }}>
      <div className="slash-menu-label">Basic blocks</div>
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          className={`slash-item${i === activeIndex ? " is-active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(item);
          }}
        >
          <span className="slash-item-icon">{item.icon}</span>
          <span className="slash-item-text">
            <span className="slash-item-name">{item.name}</span>
            <span className="slash-item-desc">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
