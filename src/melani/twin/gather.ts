import { DAILY_SUPPLEMENTS, MACRO_GOALS, PROFILE } from "../data";
import { deriveCycle, loadCycle, parseISO } from "../cycleEngine";
import { loadLabs } from "../labEngine";
import { loadGoals, loadLifeLog } from "../melContext";
import { loadFogMap, loadSleepDay } from "../sleepStore";
import type { TwinHistoryDay, TwinInputs } from "./types";

type MealDay = {
  loggedIds: string[];
  totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
  };
};

const EMPTY_MEALS: MealDay = {
  loggedIds: [],
  totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lsJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsNumber(key: string): number {
  try {
    return Math.max(0, Number(localStorage.getItem(key)) || 0);
  } catch {
    return 0;
  }
}

export function twinAddDays(day: string, amount: number): string {
  const date = parseISO(day);
  date.setDate(date.getDate() + amount);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dateNum = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dateNum}`;
}

function mealDay(day: string): MealDay {
  return lsJson(`dr-melani-meals-usuals:${day}`, EMPTY_MEALS);
}

function waterDay(day: string): number {
  return lsNumber(`dr-melani-water-ml:${day}`);
}

function gymPlanKey(day: string): string {
  const names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return names[parseISO(day).getDay()] || "sun";
}

function isHardNote(text: string): boolean {
  return /pain|migraine|headache|exhausted|fatigue|anxious|anxiety|stressed|overwhelmed|sad|depressed|cramp/i.test(
    text
  );
}

function isMigraineNote(text: string): boolean {
  return /migraine|headache|head pain/i.test(text);
}

function gatherHistory(day: string, days: number): TwinHistoryDay[] {
  const fog = loadFogMap();
  const logs = loadLifeLog();
  const out: TwinHistoryDay[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const iso = twinAddDays(day, -offset);
    const sleep = loadSleepDay(iso);
    const meals = mealDay(iso);
    const notes = logs.filter((entry) => entry.day === iso);
    out.push({
      day: iso,
      sleepHours: sleep.hours,
      brainFog: fog[iso] === true,
      protein_g: Number(meals.totals?.protein_g) || 0,
      calories: Number(meals.totals?.calories) || 0,
      water_ml: waterDay(iso),
      mealsLogged: Array.isArray(meals.loggedIds) ? meals.loggedIds.length : 0,
      hardNoteCount: notes.filter((entry) => isHardNote(entry.text)).length,
      migraineNoteCount: notes.filter((entry) => isMigraineNote(entry.text)).length,
    });
  }
  return out;
}

export function gatherTwinInputs(day: string): TwinInputs {
  const goals = loadGoals();
  const sleepGoal = goals.sleep_hours || 8;
  const proteinGoal = goals.protein_g || MACRO_GOALS.protein_g;
  const waterGoal = goals.water_ml || PROFILE.waterGoalMl;
  const history14d = gatherHistory(day, 14);
  const history7d = history14d.slice(-7);
  const today = history14d[history14d.length - 1];
  const loggedSleep = history7d.filter((item) => item.sleepHours != null);
  const sleepDebt7d = loggedSleep.reduce(
    (sum, item) => sum + Math.max(0, sleepGoal - (item.sleepHours || 0)),
    0
  );
  const shortNights7d = loggedSleep.filter(
    (item) => (item.sleepHours || 0) < sleepGoal - 0.7
  ).length;
  let consecutiveShortNights = 0;
  for (let i = history7d.length - 1; i >= 0; i--) {
    const hours = history7d[i].sleepHours;
    if (hours == null || hours >= sleepGoal - 0.7) break;
    consecutiveShortNights += 1;
  }

  const recent = history14d.slice(-3);
  const recentProteinRatio =
    recent.reduce((sum, item) => sum + item.protein_g / proteinGoal, 0) /
    Math.max(1, recent.length);
  const recentWaterRatio =
    recent.reduce((sum, item) => sum + item.water_ml / waterGoal, 0) /
    Math.max(1, recent.length);

  const cycle = loadCycle();
  const cycleToday = deriveCycle(cycle, parseISO(day));
  const plan = lsJson<Record<string, string>>("dr-melani-gym-week-plan", {});
  const gymToday = plan[gymPlanKey(day)] || "-";
  const warmup = lsJson<Record<string, boolean>>(`gym-warmup:${day}`, {});
  const warmupValues = Object.values(warmup);
  const supplementMap = lsJson<Record<string, boolean>>(
    `dr-melani-supplements-done:${day}`,
    {}
  );
  const logs = loadLifeLog();
  const firstDay = twinAddDays(day, -13);
  const notes14d = logs.filter((entry) => entry.day >= firstDay && entry.day <= day);
  const flaggedLabs = loadLabs().filter(
    (lab) => lab.status === "high" || lab.status === "low"
  );

  return {
    day,
    createdAt: new Date().toISOString(),
    goals,
    sleepHours: today?.sleepHours ?? null,
    brainFog: today?.brainFog === true,
    sleepDebt7d: Math.round(sleepDebt7d * 10) / 10,
    shortNights7d,
    consecutiveShortNights,
    protein_g: today?.protein_g || 0,
    calories: today?.calories || 0,
    water_ml: today?.water_ml || 0,
    mealsLogged: today?.mealsLogged || 0,
    supplementsDone: DAILY_SUPPLEMENTS.filter((item) => supplementMap[item.id]).length,
    supplementsTotal: DAILY_SUPPLEMENTS.length,
    recentProteinRatio: clamp(recentProteinRatio, 0, 1.25),
    recentWaterRatio: clamp(recentWaterRatio, 0, 1.25),
    phaseId: cycleToday.phase,
    phaseLabel: cycleToday.phaseLabel,
    cycleDay: cycleToday.currentDay,
    cycle,
    gymToday,
    gymPlanned: gymToday !== "-" && !/rest/i.test(gymToday),
    warmupDone: warmupValues.filter(Boolean).length,
    warmupTotal: warmupValues.length,
    hardNotes14d: notes14d.filter((entry) => isHardNote(entry.text)),
    migraineNotes14d: notes14d.filter((entry) => isMigraineNote(entry.text)),
    notesToday: logs.filter((entry) => entry.day === day),
    flaggedLabs,
    history14d,
  };
}
