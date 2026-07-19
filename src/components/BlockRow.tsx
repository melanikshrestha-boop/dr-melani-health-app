import { useEffect, useRef } from "react";
import type { Block } from "../types";

type Props = {
  block: Block;
  index: number;
  listIndex?: number;
  autoFocus?: boolean;
  linkedTitle?: string;
  onChange: (id: string, patch: Partial<Block>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, block: Block, index: number) => void;
  onFocus: (id: string) => void;
  onPlus: (index: number) => void;
  onOpenPage?: (pageId: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: (index: number) => void;
};

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function BlockRow({
  block,
  index,
  listIndex,
  autoFocus,
  linkedTitle,
  onChange,
  onKeyDown,
  onFocus,
  onPlus,
  onOpenPage,
  onDragStart,
  onDragOver,
  onDrop,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const empty = !block.text;
  const indent = Math.min(Math.max(block.indent || 0, 0), 4);

  useEffect(() => {
    autoGrow(ref.current);
  }, [block.text, block.type, indent]);

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
    }
  }, [autoFocus]);

  if (block.type === "page_link" && block.pageId) {
    return (
      <div
        className="block-row"
        style={{ paddingLeft: 42 + indent * 24 }}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver(index);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDrop(index);
        }}
      >
        <div className="block-gutter" style={{ left: indent * 24 }}>
          <button type="button" className="block-plus" onClick={() => onPlus(index)}>
            +
          </button>
          <button
            type="button"
            className="block-handle"
            draggable
            onDragStart={() => onDragStart(index)}
            aria-label="Drag"
          >
            ⋮⋮
          </button>
        </div>
        <button
          type="button"
          className="block-page-link"
          onClick={() => onOpenPage?.(block.pageId!)}
        >
          <span className="block-page-link-icon">📄</span>
          <span className="block-page-link-title">
            {linkedTitle || block.text || "Untitled"}
          </span>
        </button>
      </div>
    );
  }

  if (block.type === "divider") {
    return (
      <div
        className="block-row"
        style={{ paddingLeft: 42 + indent * 24 }}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver(index);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDrop(index);
        }}
      >
        <div className="block-gutter" style={{ left: indent * 24 }}>
          <button type="button" className="block-plus" onClick={() => onPlus(index)}>
            +
          </button>
          <button
            type="button"
            className="block-handle"
            draggable
            onDragStart={() => onDragStart(index)}
          >
            ⋮⋮
          </button>
        </div>
        <div className="block-body">
          <hr className="block-divider" />
        </div>
      </div>
    );
  }

  const input = (
    <textarea
      ref={ref}
      className={`block-input type-${block.type}${block.checked ? " is-checked" : ""}`}
      value={block.text}
      rows={1}
      placeholder={
        block.type === "heading1"
          ? "Heading 1"
          : block.type === "heading2"
            ? "Heading 2"
            : block.type === "heading3"
              ? "Heading 3"
              : block.type === "todo"
                ? "To-do"
                : block.type === "bullet"
                  ? "List"
                  : block.type === "quote"
                    ? "Empty quote"
                    : empty
                      ? "Type something, or press '/' for commands…"
                      : ""
      }
      onChange={(e) => {
        onChange(block.id, { text: e.target.value });
        autoGrow(e.target);
      }}
      onKeyDown={(e) => onKeyDown(e, block, index)}
      onFocus={() => onFocus(block.id)}
      spellCheck
    />
  );

  let body: React.ReactNode = input;

  if (block.type === "bullet") {
    body = (
      <div className="block-bullet">
        <span className="block-bullet-mark">•</span>
        {input}
      </div>
    );
  } else if (block.type === "numbered") {
    body = (
      <div className="block-numbered">
        <span className="block-number-mark">{listIndex ?? 1}.</span>
        {input}
      </div>
    );
  } else if (block.type === "todo") {
    body = (
      <div className="block-todo">
        <button
          type="button"
          className={`block-todo-check${block.checked ? " is-checked" : ""}`}
          onClick={() => onChange(block.id, { checked: !block.checked })}
        >
          {block.checked ? "✓" : ""}
        </button>
        {input}
      </div>
    );
  } else if (block.type === "toggle") {
    body = (
      <div className="block-bullet">
        <button
          type="button"
          className="block-bullet-mark"
          style={{ border: "none", background: "transparent", cursor: "pointer" }}
          onClick={() => onChange(block.id, { open: !block.open })}
        >
          {block.open ? "▾" : "▸"}
        </button>
        {input}
      </div>
    );
  } else if (block.type === "callout") {
    body = (
      <div className="block-callout">
        <span className="block-callout-icon">💡</span>
        {input}
      </div>
    );
  }

  return (
    <div
      className={`block-row${empty ? " is-empty" : ""}`}
      style={{ paddingLeft: 42 + indent * 24 }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
    >
      <div className="block-gutter" style={{ left: indent * 24 }}>
        <button type="button" className="block-plus" onClick={() => onPlus(index)}>
          +
        </button>
        <button
          type="button"
          className="block-handle"
          draggable
          onDragStart={() => onDragStart(index)}
          aria-label="Drag"
        >
          ⋮⋮
        </button>
      </div>
      <div className="block-body">{body}</div>
    </div>
  );
}
