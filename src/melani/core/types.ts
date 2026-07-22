/**
 * Typed domain model for Wonder.
 * UI and Mel talk in these shapes; storage adapters translate raw keys.
 */

export type MeatId = "beef" | "salmon";

export type CyclePhaseId =
  | "menstrual"
  | "follicular"
  | "ovulatory"
  | "luteal"
  | "unknown";

export type MacroTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

export type SleepState = {
  day: string;
  bedtime: string;
  wake: string;
  hours: number | null;
  brainFog: boolean;
};

export type MealDayState = {
  day: string;
  loggedIds: string[];
  totals: MacroTotals;
};

export type MeatDayState = {
  day: string;
  meat: MeatId;
  locked: boolean;
  eaten: boolean;
};

export type WeatherDayState = {
  label: string;
  temperatureF: number;
  feelsLikeF: number;
  condition: string;
  rainRisk: number;
  highF: number;
  lowF: number;
  fetchedAt: number;
  source: "cache" | "network" | "default-nyc";
};

export type PersonDay = {
  day: string;
  sleep: SleepState;
  meals: MealDayState;
  meat: MeatDayState | null;
  waterMl: number;
  waterGoalMl: number;
  proteinGoal: number;
  cyclePhase: CyclePhaseId;
  cycleDay: number;
  gymToday: string;
  weather: WeatherDayState | null;
  updatedAt: string;
};

export type PolicyContext = {
  day: string;
  phaseId: CyclePhaseId;
  lipidPressure: boolean;
  yesterdayMeat: MeatId | null;
  beefStreak: number;
  salmonStreak: number;
  rain: boolean;
  temperatureF: number | null;
  gymToday: string;
};

export type PolicyDecision<T extends string = string> = {
  value: T;
  ruleIds: string[];
  reasons: string[];
};

/** Side-effect class for Mel tools (capability matrix) */
export type ToolSideEffect = "read" | "write";
export type ToolLatency = "sync" | "async";

export type ToolCapability = {
  name: string;
  sideEffect: ToolSideEffect;
  latency: ToolLatency;
  needsConfirm: boolean;
};
