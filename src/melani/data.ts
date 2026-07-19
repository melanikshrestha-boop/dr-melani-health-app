/**
 * Snapshot of Dr. Melani app data — used so exported pages look like the real app.
 * Live numbers can still be logged on port 8781; this is the visual export.
 */

export const PROFILE = {
  name: "Melani Shrestha",
  ageDisplay: "18",
  sex: "female",
  height: "5 ft 0 in",
  provider: "Ververis, Megan",
  patientId: "2581279882",
  conditions: "migraine/chronic pain; cardio/metabolic monitoring",
  waterGoalMl: 4000,
};

export const MACRO_GOALS = {
  protein_g: 125,
  calories: 2000,
  carbs_g: 200,
  fat_g: 65,
  fiber_g: 30,
};

/** Demo “logged today” — rings fill from these (edit freely in UI local state later) */
export const MACRO_CURRENT = {
  protein_g: 49,
  calories: 715,
  carbs_g: 58,
  fat_g: 28,
  fiber_g: 14,
};

export const MEAL_PRESETS = [
  {
    id: "breakfast",
    title: "My usual breakfast",
    calories: 715,
    protein_g: 49,
    carbs_g: 58,
    fat_g: 28,
    fiber_g: 14,
    ingredients: [
      "Fage 0% Greek yogurt (plain, organic)",
      "Fage 0% kefir (no added sugar)",
      "2 tsp chia seeds",
      "2 tsp flaxseeds",
      "Small handful pumpkin seeds",
      "Trader Joe’s raw honey (minimal)",
    ],
  },
  {
    id: "chipotle",
    title: "Chipotle burrito bowl",
    calories: 585,
    protein_g: 27,
    carbs_g: 59,
    fat_g: 23,
    fiber_g: 12,
    ingredients: ["Chicken", "Rice", "Beans", "Fajita veggies", "Salsa"],
  },
];

export const LAB_STATUS = [
  { short: "LDL", value: "120", unit: "mg/dL", badge: "HIGH", chip: "high" },
  { short: "TC", value: "207", unit: "mg/dL", badge: "HIGH", chip: "high" },
  { short: "TG", value: "119", unit: "mg/dL", badge: "HIGH", chip: "high" },
  { short: "Non-HDL", value: "143", unit: "mg/dL", badge: "HIGH", chip: "high" },
  { short: "HDL", value: "64", unit: "mg/dL", badge: "OK", chip: "ok" },
  { short: "A1c", value: "5.3", unit: "%", badge: "OK", chip: "ok" },
  { short: "TSH", value: "1.06", unit: "mIU/L", badge: "OK", chip: "ok" },
];

export const LAB_DRAWS = [
  {
    title: "Quest · 2026-03-26 · Lipids + A1C",
    lines: [
      "Total Cholesterol: 207 mg/dL · HIGH",
      "HDL: 64 mg/dL · OK",
      "Triglycerides: 119 mg/dL · HIGH",
      "LDL: 120 mg/dL · HIGH",
      "Non-HDL: 143 mg/dL · HIGH",
      "A1c: 5.3%",
    ],
  },
  {
    title: "Quest · 2026-04-07 · Thyroid",
    lines: ["TSH: 1.06 mIU/L"],
  },
  {
    title: "USC · 2026-03-25 · CBC + CMP",
    lines: ["WBC 9.3 · RBC 4.94 · HGB 13.6 · HCT 40.2 · PLT 223", "Albumin 4.8 · ALT 14 · ALP 66 · AST 22"],
  },
];

export const GYM_WEEK = [
  { day: "Mon", title: "Glutes + Abs" },
  { day: "Tue", title: "Lower / plan" },
  { day: "Wed", title: "Plan day" },
  { day: "Thu", title: "Upper + Abs" },
  { day: "Fri", title: "Glutes + Abs" },
  { day: "Sat", title: "Glutes + Abs" },
  { day: "Sun", title: "Rest / cardio" },
];

export const CYCLE = {
  lastPeriodStart: "2026-06-07",
  cycleLengthDays: 28,
  periodLengthDays: 5,
  estimated: false,
  phase: "Luteal",
  statusLine: "Cycle day tracking · last period Jun 7, 2026",
  lastPeriodDisplay: "Jun 7, 2026",
  predictedNextDisplay: "Jul 5, 2026",
  predictedOvulationDisplay: "Jun 21, 2026",
  flowLevels: ["spotting", "light", "medium", "heavy"] as const,
  loggedFlow: {
    "2026-06-07": "medium",
    "2026-06-08": "medium",
    "2026-06-09": "light",
    "2026-06-10": "light",
    "2026-06-11": "spotting",
  } as Record<string, string>,
};

export const PHASES = [
  { id: "period", label: "Period" },
  { id: "follicular", label: "Follicular" },
  { id: "ovulation", label: "Ovulation" },
  { id: "luteal", label: "Luteal" },
  { id: "pre_period", label: "Pre-period" },
];

export type CycleDay = {
  iso: string;
  weekday: string;
  label: string;
  flow: string | null;
  isToday: boolean;
  isPeriodStart: boolean;
  isPredicted: boolean;
  isOvulation: boolean;
};

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ~1 cycle of days like My Data period calendar */
export function buildCycleCalendar(today = new Date()): CycleDay[] {
  const start = parseISO(CYCLE.lastPeriodStart);
  const days: CycleDay[] = [];
  const todayIso = fmtISO(today);
  const wd = ["S", "M", "T", "W", "T", "F", "S"];

  for (let i = 0; i < CYCLE.cycleLengthDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = fmtISO(d);
    const dayNum = i + 1;
    const ovStart = 13;
    const ovEnd = 15;
    const isPeriod = dayNum <= CYCLE.periodLengthDays;
    const flow =
      CYCLE.loggedFlow[iso] ||
      (isPeriod ? (dayNum <= 2 ? "medium" : dayNum <= 4 ? "light" : "spotting") : null);

    days.push({
      iso,
      weekday: wd[d.getDay()],
      label: String(d.getDate()),
      flow,
      isToday: iso === todayIso,
      isPeriodStart: dayNum === 1,
      isPredicted: false,
      isOvulation: dayNum >= ovStart && dayNum <= ovEnd,
    });
  }
  return days;
}

export function pct(current: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.max(0, (current / goal) * 100));
}

export const CIRC = {
  cal: 2 * Math.PI * 88,
  protein: 2 * Math.PI * 77,
  carbs: 2 * Math.PI * 66,
  fat: 2 * Math.PI * 55,
  fiber: 2 * Math.PI * 44,
};

export const LIVE_APP = "http://127.0.0.1:8781";
