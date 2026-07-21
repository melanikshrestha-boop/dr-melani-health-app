import { labDisplayName } from "../labData";
import { gatherTwinInputs, twinAddDays } from "./gather";
import type { DoctorPack, TwinInputs } from "./types";

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatAverage(value: number | null, unit: string): string {
  return value == null ? "not enough logged data" : `${value.toFixed(1)}${unit}`;
}

export function buildDoctorPackFromInputs(inputs: TwinInputs): DoctorPack {
  const periodStart = twinAddDays(inputs.day, -13);
  const sleep = inputs.history14d
    .map((item) => item.sleepHours)
    .filter((hours): hours is number => hours != null);
  const proteinDays = inputs.history14d.filter((item) => item.mealsLogged > 0);
  const waterDays = inputs.history14d.filter((item) => item.water_ml > 0);
  const brainFogDays = inputs.history14d.filter((item) => item.brainFog).length;
  const sleepAverage = average(sleep);
  const proteinAverage = average(proteinDays.map((item) => item.protein_g));
  const waterAverage = average(waterDays.map((item) => item.water_ml));

  const summaryLines = [
    `Sleep: ${formatAverage(sleepAverage, "h")} across ${sleep.length}/14 logged nights`,
    `Brain fog: ${brainFogDays}/14 days marked yes`,
    `Protein: ${formatAverage(proteinAverage, "g")} across ${proteinDays.length}/14 meal-log days`,
    `Water: ${formatAverage(waterAverage, " ml")} across ${waterDays.length}/14 logged days`,
    `Cycle now: ${inputs.phaseLabel}, cycle day ${inputs.cycleDay}`,
    `Headache or migraine notes: ${inputs.migraineNotes14d.length}`,
    `Other hard symptom or mood notes: ${inputs.hardNotes14d.length}`,
    `Flagged labs on file: ${inputs.flaggedLabs.length}`,
  ];

  const questions: string[] = [];
  if (inputs.migraineNotes14d.length) {
    questions.push(
      "Do the timing and frequency of these headache or migraine notes justify a prevention plan or a more structured trigger log?"
    );
  }
  for (const lab of inputs.flaggedLabs.slice(0, 4)) {
    questions.push(
      `My ${labDisplayName(lab)} was ${lab.value}${lab.unit ? ` ${lab.unit}` : ""} and marked ${lab.status}. What follow-up or recheck timing makes sense?`
    );
  }
  if (inputs.sleepDebt7d >= 4) {
    questions.push(
      "Could persistent short sleep be amplifying fatigue, brain fog, or headaches, and what symptoms would warrant further evaluation?"
    );
  }
  if (!questions.length) {
    questions.push(
      "Looking across these 14 days, which one pattern is most useful to track before my next visit?"
    );
  }

  const fullText = [
    `DR. MELANI CLINIC PACK`,
    `${periodStart} to ${inputs.day}`,
    `For review with Dr. Ververis. This is a log summary, not a diagnosis.`,
    "",
    "14-DAY SIGNALS",
    ...summaryLines.map((line) => `  ${line}`),
    "",
    "FLAGGED LABS ON FILE",
    ...(inputs.flaggedLabs.length
      ? inputs.flaggedLabs.slice(0, 10).map(
          (lab) =>
            `  ${labDisplayName(lab)}: ${lab.value}${lab.unit ? ` ${lab.unit}` : ""} [${lab.status.toUpperCase()}] ${lab.date || ""}`.trimEnd()
        )
      : ["  None marked high or low in the current lab store"]),
    "",
    "RECENT HEADACHE OR MIGRAINE NOTES",
    ...(inputs.migraineNotes14d.length
      ? inputs.migraineNotes14d.slice(-8).map((entry) => `  ${entry.day}: ${entry.text}`)
      : ["  None logged"]),
    "",
    "QUESTIONS FOR DR. VERVERIS",
    ...questions.map((question, index) => `  ${index + 1}. ${question}`),
  ].join("\n");

  return {
    day: inputs.day,
    periodStart,
    periodEnd: inputs.day,
    summaryLines,
    questions,
    fullText,
  };
}

export function buildDoctorPack(day: string): DoctorPack {
  return buildDoctorPackFromInputs(gatherTwinInputs(day));
}
