import { deriveCycle, parseISO } from "../cycleEngine";
import { twinAddDays } from "./gather";
import type { ForecastDay, ScoredTwin, TwinInputs } from "./types";

const PHASE_ENERGY_BIAS = {
  menstrual: -10,
  follicular: 7,
  ovulatory: 11,
  luteal: -4,
} as const;

const PHASE_RECOVERY_BIAS = {
  menstrual: -8,
  follicular: 5,
  ovulatory: 3,
  luteal: -5,
} as const;

function clamp(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function labelFor(energy: number, recovery: number): string {
  const readiness = Math.round((energy + recovery) / 2);
  if (readiness >= 78) return "Ready";
  if (readiness >= 62) return "Steady";
  if (readiness >= 45) return "Protect";
  return "Reset";
}

export function forecastTwin(
  today: ScoredTwin,
  inputs: TwinInputs
): ForecastDay[] {
  const out: ForecastDay[] = [];
  const sleepGoal = inputs.goals.sleep_hours || 8;
  const recentSleep = inputs.history14d
    .slice(-3)
    .map((item) => item.sleepHours)
    .filter((hours): hours is number => hours != null);
  const sleepAverage = recentSleep.length
    ? recentSleep.reduce((sum, hours) => sum + hours, 0) / recentSleep.length
    : sleepGoal - 1;
  const repeatedShortfall = Math.max(0, sleepGoal - sleepAverage);
  const fuelDrag = Math.max(
    0,
    1 - (inputs.recentProteinRatio * 0.6 + inputs.recentWaterRatio * 0.4)
  );

  for (let offset = 1; offset <= 7; offset++) {
    const day = twinAddDays(inputs.day, offset);
    const cycle = deriveCycle(inputs.cycle, parseISO(day));
    // Debt recovers gradually, but a repeated recent shortfall slows that decay.
    const projectedDebt = Math.max(
      0,
      inputs.sleepDebt7d - offset * 0.65 + repeatedShortfall * offset * 0.35
    );
    const recovery = clamp(
      today.scores.recovery +
        offset * 1.8 -
        projectedDebt * 1.7 +
        PHASE_RECOVERY_BIAS[cycle.phase]
    );
    const energy = clamp(
      today.scores.energy +
        offset * 1.2 -
        projectedDebt * 1.3 -
        fuelDrag * 16 +
        PHASE_ENERGY_BIAS[cycle.phase]
    );

    let why = `${cycle.phaseLabel} phase keeps the day fairly steady.`;
    if (projectedDebt >= 4) {
      why = `${projectedDebt.toFixed(1)} hours of projected sleep debt still weighs on recovery.`;
    } else if (fuelDrag >= 0.3) {
      why = "Recent protein and water consistency may limit energy unless the rhythm improves.";
    } else if (cycle.phase === "menstrual") {
      why = "Menstrual load may lower energy, so recovery and lighter output matter more.";
    } else if (cycle.phase === "ovulatory" && recovery >= 60) {
      why = "Ovulatory energy bias meets enough recovery for a stronger output day.";
    } else if (cycle.phase === "luteal") {
      why = "Luteal load favors steady meals, earlier sleep, and controlled training volume.";
    }

    out.push({
      day,
      energy,
      recovery,
      label: labelFor(energy, recovery),
      why,
    });
  }

  return out;
}
