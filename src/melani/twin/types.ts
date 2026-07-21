import type { CyclePhaseId, CycleStore } from "../cycleEngine";
import type { LabItem } from "../labData";
import type { LifeLogEntry, MelGoals } from "../melContext";

export type TwinSeverity = "low" | "med" | "high";

export type TwinScores = {
  energy: number;
  recovery: number;
  fuel: number;
  cycleLoad: number;
  trainingLoad: number;
  stress: number;
  labRisk: number;
  overall: number;
};

export type ForecastDay = {
  day: string;
  energy: number;
  recovery: number;
  label: string;
  why: string;
};

export type RadarItem = {
  id: string;
  title: string;
  why: string;
  severity: TwinSeverity;
};

export type TwinLever = {
  title: string;
  detail: string;
  pageHint?: string;
};

export type DoctorPack = {
  day: string;
  periodStart: string;
  periodEnd: string;
  summaryLines: string[];
  questions: string[];
  fullText: string;
};

export type TwinState = {
  day: string;
  createdAt: string;
  scores: TwinScores;
  phaseId: CyclePhaseId;
  phaseLabel: string;
  cycleDay: number;
  sleepHours: number | null;
  sleepDebt7d: number;
  protein_g: number;
  proteinGoal: number;
  water_ml: number;
  waterGoal: number;
  gymToday: string;
  flags: string[];
  radar: RadarItem[];
  lever: TwinLever;
  forecast: ForecastDay[];
  summaryLines: string[];
  fullText: string;
};

export type TwinHistoryDay = {
  day: string;
  sleepHours: number | null;
  brainFog: boolean;
  protein_g: number;
  calories: number;
  water_ml: number;
  mealsLogged: number;
  hardNoteCount: number;
  migraineNoteCount: number;
};

export type TwinInputs = {
  day: string;
  createdAt: string;
  goals: MelGoals;
  sleepHours: number | null;
  brainFog: boolean;
  sleepDebt7d: number;
  shortNights7d: number;
  consecutiveShortNights: number;
  protein_g: number;
  calories: number;
  water_ml: number;
  mealsLogged: number;
  supplementsDone: number;
  supplementsTotal: number;
  recentProteinRatio: number;
  recentWaterRatio: number;
  phaseId: CyclePhaseId;
  phaseLabel: string;
  cycleDay: number;
  cycle: CycleStore;
  gymToday: string;
  gymPlanned: boolean;
  warmupDone: number;
  warmupTotal: number;
  hardNotes14d: LifeLogEntry[];
  migraineNotes14d: LifeLogEntry[];
  notesToday: LifeLogEntry[];
  flaggedLabs: LabItem[];
  history14d: TwinHistoryDay[];
};

export type ScoredTwin = Omit<
  TwinState,
  "radar" | "lever" | "forecast" | "summaryLines" | "fullText"
>;
