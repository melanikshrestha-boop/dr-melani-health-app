/**
 * Real Gmail client inside the workspace (IMAP bridge on :8790).
 * Connect with Gmail address + App Password → live inbox / open / send.
 */
import { useCallback, useEffect, useState } from "react";
import "./gmail-connector.css";

type Status = {
  connected: boolean;
  email?: string | null;
  ok?: boolean;
  error?: string;
  inbox_count?: number;
};

type MsgRow = {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  unread: boolean;
};

type MsgFull = {
  id: string;
  subject: string;
  from: string;
  to: string;
  cc?: string;
  date: string;
  body: string;
};

const API = "/api/gmail";

async function api<T>(
  path: string,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const text = await r.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { detail: text };
    }
    if (!r.ok) {
      const err =
        (data as { detail?: string })?.detail ||
        (data as { error?: string })?.error ||
        r.statusText;
      return { ok: false, error: String(err) };
    }
    return { ok: true, data: data as T };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Gmail bridge offline — run: npm run gmail",
    };
  }
}

type Props = { onGo?: (id: string) => void };

export function GmailConnector({ onGo }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [email, setEmail] = useState("itsmelanilaurent@gmail.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [selected, setSelected] = useState<MsgFull | null>(null);
  const [folder, setFolder] = useState("INBOX");
  const [query, setQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [flash, setFlash] = useState("");

  const refreshStatus = useCallback(async () => {
    const res = await api<Status>("/status");
    if (res.ok) {
      setStatus(res.data);
      if (res.data.email) setEmail(res.data.email);
    } else {
      setStatus({ connected: false });
      setErr(res.error);
    }
  }, []);

  const loadMessages = useCallback(
    async (f = folder, q = query) => {
      setBusy(true);
      setErr("");
      const qs = new URLSearchParams({
        folder: f,
        max_results: "40",
        ...(q.trim() ? { q: q.trim() } : {}),
      });
      const res = await api<{ messages: MsgRow[] }>(`/messages?${qs}`);
      setBusy(false);
      if (!res.ok) {
        setErr(res.error);
        setMessages([]);
        return;
      }
      setMessages(res.data.messages || []);
    },
    [folder, query]
  );

  useEffect(() => {
    // Kill old fake "permissions" connector storage — full access only
    try {
      localStorage.removeItem("dr-melani-gmail-connector");
    } catch {
      /* ignore */
    }
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (status?.connected && status.ok !== false) {
      loadMessages();
    }
  }, [status?.connected, status?.ok, loadMessages]);

  async function connect() {
    setBusy(true);
    setErr("");
    const res = await api<Status>("/connect", {
      method: "POST",
      body: JSON.stringify({ email, app_password: password }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setPassword("");
    setFlash("Connected to Gmail");
    window.setTimeout(() => setFlash(""), 2000);
    await refreshStatus();
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Gmail from this app?")) return;
    await api("/disconnect", { method: "POST" });
    setMessages([]);
    setSelected(null);
    await refreshStatus();
  }

  async function openMessage(id: string) {
    setBusy(true);
    setErr("");
    const res = await api<MsgFull>(
      `/message/${encodeURIComponent(id)}?folder=${encodeURIComponent(folder)}`
    );
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setSelected(res.data);
    // mark unread flag off in list
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, unread: false } : m))
    );
  }

  async function sendMail() {
    setBusy(true);
    setErr("");
    const res = await api<{ ok: boolean }>("/send", {
      method: "POST",
      body: JSON.stringify({ to, subject, body }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setComposeOpen(false);
    setTo("");
    setSubject("");
    setBody("");
    setFlash("Sent");
    window.setTimeout(() => setFlash(""), 2000);
  }

  const connected = !!(status?.connected && status.ok !== false);

  // ── Connect screen ──
  if (!connected) {
    return (
      <div className="gc">
        <h2 className="gc-h2">Gmail — real inbox</h2>
        <p className="gc-muted">
          Full access when connected (read + send). No permission toggles.
          Paste a Google <strong>App Password</strong> once.
        </p>

        <ol className="gc-steps">
          <li>
            Open{" "}
            <a
              className="gc-link"
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
            >
              Google App Passwords
            </a>
          </li>
          <li>Turn on 2-Step Verification if Google asks</li>
          <li>
            Create app password → name it <em>Dr Melani</em>
          </li>
          <li>Copy the 16-character password and paste below</li>
        </ol>

        {status?.connected && status.ok === false && (
          <p className="gc-err">
            Saved login failed: {status.error}. Reconnect with a new App
            Password.
          </p>
        )}

        <label className="gc-label" htmlFor="gc-email">
          Gmail address
        </label>
        <input
          id="gc-email"
          className="gc-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />

        <label className="gc-label" htmlFor="gc-pass">
          App Password (16 characters)
        </label>
        <input
          id="gc-pass"
          className="gc-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="xxxx xxxx xxxx xxxx"
          autoComplete="current-password"
        />

        <button
          type="button"
          className="gc-btn"
          onClick={connect}
          disabled={busy || !email || password.length < 8}
        >
          {busy ? "Connecting…" : "Connect Gmail"}
        </button>

        {err ? <p className="gc-err">{err}</p> : null}
        {flash ? <p className="gc-flash">{flash}</p> : null}

        <p className="gc-hint">
          Bridge must be running:{" "}
          <code>cd ~/notion-like && npm run gmail</code>
        </p>

        {onGo && (
          <button
            type="button"
            className="gc-btn-ghost"
            onClick={() => onGo("pg-agents")}
          >
            ← Agents
          </button>
        )}
      </div>
    );
  }

  // ── Live mail client ──
  return (
    <div className="gm">
      <header className="gm-top">
        <div className="gm-top-left">
          <span className="gm-brand">Gmail</span>
          <span className="gm-email">{status?.email}</span>
        </div>
        <div className="gm-top-actions">
          <button
            type="button"
            className="gc-btn"
            onClick={() => setComposeOpen(true)}
          >
            Compose
          </button>
          <button
            type="button"
            className="gc-btn-ghost"
            onClick={() => loadMessages()}
            disabled={busy}
          >
            Refresh
          </button>
          <button type="button" className="gc-btn-ghost" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      </header>

      <div className="gm-folders">
        {(["INBOX", "SENT", "STARRED"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`gm-folder${folder === f ? " is-on" : ""}`}
            onClick={() => {
              setFolder(f);
              setSelected(null);
              loadMessages(f, query);
            }}
          >
            {f === "INBOX" ? "Inbox" : f === "SENT" ? "Sent" : "Starred"}
          </button>
        ))}
      </div>

      <div className="gm-search-row">
        <input
          className="gc-input gm-search"
          placeholder="Search mail…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") loadMessages(folder, query);
          }}
        />
        <button
          type="button"
          className="gc-btn-ghost"
          onClick={() => loadMessages(folder, query)}
        >
          Search
        </button>
      </div>

      {err ? <p className="gc-err">{err}</p> : null}
      {flash ? <p className="gc-flash">{flash}</p> : null}

      <div className="gm-split">
        <div className="gm-list">
          {busy && !messages.length ? (
            <p className="gc-muted">Loading…</p>
          ) : null}
          {!busy && !messages.length ? (
            <p className="gc-muted">No messages</p>
          ) : null}
          {messages.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`gm-row${m.unread ? " is-unread" : ""}${
                selected?.id === m.id ? " is-active" : ""
              }`}
              onClick={() => openMessage(m.id)}
            >
              <span className="gm-row-from">{shortFrom(m.from)}</span>
              <span className="gm-row-sub">{m.subject}</span>
              <span className="gm-row-date">{shortDate(m.date)}</span>
            </button>
          ))}
        </div>

        <div className="gm-read">
          {!selected ? (
            <p className="gc-muted gm-read-empty">
              Select a message — like opening mail in Safari, inside this app.
            </p>
          ) : (
            <>
              <h2 className="gm-read-sub">{selected.subject}</h2>
              <p className="gm-read-meta">
                <strong>From</strong> {selected.from}
              </p>
              <p className="gm-read-meta">
                <strong>To</strong> {selected.to}
              </p>
              {selected.cc ? (
                <p className="gm-read-meta">
                  <strong>Cc</strong> {selected.cc}
                </p>
              ) : null}
              <p className="gm-read-meta gm-read-date">{selected.date}</p>
              <pre className="gm-read-body">{selected.body}</pre>
              <button
                type="button"
                className="gc-btn-ghost"
                onClick={() => {
                  setComposeOpen(true);
                  setTo(extractEmail(selected.from));
                  setSubject(
                    selected.subject.toLowerCase().startsWith("re:")
                      ? selected.subject
                      : `Re: ${selected.subject}`
                  );
                  setBody(`\n\n---\nOn ${selected.date}, ${selected.from} wrote:\n${selected.body.slice(0, 800)}`);
                }}
              >
                Reply
              </button>
            </>
          )}
        </div>
      </div>

      {composeOpen && (
        <div className="gm-compose-backdrop" onClick={() => setComposeOpen(false)}>
          <div
            className="gm-compose"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="gc-h2">Compose</h3>
            <label className="gc-label">To</label>
            <input
              className="gc-input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <label className="gc-label">Subject</label>
            <input
              className="gc-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <label className="gc-label">Body</label>
            <textarea
              className="gc-input gm-textarea"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="gm-compose-actions">
              <button
                type="button"
                className="gc-btn"
                onClick={sendMail}
                disabled={busy || !to || !subject}
              >
                Send
              </button>
              <button
                type="button"
                className="gc-btn-ghost"
                onClick={() => setComposeOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function shortFrom(from: string): string {
  const m = from.match(/"?([^"<]+)"?\s*</);
  if (m) return m[1].trim();
  return from.slice(0, 28);
}

function shortDate(d: string): string {
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d.slice(0, 16);
    return dt.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return d.slice(0, 16);
  }
}

function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return m ? m[1] : from.trim();
}
