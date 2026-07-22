/**
 * Offline-first storage adapters.
 * Reads/writes localStorage with a small write-ahead log.
 * Network (weather, Grok) is optional sauce — never the source of truth for personal data.
 */

import { wonderEmit } from "./eventBus";

const WAL_KEY = "wonder-offline-wal-v1";
const MAX_WAL = 80;

export type WalEntry = {
  id: string;
  at: string;
  key: string;
  op: "set" | "remove";
  /** size hint only — values stay in localStorage */
  bytes: number;
};

function readWal(): WalEntry[] {
  try {
    const raw = localStorage.getItem(WAL_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as WalEntry[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeWal(entries: WalEntry[]) {
  try {
    localStorage.setItem(WAL_KEY, JSON.stringify(entries.slice(0, MAX_WAL)));
  } catch {
    /* ignore */
  }
}

function appendWal(entry: Omit<WalEntry, "id" | "at">) {
  const full: WalEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
  };
  writeWal([full, ...readWal()]);
}

/** Safe JSON get */
export function offlineGetJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Safe JSON set + WAL + event */
export function offlineSetJson(key: string, value: unknown, source = "offlineStore"): void {
  try {
    const raw = JSON.stringify(value);
    localStorage.setItem(key, raw);
    appendWal({ key, op: "set", bytes: raw.length });
    wonderEmit("data.changed", source, { key });
  } catch {
    /* quota / private mode */
  }
}

export function offlineRemove(key: string, source = "offlineStore"): void {
  try {
    localStorage.removeItem(key);
    appendWal({ key, op: "remove", bytes: 0 });
    wonderEmit("data.changed", source, { key });
  } catch {
    /* ignore */
  }
}

export function offlineGetString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function offlineSetString(key: string, value: string, source = "offlineStore"): void {
  try {
    localStorage.setItem(key, value);
    appendWal({ key, op: "set", bytes: value.length });
    wonderEmit("data.changed", source, { key });
  } catch {
    /* ignore */
  }
}

/** True when we should not block UI on network AI bridges */
export function preferOfflinePath(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return false;
}

export function loadWriteAheadLog(): WalEntry[] {
  return readWal();
}
