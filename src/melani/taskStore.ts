export type WonderTask = { id: string; title: string; done: boolean; source: "wonder" | "reminders"; list?: string; createdAt: number };
const KEY = "wonder-local-tasks-v1";
export const TASK_EVENT = "wonder-tasks-update";
export const FOCUS_EVENT = "wonder-start-focus";

export function loadLocalTasks(): WonderTask[] {
  try { const value = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
export function saveLocalTasks(tasks: WonderTask[]) { localStorage.setItem(KEY, JSON.stringify(tasks)); window.dispatchEvent(new CustomEvent(TASK_EVENT)); }
export function addLocalTask(title: string) {
  const task: WonderTask = { id: `task-${Date.now()}`, title, done: false, source: "wonder", createdAt: Date.now() };
  saveLocalTasks([task, ...loadLocalTasks()]);
  void fetch("/api/local-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).catch(() => {});
  return task;
}
export function startFocus(title: string, minutes = 25) { window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { title, minutes } })); }
export function applyTaskCommand(text: string): string | null {
  const match = text.trim().match(/^(?:hey\s+)?(?:i(?:'m| am) going to|i gotta|i need to|task:?|remind me to|focus on)\s+(.+)$/i)
    || text.trim().match(/^(?:add|create|make)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?task(?:\s+(?:called|named|to))?\s+(.+)$/i);
  if (!match?.[1]) return null;
  const title = match[1].replace(/[.!]+$/, "").trim();
  addLocalTask(title); startFocus(title, 25);
  return `Added “${title}” and started a 25-minute focus block.`;
}
