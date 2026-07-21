import type { TwinState } from "./types";

const HISTORY_KEY = "dr-melani-twin-v1";
const dayKey = (day: string) => `dr-melani-twin-day:${day}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadTwin(day: string): TwinState | null {
  return readJson<TwinState | null>(dayKey(day), null);
}

export function loadTwinHistory(): TwinState[] {
  return readJson<TwinState[]>(HISTORY_KEY, []);
}

export function saveTwin(state: TwinState): void {
  try {
    localStorage.setItem(dayKey(state.day), JSON.stringify(state));
    const history = loadTwinHistory().filter((item) => item.day !== state.day);
    history.push(state);
    history.sort((a, b) => a.day.localeCompare(b.day));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-30)));
  } catch {
    /* The live state still works when browser storage is unavailable. */
  }
}
