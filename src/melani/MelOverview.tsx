import { useState } from "react";
import { writeTonightBrief } from "./bodyBrief";
import { todayKey } from "./data";
import { writeTwin, type TwinState } from "./twin";
import { gatherTwinInputs } from "./twin/gather";

type ScoreName = "overall" | "energy" | "recovery" | "fuel" | "stress";

function explanation(name: ScoreName, state: TwinState): string {
  const input = gatherTwinInputs(state.day);
  const sleep = input.sleepHours == null ? "sleep is not logged, so Mel applies a 1.5-hour shortfall" : `${input.sleepHours}h sleep against your ${input.goals.sleep_hours}h goal`;
  const protein = `${Math.round(input.protein_g)}/${input.goals.protein_g}g protein`;
  const water = `${input.water_ml}/${input.goals.water_ml} ml water`;
  if (name === "recovery") return `Recovery starts at 92, then drops for sleep shortfall, seven-day sleep debt (${input.sleepDebt7d}h), stacked short nights (${input.consecutiveShortNights}), and brain fog (${input.brainFog ? "yes" : "no"}). Today: ${sleep}.`;
  if (name === "fuel") return `Fuel is 48% protein completion, 34% hydration completion, and 18 points when a meal is logged (4 before a meal). Today: ${protein}, ${water}, ${input.mealsLogged} meal${input.mealsLogged === 1 ? "" : "s"} logged.`;
  if (name === "stress") return `Stress rises from difficult notes, migraine notes, brain fog, and sleep debt beyond two hours. Current inputs: ${input.hardNotes14d.length} difficult notes, ${input.migraineNotes14d.length} migraine notes, brain fog ${input.brainFog ? "yes" : "no"}, sleep debt ${input.sleepDebt7d}h.`;
  if (name === "energy") return `Energy combines recovery with your ${input.phaseLabel.toLowerCase()} phase adjustment, then subtracts stress, low-fuel load, and brain fog. Current recovery is ${state.scores.recovery}, fuel ${state.scores.fuel}, stress ${state.scores.stress}.`;
  return `Overall is a weighted readiness summary: 28% energy, 28% recovery, 22% fuel, 12% stress capacity, 5% lab capacity, and 5% cycle capacity. It is directional, not a medical measurement or diagnosis.`;
}

export function MelOverview({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState(() => writeTwin(todayKey()));
  const [selected, setSelected] = useState<ScoreName>("overall");
  const brief = writeTonightBrief(todayKey());
  const scores: Array<[ScoreName, string, number]> = [
    ["overall", "Overall", state.scores.overall],
    ["energy", "Energy", state.scores.energy],
    ["recovery", "Recovery", state.scores.recovery],
    ["fuel", "Fuel", state.scores.fuel],
    ["stress", "Stress", state.scores.stress],
  ];

  return <div className="mai-overview">
    <div className="mai-overview-top"><div><p>Today</p><h2>Your body, in one view</h2></div><button onClick={onClose}>Chat</button></div>
    <div className="mai-overview-scores">{scores.map(([id, label, value]) => <button key={id} className={selected === id ? "is-selected" : ""} onClick={() => setSelected(id)}><span>{label}</span><strong>{value}</strong></button>)}</div>
    <div className="mai-score-why"><p>Why {selected}</p><span>{explanation(selected, state)}</span></div>
    <div className="mai-overview-inputs"><p><span>Sleep</span><strong>{state.sleepHours == null ? "Not logged" : `${state.sleepHours}h`}</strong></p><p><span>Protein</span><strong>{Math.round(state.protein_g)}/{state.proteinGoal}g</strong></p><p><span>Water</span><strong>{state.water_ml}/{state.waterGoal} ml</strong></p><p><span>Cycle</span><strong>{state.phaseLabel}, day {state.cycleDay}</strong></p></div>
    {state.radar.length > 0 && <section><p className="mai-overview-label">Needs attention</p>{state.radar.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.why}</span></article>)}</section>}
    <section className="mai-overview-lever"><p className="mai-overview-label">Do this next</p><strong>{state.lever.title}</strong><span>{state.lever.detail}</span></section>
    <section><p className="mai-overview-label">Body brief</p><article><strong>{brief.summaryLines[0] || "Today at a glance"}</strong><span>{brief.tomorrowMove}</span></article></section>
    <button className="mai-overview-refresh" onClick={() => setState(writeTwin(todayKey()))}>Refresh from my logs</button>
  </div>;
}
