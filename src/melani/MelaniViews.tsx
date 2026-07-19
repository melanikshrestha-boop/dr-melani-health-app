/**
 * Rich Melani pages inside Notion shell.
 * Fitness = exact FitnessExact UI (quote + Sleep/Meals/Gym/Body).
 * My Data keeps period + neon labs.
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

export function MelaniCycle() {
  const days = useMemo(() => buildCycleCalendar(), []);
  const [flow, setFlow] = useState<string | null>("medium");
  const [phase, setPhase] = useState("luteal");

  return (
    <div className="melani-shell">
      <div className="melani-inner">
        <div className="melani-card">
          <h2 className="melani-h2">Period tracker</h2>
          <p className="cycle-status">{CYCLE.statusLine}</p>
          <p className="cycle-phase">{CYCLE.phase}</p>

          <p className="cycle-subhead">Last period</p>
          <p className="cycle-meta">
            {CYCLE.lastPeriodDisplay} · short (~{CYCLE.periodLengthDays} days)
          </p>
          <p className="cycle-meta">Next expected: {CYCLE.predictedNextDisplay}</p>

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
                className={`cycle-phase-chip${phase === p.id ? " is-current" : ""}`}
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
                <span className={`cycle-dot cycle-dot-${d.flow || "empty"}`} />
                <span className="cycle-day-num">{d.label}</span>
              </div>
            ))}
          </div>
          <p className="melani-hint">
            Pink = flow · gold ring = ovulation window · blue ring = today
          </p>
        </div>
      </div>
    </div>
  );
}

export function MelaniLabs() {
  return (
    <div className="melani-shell">
      <div className="melani-inner">
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

export function MelaniProfile() {
  return (
    <div className="melani-shell">
      <div className="melani-inner">
        <div className="melani-card">
          <h2 className="melani-h2">Profile</h2>
          <div className="profile-stat-row">
            <span className="profile-stat">
              <em>Age</em>
              {PROFILE.ageDisplay} · {PROFILE.sex}
            </span>
            <span className="profile-stat">
              <em>Height</em>
              {PROFILE.height}
            </span>
            <span className="profile-stat">
              <em>Provider</em>
              {PROFILE.provider}
            </span>
            <span className="profile-stat">
              <em>Patient ID</em>
              {PROFILE.patientId}
            </span>
          </div>
          <p className="melani-hint" style={{ marginTop: 12 }}>
            {PROFILE.conditions}
          </p>
          <p className="melani-hint">Water goal: {PROFILE.waterGoalMl} ml</p>
        </div>
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
    "pg-cycle",
    "pg-labs",
    "pg-profile",
    "pg-my-data",
  ].includes(pageId);
}

export function MelaniRichPage({
  pageId,
  onGo,
}: {
  pageId: string;
  onGo: (id: string) => void;
}) {
  // Fitness tree = exact screenshot UI only (no live bars, no hub junk)
  if (isFitnessPage(pageId)) {
    return <FitnessExact pageId={pageId} onGo={onGo} />;
  }

  switch (pageId) {
    case "pg-cycle":
      return <MelaniCycle />;
    case "pg-labs":
      return <MelaniLabs />;
    case "pg-profile":
      return <MelaniProfile />;
    case "pg-my-data":
      return (
        <div className="melani-shell">
          <div className="melani-inner">
            <div className="melani-card">
              <h2 className="melani-h2">My Data</h2>
              <p className="melani-hint">Profile · Period · Labs</p>
              <div className="gym-week">
                {[
                  { id: "pg-profile", t: "Profile" },
                  { id: "pg-cycle", t: "Period tracker" },
                  { id: "pg-labs", t: "Labs" },
                ].map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className="gym-day-row"
                    style={{
                      width: "100%",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: "inherit",
                    }}
                    onClick={() => onGo(x.id)}
                  >
                    <strong>{x.t}</strong>
                    <span>→</span>
                  </button>
                ))}
              </div>
            </div>
            <MelaniLabs />
          </div>
        </div>
      );
    default:
      return null;
  }
}
