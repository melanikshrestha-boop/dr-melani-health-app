import { todayKey } from "../data";
import { writeTonightBrief } from "../bodyBrief";
import { buildDoctorPackFromInputs } from "./doctorPack";
import { forecastTwin } from "./forecast";
import { gatherTwinInputs } from "./gather";
import { pickTwinLever } from "./lever";
import { buildRadar } from "./radar";
import { scoreTwin } from "./score";
import { saveTwin } from "./store";
import type { TwinState } from "./types";

function formatDate(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatForecastText(state: TwinState): string {
  return [
    "TWIN FORECAST, NEXT 7 DAYS",
    ...state.forecast.map(
      (day) =>
        `${formatDate(day.day)}: ${day.label}, energy ${day.energy}, recovery ${day.recovery}. ${day.why}`
    ),
  ].join("\n");
}

export function formatRadarText(state: TwinState): string {
  if (!state.radar.length) return "EARLY RADAR\nNo rising signal is strong enough to name today.";
  return [
    "EARLY RADAR",
    ...state.radar.map(
      (item, index) => `${index + 1}. ${item.title} [${item.severity}]\n   ${item.why}`
    ),
  ].join("\n");
}

export function formatLeverText(state: TwinState): string {
  return `ONE LEVER\n${state.lever.title}\n${state.lever.detail}`;
}

export function formatTwinText(state: TwinState): string {
  return [
    `MEL DIGITAL TWIN, ${state.day}`,
    `Overall ${state.scores.overall}/100, ${state.phaseLabel}, cycle day ${state.cycleDay}`,
    "Wonder does not just store health. It runs a twin of you and shows next week before it happens.",
    "",
    "TODAY",
    `Energy ${state.scores.energy} | Recovery ${state.scores.recovery} | Fuel ${state.scores.fuel} | Stress ${state.scores.stress}`,
    `Sleep ${state.sleepHours == null ? "not logged" : `${state.sleepHours}h`} | 7-day debt ${state.sleepDebt7d}h`,
    `Protein ${Math.round(state.protein_g)}/${state.proteinGoal}g | Water ${state.water_ml}/${state.waterGoal} ml`,
    `Gym ${state.gymToday}`,
    "",
    formatRadarText(state),
    "",
    formatLeverText(state),
    "",
    formatForecastText(state),
    "",
    "Directional forecast from your own logs. Not a diagnosis.",
  ].join("\n");
}

export function buildTwin(day: string = todayKey()): TwinState {
  const inputs = gatherTwinInputs(day);
  const scored = scoreTwin(inputs);
  const forecast = forecastTwin(scored, inputs);
  const radar = buildRadar(scored, inputs, forecast);
  const lever = pickTwinLever(scored, inputs);
  const summaryLines = [
    `Overall ${scored.scores.overall}, energy ${scored.scores.energy}, recovery ${scored.scores.recovery}`,
    `${scored.phaseLabel}, cycle day ${scored.cycleDay}`,
    radar.length ? `Radar: ${radar[0].title}` : "Radar: no strong rising signal",
    `One lever: ${lever.title}`,
  ];
  const state: TwinState = {
    ...scored,
    radar,
    lever,
    forecast,
    summaryLines,
    fullText: "",
  };
  state.fullText = formatTwinText(state);
  return state;
}

export function writeTwin(day: string = todayKey()): TwinState {
  const state = buildTwin(day);
  saveTwin(state);
  // Body Brief remains today's narrative and is refreshed from the same live logs.
  writeTonightBrief(day);
  return state;
}

export function twinDoctorPack(day: string = todayKey()) {
  return buildDoctorPackFromInputs(gatherTwinInputs(day));
}

export { loadTwin, loadTwinHistory } from "./store";
export type {
  DoctorPack,
  ForecastDay,
  RadarItem,
  TwinLever,
  TwinScores,
  TwinState,
} from "./types";
