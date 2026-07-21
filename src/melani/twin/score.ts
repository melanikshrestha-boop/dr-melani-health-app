import type { ScoredTwin, TwinInputs, TwinScores } from "./types";

// V1 weights are intentionally visible. Positive capacity gets most of the
// blend; load and risk are inverted so a higher burden lowers overall readiness.
export const OVERALL_WEIGHTS = {
  energy: 0.28,
  recovery: 0.28,
  fuel: 0.22,
  stressCapacity: 0.12,
  labCapacity: 0.05,
  cycleCapacity: 0.05,
} as const;

const PHASE_LOAD = {
  menstrual: 72,
  follicular: 24,
  ovulatory: 18,
  luteal: 55,
} as const;

const PHASE_ENERGY = {
  menstrual: -12,
  follicular: 8,
  ovulatory: 12,
  luteal: -5,
} as const;

function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

export function scoreTwin(inputs: TwinInputs): ScoredTwin {
  const sleepGoal = inputs.goals.sleep_hours || 8;
  const proteinGoal = inputs.goals.protein_g || 125;
  const waterGoal = inputs.goals.water_ml || 4000;
  const sleepShortfall =
    inputs.sleepHours == null ? 1.5 : Math.max(0, sleepGoal - inputs.sleepHours);

  const recovery = clampScore(
    92 -
      sleepShortfall * 10 -
      inputs.sleepDebt7d * 2.1 -
      Math.max(0, inputs.consecutiveShortNights - 1) * 4 -
      (inputs.brainFog ? 8 : 0)
  );

  const proteinRatio = inputs.protein_g / Math.max(1, proteinGoal);
  const waterRatio = inputs.water_ml / Math.max(1, waterGoal);
  const fuel = clampScore(
    Math.min(1, proteinRatio) * 48 +
      Math.min(1, waterRatio) * 34 +
      (inputs.mealsLogged > 0 ? 18 : 4)
  );

  const recentHard = inputs.hardNotes14d.filter((entry) => entry.day >= inputs.history14d[7].day);
  const stress = clampScore(
    recentHard.length * 9 +
      inputs.migraineNotes14d.length * 10 +
      (inputs.brainFog ? 10 : 0) +
      Math.max(0, inputs.sleepDebt7d - 2) * 2
  );
  const cycleLoad = PHASE_LOAD[inputs.phaseId];
  const trainingLoad = inputs.gymPlanned
    ? clampScore(52 + (inputs.warmupTotal ? 28 * (inputs.warmupDone / inputs.warmupTotal) : 0))
    : 15;
  const labRisk = clampScore(inputs.flaggedLabs.length * 10);

  const energy = clampScore(
    58 +
      recovery * 0.3 +
      PHASE_ENERGY[inputs.phaseId] -
      stress * 0.18 -
      (fuel < 55 ? 8 : 0) -
      (inputs.brainFog ? 10 : 0)
  );

  const scores: TwinScores = {
    energy,
    recovery,
    fuel,
    cycleLoad,
    trainingLoad,
    stress,
    labRisk,
    overall: 0,
  };
  scores.overall = clampScore(
    scores.energy * OVERALL_WEIGHTS.energy +
      scores.recovery * OVERALL_WEIGHTS.recovery +
      scores.fuel * OVERALL_WEIGHTS.fuel +
      (100 - scores.stress) * OVERALL_WEIGHTS.stressCapacity +
      (100 - scores.labRisk) * OVERALL_WEIGHTS.labCapacity +
      (100 - scores.cycleLoad) * OVERALL_WEIGHTS.cycleCapacity
  );

  const flags: string[] = [];
  if (inputs.sleepHours == null) flags.push("Sleep is not logged today");
  if (inputs.consecutiveShortNights >= 2)
    flags.push(`${inputs.consecutiveShortNights} short nights are stacking`);
  if (proteinRatio < 0.7)
    flags.push(`Protein is ${Math.round(inputs.protein_g)}/${proteinGoal}g`);
  if (waterRatio < 0.5)
    flags.push(`Water is ${inputs.water_ml}/${waterGoal} ml`);
  if (inputs.migraineNotes14d.length >= 2)
    flags.push("Headache or migraine notes are clustering");
  if (inputs.gymPlanned && recovery < 50)
    flags.push("Training is planned while recovery is low");
  if (inputs.flaggedLabs.length)
    flags.push(`${inputs.flaggedLabs.length} flagged lab result${inputs.flaggedLabs.length === 1 ? "" : "s"} on file`);

  return {
    day: inputs.day,
    createdAt: inputs.createdAt,
    scores,
    phaseId: inputs.phaseId,
    phaseLabel: inputs.phaseLabel,
    cycleDay: inputs.cycleDay,
    sleepHours: inputs.sleepHours,
    sleepDebt7d: inputs.sleepDebt7d,
    protein_g: inputs.protein_g,
    proteinGoal,
    water_ml: inputs.water_ml,
    waterGoal,
    gymToday: inputs.gymToday,
    flags,
  };
}
