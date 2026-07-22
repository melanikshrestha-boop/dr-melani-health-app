/**
 * Nightly body brief — one plain report of your day from live app data.
 * Sleep · meals · water · cycle · gym · mood notes · one clear move for tomorrow.
 * No API. No diagnoses. No em dashes.
 */
import {
  DAILY_SUPPLEMENTS,
  MEAL_PRESETS,
  MACRO_GOALS,
  PROFILE,
  todayKey,
} from "./data";
import { deriveCycle, loadCycle, PHASE_META } from "./cycleEngine";
import { loadSleepDay, loadFogMap, sleepWeekDays } from "./sleepStore";
import {
  loadGoals,
  loadLifeLog,
  type MelGoals,
  type LifeLogEntry,
} from "./melContext";

// Where we save past briefs (last ~14 nights)
const HISTORY_KEY = "dr-melani-body-brief-history-v1";
// One slot per calendar day so reopening does not spam new copies
const DAY_KEY = (day: string) => `dr-melani-body-brief:${day}`;

export type BodyBrief = {
  day: string; // YYYY-MM-DD
  createdAt: string; // ISO time when Mel wrote it
  // Live numbers Mel used
  sleepHours: number | null;
  sleepBed: string;
  sleepWake: string;
  brainFog: boolean;
  sleepGoal: number;
  mealsLogged: string[]; // human titles
  protein_g: number;
  calories: number;
  proteinGoal: number;
  calGoal: number;
  water_ml: number;
  waterGoal: number;
  phaseLabel: string;
  phaseId: string;
  cycleDay: number;
  flow: string;
  symptoms: string[];
  gymToday: string; // plan type for today or "-"
  gymWeekLine: string;
  warmupDone: number;
  warmupTotal: number;
  supsDone: number;
  supsTotal: number;
  moodNotes: string[]; // today's life-log lines that feel like mood/energy
  allNotesToday: string[];
  flags: string[]; // soft gaps, not scares
  tomorrowMove: string; // one action
  summaryLines: string[]; // short bullets for the card
  fullText: string; // full plain brief for Mel chat / copy
};

// Read a number from localStorage safely
function lsNum(key: string): number {
  try {
    return Math.max(0, Number(localStorage.getItem(key)) || 0);
  } catch {
    return 0;
  }
}

// Read JSON from localStorage with a fallback
function lsJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Meals logged today (same keys Meals panel writes)
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

// Water ml for a day
function waterMl(day: string): number {
  return lsNum(`dr-melani-water-ml:${day}`);
}

// Supplements checked off today
function supplementsDone(day: string): Record<string, boolean> {
  return lsJson(`dr-melani-supplements-done:${day}`, {} as Record<string, boolean>);
}

// Gym week plan (sat–fri keys)
function gymWeek(): Record<string, string> {
  return lsJson("dr-melani-gym-week-plan", {} as Record<string, string>);
}

// Warm-up checkboxes for a day
function gymWarmup(day: string): Record<string, boolean> {
  return lsJson(`gym-warmup:${day}`, {} as Record<string, boolean>);
}

// Map JS day (0=Sun) to the week-plan key Mel uses
function weekPlanKeyForDate(d: Date): string {
  const map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[d.getDay()] || "sun";
}

// Soft flags = gaps worth naming, not medical alarms
function computeFlags(input: {
  sleepHours: number | null;
  sleepGoal: number;
  protein_g: number;
  proteinGoal: number;
  water_ml: number;
  waterGoal: number;
  mealsCount: number;
  brainFog: boolean;
  phaseId: string;
  moodNotes: string[];
}): string[] {
  const flags: string[] = [];
  const {
    sleepHours,
    sleepGoal,
    protein_g,
    proteinGoal,
    water_ml,
    waterGoal,
    mealsCount,
    brainFog,
    phaseId,
    moodNotes,
  } = input;

  // Sleep short of goal by more than ~45 min
  if (sleepHours != null && sleepHours < sleepGoal - 0.7) {
    flags.push(
      `Sleep short: ${sleepHours}h vs ${sleepGoal}h goal`
    );
  }
  if (sleepHours == null) {
    flags.push("Sleep not logged yet (bed + wake)");
  }
  // Protein under 70% of goal late in the day is a real gap
  if (protein_g < proteinGoal * 0.7) {
    flags.push(
      `Protein lagging: ${Math.round(protein_g)}g / ${proteinGoal}g`
    );
  }
  if (water_ml < waterGoal * 0.5) {
    flags.push(
      `Water low: ${water_ml} ml / ${waterGoal} ml`
    );
  }
  if (mealsCount === 0) {
    flags.push("No meals logged today");
  }
  if (brainFog) {
    flags.push("Brain fog marked today");
  }
  // Mood notes that sound hard
  const hard = moodNotes.some((n) =>
    /sad|anxious|anxiety|pain|migraine|headache|exhausted|overwhelmed|cry|depressed|stressed/i.test(
      n
    )
  );
  if (hard) {
    flags.push("Hard feelings or pain showed up in notes");
  }
  if (phaseId === "luteal" && sleepHours != null && sleepHours < 7) {
    flags.push("Luteal + short sleep: body may want earlier bed");
  }

  return flags;
}

// One clear next move (not a list of 12 things)
function pickTomorrowMove(input: {
  flags: string[];
  sleepHours: number | null;
  sleepGoal: number;
  protein_g: number;
  proteinGoal: number;
  water_ml: number;
  waterGoal: number;
  phaseId: string;
  mealsCount: number;
  gymToday: string;
}): string {
  const {
    flags,
    sleepHours,
    sleepGoal,
    protein_g,
    proteinGoal,
    water_ml,
    waterGoal,
    phaseId,
    mealsCount,
    gymToday,
  } = input;

  // Pain / hard day first
  if (flags.some((f) => /Hard feelings|pain|migraine/i.test(f))) {
    return "Tomorrow: protect sleep and one calm meal. Log how you feel once for Mel.";
  }
  // Sleep is the lever that fixes most days
  if (sleepHours == null) {
    return "Tomorrow: log bed and wake so the brief can track real rest.";
  }
  if (sleepHours < sleepGoal - 0.7) {
    return `Tomorrow: aim for bed ~30–45 min earlier so you hit ~${sleepGoal}h.`;
  }
  // Protein
  if (protein_g < proteinGoal * 0.7) {
    return "Tomorrow: lock breakfast usual first, then build protein from there.";
  }
  // Water
  if (water_ml < waterGoal * 0.5) {
    return "Tomorrow: fill a bottle at breakfast and finish it before lunch.";
  }
  if (mealsCount === 0) {
    return "Tomorrow: tap your usual meals so macros are honest.";
  }
  // Phase-aware soft cue
  if (phaseId === "menstrual") {
    return "Tomorrow: keep protein steady, iron-friendly food, and easy movement only.";
  }
  if (phaseId === "luteal") {
    return "Tomorrow: steady meals + earlier wind-down. Skip heroic deficits.";
  }
  if (phaseId === "ovulatory") {
    return "Tomorrow: good day to train hard if energy is up. Keep water high.";
  }
  if (gymToday && gymToday !== "-") {
    return `Tomorrow: if ${gymToday} is on the plan, show up for the warm-up even if the set list is short.`;
  }
  // Default win day
  return "Tomorrow: same rhythm. Sleep on time, breakfast usual, water early.";
}

// Pull mood-ish lines from today's life log + any chat tags
function moodFromLogs(day: string, logs: LifeLogEntry[]): string[] {
  const today = logs.filter((e) => e.day === day);
  const scored = today.filter((e) => {
    const t = e.text.toLowerCase();
    const tags = (e.tags || []).join(" ");
    return (
      /mood|feel|feeling|energy|tired|anxious|happy|sad|stress|pain|migraine|fog|overwhelm|good|bad|ok|okay/i.test(
        t
      ) ||
      /mood|energy|pain|migraine|sleep/.test(tags)
    );
  });
  return (scored.length ? scored : today).map((e) => e.text).slice(-6);
}

/**
 * Build a fresh brief from whatever is in localStorage right now.
 * Does not save until you call saveBodyBrief.
 */
export function buildBodyBrief(day: string = todayKey()): BodyBrief {
  const goals: MelGoals = loadGoals();
  const sleep = loadSleepDay(day);
  const fog = loadFogMap();
  const brainFog = !!fog[day];
  const meals = mealUsuals(day);
  const water = waterMl(day);
  const sups = supplementsDone(day);
  const week = gymWeek();
  const warmup = gymWarmup(day);
  const cycle = loadCycle();
  const derived = deriveCycle(cycle, new Date(day + "T12:00:00"));
  const phaseId = derived.phase || "unknown";
  const phaseLabel =
    PHASE_META[phaseId as keyof typeof PHASE_META]?.label ||
    derived.phaseLabel ||
    "unknown";
  const logs = loadLifeLog();
  const moodNotes = moodFromLogs(day, logs);
  const allNotesToday = logs
    .filter((e) => e.day === day)
    .map((e) => e.text)
    .slice(-10);

  // Plan key for this calendar day
  const d = new Date(day + "T12:00:00");
  const planKey = weekPlanKeyForDate(d);
  const gymToday = week[planKey] || "-";
  const weekDays = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];
  const gymWeekLine = weekDays
    .map((k) => `${k}:${week[k] || "-"}`)
    .join(" ");

  const warmupVals = Object.values(warmup);
  const warmupDone = warmupVals.filter(Boolean).length;
  const warmupTotal = warmupVals.length;

  const mealTitles = meals.loggedIds.map(
    (id) => MEAL_PRESETS.find((m) => m.id === id)?.title || id
  );

  const supsTotal = DAILY_SUPPLEMENTS.length;
  const supsDone = DAILY_SUPPLEMENTS.filter((s) => !!sups[s.id]).length;

  const proteinGoal = goals.protein_g || MACRO_GOALS.protein_g;
  const calGoal = goals.calories || MACRO_GOALS.calories;
  const waterGoal = goals.water_ml || PROFILE.waterGoalMl;
  const sleepGoal = goals.sleep_hours || 8;

  const flags = computeFlags({
    sleepHours: sleep.hours,
    sleepGoal,
    protein_g: meals.totals.protein_g,
    proteinGoal,
    water_ml: water,
    waterGoal,
    mealsCount: mealTitles.length,
    brainFog,
    phaseId,
    moodNotes,
  });

  const tomorrowMove = pickTomorrowMove({
    flags,
    sleepHours: sleep.hours,
    sleepGoal,
    protein_g: meals.totals.protein_g,
    proteinGoal,
    water_ml: water,
    waterGoal,
    phaseId,
    mealsCount: mealTitles.length,
    gymToday,
  });

  // Short bullets for the Fitness card
  const summaryLines: string[] = [];
  summaryLines.push(
    sleep.hours != null
      ? `Sleep ${sleep.hours}h${brainFog ? " · fog noted" : ""}`
      : "Sleep not logged"
  );
  summaryLines.push(
    mealTitles.length
      ? `Meals: ${mealTitles.join(", ")} · protein ${Math.round(meals.totals.protein_g)}/${proteinGoal}g`
      : `Meals: none yet · protein ${Math.round(meals.totals.protein_g)}/${proteinGoal}g`
  );
  summaryLines.push(`Water ${water}/${waterGoal} ml`);
  summaryLines.push(
    `Cycle: ${phaseLabel} (day ${derived.currentDay || "?"})`
  );
  summaryLines.push(
    gymToday && gymToday !== "-"
      ? `Gym plan: ${gymToday}${warmupTotal ? ` · warm-up ${warmupDone}/${warmupTotal}` : ""}`
      : "Gym: rest / unplanned"
  );
  if (moodNotes.length) {
    summaryLines.push(`Notes: ${moodNotes[moodNotes.length - 1].slice(0, 80)}`);
  }
  summaryLines.push(`Tomorrow: ${tomorrowMove.replace(/^Tomorrow:\s*/i, "")}`);

  // Full plain-text brief — chunked for human scanning (short blocks, blank lines)
  const pct = (have: number, want: number) =>
    want ? Math.round((have / want) * 100) : 0;

  const sleepBlock =
    sleep.hours != null
      ? `${sleep.hours}h · bed ${sleep.bedtime || "?"} → wake ${sleep.wake || "?"}\nGoal ${sleepGoal}h (${pct(sleep.hours, sleepGoal)}%) · fog ${brainFog ? "yes" : "no"}`
      : `Not logged yet\nGoal ${sleepGoal}h · fog ${brainFog ? "yes" : "no"}`;

  const mealBlock = [
    mealTitles.length ? mealTitles.join(", ") : "None logged yet",
    `Protein ${Math.round(meals.totals.protein_g)} / ${proteinGoal}g (${pct(meals.totals.protein_g, proteinGoal)}%)`,
    `Calories ${Math.round(meals.totals.calories)} / ${calGoal} (${pct(meals.totals.calories, calGoal)}%)`,
  ].join("\n");

  const gapBlock = flags.length
    ? flags.map((f, i) => `${i + 1}. ${f}`).join("\n")
    : "Nothing big enough to name.";

  const moodBlock = moodNotes.length
    ? moodNotes.map((n) => `· ${n}`).join("\n")
    : "No mood notes yet.\n(type: log felt calm after gym)";

  const fullText = [
    `Nightly body brief`,
    day,
    ``,
    `— Sleep —`,
    sleepBlock,
    ``,
    `— Meals —`,
    mealBlock,
    ``,
    `— Water —`,
    `${water} / ${waterGoal} ml (${pct(water, waterGoal)}%)`,
    ``,
    `— Cycle —`,
    `${phaseLabel} · day ${derived.currentDay || "?"}`,
    `Flow: ${cycle.flow?.[day] || "none"}`,
    `Symptoms: ${(cycle.symptoms?.[day] || []).join(", ") || "none logged"}`,
    ``,
    `— Gym —`,
    gymToday && gymToday !== "-" ? `Today: ${gymToday}` : "Today: rest / unplanned",
    warmupTotal ? `Warm-up ${warmupDone}/${warmupTotal}` : "Warm-up not started",
    ``,
    `— Supplements —`,
    `${supsDone} of ${supsTotal} done`,
    ``,
    `— How you sounded —`,
    moodBlock,
    ``,
    `— Gaps —`,
    gapBlock,
    ``,
    `— One move tomorrow —`,
    tomorrowMove.replace(/^Tomorrow:\s*/i, ""),
    ``,
    `Not a diagnosis. Just your day, written back clearly.`,
  ].join("\n");

  return {
    day,
    createdAt: new Date().toISOString(),
    sleepHours: sleep.hours,
    sleepBed: sleep.bedtime,
    sleepWake: sleep.wake,
    brainFog,
    sleepGoal,
    mealsLogged: mealTitles,
    protein_g: meals.totals.protein_g,
    calories: meals.totals.calories,
    proteinGoal,
    calGoal,
    water_ml: water,
    waterGoal,
    phaseLabel,
    phaseId,
    cycleDay: derived.currentDay || 0,
    flow: cycle.flow?.[day] || "none",
    symptoms: cycle.symptoms?.[day] || [],
    gymToday,
    gymWeekLine,
    warmupDone,
    warmupTotal,
    supsDone,
    supsTotal,
    moodNotes,
    allNotesToday,
    flags,
    tomorrowMove,
    summaryLines,
    fullText,
  };
}

/** Save brief for a day + keep short history */
export function saveBodyBrief(brief: BodyBrief): void {
  try {
    localStorage.setItem(DAY_KEY(brief.day), JSON.stringify(brief));
    const hist = loadBriefHistory();
    const next = [
      brief,
      ...hist.filter((b) => b.day !== brief.day),
    ].slice(0, 14);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

/** Load today's saved brief if any */
export function loadBodyBrief(day: string = todayKey()): BodyBrief | null {
  try {
    const raw = localStorage.getItem(DAY_KEY(day));
    if (!raw) return null;
    return JSON.parse(raw) as BodyBrief;
  } catch {
    return null;
  }
}

/** Past briefs, newest first */
export function loadBriefHistory(): BodyBrief[] {
  return lsJson<BodyBrief[]>(HISTORY_KEY, []);
}

/**
 * Write (or refresh) tonight's brief.
 * Always rebuilds from live data so the numbers stay honest.
 */
export function writeTonightBrief(day: string = todayKey()): BodyBrief {
  const brief = buildBodyBrief(day);
  saveBodyBrief(brief);
  return brief;
}

/** True if local hour is evening (default 8pm+) — good time to offer the brief */
export function isBriefHour(now: Date = new Date()): boolean {
  return now.getHours() >= 20;
}

/**
 * Week sleep average for a tiny extra line (uses sleep store)
 */
export function weekSleepAvg(): number | null {
  const days = sleepWeekDays();
  const hours = days
    .map((d) => loadSleepDay(d.iso).hours)
    .filter((h): h is number => h != null);
  if (!hours.length) return null;
  return Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10;
}
