/**
 * Live snapshot of Melani's workspace for Mel (Grok).
 * Tier 1 smart brain:
 *  1) Weekly rollup (7-day trends)
 *  2) Goals she tracks
 *  3) Red-flag rules (computed)
 *  4) Page-aware coaching hints
 *  5) Doctor questions pack for Ververis
 *
 * No em dashes in any string Mel reads (user preference).
 */
import {
  DAILY_SUPPLEMENTS,
  MACRO_GOALS,
  MEAL_PRESETS,
  PROFILE,
  todayKey,
} from "./data";
import { loadCycle, type CycleStore } from "./cycleEngine";
import { loadLabs } from "./labEngine";
import { labDisplayName, type LabItem } from "./labData";

const LIFE_LOG_KEY = "dr-melani-life-log-v1";
const GOALS_KEY = "dr-melani-goals-v1";
const PINS_KEY = "dr-melani-pins-v1";
const SESSION_KEY = "dr-melani-session-memory-v1";

export type LifeLogEntry = {
  id: string;
  at: string;
  day: string;
  text: string;
  /** optional tags: pain, sleep, food, mood, migraine */
  tags?: string[];
};

/** Goals Mel measures her against (editable via: goal protein 130) */
export type MelGoals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  water_ml: number;
  sleep_hours: number;
  migraine_max_per_week: number;
  /** free notes she cares about, e.g. "no dairy after 6" */
  notes: string[];
};

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsJson<T>(key: string, fallback: T): T {
  try {
    const raw = lsGet(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function defaultGoals(): MelGoals {
  return {
    calories: MACRO_GOALS.calories,
    protein_g: MACRO_GOALS.protein_g,
    carbs_g: MACRO_GOALS.carbs_g,
    fat_g: MACRO_GOALS.fat_g,
    fiber_g: MACRO_GOALS.fiber_g,
    water_ml: PROFILE.waterGoalMl,
    sleep_hours: 8,
    migraine_max_per_week: 2,
    notes: [],
  };
}

export function loadGoals(): MelGoals {
  const g = lsJson<Partial<MelGoals>>(GOALS_KEY, {});
  return { ...defaultGoals(), ...g, notes: g.notes || [] };
}

export function saveGoals(goals: MelGoals) {
  try {
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  } catch {
    /* ignore */
  }
}

/** Parse "goal protein 130" / "goal water 4000" / "goal note no dairy after 6" */
export function applyGoalCommand(raw: string): MelGoals | null {
  const m = raw.match(/^goal\s+(\w+)\s+(.+)$/i);
  if (!m) return null;
  const key = m[1].toLowerCase();
  const val = m[2].trim();
  const g = loadGoals();

  if (key === "note" || key === "notes") {
    g.notes = [...g.notes, val].slice(-20);
    saveGoals(g);
    return g;
  }
  const n = Number(val.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;

  if (key === "protein" || key === "protein_g") g.protein_g = n;
  else if (key === "cal" || key === "calories" || key === "cals") g.calories = n;
  else if (key === "carbs" || key === "carb") g.carbs_g = n;
  else if (key === "fat" || key === "fats") g.fat_g = n;
  else if (key === "fiber") g.fiber_g = n;
  else if (key === "water") g.water_ml = n;
  else if (key === "sleep") g.sleep_hours = n;
  else if (key === "migraine" || key === "migraines") g.migraine_max_per_week = n;
  else return null;

  saveGoals(g);
  return g;
}

export function loadLifeLog(): LifeLogEntry[] {
  const rows = lsJson<LifeLogEntry[]>(LIFE_LOG_KEY, []);
  return Array.isArray(rows) ? rows : [];
}

/** Pull tags from text: "pain:5 migraine sleep" */
function extractTags(text: string): string[] {
  const tags = new Set<string>();
  const low = text.toLowerCase();
  const known = [
    "pain",
    "migraine",
    "headache",
    "sleep",
    "food",
    "mood",
    "gym",
    "water",
    "cycle",
    "energy",
  ];
  for (const k of known) {
    if (low.includes(k)) tags.add(k);
  }
  // tag:value patterns
  const re = /\b([a-z]{2,12})\s*:\s*[\w./+-]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tags.add(m[1].toLowerCase());
  }
  return [...tags];
}

export function appendLifeLog(text: string): LifeLogEntry {
  const clean = text.trim();
  const entry: LifeLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    day: todayKey(),
    text: clean,
    tags: extractTags(clean),
  };
  const next = [...loadLifeLog(), entry].slice(-200);
  try {
    localStorage.setItem(LIFE_LOG_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return entry;
}

export function searchLifeLog(query: string, limit = 12): LifeLogEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return loadLifeLog().slice(-limit);
  return loadLifeLog()
    .filter(
      (e) =>
        e.text.toLowerCase().includes(q) ||
        (e.tags || []).some((t) => t.includes(q))
    )
    .slice(-limit);
}

/** Permanent facts Mel always reads (Tier 2) */
export function loadPins(): string[] {
  const rows = lsJson<string[]>(PINS_KEY, []);
  return Array.isArray(rows) ? rows : [];
}

export function savePins(pins: string[]) {
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(pins.slice(0, 40)));
  } catch {
    /* ignore */
  }
}

/** pin <fact> | unpin <substring> | pins */
export function applyPinCommand(raw: string): string | null {
  const t = raw.trim();
  const pin = t.match(/^pin\s+(.+)$/i);
  if (pin?.[1]) {
    const fact = pin[1].trim();
    const next = [...loadPins().filter((p) => p !== fact), fact];
    savePins(next);
    return `Pinned: ${fact}`;
  }
  const unpin = t.match(/^unpin\s+(.+)$/i);
  if (unpin?.[1]) {
    const needle = unpin[1].trim().toLowerCase();
    const next = loadPins().filter((p) => !p.toLowerCase().includes(needle));
    savePins(next);
    return `Unpinned matches for: ${unpin[1].trim()}`;
  }
  if (/^pins$/i.test(t)) {
    const pins = loadPins();
    return pins.length ? pins.map((p, i) => `${i + 1}. ${p}`).join("\n") : "No pins.";
  }
  return null;
}

export type SessionMemory = {
  topics: string[];
  lastUser: string;
  lastReply: string;
};

export function loadSessionMemory(): SessionMemory {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as SessionMemory;
  } catch {
    /* ignore */
  }
  return { topics: [], lastUser: "", lastReply: "" };
}

export function pushSessionMemory(user: string, reply: string) {
  const prev = loadSessionMemory();
  const topic =
    user
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join(" ") || "chat";
  const topics = [...prev.topics.filter((t) => t !== topic), topic].slice(-8);
  const next: SessionMemory = {
    topics,
    lastUser: user.slice(0, 200),
    lastReply: reply.slice(0, 400),
  };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function waterMl(day: string): number {
  const raw = lsGet(`dr-melani-water-ml:${day}`);
  return Math.max(0, Number(raw) || 0);
}

function mealUsuals(day: string): {
  loggedIds: string[];
  totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
  };
} {
  return lsJson(`dr-melani-meals-usuals:${day}`, {
    loggedIds: [] as string[],
    totals: {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
    },
  });
}

function supplementsDone(day: string): Record<string, boolean> {
  return lsJson(
    `dr-melani-supplements-done:${day}`,
    {} as Record<string, boolean>
  );
}

function gymWeek(): Record<string, string> {
  return lsJson("dr-melani-gym-week-plan", {} as Record<string, string>);
}

function gymWarmup(day: string): Record<string, boolean> {
  return lsJson(`gym-warmup:${day}`, {} as Record<string, boolean>);
}

/** Last N local calendar days including today (YYYY-MM-DD) */
function lastNDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

type WeekRollup = {
  days: string[];
  water_avg_ml: number;
  water_days_hit_goal: number;
  protein_avg_g: number;
  cal_avg: number;
  days_with_meal_log: number;
  gym_types: Record<string, number>;
  migraine_log_hits: number;
  sleep_log_hits: number;
  life_log_count: number;
};

function buildWeeklyRollup(goals: MelGoals): WeekRollup {
  const days = lastNDays(7);
  const waters: number[] = [];
  const proteins: number[] = [];
  const cals: number[] = [];
  let mealDays = 0;
  let waterHit = 0;

  for (const day of days) {
    const w = waterMl(day);
    waters.push(w);
    if (w >= goals.water_ml * 0.9) waterHit++;

    const meals = mealUsuals(day);
    if (meals.loggedIds.length || meals.totals.calories > 0) {
      mealDays++;
      proteins.push(meals.totals.protein_g);
      cals.push(meals.totals.calories);
    }
  }

  const week = gymWeek();
  const gym_types: Record<string, number> = {};
  for (const t of Object.values(week)) {
    if (!t) continue;
    gym_types[t] = (gym_types[t] || 0) + 1;
  }

  const logs = loadLifeLog().filter((e) => days.includes(e.day));
  const migraineHits = logs.filter((e) =>
    /migraine|headache|head pain/i.test(e.text)
  ).length;
  const sleepHits = logs.filter((e) => /sleep|insomnia|tired|fatigue/i.test(e.text))
    .length;

  return {
    days,
    water_avg_ml: avg(waters),
    water_days_hit_goal: waterHit,
    protein_avg_g: avg(proteins),
    cal_avg: avg(cals),
    days_with_meal_log: mealDays,
    gym_types,
    migraine_log_hits: migraineHits,
    sleep_log_hits: sleepHits,
    life_log_count: logs.length,
  };
}

function phaseInfo(
  cycle: CycleStore,
  day: string
): { label: string; dayNum: number; phase: string } {
  if (!cycle.starts?.length) {
    return { label: "unknown", dayNum: 0, phase: "unknown" };
  }
  const last = [...cycle.starts].sort((a, b) => a.start.localeCompare(b.start)).at(-1);
  if (!last) return { label: "unknown", dayNum: 0, phase: "unknown" };
  const start = new Date(last.start + "T12:00:00");
  const now = new Date(day + "T12:00:00");
  const dayNum = Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
  if (dayNum < 1) return { label: "before last logged period", dayNum, phase: "unknown" };
  if (dayNum <= (last.periodDays || 5))
    return { label: `menstrual ~day ${dayNum}`, dayNum, phase: "menstrual" };
  if (dayNum <= 13)
    return { label: `follicular ~day ${dayNum}`, dayNum, phase: "follicular" };
  if (dayNum <= 16)
    return { label: `ovulatory window ~day ${dayNum}`, dayNum, phase: "ovulatory" };
  return { label: `luteal ~day ${dayNum}`, dayNum, phase: "luteal" };
}

function labSummary(labs: LabItem[]): string {
  const flagged = labs.filter(
    (l) => l.status && /high|low|abnormal|critical|out/i.test(String(l.status))
  );
  const pick = (flagged.length ? flagged : labs).slice(0, 18);
  if (!pick.length) return "No labs stored yet.";
  return pick
    .map(
      (l) =>
        `${labDisplayName(l)}: ${l.value}${l.unit ? " " + l.unit : ""}${
          l.status ? ` [${l.status}]` : ""
        }${l.date ? ` (${l.date})` : ""}`
    )
    .join("; ");
}

/** Computed red flags Mel should surface unprompted when relevant */
function buildRedFlags(input: {
  water: number;
  goals: MelGoals;
  meals: ReturnType<typeof mealUsuals>;
  phase: string;
  labs: LabItem[];
  lifeLog: LifeLogEntry[];
  weekRollup: WeekRollup;
  sups: Record<string, boolean>;
}): string[] {
  const flags: string[] = [];
  const { water, goals, meals, phase, labs, lifeLog, weekRollup, sups } = input;
  const t = meals.totals;

  if (water < goals.water_ml * 0.4) {
    flags.push(
      `Water very low today (${water} ml vs goal ${goals.water_ml}). Prioritize fluids before more caffeine.`
    );
  } else if (water < goals.water_ml * 0.6) {
    flags.push(`Water behind (${water}/${goals.water_ml} ml).`);
  }

  if (t.protein_g > 0 && t.protein_g < goals.protein_g * 0.5) {
    flags.push(
      `Protein low so far (${t.protein_g}g / ${goals.protein_g}g). Add a high-protein meal or shake.`
    );
  }

  const recentMigraine = lifeLog
    .slice(-8)
    .some((e) => /migraine|headache/i.test(e.text));
  if (recentMigraine && water < goals.water_ml * 0.7) {
    flags.push(
      "Recent migraine/headache note + low water. Hydrate, dim screens, log triggers."
    );
  }
  if (recentMigraine && phase === "luteal") {
    flags.push(
      "Migraine/headache note in luteal phase. Common window; track sleep and sodium, soft training if needed."
    );
  }
  if (recentMigraine && phase === "menstrual") {
    flags.push(
      "Migraine/headache on menstrual days. Keep iron-rich food + water; avoid max-effort lower if pain is high."
    );
  }

  if (weekRollup.migraine_log_hits > goals.migraine_max_per_week) {
    flags.push(
      `Migraine/headache logs this week (${weekRollup.migraine_log_hits}) above her max goal (${goals.migraine_max_per_week}). Bring pattern to Dr. Ververis.`
    );
  }

  if (weekRollup.water_days_hit_goal <= 2 && weekRollup.days.length >= 5) {
    flags.push(
      `Water goal only hit ~${weekRollup.water_days_hit_goal}/7 days this week (avg ${weekRollup.water_avg_ml} ml).`
    );
  }

  if (weekRollup.days_with_meal_log >= 3 && weekRollup.protein_avg_g < goals.protein_g * 0.75) {
    flags.push(
      `Weekly protein avg ~${weekRollup.protein_avg_g}g under goal ${goals.protein_g}g.`
    );
  }

  const highLabs = labs.filter((l) => String(l.status).toLowerCase() === "high");
  if (highLabs.some((l) => /ldl|non-hdl|triglyceride|cholesterol|tg\b/i.test(labDisplayName(l)))) {
    flags.push(
      "Lipid markers flagged HIGH on file. Keep fiber, cut liquid sugar, note for doctor visit."
    );
  }

  const vitDDone = !!sups["vit-d"];
  if (!vitDDone) {
    // not always a red flag; only if afternoon-ish we could note - skip time to keep simple
  }

  const lowerCount = weekRollup.gym_types["lower"] || 0;
  if (lowerCount >= 3) {
    flags.push(
      `Lower body scheduled ${lowerCount}x this week. Watch recovery; no back-to-back lowers.`
    );
  }

  return flags;
}

/** Page-aware coaching: what Mel should lean into based on where she is */
function pageAwareHints(pageId?: string, pageTitle?: string): string {
  const id = (pageId || "").toLowerCase();
  const t = (pageTitle || "").toLowerCase();

  if (id.includes("meal") || t.includes("meal")) {
    return [
      "PAGE MODE: Meals / nutrition",
      "- Lead with today's macros vs goals and weekly protein/water averages.",
      "- Suggest the next food move in grams of protein, not vague 'eat better'.",
      "- Use her Breakfast preset macros when helpful.",
    ].join("\n");
  }
  if (id.includes("gym") || t.includes("gym") || t.includes("fitness")) {
    return [
      "PAGE MODE: Gym / training",
      "- Lead with this week's plan (types per day) and recovery flags.",
      "- Respect rules: lower not consecutive, cardio max 2, rest max 1.",
      "- Cycle-aware: luteal/menstrual = maybe volume down if pain/migraine flags.",
    ].join("\n");
  }
  if (id.includes("lab") || t.includes("lab")) {
    return [
      "PAGE MODE: Labs",
      "- Explain HIGH/LOW markers in plain English.",
      "- Tie lipids/glucose to food pattern when relevant.",
      "- Always end actionable items + what to ask Dr. Ververis (see doctor pack).",
    ].join("\n");
  }
  if (id.includes("cycle") || t.includes("cycle") || t.includes("period")) {
    return [
      "PAGE MODE: Cycle",
      "- State phase estimate and what that often means for energy, training, migraine risk.",
      "- Do not predict fertility or diagnose PCOS etc.",
    ].join("\n");
  }
  if (
    id.includes("hygiene") ||
    id.includes("shower") ||
    id.includes("skin") ||
    id.includes("hair") ||
    t.includes("hygiene") ||
    t.includes("skin") ||
    t.includes("hair")
  ) {
    return [
      "PAGE MODE: Hygiene / skincare / hair",
      "- Routine order and product roles.",
      "- Exact product URLs when she asks to buy (never brand homepage only).",
    ].join("\n");
  }
  if (id.includes("sleep") || t.includes("sleep")) {
    return [
      "PAGE MODE: Sleep",
      "- Connect sleep notes in life log to migraine, training, and next-day protein/water.",
    ].join("\n");
  }
  if (id.includes("body") || t.includes("body")) {
    return [
      "PAGE MODE: Body",
      "- Composition/weight goals if set; never shame; focus on protein + training consistency.",
    ].join("\n");
  }
  if (id.includes("agent") || t.includes("gmail")) {
    return [
      "PAGE MODE: Agents / Gmail",
      "- Help triage or draft; do not invent emails she did not receive.",
    ].join("\n");
  }

  return [
    "PAGE MODE: General workspace",
    "- Answer with full live snapshot. Offer the single highest-leverage next action.",
  ].join("\n");
}

/** Questions pack for her real doctor visit */
function doctorQuestionsPack(labs: LabItem[], lifeLog: LifeLogEntry[], phase: string): string[] {
  const qs: string[] = [];
  const high = labs.filter((l) => String(l.status).toLowerCase() === "high");
  const low = labs.filter((l) => String(l.status).toLowerCase() === "low");

  for (const l of high.slice(0, 6)) {
    qs.push(
      `My ${labDisplayName(l)} was ${l.value}${l.unit ? " " + l.unit : ""} (HIGH${
        l.date ? ", " + l.date : ""
      }). What should we change first: food, meds, or recheck timing?`
    );
  }
  for (const l of low.slice(0, 4)) {
    qs.push(
      `My ${labDisplayName(l)} was ${l.value}${l.unit ? " " + l.unit : ""} (LOW). Do I need follow-up labs or symptoms to watch?`
    );
  }

  const mig = lifeLog.filter((e) => /migraine|headache/i.test(e.text)).slice(-5);
  if (mig.length) {
    qs.push(
      `I logged ${mig.length} headache/migraine notes recently (examples: ${mig
        .slice(0, 2)
        .map((m) => m.text)
        .join("; ")}). When should we escalate imaging, preventives, or cycle-linked treatment?`
    );
  }

  if (phase === "luteal" || phase === "menstrual") {
    qs.push(
      `Symptoms cluster around ${phase} phase. Anything cycle-linked we should document or treat differently?`
    );
  }

  const lipid = high.some((l) =>
    /ldl|non-hdl|triglyceride|cholesterol|tg\b/i.test(labDisplayName(l))
  );
  if (lipid) {
    qs.push(
      "With elevated lipids on my file, what targets should I aim for and when do we recheck?"
    );
  }

  if (!qs.length) {
    qs.push(
      "Please review my latest labs and migraine history together. What is the one metric to improve before my next visit?"
    );
  }

  // unique-ish, max 8
  return [...new Set(qs)].slice(0, 8);
}

/**
 * Full plain-text snapshot Mel receives every message.
 */
export function buildLiveContext(pageId?: string, pageTitle?: string): string {
  const day = todayKey();
  const goals = loadGoals();
  const water = waterMl(day);
  const meals = mealUsuals(day);
  const sups = supplementsDone(day);
  const week = gymWeek();
  const warmup = gymWarmup(day);
  const cycle = loadCycle();
  const labs = loadLabs();
  const lifeLogAll = loadLifeLog();
  const lifeLog = lifeLogAll.slice(-30); // Tier 2: last 30 notes
  const pins = loadPins();
  const session = loadSessionMemory();
  const phase = phaseInfo(cycle, day);
  const weekRollup = buildWeeklyRollup(goals);

  // Sleep today (same keys FitnessExact writes)
  let sleepLine = "not logged";
  try {
    const raw = localStorage.getItem(`dr-melani-sleep-v1:${day}`);
    if (raw) {
      const s = JSON.parse(raw) as { bedtime?: string; wake?: string };
      if (s.bedtime && s.wake) {
        const [bh, bm] = s.bedtime.split(":").map(Number);
        const [wh, wm] = s.wake.split(":").map(Number);
        let mins = wh * 60 + wm - (bh * 60 + bm);
        if (mins <= 0) mins += 24 * 60;
        const hrs = Math.round((mins / 60) * 10) / 10;
        sleepLine =
          hrs >= 1 && hrs <= 14
            ? `bed ${s.bedtime} wake ${s.wake} (${hrs}h)`
            : `bed ${s.bedtime} wake ${s.wake} (invalid range)`;
      } else if (s.bedtime || s.wake) {
        sleepLine = `bed ${s.bedtime || "?"} wake ${s.wake || "?"} (need both)`;
      }
    }
  } catch {
    /* ignore */
  }

  // Free notes on this page
  let pageNotes = "";
  try {
    const raw = localStorage.getItem("dr-melani-page-notes-v1");
    if (raw && pageId) {
      const map = JSON.parse(raw) as Record<string, string>;
      pageNotes = (map[pageId] || "").trim().slice(0, 800);
    }
  } catch {
    /* ignore */
  }

  const loggedMeals = meals.loggedIds
    .map((id) => MEAL_PRESETS.find((m) => m.id === id)?.title || id)
    .join(", ");

  const supLines = DAILY_SUPPLEMENTS.map((s) => {
    const done = !!sups[s.id];
    return `${s.name}${s.dose ? " (" + s.dose + ")" : ""} - ${
      done ? "DONE today" : "not yet"
    } · ${s.when}`;
  }).join("\n  ");

  const weekDays = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];
  const weekLine = weekDays.map((d) => `${d}:${week[d] || "-"}`).join(" ");

  const warmupDone = Object.values(warmup).filter(Boolean).length;
  const warmupTotal = Object.keys(warmup).length;

  const t = meals.totals;
  const symptomToday =
    cycle.symptoms?.[day]?.length
      ? cycle.symptoms[day].join(", ")
      : "none logged on cycle tracker";

  const flowToday = cycle.flow?.[day] || "none";

  const logLines =
    lifeLog.length === 0
      ? "(empty. type: log pain:5 migraine after sleep)"
      : lifeLog
          .map((e) => {
            const tag = e.tags?.length ? ` #${e.tags.join(",")}` : "";
            return `[${e.day} ${e.at.slice(11, 16)}] ${e.text}${tag}`;
          })
          .join("\n  ");

  const pinLines =
    pins.length === 0
      ? "(none. type: pin no dairy after 6)"
      : pins.map((p) => `- ${p}`).join("\n  ");

  const sessionLine = session.topics.length
    ? `topics: ${session.topics.join(", ")} | last: ${session.lastUser.slice(0, 80)}`
    : "empty this tab session";

  const flags = buildRedFlags({
    water,
    goals,
    meals,
    phase: phase.phase,
    labs,
    lifeLog: lifeLogAll,
    weekRollup,
    sups,
  });

  const doctorQs = doctorQuestionsPack(labs, lifeLogAll, phase.phase);

  const gymTypeLine =
    Object.keys(weekRollup.gym_types).length === 0
      ? "no week plan saved"
      : Object.entries(weekRollup.gym_types)
          .map(([k, v]) => `${k} x${v}`)
          .join(", ");

  const goalNotes =
    goals.notes.length === 0 ? "(none)" : goals.notes.map((n) => `- ${n}`).join("\n  ");

  const vs = (have: number, want: number, unit: string) => {
    const pct = want ? Math.round((have / want) * 100) : 0;
    return `${have}/${want}${unit} (${pct}%)`;
  };

  return `
LIVE BUILD SNAPSHOT (auto-synced from her app. Trust these numbers over guesses.)
Date today: ${day}
Looking at page: ${pageTitle || "unknown"} (${pageId || "?"})

${pageAwareHints(pageId, pageTitle)}

PROFILE
${PROFILE.name} · age display ${PROFILE.ageDisplay} · ${PROFILE.sex} · ${PROFILE.height}
Conditions: ${PROFILE.conditions}
Provider on file: ${PROFILE.provider} (always frame serious issues for her, not as your diagnosis)

GOALS MEL TRACKS (she can change with: goal protein 130 | goal water 4000 | goal sleep 8 | goal migraine 2 | goal note ...)
Calories ${goals.calories} · protein ${goals.protein_g}g · carbs ${goals.carbs_g}g · fat ${goals.fat_g}g · fiber ${goals.fiber_g}g
Water ${goals.water_ml} ml · sleep ${goals.sleep_hours}h · max migraine/headache log hits per week ${goals.migraine_max_per_week}
Goal notes:
  ${goalNotes}

PINNED FACTS (always true about her. pin <text> / unpin <text> / pins)
  ${pinLines}

SESSION MEMORY (this browser tab)
${sessionLine}

TODAY vs GOALS
Water: ${vs(water, goals.water_ml, " ml")}
Calories: ${vs(t.calories, goals.calories, "")}
Protein: ${vs(t.protein_g, goals.protein_g, "g")}
Carbs: ${vs(t.carbs_g, goals.carbs_g, "g")} · Fat: ${vs(t.fat_g, goals.fat_g, "g")} · Fiber: ${vs(t.fiber_g, goals.fiber_g, "g")}
Meals logged today: ${loggedMeals || "none yet"}
Breakfast preset: ${MEAL_PRESETS[0]?.title || "Breakfast"} ~${MEAL_PRESETS[0]?.calories || 0} cal / ${MEAL_PRESETS[0]?.protein_g || 0}g protein
Supplements:
  ${supLines}

WEEKLY ROLLUP (last 7 local days: ${weekRollup.days[0]} to ${weekRollup.days[weekRollup.days.length - 1]})
Water avg: ${weekRollup.water_avg_ml} ml/day · days near goal: ${weekRollup.water_days_hit_goal}/7
Protein avg (on days with meal log): ${weekRollup.protein_avg_g}g · cal avg: ${weekRollup.cal_avg} · meal-log days: ${weekRollup.days_with_meal_log}/7
Gym types this plan: ${gymTypeLine}
Life log notes this week: ${weekRollup.life_log_count} · migraine/headache hits: ${weekRollup.migraine_log_hits} · sleep-related hits: ${weekRollup.sleep_log_hits}

TODAY GYM
Week plan (sat to fri): ${weekLine}
Warm-up checks today: ${warmupDone}${warmupTotal ? "/" + warmupTotal : ""}

SLEEP TODAY
${sleepLine}

PAGE NOTES (free text on this page)
${pageNotes || "(empty)"}

CYCLE
Phase estimate: ${phase.label}
Flow today: ${flowToday}
Symptoms today (cycle tracker): ${symptomToday}
Recent period starts: ${cycle.starts
    .slice(-4)
    .map((s) => s.start)
    .join(", ")}

LABS (flagged first if any)
${labSummary(labs)}

RED FLAGS (computed; surface early if relevant, do not scare-monger)
${flags.length ? flags.map((f, i) => `${i + 1}. ${f}`).join("\n") : "None computed right now."}

DOCTOR QUESTIONS PACK (for Dr. Ververis / clinic. Offer when she asks what to ask, or before a visit.)
${doctorQs.map((q, i) => `${i + 1}. ${q}`).join("\n")}

LIFE LOG last 30 (log <note>. tags auto: pain, migraine, sleep, food, mood, gym)
  ${logLines}

TIER 1+2 RULES
- TODAY + WEEKLY ROLLUP + GOALS + PINNED FACTS + SESSION MEMORY.
- PAGE MODE for depth.
- RED FLAGS early when relevant.
- Doctor pack when she asks visit prep.
- Never invent diagnoses. No em dashes.
`.trim();
}
