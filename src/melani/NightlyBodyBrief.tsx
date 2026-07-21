/**
 * Nightly body brief card — shows tonight's report on Fitness.
 * One button rebuilds from live sleep / meals / cycle / gym / notes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadBodyBrief,
  writeTonightBrief,
  type BodyBrief,
} from "./bodyBrief";
import { todayKey } from "./data";
import "./nightly-body-brief.css";

type Props = {
  // Optional: jump somewhere (unused for now, kept for later links)
  onGo?: (id: string) => void;
};

export function NightlyBodyBrief({ onGo: _onGo }: Props) {
  // Current brief for today (null until first write)
  const [brief, setBrief] = useState<BodyBrief | null>(() =>
    loadBodyBrief(todayKey())
  );
  // Expanded full text vs short bullets
  const [open, setOpen] = useState(false);
  // Tiny copy status, including a useful failure state.
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const copyReset = useRef<number | null>(null);

  // Rebuild when the window gets focus (she logged sleep in another tab)
  useEffect(() => {
    function refresh() {
      setBrief(loadBodyBrief(todayKey()));
    }
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => () => {
    if (copyReset.current !== null) window.clearTimeout(copyReset.current);
  }, []);

  // Write or refresh from live localStorage
  const write = useCallback(() => {
    const next = writeTonightBrief(todayKey());
    setBrief(next);
    setOpen(true);
  }, []);

  // Copy full text so she can paste into Notes or GPT
  const copy = useCallback(async () => {
    if (!brief) return;
    try {
      await navigator.clipboard.writeText(brief.fullText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    if (copyReset.current !== null) window.clearTimeout(copyReset.current);
    copyReset.current = window.setTimeout(() => {
      setCopyStatus("idle");
      copyReset.current = null;
    }, 1600);
  }, [brief]);

  return (
    <section className="nbb-card" aria-label="Nightly body brief">
      <header className="nbb-head">
        <div className="nbb-titles">
          <p className="nbb-kicker">Tonight</p>
          <h2 className="nbb-title">Body brief</h2>
        </div>
        <button type="button" className="nbb-write" onClick={write}>
          {brief ? "Refresh" : "Write brief"}
        </button>
      </header>

      {!brief && (
        <p className="nbb-empty">
          Mel writes one clear report from sleep, meals, water, cycle, gym, and
          your notes. Tap Write brief when you are winding down.
        </p>
      )}

      {brief && (
        <>
          <ul className="nbb-list" aria-live="polite">
            {brief.summaryLines.map((line, i) => (
              <li key={i} className="nbb-line">
                {line}
              </li>
            ))}
          </ul>

          {brief.flags.length > 0 && (
            <div className="nbb-flags">
              <p className="nbb-flags-label">Gaps</p>
              {brief.flags.slice(0, 3).map((f, i) => (
                <p key={i} className="nbb-flag">
                  {f}
                </p>
              ))}
            </div>
          )}

          <div className="nbb-actions">
            <button
              type="button"
              className="nbb-link"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="nightly-body-brief-details"
            >
              {open ? "Hide full" : "Full brief"}
            </button>
            <button type="button" className="nbb-link" onClick={copy}>
              {copyStatus === "copied"
                ? "Copied"
                : copyStatus === "failed"
                  ? "Copy unavailable"
                  : "Copy"}
            </button>
          </div>

          {open && (
            <pre
              id="nightly-body-brief-details"
              className="nbb-full"
              tabIndex={0}
            >
              {brief.fullText}
            </pre>
          )}
        </>
      )}
    </section>
  );
}
