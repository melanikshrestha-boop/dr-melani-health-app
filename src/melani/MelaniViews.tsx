import { useMemo, useState } from "react";
import {
  buildCycleCalendar,
  CIRC,
  CYCLE,
  GYM_WEEK,
  LAB_DRAWS,
  LAB_STATUS,
  LIVE_APP,
  MACRO_CURRENT,
  MACRO_GOALS,
  MEAL_PRESETS,
  pct,
  PHASES,
  PROFILE,
} from "./data";
import "./melani.css";

function LiveBar({ path }: { path: string }) {
  return (
    <div className="melani-live-bar">
      <span>Dr. Melani export · same UI as the app</span>
      <a href={`${LIVE_APP}${path}`} target="_blank" rel="noreferrer">
        Open live →
      </a>
    </div>
  );
}

function FitnessSubnav({
  active,
  onGo,
}: {
  active: string;
  onGo: (id: string) => void;
}) {
  const items = [
    { id: "pg-sleep", label: "Sleep" },
    { id: "pg-meals", label: "Meals" },
    { id: "pg-gym", label: "Gym" },
    { id: "pg-body", label: "Body" },
  ];
  return (
    <div className="melani-subnav">
      {items.map((it, i) => (
        <span key={it.id} style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
          {i > 0 && <span className="dot">·</span>}
          <button
            type="button"
            className={active === it.id ? "is-active" : ""}
            onClick={() => onGo(it.id)}
          >
            {it.label}
          </button>
        </span>
      ))}
    </div>
  );
}

export function MelaniMeals({ onGo }: { onGo?: (id: string) => void }) {
  const g = MACRO_GOALS;
  const c = MACRO_CURRENT;
  const p = {
    calories: pct(c.calories, g.calories),
    protein_g: pct(c.protein_g, g.protein_g),
    carbs_g: pct(c.carbs_g, g.carbs_g),
    fat_g: pct(c.fat_g, g.fat_g),
    fiber_g: pct(c.fiber_g, g.fiber_g),
  };

  const off = (circ: number, percent: number) =>
    (circ * (1 - percent / 100)).toFixed(2);

  return (
    <div className="melani-shell">
      <div className="melani-inner">
        <LiveBar path="/meals" />
        {onGo && <FitnessSubnav active="pg-meals" onGo={onGo} />}

        <div className="melani-card">
          <h2 className="melani-h2">Today's macros</h2>
          <p className="melani-hint">
            Goal {g.protein_g}g protein · rings fill as you log food
          </p>

          <div className="macro-ring-wrap">
            <svg className="macro-rings" viewBox="0 0 200 200" aria-hidden>
              <circle className="ring-track" cx="100" cy="100" r="88" />
              <circle
                className="ring-cal"
                cx="100"
                cy="100"
                r="88"
                strokeDasharray={CIRC.cal}
                strokeDashoffset={off(CIRC.cal, p.calories)}
              />
              <circle className="ring-track" cx="100" cy="100" r="77" />
              <circle
                className="ring-protein"
                cx="100"
                cy="100"
                r="77"
                strokeDasharray={CIRC.protein}
                strokeDashoffset={off(CIRC.protein, p.protein_g)}
              />
              <circle className="ring-track" cx="100" cy="100" r="66" />
              <circle
                className="ring-carbs"
                cx="100"
                cy="100"
                r="66"
                strokeDasharray={CIRC.carbs}
                strokeDashoffset={off(CIRC.carbs, p.carbs_g)}
              />
              <circle className="ring-track" cx="100" cy="100" r="55" />
              <circle
                className="ring-fat"
                cx="100"
                cy="100"
                r="55"
                strokeDasharray={CIRC.fat}
                strokeDashoffset={off(CIRC.fat, p.fat_g)}
              />
              <circle className="ring-track" cx="100" cy="100" r="44" />
              <circle
                className="ring-fiber"
                cx="100"
                cy="100"
                r="44"
                strokeDasharray={CIRC.fiber}
                strokeDashoffset={off(CIRC.fiber, p.fiber_g)}
              />
              <circle className="ring-hole" cx="100" cy="100" r="32" />
            </svg>
            <div className="macro-ring-center">
              <span className="macro-ring-num">
                {c.protein_g}
                <small>g</small>
              </span>
              <span className="macro-ring-sub">protein</span>
              <span className="macro-ring-goal">of {g.protein_g}g</span>
            </div>
          </div>

          <ul className="macro-stats">
            <li>
              <span className="dot dot-cal" />
              Calories <strong>{c.calories}</strong> / {g.calories}
              <em>{Math.max(0, g.calories - c.calories)} left</em>
            </li>
            <li>
              <span className="dot dot-protein" />
              Protein <strong>{c.protein_g}g</strong> / {g.protein_g}g
            </li>
            <li>
              <span className="dot dot-carbs" />
              Carbs <strong>{c.carbs_g}g</strong> / {g.carbs_g}g
            </li>
            <li>
              <span className="dot dot-fat" />
              Fat <strong>{c.fat_g}g</strong> / {g.fat_g}g
            </li>
            <li>
              <span className="dot dot-fiber" />
              Fiber <strong>{c.fiber_g}g</strong> / {g.fiber_g}g
            </li>
          </ul>
        </div>

        <div className="melani-card">
          <h2 className="melani-h2">Usuals</h2>
          <p className="melani-hint">Same presets as Dr. Melani Meals</p>
          {MEAL_PRESETS.map((m) => (
            <div key={m.id} className="meal-usual">
              <p className="meal-usual-title">{m.title}</p>
              <p className="meal-usual-macros">
                {m.calories} cal · {m.protein_g}g protein · {m.carbs_g}g C ·{" "}
                {m.fat_g}g F · {m.fiber_g}g fiber
              </p>
              <ul>
                {m.ingredients.map((ing) => (
                  <li key={ing}>{ing}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="melani-card">
          <h2 className="melani-h2">Water</h2>
          <p className="melani-hint">Goal {PROFILE.waterGoalMl} ml / day</p>
          <div className="melani-line">
            <label>Logged</label>
            <span>— ml (log live in app)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MelaniCycle() {
  const days = useMemo(() => buildCycleCalendar(), []);
  const [flow, setFlow] = useState<string | null>("medium");
  const [phase, setPhase] = useState("luteal");

  return (
    <div className="melani-shell">
      <div className="melani-inner">
        <LiveBar path="/labs" />

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
                <span
                  className={`cycle-dot cycle-dot-${d.flow || "empty"}`}
                />
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
        <LiveBar path="/labs" />

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
            <h2 className="melani-h2" style={{ textTransform: "none", letterSpacing: 0 }}>
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

export function MelaniSleep({ onGo }: { onGo?: (id: string) => void }) {
  const [bf, setBf] = useState<"yes" | "no" | null>(null);
  return (
    <div className="melani-shell">
      <div className="melani-inner">
        <LiveBar path="/fitness" />
        {onGo && <FitnessSubnav active="pg-sleep" onGo={onGo} />}

        <div className="melani-card">
          <h2 className="melani-h2">Sleep</h2>
          <div className="melani-line">
            <label>Day:</label>
            <span>July 18, 2026</span>
          </div>
          <div className="melani-line">
            <label>Bedtime:</label>
            <span>—:—— ——</span>
          </div>
          <div className="melani-line">
            <label>Wake:</label>
            <span>—:—— ——</span>
          </div>
        </div>

        <div className="melani-card">
          <h2 className="melani-h2">Brain fog</h2>
          <p className="melani-hint">
            Logging for <strong style={{ color: "#fff" }}>today</strong> · Last week: mixed
          </p>
          <div className="bf-row">
            <button
              type="button"
              className={`bf-btn${bf === "yes" ? " yes-active" : ""}`}
              onClick={() => setBf("yes")}
            >
              Yes
            </button>
            <button
              type="button"
              className={`bf-btn${bf === "no" ? " no-active" : ""}`}
              onClick={() => setBf("no")}
            >
              No
            </button>
          </div>
          <p className="melani-hint">Yes = red day · No = green day (for doctor chat)</p>
        </div>

        <div className="melani-card">
          <h2 className="melani-h2">Weekly sleep</h2>
          <p className="melani-hint">Target ~8 hours · full chart in live Fitness app</p>
          <div className="melani-line">
            <label>Week:</label>
            <span>Week of Jul 18 – Jul 24, 2026 (current)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MelaniGym({ onGo }: { onGo?: (id: string) => void }) {
  return (
    <div className="melani-shell">
      <div className="melani-inner">
        <LiveBar path="/fitness" />
        {onGo && <FitnessSubnav active="pg-gym" onGo={onGo} />}

        <div className="melani-card">
          <h2 className="melani-h2">This week</h2>
          <p className="melani-hint">From Dr. Melani gym plans</p>
          <div className="gym-week">
            {GYM_WEEK.map((d) => (
              <div key={d.day} className="gym-day-row">
                <strong>{d.day}</strong>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{d.title}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="melani-card">
          <h2 className="melani-h2">Cardio</h2>
          <div className="gym-day-row">
            <span>Running</span>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>program</span>
          </div>
          <div className="gym-day-row" style={{ marginTop: 8 }}>
            <span>Swimming</span>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>option</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MelaniBody({ onGo }: { onGo?: (id: string) => void }) {
  return (
    <div className="melani-shell">
      <div className="melani-inner">
        <LiveBar path="/fitness" />
        {onGo && <FitnessSubnav active="pg-body" onGo={onGo} />}
        <div className="melani-card">
          <h2 className="melani-h2">Body</h2>
          <div className="melani-line">
            <label>Weight</label>
            <span>— (log in app)</span>
          </div>
          <div className="melani-line">
            <label>Photos</label>
            <span>Front · Side · Back</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MelaniProfile() {
  return (
    <div className="melani-shell">
      <div className="melani-inner">
        <LiveBar path="/labs" />
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

export function MelaniFitnessHub({ onGo }: { onGo: (id: string) => void }) {
  return (
    <div className="melani-shell">
      <div className="melani-inner">
        <LiveBar path="/fitness" />
        <FitnessSubnav active="pg-fitness" onGo={onGo} />
        <div className="melani-card">
          <h2 className="melani-h2">Fitness</h2>
          <p className="melani-hint">
            Same four slides as Dr. Melani — open Sleep · Meals · Gym · Body
          </p>
          <div className="gym-week">
            {[
              { id: "pg-sleep", t: "Sleep", d: "Bedtime · wake · brain fog" },
              { id: "pg-meals", t: "Meals", d: "Macro rings · usuals · water" },
              { id: "pg-gym", t: "Gym", d: "Week plan · warm-up" },
              { id: "pg-body", t: "Body", d: "Weight · progress photos" },
            ].map((x) => (
              <button
                key={x.id}
                type="button"
                className="gym-day-row"
                style={{ width: "100%", cursor: "pointer", fontFamily: "inherit", color: "inherit" }}
                onClick={() => onGo(x.id)}
              >
                <strong>{x.t}</strong>
                <span style={{ color: "rgba(255,255,255,0.55)" }}>{x.d} →</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Map stable page ids → Melani UI (not plain text blocks) */
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
  switch (pageId) {
    case "pg-fitness":
      return <MelaniFitnessHub onGo={onGo} />;
    case "pg-sleep":
      return <MelaniSleep onGo={onGo} />;
    case "pg-meals":
      return <MelaniMeals onGo={onGo} />;
    case "pg-gym":
      return <MelaniGym onGo={onGo} />;
    case "pg-body":
      return <MelaniBody onGo={onGo} />;
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
            <LiveBar path="/labs" />
            <div className="melani-card">
              <h2 className="melani-h2">My Data</h2>
              <p className="melani-hint">Open a section — UI matches Dr. Melani</p>
              <div className="gym-week">
                {[
                  { id: "pg-profile", t: "Profile" },
                  { id: "pg-cycle", t: "Period tracker" },
                  { id: "pg-labs", t: "Labs · neon status" },
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
