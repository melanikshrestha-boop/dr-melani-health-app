import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { todayKey } from "../data";
import { appendLifeLog, loadPins, savePins } from "../melContext";
import {
  buildTwin,
  formatTwinText,
  twinDoctorPack,
  writeTwin,
  type TwinState,
} from "./index";
import "./twin.css";

type DetailView = "none" | "twin" | "doctor";

function dayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
  });
}

function scoreTone(score: number): "high" | "mid" | "low" {
  if (score >= 70) return "high";
  if (score >= 48) return "mid";
  return "low";
}

export function TwinDashboard() {
  const [state, setState] = useState<TwinState>(() => buildTwin(todayKey()));
  const [detailView, setDetailView] = useState<DetailView>("none");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle"
  );
  const [selectedForecastDay, setSelectedForecastDay] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const copyReset = useRef<number | null>(null);
  const doctorPack = useMemo(() => twinDoctorPack(state.day), [state]);
  const selectedForecast = state.forecast.find((day) => day.day === selectedForecastDay) || null;
  const hasCoreLogs =
    state.sleepHours != null || state.protein_g > 0 || state.water_ml > 0;

  const rebuildLive = useCallback(() => {
    setState(buildTwin(todayKey()));
  }, []);

  useEffect(() => {
    window.addEventListener("focus", rebuildLive);
    return () => window.removeEventListener("focus", rebuildLive);
  }, [rebuildLive]);

  useEffect(() => {
    const text = `Twin lever ${state.day}: ${state.lever.title}. ${state.lever.detail}`;
    setPinned(loadPins().includes(text));
  }, [state.day, state.lever.detail, state.lever.title]);

  useEffect(() => () => {
    if (copyReset.current !== null) window.clearTimeout(copyReset.current);
  }, []);

  function refresh() {
    setState(writeTwin(todayKey()));
    setSelectedForecastDay(null);
  }

  function pinLever() {
    const text = `Twin lever ${state.day}: ${state.lever.title}. ${state.lever.detail}`;
    const pins = loadPins();
    const alreadyPinned = pins.includes(text);
    if (!alreadyPinned) {
      savePins([...pins, text]);
      appendLifeLog(`Twin lever pinned: ${state.lever.title}`);
    }
    setPinned(true);
  }

  async function copyActive() {
    const text = detailView === "doctor" ? doctorPack.fullText : formatTwinText(state);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    if (copyReset.current !== null) window.clearTimeout(copyReset.current);
    copyReset.current = window.setTimeout(() => {
      setCopyStatus("idle");
      copyReset.current = null;
    }, 1600);
  }

  const scoreItems = [
    ["Energy", state.scores.energy],
    ["Recovery", state.scores.recovery],
    ["Fuel", state.scores.fuel],
    ["Stress", state.scores.stress],
  ] as const;

  return (
    <section className="twin" aria-label="Mel Digital Twin">
      <header className="twin-head">
        <div>
          <p className="twin-kicker">Your twin</p>
          <h2 className="twin-title">Next seven days, from today&apos;s signals</h2>
          <p className="twin-phase">
            {state.phaseLabel} · cycle day {state.cycleDay}
          </p>
        </div>
        <div className="twin-overall" aria-label={`Overall score ${state.scores.overall}`}>
          <strong>{state.scores.overall}</strong>
          <span>overall</span>
        </div>
      </header>

      {!hasCoreLogs ? (
        <p className="twin-empty">
          Log sleep, a meal, or water so the twin can see you. Cycle and labs are
          already included when available.
        </p>
      ) : null}

      <div className="twin-scores" aria-label="Twin scores">
        {scoreItems.map(([label, value]) => (
          <div key={label} className="twin-score">
            <div className="twin-score-line">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
            <span className="twin-score-track" aria-hidden>
              <span style={{ width: `${value}%` }} />
            </span>
          </div>
        ))}
      </div>

      <div className="twin-section">
        <div className="twin-section-head">
          <h3>Early radar</h3>
          <span>{state.radar.length ? `${state.radar.length} signal${state.radar.length === 1 ? "" : "s"}` : "clear"}</span>
        </div>
        {state.radar.length ? (
          <div className="twin-radar-list">
            {state.radar.map((item) => (
              <article key={item.id} className={`twin-radar is-${item.severity}`}>
                <div className="twin-radar-title">
                  <span className="twin-radar-dot" aria-hidden />
                  <strong>{item.title}</strong>
                </div>
                <p>{item.why}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="twin-clear">No rising signal is strong enough to name today.</p>
        )}
      </div>

      <article className="twin-lever">
        <div>
          <p className="twin-lever-label">One lever</p>
          <h3>{state.lever.title}</h3>
          <p>{state.lever.detail}</p>
        </div>
        <button type="button" onClick={pinLever} disabled={pinned}>
          {pinned ? "Pinned" : "Do this"}
        </button>
      </article>

      <div className="twin-section">
        <div className="twin-section-head">
          <h3>Seven-day forecast</h3>
          <span>directional</span>
        </div>
        <div className="twin-forecast">
          {state.forecast.map((day) => {
            const readiness = Math.round((day.energy + day.recovery) / 2);
            return (
              <button
                key={day.day}
                type="button"
                className={`twin-day is-${scoreTone(readiness)}`}
                title={day.why}
                aria-pressed={selectedForecastDay === day.day}
                aria-label={`${dayLabel(day.day)}, ${day.label}, energy ${day.energy}, recovery ${day.recovery}. ${day.why}`}
                onClick={() => setSelectedForecastDay((selected) => selected === day.day ? null : day.day)}
              >
                <span>{dayLabel(day.day)}</span>
                <strong>{readiness}</strong>
                <small>{day.label}</small>
              </button>
            );
          })}
        </div>
        {selectedForecast ? (
          <p className="twin-forecast-detail" role="status">
            <strong>{dayLabel(selectedForecast.day)}: {selectedForecast.label}.</strong> {selectedForecast.why}
          </p>
        ) : null}
        <p className="twin-forecast-note">
          Tap a day for why. New logs change the forecast.
        </p>
      </div>

      <div className="twin-actions">
        <button type="button" onClick={refresh}>Refresh twin</button>
        <button
          type="button"
          aria-expanded={detailView === "twin"}
          onClick={() => setDetailView((view) => (view === "twin" ? "none" : "twin"))}
        >
          Full text
        </button>
        <button
          type="button"
          aria-expanded={detailView === "doctor"}
          onClick={() => setDetailView((view) => (view === "doctor" ? "none" : "doctor"))}
        >
          Doctor pack
        </button>
        <button type="button" onClick={copyActive}>
          {copyStatus === "copied"
            ? "Copied"
            : copyStatus === "failed"
              ? "Copy unavailable"
              : "Copy"}
        </button>
      </div>

      {detailView !== "none" ? (
        <pre className="twin-full" tabIndex={0}>
          {detailView === "doctor" ? doctorPack.fullText : formatTwinText(state)}
        </pre>
      ) : null}
    </section>
  );
}
