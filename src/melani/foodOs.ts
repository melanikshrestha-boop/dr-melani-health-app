import { loadGoals } from "./melContext";
import { MEAL_PRESETS, todayKey } from "./data";

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
}

function rotationFor(day: string): FoodOsMeat {
  const stamp = new Date(`${day}T12:00:00`).getTime();
  const dayNumber = Math.floor(stamp / 86_400_000);
  return dayNumber % 2 === 0 ? "beef" : "salmon";
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
  return next;
}

export function markTodayMeatEaten(meat?: FoodOsMeat, day: string = todayKey()): FoodOsDay {
  const current = meat ? lockTodayMeat(meat, day) : ensureTodayMeat(day);
  const store = loadStore();
  const next: FoodOsDay = { ...current, eatenAt: new Date().toISOString() };
  saveStore({ ...store, days: { ...store.days, [day]: next } });
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

  return {
    day,
    meat: selection.meat,
    locked: selection.locked,
    eaten: Boolean(selection.eatenAt),
    plate,
    proteinRemaining_g: proteinRemaining,
    caloriesRemaining,
    note: meals.loggedIds.includes("breakfast_usual")
      ? "Breakfast is logged. Build the next plate around the remaining protein."
      : `Breakfast is not logged${breakfast ? ` (${breakfast.protein_g}g protein preset)` : ""}.`,
  };
}
