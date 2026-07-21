/**
 * Fitness page — pixel-faithful to Dr. Melani Fitness (Sleep · Meals · Gym · Body).
 * Quote + subnav + sleep/brain fog/weekly chart exactly like the app screenshot.
 */
import { useEffect, useMemo, useRef, useState } from "react";
// useState used for consume checklist
import {
  CIRC,
  DAILY_SUPPLEMENTS,
  MACRO_GOALS,
  MEAL_PRESETS,
  pct,
  todayKey,
  type ConsumeLog,
} from "./data";
import { GymExact } from "./GymExact";
import { SmartMealCamera, type SmartMealDraft } from "./SmartMealCamera";
import { MEL_DATA_EVENT } from "./melTools";
import "./fitness-exact.css";
import "./gym-exact.css";

const CONSUME_KEY = "dr-melani-meals-consume";

type DayLog = Record<string, ConsumeLog>;

function loadDayLog(day: string): DayLog {
  try {
    const raw = localStorage.getItem(`${CONSUME_KEY}:${day}`);
    if (raw) return JSON.parse(raw) as DayLog;
  } catch {
    /* ignore */
  }
  return {};
}

function saveDayLog(day: string, log: DayLog) {
  try {
    localStorage.setItem(`${CONSUME_KEY}:${day}`, JSON.stringify(log));
  } catch {
    /* ignore */
  }
}

export type FitnessTab = "sleep" | "meals" | "gym";

const QUOTE = {
  text: "The best way to predict the future is to invent it.",
  source: "Alan Kay",
};

function tabFromPageId(pageId: string): FitnessTab {
  if (pageId === "pg-meals") return "meals";
  // Old Body page redirects to Gym (weight under warm-up)
  if (pageId === "pg-gym" || pageId === "pg-body") return "gym";
  return "sleep";
}

import {
  loadFogMap,
  loadSleepDay,
  saveFogMap,
  saveSleepDay,
  sleepHours,
  sleepWeekDays,
  weekSleepHours,
} from "./sleepStore";

function SleepPanel() {
  // Calendar day this panel is editing (local YYYY-MM-DD).
  // When the clock rolls to a new day, bed/wake go blank for that day;
  // older nights stay in storage and still show on the weekly line.
  const [dayIso, setDayIso] = useState(() => todayKey());
  const week = useMemo(() => {
    const [y, m, d] = dayIso.split("-").map(Number);
    return sleepWeekDays(new Date(y, m - 1, d));
  }, [dayIso]);

  const [bedtime, setBedtime] = useState(
    () => loadSleepDay(todayKey()).bedtime
  );
  const [wake, setWake] = useState(() => loadSleepDay(todayKey()).wake);
  const [fogMap, setFogMap] = useState<Record<string, boolean>>(() =>
    loadFogMap()
  );
  const [weekHours, setWeekHours] = useState<(number | null)[]>(() => {
    const iso = todayKey();
    const s = loadSleepDay(iso);
    const w = sleepWeekDays();
    return weekSleepHours(
      w.map((x) => x.iso),
      iso,
      s.bedtime,
      s.wake
    );
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const hoursToday = sleepHours(bedtime, wake);
  const fogCount = week.filter((d) => fogMap[d.iso]).length;
  const todayFog = fogMap[dayIso] === true;
  const weekLabel = `Week of ${week[0].label} to ${week[6].label}`;
  const dayLabel = (() => {
    const [y, m, d] = dayIso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  })();

  // New calendar day → blank bed/wake for today (yesterday already saved)
  useEffect(() => {
    function rollToToday() {
      const now = todayKey();
      if (now === dayIso) return;
      setDayIso(now);
      const next = loadSleepDay(now); // empty if never logged this day
      setBedtime(next.bedtime);
      setWake(next.wake);
    }
    rollToToday();
    const id = window.setInterval(rollToToday, 20_000); // catch midnight while open
    window.addEventListener("focus", rollToToday);
    document.addEventListener("visibilitychange", rollToToday);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", rollToToday);
      document.removeEventListener("visibilitychange", rollToToday);
    };
  }, [dayIso]);

  // Save THIS day's times + rebuild weekly line (history + live today)
  useEffect(() => {
    if (bedtime || wake) {
      saveSleepDay(dayIso, bedtime, wake);
    }
    setWeekHours(
      weekSleepHours(
        week.map((d) => d.iso),
        dayIso,
        bedtime,
        wake
      )
    );
  }, [bedtime, wake, dayIso, week]);

  useEffect(() => {
    saveFogMap(fogMap);
  }, [fogMap]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const domain = (event as CustomEvent<{ domain?: string }>).detail?.domain;
      if (domain !== "sleep" && domain !== "brainFog") return;
      const sleep = loadSleepDay(dayIso);
      setBedtime(sleep.bedtime);
      setWake(sleep.wake);
      setFogMap(loadFogMap());
    };
    window.addEventListener(MEL_DATA_EVENT, refresh);
    return () => window.removeEventListener(MEL_DATA_EVENT, refresh);
  }, [dayIso]);

  // Draw linear weekly sleep chart (hours per day, line + dots)
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(wrap.clientWidth || 300, 220);
      const h = 180;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const padL = 36;
      const padR = 12;
      const padT = 22;
      const padB = 28;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      // Y axis 0–14 so 8h goal sits mid-upper; clamp points into range
      const yMax = 14;

      ctx.clearRect(0, 0, w, h);
      // Grid
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 3; i++) {
        const y = padT + (plotH * i) / 3;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = '12px "Times New Roman", Times, serif';
      ctx.textAlign = "right";
      [14, 10, 5, 0].forEach((v, i) => {
        ctx.fillText(String(v), padL - 8, padT + (plotH * i) / 3 + 4);
      });
      ctx.save();
      ctx.translate(12, padT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText("Hours", 0, 0);
      ctx.restore();

      // 8h goal line (green dashed)
      const y8 = padT + plotH * (1 - 8 / yMax);
      ctx.strokeStyle = "rgba(34,197,94,0.55)";
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padL, y8);
      ctx.lineTo(padL + plotW, y8);
      ctx.stroke();
      ctx.setLineDash([]);

      // One point per day that has hours (index keeps Mon under Mon, etc.)
      const points: { x: number; y: number; hr: number; i: number }[] = [];
      weekHours.forEach((hr, i) => {
        if (hr == null || Number.isNaN(hr)) return;
        const x = padL + (plotW * (i + 0.5)) / 7;
        const clamped = Math.max(0, Math.min(yMax, hr));
        const y = padT + plotH * (1 - clamped / yMax);
        points.push({ x, y, hr, i });
      });

      if (points.length > 0) {
        // Linear line: connect days in week order (gaps skip missing nights)
        ctx.strokeStyle = "rgba(255,255,255,0.92)";
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        points.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        // Dots + hour labels
        points.forEach((p) => {
          ctx.beginPath();
          ctx.fillStyle = p.hr >= 7.5 ? "#22c55e" : "#fb7185";
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
          // white ring so it pops on dark bg
          ctx.strokeStyle = "rgba(0,0,0,0.35)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.font = '11px "Times New Roman", Times, serif';
          ctx.textAlign = "center";
          ctx.fillText(String(p.hr), p.x, p.y - 9);
        });
      }

      // Day labels
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = '12px "Times New Roman", Times, serif';
      ctx.textAlign = "center";
      week.forEach((d, i) => {
        const isToday = d.iso === dayIso;
        ctx.fillStyle = isToday
          ? "rgba(255,255,255,0.85)"
          : "rgba(255,255,255,0.45)";
        ctx.fillText(d.short, padL + (plotW * (i + 0.5)) / 7, h - 8);
      });
    };

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [weekHours, week, dayIso]);

  // Hint when both times set but hours invalid (e.g. 1 AM → 11 PM = 22h)
  const timesSet = Boolean(bedtime && wake);
  const hoursInvalid = timesSet && hoursToday == null;

  return (
    <>
      <section className="fx-section">
        <h2 className="fx-h2">SLEEP</h2>
        <p className="fx-line">
          <span className="fx-key">Day:</span>
          <span className="fx-val">{dayLabel}</span>
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
        {hoursToday != null ? (
          <p className="fx-line">
            <span className="fx-key">Hours:</span>
            <span className="fx-val">{hoursToday} h</span>
          </p>
        ) : null}
        {hoursInvalid ? (
          <p className="fx-line fx-sleep-hint">
            Times look off (need about 1–16 hours). Example: bed 11:00 PM, wake
            7:00 AM — or bed 1:00 AM, wake 11:00 AM.
          </p>
        ) : null}
      </section>

      <section className="fx-section">
        <h2 className="fx-h2">BRAIN FOG</h2>
        <div className="fx-bf-btns">
          <button
            type="button"
            className={`fx-bf-tap fx-bf-yes${todayFog ? " is-on" : ""}`}
            onClick={() => setFogMap((m) => ({ ...m, [dayIso]: true }))}
          >
            Yes
          </button>
          <button
            type="button"
            className={`fx-bf-tap fx-bf-no${
              fogMap[dayIso] === false ? " is-on" : ""
            }`}
            onClick={() => setFogMap((m) => ({ ...m, [dayIso]: false }))}
          >
            No
          </button>
        </div>
        <div className="fx-bf-week">
          {week.map((d) => (
            <button
              key={d.iso}
              type="button"
              className={`fx-bf-day${fogMap[d.iso] ? " is-fog" : ""}`}
              title={d.label}
              onClick={() =>
                setFogMap((m) => ({ ...m, [d.iso]: !m[d.iso] }))
              }
            >
              {d.short[0]}
            </button>
          ))}
        </div>
        <p className="fx-bf-summary">Brain fog {fogCount} of 7 days</p>
      </section>

      <section className="fx-section">
        <h2 className="fx-h2">WEEKLY SLEEP</h2>
        <p className="fx-line">
          <span className="fx-key">Week:</span>
          <span className="fx-val">{weekLabel}</span>
        </p>
        <div className="fx-chart-wrap" ref={wrapRef}>
          <canvas ref={canvasRef} className="fx-chart" />
        </div>
      </section>
    </>
  );
}

// Today's logged usuals → macros (saved in this browser)
const USUAL_LOG_KEY = "dr-melani-meals-usuals";

type MacroBag = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

type UsualDayLog = {
  // which usual ids were logged today (can log more than once? keep once each)
  loggedIds: string[];
  // sum of macros from logged usuals
  totals: MacroBag;
};

function emptyMacros(): MacroBag {
  return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
}

function loadUsualDay(day: string): UsualDayLog {
  try {
    const raw = localStorage.getItem(`${USUAL_LOG_KEY}:${day}`);
    if (raw) return JSON.parse(raw) as UsualDayLog;
  } catch {
    /* ignore */
  }
  return { loggedIds: [], totals: emptyMacros() };
}

function saveUsualDay(day: string, data: UsualDayLog) {
  try {
    localStorage.setItem(`${USUAL_LOG_KEY}:${day}`, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function MealsPanel() {
  // Track calendar day so midnight clears "logged today" and starts a fresh log
  const [day, setDay] = useState(() => todayKey());
  const g = MACRO_GOALS;

  // One-tap usual log (breakfast etc.) — this is the main logging UI
  const [usualDay, setUsualDay] = useState<UsualDayLog>(() =>
    loadUsualDay(todayKey())
  );
  const [flash, setFlash] = useState("");
  // Open "What's in it" when linked with ?details=breakfast (or leave closed)
  const [openDetails, setOpenDetails] = useState<string | null>(() => {
    try {
      const d = new URLSearchParams(window.location.search).get("details");
      if (d === "breakfast" || d === "1") return "breakfast_usual";
    } catch {
      /* ignore */
    }
    return null;
  });

  // New day → load that day's meals (empty if nothing logged yet)
  useEffect(() => {
    function roll() {
      const now = todayKey();
      if (now === day) return;
      setDay(now);
      setUsualDay(loadUsualDay(now));
    }
    roll();
    const id = window.setInterval(roll, 20_000);
    window.addEventListener("focus", roll);
    document.addEventListener("visibilitychange", roll);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", roll);
      document.removeEventListener("visibilitychange", roll);
    };
  }, [day]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const domain = (event as CustomEvent<{ domain?: string }>).detail?.domain;
      if (domain === "meals") setUsualDay(loadUsualDay(day));
    };
    window.addEventListener(MEL_DATA_EVENT, refresh);
    return () => window.removeEventListener(MEL_DATA_EVENT, refresh);
  }, [day]);

  const c = usualDay.totals;
  const p = {
    calories: pct(c.calories, g.calories),
    protein_g: pct(c.protein_g, g.protein_g),
    carbs_g: pct(c.carbs_g, g.carbs_g),
    fat_g: pct(c.fat_g, g.fat_g),
    fiber_g: pct(c.fiber_g, g.fiber_g),
  };
  const off = (circ: number, percent: number) =>
    (circ * (1 - percent / 100)).toFixed(2);

  // Keep day log for usual meal checkmarks (no OTHER/SNACK row anymore)
  const [, setLog] = useState<DayLog>(() => loadDayLog(day));

  function patch(id: string, next: Partial<ConsumeLog>) {
    setLog((prev) => {
      const cur = prev[id] || { done: false, time: "" };
      const merged = { ...cur, ...next };
      const out = { ...prev, [id]: merged };
      saveDayLog(day, out);
      return out;
    });
  }

  /** Log a usual meal once for today → rings update */
  function logUsual(presetId: string) {
    const preset = MEAL_PRESETS.find((m) => m.id === presetId);
    if (!preset) return;
    if (usualDay.loggedIds.includes(presetId)) {
      setFlash("Already logged today");
      window.setTimeout(() => setFlash(""), 1600);
      return;
    }
    const next: UsualDayLog = {
      loggedIds: [...usualDay.loggedIds, presetId],
      totals: {
        calories: usualDay.totals.calories + preset.calories,
        protein_g: usualDay.totals.protein_g + preset.protein_g,
        carbs_g: usualDay.totals.carbs_g + preset.carbs_g,
        fat_g: usualDay.totals.fat_g + preset.fat_g,
        fiber_g: usualDay.totals.fiber_g + preset.fiber_g,
      },
    };
    setUsualDay(next);
    saveUsualDay(day, next);
    // also tick the consume checklist row for that meal
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    patch(`meal-${presetId}`, { done: true, time: `${hh}:${mm}` });
    setFlash(`Logged ${preset.title.toLowerCase()} — macros updated`);
    window.setTimeout(() => setFlash(""), 2200);
  }

  /** Undo a usual so you can log again */
  function undoUsual(presetId: string) {
    const preset = MEAL_PRESETS.find((m) => m.id === presetId);
    if (!preset || !usualDay.loggedIds.includes(presetId)) return;
    const next: UsualDayLog = {
      loggedIds: usualDay.loggedIds.filter((id) => id !== presetId),
      totals: {
        calories: Math.max(0, usualDay.totals.calories - preset.calories),
        protein_g: Math.max(0, usualDay.totals.protein_g - preset.protein_g),
        carbs_g: Math.max(0, usualDay.totals.carbs_g - preset.carbs_g),
        fat_g: Math.max(0, usualDay.totals.fat_g - preset.fat_g),
        fiber_g: Math.max(0, usualDay.totals.fiber_g - preset.fiber_g),
      },
    };
    setUsualDay(next);
    saveUsualDay(day, next);
    patch(`meal-${presetId}`, { done: false });
    setFlash("Undone");
    window.setTimeout(() => setFlash(""), 1400);
  }

  function logSmartMeal(meal: SmartMealDraft) {
    const id = `smart-${Date.now()}`;
    const next: UsualDayLog = {
      loggedIds: [...usualDay.loggedIds, id],
      totals: {
        calories: Math.round(usualDay.totals.calories + meal.totals.calories),
        protein_g: Math.round(usualDay.totals.protein_g + meal.totals.protein_g),
        carbs_g: Math.round(usualDay.totals.carbs_g + meal.totals.carbs_g),
        fat_g: Math.round(usualDay.totals.fat_g + meal.totals.fat_g),
        fiber_g: Math.round(usualDay.totals.fiber_g + meal.totals.fiber_g),
      },
    };
    setUsualDay(next);
    saveUsualDay(day, next);
    try {
      const key = `dr-melani-smart-meals:${day}`;
      const prior = JSON.parse(localStorage.getItem(key) || "[]");
      localStorage.setItem(key, JSON.stringify([...prior, { ...meal, id, loggedAt: new Date().toISOString() }]));
    } catch { /* the macro record is already saved */ }
    setFlash(`Logged ${meal.title.toLowerCase()} · verified macros added`);
    window.setTimeout(() => setFlash(""), 2400);
  }

  return (
    <>
      <section className="fx-section">
        <h2 className="fx-h2">TODAY&apos;S MACROS</h2>
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

      <SmartMealCamera onLog={logSmartMeal} />

      {/* One-tap meal log — no worthless MY USUALS header */}
      <section className="fx-section usuals-section">
        {flash ? <p className="usual-flash">{flash}</p> : null}

        {MEAL_PRESETS.map((u) => {
          const logged = usualDay.loggedIds.includes(u.id);
          const open = openDetails === u.id;
          return (
            <div
              key={u.id}
              className={`usual-card${u.slot === "breakfast" ? " is-breakfast" : ""}${
                logged ? " is-logged" : ""
              }`}
            >
              {/* Skip slot label when title already says it (e.g. Breakfast) */}
              {u.title.toLowerCase() !== u.slot.toLowerCase() ? (
                <p className="usual-slot">{u.slot}</p>
              ) : null}
              <h3 className="usual-title">{u.title}</h3>
              <p className="usual-macro-line">
                {u.calories} cal · {u.protein_g}g protein · {u.carbs_g}g C ·{" "}
                {u.fat_g}g F
              </p>

              {logged ? (
                <div className="usual-logged-row">
                  <span className="usual-logged-label">Logged today ✓</span>
                  <button
                    type="button"
                    className="usual-undo-btn"
                    onClick={() => undoUsual(u.id)}
                  >
                    Undo
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="usual-log-btn"
                  onClick={() => logUsual(u.id)}
                >
                  Log {u.title.toLowerCase()} today
                </button>
              )}

              <button
                type="button"
                className="usual-details-toggle"
                aria-expanded={open}
                onClick={() =>
                  setOpenDetails((cur) => (cur === u.id ? null : u.id))
                }
              >
                {open ? "▾" : "▸"} What&apos;s in it
              </button>
              {open && (
                <div className="usual-details">
                  {/* Notes line under "What's in it" — same style as before */}
                  {u.notes ? <p className="usual-notes">{u.notes}</p> : null}
                  {u.sections && u.sections.length > 0 ? (
                    u.sections.map((sec, si) => (
                      <div key={sec.title || `sec-${si}`} className="usual-sec">
                        {sec.title ? (
                          <p className="usual-sec-title">{sec.title}</p>
                        ) : null}
                        <ul className="usual-ingredients">
                          {sec.items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))
                  ) : (
                    <ul className="usual-ingredients">
                      {u.ingredients.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <WaterTracker day={day} />
      <SupplementsList day={day} />
    </>
  );
}

const WATER_GOAL_ML = 4000; // 4 L
const WATER_ADDS = [
  { ml: 250, label: "+250 ml" },
  { ml: 500, label: "+500 ml" },
  { ml: 1000, label: "+1 L" },
] as const;

const WATER_KEY = "dr-melani-water-ml";
const WATER_HIST_KEY = "dr-melani-water-hist";

function loadWater(day: string): number {
  try {
    const raw = localStorage.getItem(`${WATER_KEY}:${day}`);
    if (raw) return Math.max(0, Number(raw) || 0);
  } catch {
    /* ignore */
  }
  return 0;
}

function saveWater(day: string, ml: number) {
  try {
    localStorage.setItem(`${WATER_KEY}:${day}`, String(ml));
  } catch {
    /* ignore */
  }
}

function loadWaterHist(day: string): number[] {
  try {
    const raw = localStorage.getItem(`${WATER_HIST_KEY}:${day}`);
    if (raw) return JSON.parse(raw) as number[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveWaterHist(day: string, hist: number[]) {
  try {
    localStorage.setItem(`${WATER_HIST_KEY}:${day}`, JSON.stringify(hist));
  } catch {
    /* ignore */
  }
}

/** Water like Melani: bar + plain text adds (no underlines, no boxes) */
function WaterTracker({ day }: { day: string }) {
  const [ml, setMl] = useState(() => loadWater(day));
  const [hist, setHist] = useState<number[]>(() => loadWaterHist(day));
  const goal = WATER_GOAL_ML;
  const liters = (ml / 1000).toFixed(1);
  const goalL = goal / 1000;
  const pctFill = Math.min(100, Math.round((ml / goal) * 100));

  useEffect(() => {
    const refresh = (event: Event) => {
      const domain = (event as CustomEvent<{ domain?: string }>).detail?.domain;
      if (domain !== "water") return;
      setMl(loadWater(day));
      setHist(loadWaterHist(day));
    };
    window.addEventListener(MEL_DATA_EVENT, refresh);
    return () => window.removeEventListener(MEL_DATA_EVENT, refresh);
  }, [day]);

  function add(amount: number) {
    setMl((prev) => {
      const next = Math.min(goal, prev + amount);
      const added = next - prev;
      if (added > 0) {
        setHist((h) => {
          const nh = [...h, added];
          saveWaterHist(day, nh);
          return nh;
        });
      }
      saveWater(day, next);
      return next;
    });
  }

  function undoLast() {
    setHist((h) => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      const rest = h.slice(0, -1);
      setMl((prev) => {
        const next = Math.max(0, prev - last);
        saveWater(day, next);
        return next;
      });
      saveWaterHist(day, rest);
      return rest;
    });
  }

  function reset() {
    setMl(0);
    setHist([]);
    saveWater(day, 0);
    saveWaterHist(day, []);
  }

  return (
    <section className="fx-section fx-water">
      <h2 className="fx-h2 fx-water-title">
        Water — {liters} / {goalL} L
      </h2>
      <div className="fx-water-bar" aria-hidden>
        <div className="fx-water-fill" style={{ width: `${pctFill}%` }} />
      </div>
      <div className="fx-water-btns">
        {WATER_ADDS.map((b) => (
          <button
            key={b.ml}
            type="button"
            className="fx-water-btn"
            onClick={() => add(b.ml)}
            disabled={ml >= goal}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="fx-water-actions">
        <button
          type="button"
          className="fx-water-action"
          onClick={undoLast}
          disabled={!hist.length}
        >
          Undo last
        </button>
        <button
          type="button"
          className="fx-water-action"
          onClick={reset}
          disabled={ml <= 0}
        >
          Reset today
        </button>
      </div>
    </section>
  );
}

const SUP_KEY = "dr-melani-supplements-done";

function loadSupDone(day: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(`${SUP_KEY}:${day}`);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* ignore */
  }
  return {};
}

function saveSupDone(day: string, map: Record<string, boolean>) {
  try {
    localStorage.setItem(`${SUP_KEY}:${day}`, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Supplements: name (pink) · brand (gold) · when to take (gold) — tap to cross out */
function SupplementsList({ day }: { day: string }) {
  const [done, setDone] = useState(() => loadSupDone(day));

  useEffect(() => {
    const refresh = (event: Event) => {
      const domain = (event as CustomEvent<{ domain?: string }>).detail?.domain;
      if (domain === "supplements") setDone(loadSupDone(day));
    };
    window.addEventListener(MEL_DATA_EVENT, refresh);
    return () => window.removeEventListener(MEL_DATA_EVENT, refresh);
  }, [day]);

  function toggle(id: string) {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveSupDone(day, next);
      return next;
    });
  }

  return (
    <section className="fx-section fx-supps">
      <h2 className="fx-h2">Supplements</h2>
      <ol className="fx-supp-list">
        {DAILY_SUPPLEMENTS.map((s, i) => {
          const isDone = !!done[s.id];
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`fx-supp-item${isDone ? " is-done" : ""}`}
                onClick={() => toggle(s.id)}
              >
                <span className="fx-supp-num">{i + 1}.</span>
                <span className="fx-supp-body">
                  <span className="fx-supp-name">{s.name}</span>
                  {s.dose ? (
                    <span className="fx-supp-when"> · {s.dose}</span>
                  ) : null}
                  {s.when ? (
                    <span className="fx-supp-when"> · {s.when}</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function GymPanel() {
  // Full Melani gym: warm-up, plans, sets, rest timer
  return <GymExact />;
}

type Props = {
  pageId: string;
  onGo: (id: string) => void;
};

const TAB_TO_PAGE: Record<FitnessTab, string> = {
  sleep: "pg-sleep",
  meals: "pg-meals",
  gym: "pg-gym",
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
          <p className="fx-quote-author">{QUOTE.source}</p>
        </div>

        {/* Sleep · Meals · Gym (Body weight is under Gym → Warm-up) */}
        <nav className="fx-subnav" aria-label="Fitness pages">
          {(
            [
              ["sleep", "Sleep"],
              ["meals", "Meals"],
              ["gym", "Gym"],
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
      </div>
    </div>
  );
}

export function isFitnessPage(pageId: string): boolean {
  return ["pg-fitness", "pg-sleep", "pg-meals", "pg-gym", "pg-body"].includes(
    pageId
  );
}
