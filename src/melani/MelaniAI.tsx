import { useCallback, useEffect, useRef, useState } from "react";
import { isBriefHour, loadBodyBrief } from "./bodyBrief";
import { todayKey } from "./data";
import { checkMelCloud, checkMelLocalModel, runMelAgent } from "./melAgent";
import { MelOverview } from "./MelOverview";
import { ensureDefaultWeatherLocation } from "./weather/weatherCore";
import "./melani-ai.css";

type Role = "user" | "assistant";

type Msg = {
  id: string;
  role: Role;
  content: string;
};

type Props = {
  pageId?: string;
  pageTitle?: string;
};

const CHAT_KEY = "dr-melani-ai-chat-v1";
const OPEN_KEY = "dr-melani-ai-open";
// How big Mel's chat text is (you pick; we remember it)
const TEXT_SIZE_KEY = "dr-melani-ai-text-size-v1";
// S = a bit bigger than old default · M/L/XL step up for easy reading
type TextSize = "s" | "m" | "l" | "xl";
const TEXT_SIZES: TextSize[] = ["s", "m", "l", "xl"];

function loadTextSize(): TextSize {
  try {
    const v = localStorage.getItem(TEXT_SIZE_KEY) as TextSize | null;
    if (v && TEXT_SIZES.includes(v)) return v;
  } catch {
    /* ignore */
  }
  // Default larger so chat is easy to read without a click
  return "l";
}

function saveTextSize(size: TextSize) {
  try {
    localStorage.setItem(TEXT_SIZE_KEY, size);
  } catch {
    /* ignore */
  }
}

function loadMsgs(): Msg[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (raw) return JSON.parse(raw) as Msg[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveMsgs(msgs: Msg[]) {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-50)));
  } catch {
    /* ignore */
  }
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function noEmDash(text: string): string {
  return text
    .replace(/\u2014/g, ",")
    .replace(/\u2013/g, "-")
    .replace(/—/g, ",")
    .replace(/–/g, "-");
}

/** Render chat text in scannable chunks (paragraphs + links). Humans skim; walls fail. */
function renderMessage(text: string) {
  const clean = noEmDash(text);
  // Split on blank lines first (sections), then keep single newlines inside a chunk
  const blocks = clean.split(/\n{2,}/).filter((b) => b.trim().length > 0);
  if (blocks.length <= 1 && !clean.includes("\n")) {
    return linkifyInline(clean);
  }
  return blocks.map((block, bi) => {
    const lines = block.split("\n");
    return (
      <div key={bi} className="mai-chunk">
        {lines.map((line, li) => {
          const isHeader =
            /^—\s+.+?\s+—$/.test(line.trim())
            || /^(Nightly body brief|Today,|Today:|SLEEP|MEALS|WATER|CYCLE|GYM)/i.test(line.trim());
          return (
            <p
              key={li}
              className={
                isHeader
                  ? "mai-line mai-line-head"
                  : line.trim() === ""
                    ? "mai-line mai-line-gap"
                    : "mai-line"
              }
            >
              {linkifyInline(line || "\u00a0")}
            </p>
          );
        })}
      </div>
    );
  });
}

function linkifyInline(text: string) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((part, i) =>
    part.startsWith("http") ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function MelaniAI({ pageId, pageTitle }: Props) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [msgs, setMsgs] = useState<Msg[]>(() => loadMsgs());
  const [input, setInput] = useState("");
  const [view, setView] = useState<"chat" | "overview">("chat");
  // Chat text size: S M L XL — saved so it stays “to your liking”
  const [textSize, setTextSize] = useState<TextSize>(() => loadTextSize());
  const [busy, setBusy] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [localModelConnected, setLocalModelConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Shrink / grow Mel text one step; remember choice
  function changeTextSize(dir: -1 | 1) {
    const i = TEXT_SIZES.indexOf(textSize);
    const next = TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, i + dir))];
    if (!next || next === textSize) return;
    setTextSize(next);
    saveTextSize(next);
  }

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (open) window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Weather is Mel-only — default city NYC, no Weather page
    try {
      ensureDefaultWeatherLocation();
    } catch {
      /* ignore */
    }
    let active = true;
    const refresh = () => {
      // Health checks are short; failures must not block chat
      void Promise.all([checkMelCloud(), checkMelLocalModel()]).then(
        ([cloud, local]) => {
          if (!active) return;
          setCloudConnected(cloud);
          setLocalModelConnected(local);
        }
      );
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [open]);

  useEffect(() => {
    saveMsgs(msgs);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const userMsg: Msg = { id: uid(), role: "user", content: trimmed };
      setMsgs((prev) => [...prev, userMsg]);
      setInput("");
      setBusy(true);

      try {
        const result = await runMelAgent({
          text: trimmed,
          pageId,
          pageTitle,
          history: msgs.slice(-18).map(({ role, content }) => ({ role, content })),
          cloudAvailable: cloudConnected,
          localModelAvailable: localModelConnected,
        });
        setMsgs((prev) => [...prev, { id: uid(), role: "assistant", content: noEmDash(result.reply) }]);
      } catch {
        setMsgs((prev) => [...prev, {
          id: uid(),
          role: "assistant",
          content: "I hit a local save error. Nothing else was changed.",
        }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, cloudConnected, localModelConnected, msgs, pageId, pageTitle]
  );

  function clearChat() {
    setMsgs([]);
    try {
      localStorage.removeItem(CHAT_KEY);
    } catch {
      /* ignore */
    }
  }

  // Evening nudge: first open after 8pm with no brief yet
  useEffect(() => {
    if (!open) return;
    if (!isBriefHour()) return;
    if (loadBodyBrief(todayKey())) return;
    // Soft welcome line only when chat is empty
    setMsgs((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          id: uid(),
          role: "assistant",
          content:
            "Evening. Tap Brief for your nightly body report, or type brief.",
        },
      ];
    });
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="mai-root">
      {open && (
        <div
          className={`mai-panel${view === "overview" ? " is-overview" : ""} mai-size-${textSize}`}
          role="dialog"
          aria-label="Mel"
        >
          <header className="mai-head">
            <p className="mai-title">
              Mel
            </p>
            {/* Text size: A− smaller · A+ bigger (saved for next time) */}
            <button
              type="button"
              className="mai-head-btn mai-size-btn"
              onClick={() => changeTextSize(-1)}
              disabled={textSize === "s"}
              aria-label="Make Mel text smaller"
              title="Smaller text"
            >
              A−
            </button>
            <button
              type="button"
              className="mai-head-btn mai-size-btn"
              onClick={() => changeTextSize(1)}
              disabled={textSize === "xl"}
              aria-label="Make Mel text bigger"
              title="Bigger text"
            >
              A+
            </button>
            <button type="button" className={`mai-head-btn${view === "overview" ? " is-active" : ""}`} onClick={() => setView((current) => current === "overview" ? "chat" : "overview")}>
              Overview
            </button>
            <button type="button" className="mai-head-btn" onClick={clearChat}>
              Clear
            </button>
            <button
              type="button"
              className="mai-head-btn"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </header>

          {view === "overview" ? <MelOverview onClose={() => setView("chat")} /> : <>
          <nav className="mai-quick" aria-label="Mel quick actions">
            {[
              ["Brief", "brief"],
              ["Food", "food"],
              ["Status", "status"],
              // One tap undoes last page move / Mel action / trash
              ["Undo", "undo that"],
            ].map(([label, command]) => (
              <button
                key={command}
                type="button"
                title={command === "undo that" ? "Undo last change (also ⌘Z)" : undefined}
                onClick={() => void send(command)}
                disabled={busy}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="mai-msgs">
            {msgs.length === 0 && (
              <p className="mai-welcome">
                Tell me what you need done.
              </p>
            )}
            {msgs.map((m) => (
              <div
                key={m.id}
                className={`mai-msg ${m.role === "user" ? "is-user" : "is-ai"}${
                  m.content.includes("\n") || m.content.length > 120 ? " is-long" : ""
                }`}
              >
                {renderMessage(m.content)}
              </div>
            ))}
            {busy && <p className="mai-typing">…</p>}
            <div ref={bottomRef} />
          </div>

          <form
            className="mai-form"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              ref={inputRef}
              className="mai-input"
              rows={1}
              placeholder="Message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={busy}
            />
            <button
              type="submit"
              className="mai-send"
              disabled={busy || !input.trim()}
              aria-label="Send"
            >
              →
            </button>
          </form></>}
        </div>
      )}

      <button
        type="button"
        className={`mai-bubble${open ? " is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Mel" : "Open Mel"}
      >
        {open ? "×" : "M"}
      </button>
    </div>
  );
}
