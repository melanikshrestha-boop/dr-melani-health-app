import type { ScoredTwin, TwinInputs, TwinLever } from "./types";

export function pickTwinLever(
  state: ScoredTwin,
  inputs: TwinInputs
): TwinLever {
  const painCluster = inputs.migraineNotes14d.length >= 2;
  if (painCluster) {
    return {
      title: "Protect sleep and log head pain once",
      detail:
        "Set an earlier wind-down tonight, then log one clear headache or migraine score so the pattern is useful for Dr. Ververis.",
      pageHint: "Sleep",
    };
  }

  if (inputs.consecutiveShortNights >= 2 || inputs.sleepDebt7d >= 4) {
    return {
      title: "Move bedtime 45 minutes earlier",
      detail: `You have ${inputs.sleepDebt7d.toFixed(1)} hours of weekly sleep debt. Tonight's earlier bed is the fastest lever for tomorrow's recovery.`,
      pageHint: "Sleep",
    };
  }

  if (inputs.protein_g < state.proteinGoal * 0.7) {
    return {
      title: "Lock breakfast usual first",
      detail: `Protein is ${Math.round(inputs.protein_g)} of ${state.proteinGoal}g. Starting with the measured breakfast makes the rest of the day easier to close.`,
      pageHint: "Meals",
    };
  }

  if (inputs.water_ml < state.waterGoal * 0.5) {
    return {
      title: "Finish one bottle before lunch",
      detail: `Water is ${inputs.water_ml} of ${state.waterGoal} ml. Front-loading one bottle is the simplest way to stop hydration from becoming an evening catch-up job.`,
      pageHint: "Meals",
    };
  }

  if (inputs.phaseId === "luteal" && (inputs.sleepHours || 0) < 7) {
    return {
      title: "Start the wind-down earlier",
      detail:
        "Luteal load plus short sleep lowers the buffer for cravings, stress, and training. Protect the first hour of the night.",
      pageHint: "Sleep",
    };
  }

  return {
    title: "Maintain the rhythm",
    detail:
      "Keep sleep on time, log the usual meals, and get water in early. The twin sees no higher-return correction today.",
    pageHint: "Fitness",
  };
}
