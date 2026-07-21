import type { ForecastDay, RadarItem, ScoredTwin, TwinInputs, TwinSeverity } from "./types";

const SEVERITY_RANK: Record<TwinSeverity, number> = {
  high: 3,
  med: 2,
  low: 1,
};

const SIGNAL_PRIORITY: Record<string, number> = {
  "head-pain": 6,
  "sleep-debt": 5,
  "training-recovery": 4,
  protein: 3,
  water: 2,
  labs: 1,
  "forecast-dip": 0,
};

export function buildRadar(
  state: ScoredTwin,
  inputs: TwinInputs,
  forecast: ForecastDay[]
): RadarItem[] {
  const items: RadarItem[] = [];
  const proteinRatio = inputs.protein_g / Math.max(1, state.proteinGoal);
  const waterRatio = inputs.water_ml / Math.max(1, state.waterGoal);

  if (inputs.consecutiveShortNights >= 2 || inputs.sleepDebt7d >= 4) {
    items.push({
      id: "sleep-debt",
      title: "Sleep debt is rising",
      why: `${inputs.sleepDebt7d.toFixed(1)} hours are missing across logged nights this week. Two or more short nights make recovery harder to catch up.`,
      severity: inputs.sleepDebt7d >= 7 ? "high" : "med",
    });
  }

  if (inputs.mealsLogged > 0 && proteinRatio < 0.7) {
    items.push({
      id: "protein",
      title: "Fuel is trailing",
      why: `Protein is ${Math.round(inputs.protein_g)} of ${state.proteinGoal}g today. Recent low intake can make tomorrow's energy forecast less stable.`,
      severity: proteinRatio < 0.4 ? "high" : "med",
    });
  }

  if (inputs.water_ml > 0 && waterRatio < 0.5) {
    items.push({
      id: "water",
      title: "Hydration is behind",
      why: `Water is ${inputs.water_ml} of ${state.waterGoal} ml. Low hydration can stack with fatigue, brain fog, and training load.`,
      severity: waterRatio < 0.25 ? "high" : "med",
    });
  }

  if (inputs.migraineNotes14d.length >= 2) {
    items.push({
      id: "head-pain",
      title: "Head pain is clustering",
      why: `${inputs.migraineNotes14d.length} headache or migraine notes appear in the last 14 days. Keep the pattern for Dr. Ververis rather than guessing at a cause.`,
      severity: inputs.migraineNotes14d.length >= 3 ? "high" : "med",
    });
  }

  if (inputs.gymPlanned && state.scores.recovery < 50) {
    items.push({
      id: "training-recovery",
      title: "Training and recovery disagree",
      why: `${inputs.gymToday} is planned while recovery is ${state.scores.recovery}. Keep the session available, but reduce volume if the warm-up feels heavy.`,
      severity: "med",
    });
  }

  if (inputs.flaggedLabs.length) {
    items.push({
      id: "labs",
      title: "Flagged labs remain on file",
      why: `${inputs.flaggedLabs.length} result${inputs.flaggedLabs.length === 1 ? " is" : "s are"} marked high or low. Twin treats this as a soft clinic signal, not a diagnosis.`,
      severity: "low",
    });
  }

  const lowest = [...forecast].sort(
    (a, b) => a.energy + a.recovery - (b.energy + b.recovery)
  )[0];
  if (lowest && (lowest.energy < 45 || lowest.recovery < 45)) {
    items.push({
      id: "forecast-dip",
      title: "A lower-capacity day is forming",
      why: `${lowest.day} forecasts ${lowest.energy} energy and ${lowest.recovery} recovery. The forecast is directional and should update as new logs arrive.`,
      severity: "low",
    });
  }

  return items
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        (SIGNAL_PRIORITY[b.id] || 0) - (SIGNAL_PRIORITY[a.id] || 0)
    )
    .slice(0, 3);
}
