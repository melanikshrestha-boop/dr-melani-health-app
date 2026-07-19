/**
 * Rich Melani pages inside workspace shell.
 * Fitness = FitnessExact. Data = one stacked page (profile + period toggle + labs).
 */
import { useMemo, useState } from "react";
import {
  buildCycleCalendar,
  CYCLE,
  LAB_DRAWS,
  LAB_STATUS,
  PHASES,
  PROFILE,
} from "./data";
import { FitnessExact, isFitnessPage } from "./FitnessExact";
import "./melani.css";

/** One page: Profile → Period (toggle) → Labs neon + draws — like original My Data */
export function MelaniData() {
  const days = useMemo(() => buildCycleCalendar(), []);
  const [flow, setFlow] = useState<string | null>("medium");
  const [phase, setPhase] = useState("luteal");
  const [periodOpen, setPeriodOpen] = useState(false);

  return (
    <div className="melani-shell">
      {/* Sticky strip — age + height only, always on top while scrolling */}
      <div className="profile-sticky">
        <div className="profile-stat-row profile-stat-row-minimal">
          <span className="profile-stat">
            <em>Age</em>
            {PROFILE.ageDisplay} · {PROFILE.sex}
          </span>
          <span className="profile-stat">
            <em>Height</em>
            {PROFILE.height}
          </span>
        </div>
      </div>

      <div className="melani-inner melani-inner-below-profile">
        {/* Period tracker — collapsed by default, toggle to open */}
        <div className="melani-card melani-toggle-card">
          <button
            type="button"
            className="melani-toggle-head"
            onClick={() => setPeriodOpen((v) => !v)}
            aria-expanded={periodOpen}
          >
            <span>
              <span className="melani-h2" style={{ display: "block", margin: 0 }}>
                Period tracker
              </span>
              <span className="melani-hint" style={{ margin: "4px 0 0" }}>
                {CYCLE.phase} · next {CYCLE.predictedNextDisplay}
              </span>
            </span>
            <span className="melani-toggle-chevron" aria-hidden>
              {periodOpen ? "▾" : "▸"}
            </span>
          </button>

          {periodOpen && (
            <div className="melani-toggle-body">
              <p className="cycle-status">{CYCLE.statusLine}</p>
              <p className="cycle-phase">{CYCLE.phase}</p>

              <p className="cycle-subhead">Last period</p>
              <p className="cycle-meta">
                {CYCLE.lastPeriodDisplay} · short (~{CYCLE.periodLengthDays}{" "}
                days)
              </p>
              <p className="cycle-meta">
                Next expected: {CYCLE.predictedNextDisplay}
              </p>

              <p className="cycle-subhead">Today's flow</p>
              <div className="cycle-flow-btns">
                {CYCLE.flowLevels.map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`cycle-flow-btn cycle-flow-${level}${
                      flow === level ? " active" : ""
                    }`}
                    onClick={() => setFlow(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>

              <button type="button" className="cycle-start-btn">
                Period started today
              </button>

              <p className="cycle-subhead">Tap a phase to learn</p>
              <div className="cycle-phase-chips">
                {PHASES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`cycle-phase-chip${
                      phase === p.id ? " is-current" : ""
                    }`}
                    onClick={() => setPhase(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <p className="cycle-subhead">This cycle</p>
              <p className="cycle-meta">
                Ovulation (estimated): {CYCLE.predictedOvulationDisplay}
              </p>

              <div className="cycle-calendar">
                {days.map((d) => (
                  <div
                    key={d.iso}
                    className={[
                      "cycle-day",
                      d.isToday ? "cycle-day-today" : "",
                      d.isOvulation ? "cycle-day-ovulation" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    title={d.iso}
                  >
                    <span className="cycle-day-label">{d.weekday}</span>
                    <span
                      className={`cycle-dot cycle-dot-${d.flow || "empty"}`}
                    />
                    <span className="cycle-day-num">{d.label}</span>
                  </div>
                ))}
              </div>
              <p className="melani-hint">
                Pink = flow · gold ring = ovulation · blue ring = today
              </p>
            </div>
          )}
        </div>

        {/* Labs — neon status + draws stacked */}
        <div className="melani-card">
          <h2 className="melani-h2">Current status</h2>
          <p className="melani-hint">Key lab flags from your latest draw</p>
          <div className="neon-status-row">
            {LAB_STATUS.map((s) => (
              <div key={s.short} className={`neon-chip neon-${s.chip}`}>
                <span className="neon-chip-label">{s.short}</span>
                <span className="neon-chip-value">
                  {s.value} {s.unit}
                </span>
                <span className="neon-chip-badge">{s.badge}</span>
              </div>
            ))}
          </div>
        </div>

        {LAB_DRAWS.map((draw) => (
          <div key={draw.title} className="melani-card">
            <h2
              className="melani-h2"
              style={{ textTransform: "none", letterSpacing: 0 }}
            >
              {draw.title}
            </h2>
            {draw.lines.map((line) => (
              <div key={line} className="melani-line">
                <span>{line}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function isMelaniRichPage(pageId: string): boolean {
  return [
    "pg-fitness",
    "pg-sleep",
    "pg-meals",
    "pg-gym",
    "pg-body",
    "pg-data",
    "pg-my-data", // legacy id → same Data page
  ].includes(pageId);
}

export function MelaniRichPage({
  pageId,
  onGo,
}: {
  pageId: string;
  onGo: (id: string) => void;
}) {
  if (isFitnessPage(pageId)) {
    return <FitnessExact pageId={pageId} onGo={onGo} />;
  }

  // Single Data page (profile + period toggle + labs)
  if (pageId === "pg-data" || pageId === "pg-my-data") {
    return <MelaniData />;
  }

  return null;
}
