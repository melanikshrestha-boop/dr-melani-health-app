import { useEffect, useRef } from "react";
import type { Block } from "../types";

type Props = {
  block: Block;
  index: number;
  listIndex?: number; // for numbered lists
  autoFocus?: boolean;
  onChange: (id: string, patch: Partial<Block>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, block: Block, index: number) => void;
  onFocus: (id: string) => void;
  onPlus: (index: number) => void;
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
  onChange,
  onKeyDown,
  onFocus,
  onPlus,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const empty = !block.text;

  useEffect(() => {
    autoGrow(ref.current);
  }, [block.text, block.type]);

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
    }
  }, [autoFocus]);

  if (block.type === "divider") {
    return (
      <div className="block-row">
        <div className="block-gutter">
          <button type="button" className="block-plus" onClick={() => onPlus(index)} aria-label="Add block">
            +
          </button>
          <button type="button" className="block-handle" aria-label="Drag">
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
              : empty
                ? "Type '/' for commands"
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
          aria-label={block.checked ? "Uncheck" : "Check"}
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
    <div className={`block-row${empty ? " is-empty" : ""}`}>
      <div className="block-gutter">
        <button type="button" className="block-plus" onClick={() => onPlus(index)} aria-label="Add block">
          +
        </button>
        <button type="button" className="block-handle" aria-label="Drag">
          ⋮⋮
        </button>
      </div>
      <div className="block-body">{body}</div>
    </div>
  );
}
