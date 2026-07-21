/**
 * Mel: local coach. Tier 1+2. No API key.
 * UI: minimal, black, quiet. No fluff. No em dashes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendLifeLog,
  applyGoalCommand,
  applyPinCommand,
} from "./melContext";
import { writeTonightBrief, isBriefHour, loadBodyBrief } from "./bodyBrief";
import { melLocalReply } from "./melLocal";
import { todayKey } from "./data";
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

function linkify(text: string) {
  const clean = noEmDash(text);
  const parts = clean.split(/(https?:\/\/[^\s)]+)/g);
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
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (open) window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    saveMsgs(msgs);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      if (/^log\s*:?\s+/i.test(trimmed)) {
        const body = trimmed.replace(/^log\s*:?\s+/i, "");
        if (body) appendLifeLog(body);
      }
      applyGoalCommand(trimmed);
      applyPinCommand(trimmed);

      const userMsg: Msg = { id: uid(), role: "user", content: trimmed };
      setMsgs((prev) => [...prev, userMsg]);
      setInput("");
      setBusy(true);

      window.setTimeout(() => {
        const reply = noEmDash(melLocalReply(trimmed, pageId, pageTitle));
        setMsgs((prev) => [
          ...prev,
          { id: uid(), role: "assistant", content: reply },
        ]);
        setBusy(false);
      }, 30);
    },
    [busy, pageId, pageTitle]
  );

  function clearChat() {
    setMsgs([]);
    try {
      localStorage.removeItem(CHAT_KEY);
    } catch {
      /* ignore */
    }
  }

  // One-tap: write tonight's body brief into the chat
  function writeBrief() {
    if (busy) return;
    const brief = writeTonightBrief(todayKey());
    const userMsg: Msg = { id: uid(), role: "user", content: "brief" };
    const aiMsg: Msg = {
      id: uid(),
      role: "assistant",
      content: noEmDash(brief.fullText),
    };
    setMsgs((prev) => [...prev, userMsg, aiMsg]);
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
        <div className="mai-panel" role="dialog" aria-label="Mel">
          <header className="mai-head">
            <p className="mai-title">Mel</p>
            <button type="button" className="mai-head-btn" onClick={writeBrief}>
              Brief
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

          <div className="mai-msgs">
            {msgs.length === 0 && (
              <p className="mai-welcome">
                Let&apos;s get to work. Try: brief
              </p>
            )}
            {msgs.map((m) => (
              <div
                key={m.id}
                className={`mai-msg ${m.role === "user" ? "is-user" : "is-ai"}`}
              >
                {linkify(m.content)}
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
          </form>
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
