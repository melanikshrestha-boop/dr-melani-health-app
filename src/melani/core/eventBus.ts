/**
 * Wonder event bus — modules publish facts; Mel / UI subscribe.
 * Keeps Food OS, Mel, Twin, weather cache aligned without tight coupling.
 */

export type WonderEventType =
  | "meal.logged"
  | "meal.undone"
  | "meat.locked"
  | "meat.eaten"
  | "meat.undone"
  | "sleep.saved"
  | "water.logged"
  | "weather.updated"
  | "task.changed"
  | "policy.decided"
  | "mel.plan"
  | "mel.action"
  | "data.changed";

export type WonderEvent<T = unknown> = {
  type: WonderEventType;
  at: string;
  source: string;
  payload?: T;
};

type Handler = (event: WonderEvent) => void;

const handlers = new Map<WonderEventType | "*", Set<Handler>>();
const RECENT_KEY = "wonder-event-log-v1";
const MAX_RECENT = 40;

function pushRecent(event: WonderEvent) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: WonderEvent[] = raw ? (JSON.parse(raw) as WonderEvent[]) : [];
    list.unshift(event);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    /* ignore */
  }
}

export function wonderOn(
  type: WonderEventType | "*",
  handler: Handler
): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler);
  return () => {
    handlers.get(type)?.delete(handler);
  };
}

export function wonderEmit<T = unknown>(
  type: WonderEventType,
  source: string,
  payload?: T
): WonderEvent<T> {
  const event: WonderEvent<T> = {
    type,
    at: new Date().toISOString(),
    source,
    payload,
  };
  pushRecent(event);
  handlers.get(type)?.forEach((h) => {
    try {
      h(event as WonderEvent);
    } catch {
      /* never break publisher */
    }
  });
  handlers.get("*")?.forEach((h) => {
    try {
      h(event as WonderEvent);
    } catch {
      /* ignore */
    }
  });
  // DOM bridge for React pages that already listen to window events
  try {
    window.dispatchEvent(
      new CustomEvent("wonder-event", { detail: event })
    );
  } catch {
    /* ignore */
  }
  return event;
}

export function loadRecentWonderEvents(): WonderEvent[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as WonderEvent[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
