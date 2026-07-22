import { loadGoals } from "./melContext";
import { MEAL_PRESETS, todayKey } from "./data";
import { deriveCycle, loadCycle } from "./cycleEngine";
import { loadLabs } from "./labEngine";
import { decideMeat } from "./core/policyEngine";
import { wonderEmit } from "./core/eventBus";
import type { MeatId, PolicyContext } from "./core/types";

export type FoodOsMeat = "beef" | "salmon";

export type FoodOsDay = {
  meat: FoodOsMeat;
  locked: boolean;
  eatenAt?: string;
};

export type FoodOsStore = {
  days: Record<string, FoodOsDay>;
};

export type FoodOsPlan = {
  day: string;
  meat: FoodOsMeat;
  locked: boolean;
  eaten: boolean;
  plate: string;
  proteinRemaining_g: number;
  caloriesRemaining: number;
  note: string;
};

export const FOOD_OS_KEY = "dr-melani-food-os-v1";
export const FOOD_OS_EVENT = "dr-melani-food-os-update";

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

function loadStore(): FoodOsStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(FOOD_OS_KEY) || "null") as Partial<FoodOsStore> | null;
    if (parsed?.days && typeof parsed.days === "object") return { days: parsed.days };
  } catch {
    /* use empty store */
  }
  return { days: {} };
}

function saveStore(store: FoodOsStore): void {
  localStorage.setItem(FOOD_OS_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent(FOOD_OS_EVENT));
  wonderEmit("data.changed", "foodOs", { key: FOOD_OS_KEY });
}

function lipidPressure(): boolean {
  try {
    return loadLabs().some((l) => {
      const name = `${l.displayName || ""} ${l.id || ""} ${l.short || ""}`.toLowerCase();
      return /ldl|non-hdl|triglyceride|total cholesterol/.test(name) && l.status === "high";
    });
  } catch {
    return false;
  }
}

function yesterdayIso(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function gymTodayLabel(day: string): string {
  try {
    const week = JSON.parse(localStorage.getItem("dr-melani-gym-week-plan") || "{}") as Record<string, string>;
    const key = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
      new Date(`${day}T12:00:00`).getDay()
    ];
    return week[key] || "-";
  } catch {
    return "-";
  }
}

/** Policy-driven meat pick (rules as data) */
function rotationFor(day: string): FoodOsMeat {
  const store = loadStore();
  const y = yesterdayIso(day);
  const yesterdayMeat = (store.days[y]?.meat as MeatId | undefined) || null;
  const cycle = loadCycle();
  const derived = deriveCycle(cycle, new Date(`${day}T12:00:00`));
  const ctx: PolicyContext = {
    day,
    phaseId: (derived.phase as PolicyContext["phaseId"]) || "unknown",
    lipidPressure: lipidPressure(),
    yesterdayMeat,
    beefStreak: yesterdayMeat === "beef" ? 1 : 0,
    salmonStreak: yesterdayMeat === "salmon" ? 1 : 0,
    rain: false,
    temperatureF: null,
    gymToday: gymTodayLabel(day),
  };
  const decision = decideMeat(ctx);
  return decision.value;
}

function loadMealDay(day: string): MealDay {
  try {
    const parsed = JSON.parse(localStorage.getItem(`dr-melani-meals-usuals:${day}`) || "null") as MealDay | null;
    if (parsed?.totals && Array.isArray(parsed.loggedIds)) return parsed;
  } catch {
    /* use empty day */
  }
  return {
    loggedIds: [],
    totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  };
}

export function ensureTodayMeat(day: string = todayKey()): FoodOsDay {
  const store = loadStore();
  const current = store.days[day];
  if (current) return current;
  const next: FoodOsDay = { meat: rotationFor(day), locked: false };
  saveStore({ ...store, days: { ...store.days, [day]: next } });
  wonderEmit("meat.locked", "foodOs", { day, meat: next.meat, auto: true });
  return next;
}

export function lockTodayMeat(meat: FoodOsMeat, day: string = todayKey()): FoodOsDay {
  const store = loadStore();
  const next: FoodOsDay = {
    ...(store.days[day] || { meat, locked: false }),
    meat,
    locked: true,
  };
  saveStore({ ...store, days: { ...store.days, [day]: next } });
  wonderEmit("meat.locked", "foodOs", { day, meat });
  return next;
}

export function markTodayMeatEaten(meat?: FoodOsMeat, day: string = todayKey()): FoodOsDay {
  const current = meat ? lockTodayMeat(meat, day) : ensureTodayMeat(day);
  const store = loadStore();
  const next: FoodOsDay = { ...current, eatenAt: new Date().toISOString() };
  saveStore({ ...store, days: { ...store.days, [day]: next } });
  wonderEmit("meat.eaten", "foodOs", { day, meat: next.meat });
  return next;
}

export function undoTodayMeatEaten(day: string = todayKey()): FoodOsDay {
  const current = ensureTodayMeat(day);
  const store = loadStore();
  const next = { ...current };
  delete next.eatenAt;
  saveStore({ ...store, days: { ...store.days, [day]: next } });
  return next;
}

export function buildFoodOsPlan(day: string = todayKey()): FoodOsPlan {
  const selection = ensureTodayMeat(day);
  const meals = loadMealDay(day);
  const goals = loadGoals();
  const proteinRemaining = Math.max(0, Math.round(goals.protein_g - meals.totals.protein_g));
  const caloriesRemaining = Math.max(0, Math.round(goals.calories - meals.totals.calories));
  const plate = selection.meat === "beef"
    ? "Lean beef with rice or potatoes and a full serving of vegetables"
    : "Salmon with rice or potatoes and a full serving of vegetables";
  const breakfast = MEAL_PRESETS.find((meal) => meal.id === "breakfast_usual");
  // Policy reasons for Mel (why this meat)
  const policyNote = (() => {
    try {
      const store = loadStore();
      const y = yesterdayIso(day);
      const ctx: PolicyContext = {
        day,
        phaseId: (deriveCycle(loadCycle(), new Date(`${day}T12:00:00`)).phase as PolicyContext["phaseId"]) || "unknown",
        lipidPressure: lipidPressure(),
        yesterdayMeat: (store.days[y]?.meat as MeatId | undefined) || null,
        beefStreak: 0,
        salmonStreak: 0,
        rain: false,
        temperatureF: null,
        gymToday: gymTodayLabel(day),
      };
      return decideMeat(ctx).reasons.slice(0, 2).join(" ");
    } catch {
      return "";
    }
  })();

  return {
    day,
    meat: selection.meat,
    locked: selection.locked,
    eaten: Boolean(selection.eatenAt),
    plate,
    proteinRemaining_g: proteinRemaining,
    caloriesRemaining,
    note: [
      meals.loggedIds.includes("breakfast_usual")
        ? "Breakfast is logged. Build the next plate around the remaining protein."
        : `Breakfast is not logged${breakfast ? ` (${breakfast.protein_g}g protein preset)` : ""}.`,
      policyNote,
    ]
      .filter(Boolean)
      .join(" "),
  };
}
