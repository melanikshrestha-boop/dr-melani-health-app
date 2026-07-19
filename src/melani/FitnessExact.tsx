/**
 * Fitness page — pixel-faithful to Dr. Melani Fitness (Sleep · Meals · Gym · Body).
 * Quote + subnav + sleep/brain fog/weekly chart exactly like the app screenshot.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CIRC,
  GYM_WEEK,
  MACRO_CURRENT,
  MACRO_GOALS,
  MEAL_PRESETS,
  pct,
  PROFILE,
} from "./data";
import "./fitness-exact.css";

export type FitnessTab = "sleep" | "meals" | "gym" | "body";

const QUOTE = {
  text: "The best way to predict the future is to invent it.",
  source: "Alan Kay",
};

const BF_DAYS = [
  { key: "sat", label: "S", fog: true },
  { key: "sun", label: "S", fog: false },
  { key: "mon", label: "M", fog: false },
  { key: "tue", label: "T", fog: false },
  { key: "wed", label: "W", fog: false },
  { key: "thu", label: "T", fog: false },
  { key: "fri", label: "F", fog: false },
];

function tabFromPageId(pageId: string): FitnessTab {
  if (pageId === "pg-meals") return "meals";
  if (pageId === "pg-gym") return "gym";
  if (pageId === "pg-body") return "body";
  return "sleep"; // fitness hub + sleep
}

function SleepPanel() {
  const [bedtime, setBedtime] = useState("");
  const [wake, setWake] = useState("");
  const [bf, setBf] = useState<"yes" | "no" | null>("yes");
  const [bfDays, setBfDays] = useState(BF_DAYS);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fogCount = bfDays.filter((d) => d.fog).length;

  // Weekly sleep chart — green dashed 8h line like Melani
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 320;
    const h = 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padL = 36;
    const padR = 12;
    const padT = 16;
    const padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const yMax = 12;

    // card bg
    ctx.clearRect(0, 0, w, h);
    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }
    // y labels
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = '12px "Times New Roman", Times, serif';
    ctx.textAlign = "right";
    [12, 8, 4, 0].forEach((v, i) => {
      const y = padT + (plotH * i) / 3;
      ctx.fillText(String(v), padL - 8, y + 4);
    });
    // Hours label
    ctx.save();
    ctx.translate(12, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Hours", 0, 0);
    ctx.restore();

    // 8h goal dashed green
    const y8 = padT + plotH * (1 - 8 / yMax);
    ctx.strokeStyle = "#22c55e";
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padL, y8);
    ctx.lineTo(padL + plotW, y8);
    ctx.stroke();
    ctx.setLineDash([]);

    // x labels
    const labels = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.textAlign = "center";
    labels.forEach((lab, i) => {
      const x = padL + (plotW * (i + 0.5)) / 7;
      ctx.fillText(lab, x, h - 8);
    });
  }, []);

  return (
    <>
      <section className="fx-section">
        <h2 className="fx-h2">SLEEP</h2>
        <p className="fx-line">
          <span className="fx-key">Day:</span>
          <span className="fx-val">July 18, 2026</span>
        </p>
        <p className="fx-line">
          <span className="fx-key">Bedtime:</span>
          <input
            className="fx-input"
            type="time"
            value={bedtime}
            onChange={(e) => setBedtime(e.target.value)}
            aria-label="Bedtime"
          />
        </p>
        <p className="fx-line">
          <span className="fx-key">Wake:</span>
          <input
            className="fx-input"
            type="time"
            value={wake}
            onChange={(e) => setWake(e.target.value)}
            aria-label="Wake"
          />
        </p>
      </section>

      <section className="fx-section">
        <h2 className="fx-h2">BRAIN FOG</h2>
        <p className="fx-meta">
          Logging for <strong>today</strong> · Last week: mixed
        </p>
        <div className="fx-bf-btns">
          <button
            type="button"
            className={`fx-bf-tap fx-bf-yes${bf === "yes" ? " is-on" : ""}`}
            onClick={() => setBf("yes")}
          >
            Yes
          </button>
          <button
            type="button"
            className={`fx-bf-tap fx-bf-no${bf === "no" ? " is-on" : ""}`}
            onClick={() => setBf("no")}
          >
            No
          </button>
        </div>
        <div className="fx-bf-week">
          {bfDays.map((d, i) => (
            <button
              key={d.key}
              type="button"
              className={`fx-bf-day${d.fog ? " is-fog" : ""}${
                !d.fog && bfDays.some((x) => x.fog === false) ? "" : ""
              }`}
              onClick={() => {
                setBfDays((prev) =>
                  prev.map((x, j) =>
                    j === i ? { ...x, fog: !x.fog } : x
                  )
                );
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="fx-bf-summary">Brain fog {fogCount} of 7 days</p>
      </section>

      <section className="fx-section">
        <h2 className="fx-h2">WEEKLY SLEEP</h2>
        <p className="fx-line">
          <span className="fx-key">Week:</span>
          <span className="fx-val">Week of Jul 18 – Jul 24, 2026 (current)</span>
        </p>
        <div className="fx-chart-wrap">
          <canvas ref={canvasRef} className="fx-chart" />
        </div>
      </section>
    </>
  );
}

function MealsPanel() {
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
    <>
      <section className="fx-section">
        <h2 className="fx-h2">TODAY'S MACROS</h2>
        <p className="fx-meta">
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
      </section>
      <section className="fx-section">
        <h2 className="fx-h2">USUALS</h2>
        {MEAL_PRESETS.map((m) => (
          <div key={m.id} className="fx-usual">
            <p className="fx-usual-title">{m.title}</p>
            <p className="fx-meta">
              {m.calories} cal · {m.protein_g}g P · {m.carbs_g}g C · {m.fat_g}g F
            </p>
          </div>
        ))}
      </section>
      <section className="fx-section">
        <h2 className="fx-h2">WATER</h2>
        <p className="fx-line">
          <span className="fx-key">Goal:</span>
          <span className="fx-val">{PROFILE.waterGoalMl} ml</span>
        </p>
      </section>
    </>
  );
}

function GymPanel() {
  return (
    <section className="fx-section">
      <h2 className="fx-h2">GYM</h2>
      {GYM_WEEK.map((d) => (
        <p key={d.day} className="fx-line">
          <span className="fx-key">{d.day}:</span>
          <span className="fx-val">{d.title}</span>
        </p>
      ))}
    </section>
  );
}

function BodyPanel() {
  return (
    <section className="fx-section">
      <h2 className="fx-h2">BODY</h2>
      <p className="fx-line">
        <span className="fx-key">Weight:</span>
        <span className="fx-val">—</span>
      </p>
      <p className="fx-line">
        <span className="fx-key">Photos:</span>
        <span className="fx-val">Front · Side · Back</span>
      </p>
    </section>
  );
}

type Props = {
  pageId: string;
  onGo: (id: string) => void;
};

const TAB_TO_PAGE: Record<FitnessTab, string> = {
  sleep: "pg-sleep",
  meals: "pg-meals",
  gym: "pg-gym",
  body: "pg-body",
};

export function FitnessExact({ pageId, onGo }: Props) {
  const tab = useMemo(() => tabFromPageId(pageId), [pageId]);

  // Fitness hub opens Sleep (like the real app)
  useEffect(() => {
    if (pageId === "pg-fitness") {
      // stay showing sleep content; optional redirect
    }
  }, [pageId]);

  function selectTab(t: FitnessTab) {
    onGo(TAB_TO_PAGE[t]);
  }

  return (
    <div className="fx-page">
      <div className="fx-inner">
        {/* Quote — plain, no bubble */}
        <div className="fx-quote">
          <p className="fx-quote-text">“{QUOTE.text}”</p>
          <p className="fx-quote-author">— {QUOTE.source}</p>
        </div>

        {/* Sleep · Meals · Gym · Body */}
        <nav className="fx-subnav" aria-label="Fitness pages">
          {(
            [
              ["sleep", "Sleep"],
              ["meals", "Meals"],
              ["gym", "Gym"],
              ["body", "Body"],
            ] as const
          ).map(([id, label], i) => (
            <span key={id} className="fx-subnav-item">
              {i > 0 && <span className="fx-dot">·</span>}
              <button
                type="button"
                className={`fx-subnav-link${tab === id ? " is-active" : ""}`}
                onClick={() => selectTab(id)}
              >
                {label}
              </button>
            </span>
          ))}
        </nav>

        {tab === "sleep" && <SleepPanel />}
        {tab === "meals" && <MealsPanel />}
        {tab === "gym" && <GymPanel />}
        {tab === "body" && <BodyPanel />}
      </div>
    </div>
  );
}

export function isFitnessPage(pageId: string): boolean {
  return [
    "pg-fitness",
    "pg-sleep",
    "pg-meals",
    "pg-gym",
    "pg-body",
  ].includes(pageId);
}
