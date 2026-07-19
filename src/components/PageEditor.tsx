import { useMemo, useRef, useState } from "react";
import type { Block, Page } from "../types";
import { newBlock } from "../storage";
import { moveBlock } from "../workspaceOps";
import { BlockRow } from "./BlockRow";
import { SlashMenu } from "./SlashMenu";
import { EmojiPicker } from "./EmojiPicker";
import { DatabaseView } from "./DatabaseView";
import { filterSlash, type SlashCommand } from "../slashCommands";

type Props = {
  page: Page;
  allPages: Page[];
  childPages?: Page[];
  onUpdatePage: (page: Page) => void;
  onOpenPage?: (id: string) => void;
  onCreateSubpage?: (blockIndex: number) => void;
  onCreateDatabase?: () => void;
};

type SlashState = {
  blockId: string;
  index: number;
  query: string;
  active: number;
} | null;

const COVERS = [
  { id: null, label: "None", color: "transparent" },
  { id: "gray", label: "Gray", color: "#e3e2e0" },
  { id: "brown", label: "Brown", color: "#eee0da" },
  { id: "orange", label: "Orange", color: "#fadec9" },
  { id: "yellow", label: "Yellow", color: "#fdecc8" },
  { id: "green", label: "Green", color: "#dbeddb" },
  { id: "blue", label: "Blue", color: "#d3e5ef" },
  { id: "purple", label: "Purple", color: "#e8deee" },
  { id: "pink", label: "Pink", color: "#f5e0e9" },
  { id: "red", label: "Red", color: "#ffe2dd" },
] as const;

export function PageEditor({
  page,
  allPages,
  childPages = [],
  onUpdatePage,
  onOpenPage,
  onCreateSubpage,
  onCreateDatabase,
}: Props) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [slash, setSlash] = useState<SlashState>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const dragFrom = useRef<number | null>(null);

  const slashItems = useMemo(
    () => (slash ? filterSlash(slash.query) : []),
    [slash]
  );

  const pageById = useMemo(() => {
    const m = new Map<string, Page>();
    for (const p of allPages) m.set(p.id, p);
    return m;
  }, [allPages]);

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
      if (typeof patch.text === "string") {
        const m = patch.text.match(/^\/(.*)$/);
        if (m) {
          const idx = page.blocks.findIndex((x) => x.id === id);
          setSlash({
            blockId: id,
            index: idx,
            query: m[1] || "",
            active: 0,
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

    if (cmd.type === "new_page") {
      setSlash(null);
      onCreateSubpage?.(slash.index);
      return;
    }
    if (cmd.type === "new_database") {
      setSlash(null);
      onCreateDatabase?.();
      return;
    }

    if (cmd.type === "divider") {
      blocks[slash.index] = { ...b, type: "divider", text: "" };
      blocks.splice(slash.index + 1, 0, newBlock("paragraph"));
      setFocusId(blocks[slash.index + 1].id);
    } else {
      blocks[slash.index] = {
        ...b,
        type: cmd.type as Block["type"],
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

    // Tab / Shift+Tab indent
    if (e.key === "Tab") {
      e.preventDefault();
      const indent = block.indent || 0;
      const next = e.shiftKey
        ? Math.max(0, indent - 1)
        : Math.min(4, indent + 1);
      updateBlock(block.id, { indent: next });
      return;
    }

    // Arrow up/down between blocks at edges
    if (e.key === "ArrowUp" && e.currentTarget.selectionStart === 0) {
      const prev = page.blocks[index - 1];
      if (prev && prev.type !== "divider" && prev.type !== "page_link") {
        e.preventDefault();
        setFocusId(prev.id);
      }
    }
    if (
      e.key === "ArrowDown" &&
      e.currentTarget.selectionStart === e.currentTarget.value.length
    ) {
      const nxt = page.blocks[index + 1];
      if (nxt && nxt.type !== "divider" && nxt.type !== "page_link") {
        e.preventDefault();
        setFocusId(nxt.id);
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      let nextType: Block["type"] = "paragraph";
      if (block.type === "bullet") nextType = "bullet";
      else if (block.type === "numbered") nextType = "numbered";
      else if (block.type === "todo") nextType = "todo";

      const nb = {
        ...newBlock(nextType),
        indent: block.indent || 0,
      };
      const blocks = [...page.blocks];
      blocks.splice(index + 1, 0, nb);
      setBlocks(blocks);
      setFocusId(nb.id);
      setSlash(null);
      return;
    }

    if (e.key === "Backspace" && block.text === "") {
      e.preventDefault();
      if ((block.indent || 0) > 0) {
        updateBlock(block.id, { indent: (block.indent || 0) - 1 });
        return;
      }
      if (page.blocks.length <= 1) {
        // convert back to paragraph
        if (block.type !== "paragraph") {
          updateBlock(block.id, { type: "paragraph" });
        }
        return;
      }
      const blocks = page.blocks.filter((b) => b.id !== block.id);
      const prev = blocks[Math.max(0, index - 1)];
      setBlocks(blocks);
      if (prev) setFocusId(prev.id);
      setSlash(null);
      return;
    }

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

  function onDragStart(index: number) {
    dragFrom.current = index;
  }
  function onDragOver(_index: number) {
    /* allow drop */
  }
  function onDrop(toIndex: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === toIndex) return;
    setBlocks(moveBlock(page.blocks, from, toIndex));
  }

  const coverColor =
    COVERS.find((c) => c.id === page.cover)?.color || null;

  // Database page
  if (page.kind === "database") {
    return (
      <div className="page-scroll">
        <div className="page-inner">
          {page.cover && (
            <div
              className="page-cover"
              style={{ background: coverColor || "#e3e2e0" }}
            />
          )}
          <div className="page-cover-space" style={{ height: page.cover ? 8 : 48 }} />
          <div className="page-icon-wrap">
            <button
              type="button"
              className="page-icon-btn"
              onClick={() => setEmojiOpen((v) => !v)}
            >
              {page.icon || "▦"}
            </button>
            {emojiOpen && (
              <EmojiPicker
                current={page.icon || "▦"}
                onPick={(emoji) => {
                  onUpdatePage({ ...page, icon: emoji, updatedAt: Date.now() });
                  setEmojiOpen(false);
                }}
                onClose={() => setEmojiOpen(false)}
              />
            )}
          </div>
          <textarea
            className="page-title-input"
            value={page.title}
            placeholder="Untitled"
            rows={1}
            onChange={(e) => {
              onUpdatePage({
                ...page,
                title: e.target.value,
                updatedAt: Date.now(),
              });
            }}
          />
          <DatabaseView page={page} onUpdatePage={onUpdatePage} />
        </div>
      </div>
    );
  }

  let numberCounter = 0;

  return (
    <div className="page-scroll">
      <div className="page-inner">
        {page.cover && (
          <div
            className="page-cover"
            style={{ background: coverColor || "#e3e2e0" }}
          />
        )}
        <div className="page-cover-space" style={{ height: page.cover ? 8 : 48 }} />

        <div className="page-icon-wrap">
          <button
            type="button"
            className="page-icon-btn"
            title="Change icon"
            onClick={() => setEmojiOpen((v) => !v)}
          >
            {page.icon || "📄"}
          </button>
          {emojiOpen && (
            <EmojiPicker
              current={page.icon || "📄"}
              onPick={(emoji) => {
                onUpdatePage({ ...page, icon: emoji, updatedAt: Date.now() });
                setEmojiOpen(false);
              }}
              onClose={() => setEmojiOpen(false)}
            />
          )}
        </div>

        <textarea
          className="page-title-input"
          value={page.title}
          placeholder="Untitled"
          rows={1}
          onChange={(e) => {
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
            onUpdatePage({
              ...page,
              title: e.target.value,
              updatedAt: Date.now(),
            });
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
          <div className="page-cover-wrap">
            <button
              type="button"
              className="page-control-chip"
              onClick={() => setCoverOpen((v) => !v)}
            >
              {page.cover ? "Change cover" : "Add cover"}
            </button>
            {coverOpen && (
              <div className="cover-picker">
                {COVERS.map((c) => (
                  <button
                    key={String(c.id)}
                    type="button"
                    className="cover-swatch"
                    style={{
                      background: c.color === "transparent" ? "#fff" : c.color,
                      border:
                        c.color === "transparent"
                          ? "1px dashed rgba(55,53,47,0.25)"
                          : "1px solid rgba(55,53,47,0.1)",
                    }}
                    title={c.label}
                    onClick={() => {
                      onUpdatePage({
                        ...page,
                        cover: c.id,
                        updatedAt: Date.now(),
                      });
                      setCoverOpen(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="page-control-chip"
            onClick={() => onCreateSubpage?.(page.blocks.length - 1)}
          >
            + Sub-page
          </button>
        </div>

        <div className="blocks" style={{ position: "relative" }}>
          {page.blocks.map((block, index) => {
            if (block.type === "numbered") numberCounter += 1;
            else numberCounter = 0;
            const listIndex =
              block.type === "numbered" ? numberCounter : undefined;
            const linked =
              block.pageId ? pageById.get(block.pageId) : undefined;

            return (
              <div key={block.id} style={{ position: "relative" }}>
                <BlockRow
                  block={block}
                  index={index}
                  listIndex={listIndex}
                  autoFocus={focusId === block.id}
                  linkedTitle={linked?.title}
                  onChange={updateBlock}
                  onKeyDown={onKeyDown}
                  onFocus={setFocusId}
                  onPlus={addAfter}
                  onOpenPage={onOpenPage}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                />
                {slash && slash.blockId === block.id && (
                  <SlashMenu
                    items={slashItems}
                    activeIndex={slash.active}
                    onPick={applySlash}
                    onClose={() => setSlash(null)}
                    top={48}
                    left={42 + (block.indent || 0) * 24}
                  />
                )}
              </div>
            );
          })}
        </div>

        {childPages.length > 0 && (
          <div className="child-page-list">
            {childPages.map((child) => (
              <button
                key={child.id}
                type="button"
                className="child-page-link"
                onClick={() => onOpenPage?.(child.id)}
              >
                <span className="child-page-icon">
                  {child.kind === "database" ? "▦" : child.icon || "📄"}
                </span>
                <span className="child-page-title">
                  {child.title.trim() || "Untitled"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
