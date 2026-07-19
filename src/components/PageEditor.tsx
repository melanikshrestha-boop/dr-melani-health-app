import { useMemo, useState } from "react";
import type { Block, Page } from "../types";
import { newBlock } from "../storage";
import { BlockRow } from "./BlockRow";
import { SlashMenu } from "./SlashMenu";
import { filterSlash, type SlashCommand } from "../slashCommands";

type Props = {
  page: Page;
  onUpdatePage: (page: Page) => void;
};

type SlashState = {
  blockId: string;
  index: number;
  query: string;
  active: number;
  top: number;
  left: number;
} | null;

export function PageEditor({ page, onUpdatePage }: Props) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [slash, setSlash] = useState<SlashState>(null);

  const slashItems = useMemo(
    () => (slash ? filterSlash(slash.query) : []),
    [slash]
  );

  function setBlocks(blocks: Block[], extra?: Partial<Page>) {
    onUpdatePage({
      ...page,
      ...extra,
      blocks,
      updatedAt: Date.now(),
    });
  }

  function updateBlock(id: string, patch: Partial<Block>) {
    const blocks = page.blocks.map((b) => {
      if (b.id !== id) return b;
      const next = { ...b, ...patch };
      // Detect slash command open
      if (typeof patch.text === "string") {
        const m = patch.text.match(/^\/(.*)$/);
        if (m) {
          const idx = page.blocks.findIndex((x) => x.id === id);
          setSlash({
            blockId: id,
            index: idx,
            query: m[1] || "",
            active: 0,
            top: 36,
            left: 0,
          });
        } else if (slash?.blockId === id) {
          setSlash(null);
        }
      }
      return next;
    });
    setBlocks(blocks);
  }

  function applySlash(cmd: SlashCommand) {
    if (!slash) return;
    const blocks = [...page.blocks];
    const b = blocks[slash.index];
    if (!b) return;

    if (cmd.type === "divider") {
      blocks[slash.index] = { ...b, type: "divider", text: "" };
      // add empty paragraph after
      blocks.splice(slash.index + 1, 0, newBlock("paragraph"));
      setFocusId(blocks[slash.index + 1].id);
    } else {
      blocks[slash.index] = {
        ...b,
        type: cmd.type,
        text: "",
        checked: cmd.type === "todo" ? false : b.checked,
        open: cmd.type === "toggle" ? true : b.open,
      };
      setFocusId(b.id);
    }
    setBlocks(blocks);
    setSlash(null);
  }

  function onKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    block: Block,
    index: number
  ) {
    // Slash menu navigation
    if (slash && slash.blockId === block.id) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlash({
          ...slash,
          active: Math.min(slash.active + 1, Math.max(slashItems.length - 1, 0)),
        });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlash({ ...slash, active: Math.max(slash.active - 1, 0) });
        return;
      }
      if (e.key === "Enter" && slashItems[slash.active]) {
        e.preventDefault();
        applySlash(slashItems[slash.active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlash(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Continue list types
      let nextType: Block["type"] = "paragraph";
      if (block.type === "bullet") nextType = "bullet";
      else if (block.type === "numbered") nextType = "numbered";
      else if (block.type === "todo") nextType = "todo";
      else if (
        block.type === "heading1" ||
        block.type === "heading2" ||
        block.type === "heading3"
      ) {
        nextType = "paragraph";
      }

      const nb = newBlock(nextType);
      const blocks = [...page.blocks];
      blocks.splice(index + 1, 0, nb);
      setBlocks(blocks);
      setFocusId(nb.id);
      setSlash(null);
      return;
    }

    if (e.key === "Backspace" && block.text === "" && page.blocks.length > 1) {
      e.preventDefault();
      const blocks = page.blocks.filter((b) => b.id !== block.id);
      const prev = blocks[Math.max(0, index - 1)];
      setBlocks(blocks);
      if (prev) setFocusId(prev.id);
      setSlash(null);
      return;
    }

    // markdown-ish shortcuts at start of line
    if (e.key === " ") {
      const v = (e.currentTarget.value || "").trimEnd();
      const map: Record<string, Block["type"]> = {
        "#": "heading1",
        "##": "heading2",
        "###": "heading3",
        "-": "bullet",
        "*": "bullet",
        "[]": "todo",
        "[ ]": "todo",
        ">": "quote",
        "```": "code",
      };
      if (map[v]) {
        e.preventDefault();
        updateBlock(block.id, { type: map[v], text: "" });
      }
    }
  }

  function addAfter(index: number) {
    const nb = newBlock("paragraph");
    const blocks = [...page.blocks];
    blocks.splice(index + 1, 0, nb);
    setBlocks(blocks);
    setFocusId(nb.id);
  }

  // Numbering for consecutive numbered blocks
  let numberCounter = 0;

  return (
    <div className="page-scroll">
      <div className="page-inner">
        <div className="page-cover-space" />
        <button
          type="button"
          className="page-icon-btn"
          title="Change icon"
          onClick={() => {
            const next = window.prompt("Emoji icon", page.icon || "📄");
            if (next != null && next.trim()) {
              onUpdatePage({ ...page, icon: next.trim().slice(0, 4), updatedAt: Date.now() });
            }
          }}
        >
          {page.icon || "📄"}
        </button>

        <textarea
          className="page-title-input"
          value={page.title}
          placeholder="Untitled"
          rows={1}
          onChange={(e) => {
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
            onUpdatePage({ ...page, title: e.target.value, updatedAt: Date.now() });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const first = page.blocks[0];
              if (first) setFocusId(first.id);
            }
          }}
        />

        <div className="page-controls">
          <button type="button" className="page-control-chip">
            Add cover
          </button>
          <button type="button" className="page-control-chip">
            Add comment
          </button>
        </div>

        <div className="blocks" style={{ position: "relative" }}>
          {page.blocks.map((block, index) => {
            if (block.type === "numbered") numberCounter += 1;
            else numberCounter = 0;
            const listIndex = block.type === "numbered" ? numberCounter : undefined;

            return (
              <div key={block.id} style={{ position: "relative" }}>
                <BlockRow
                  block={block}
                  index={index}
                  listIndex={listIndex}
                  autoFocus={focusId === block.id}
                  onChange={updateBlock}
                  onKeyDown={onKeyDown}
                  onFocus={setFocusId}
                  onPlus={addAfter}
                />
                {slash && slash.blockId === block.id && (
                  <SlashMenu
                    items={slashItems}
                    activeIndex={slash.active}
                    onPick={applySlash}
                    onClose={() => setSlash(null)}
                    top={48}
                    left={42}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
