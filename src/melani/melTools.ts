import { writeTonightBrief } from "./bodyBrief";
import { loadBooks, requestBookOpen, type Book } from "./booksStore";
import { requestBookDiscovery } from "./bookDiscovery";
import { deriveCycle, loadCycle } from "./cycleEngine";
import { DAILY_SUPPLEMENTS, MEAL_PRESETS, todayKey } from "./data";
import {
  appendLifeLog,
  applyGoalCommand,
  applyPinCommand,
  buildLiveContext,
  loadGoals,
  loadLifeLog,
  loadPins,
  searchLifeLog,
} from "./melContext";
import {
  buildFoodOsPlan,
  ensureTodayMeat,
  lockTodayMeat,
  markTodayMeatEaten,
  type FoodOsMeat,
  undoTodayMeatEaten,
} from "./foodOs";
import {
  MEL_NAVIGATE_EVENT,
  requestMelSidebarAction,
  requestMelWorkspaceAction,
  type MelPageReference,
  type MelSidebarAction,
  type MelWorkspaceAction,
} from "./melActions";
import { applyShoppingCommand } from "./shoppingStore";
import { loadFogMap, loadSleepDay, saveFogMap, saveSleepDay } from "./sleepStore";
import { applyTaskCommand } from "./taskStore";

export const MEL_DATA_EVENT = "dr-melani-data-update";

export type MelToolResult<T = unknown> = {
  ok: boolean;
  tool: string;
  summary: string;
  data?: T;
};

type MacroBag = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

type MealDay = {
  loggedIds: string[];
  totals: MacroBag;
};

const EMPTY_MACROS: MacroBag = {
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
};

const PAGE_ALIASES: Array<{ pattern: RegExp; pageId: string; title: string }> = [
  { pattern: /\b(my\s+)?tasks?|to[ -]?do(?: list)?\b/i, pageId: "pg-my-tasks", title: "My Tasks" },
  { pattern: /\bbookshelf|library|books?\b/i, pageId: "pg-life", title: "Bookshelf" },
  { pattern: /\bweather|forecast|outside\b/i, pageId: "pg-agent-weather", title: "Weather" },
  { pattern: /\bwardrobe|closet|clothes\b/i, pageId: "pg-fashion-os", title: "Wardrobe" },
  { pattern: /\bshopping|grocer(?:y|ies)|inventory|restock\b/i, pageId: "pg-agent-shopping", title: "Shopping" },
  { pattern: /\bgmail|email|inbox\b/i, pageId: "pg-agent-gmail", title: "Gmail" },
  { pattern: /\bmeals?|food|macros?|nutrition\b/i, pageId: "pg-meals", title: "Meals" },
  { pattern: /\bsleep|brain fog\b/i, pageId: "pg-sleep", title: "Sleep" },
  { pattern: /\bgym|workout|training|fitness\b/i, pageId: "pg-gym", title: "Gym" },
  { pattern: /\bmy data|labs?|period|cycle|health data\b/i, pageId: "pg-data", title: "My Data" },
  { pattern: /\bdaily shower\b/i, pageId: "pg-shower-daily", title: "Daily shower" },
  { pattern: /\beverything shower\b/i, pageId: "pg-shower-everything", title: "Everything shower" },
  { pattern: /\bhair(?: care)?\b/i, pageId: "pg-hair", title: "Hair care" },
  { pattern: /\bam skincare|morning skincare\b/i, pageId: "pg-am-skin", title: "AM skincare" },
  { pattern: /\bpm skincare|night skincare\b/i, pageId: "pg-pm-skin", title: "PM skincare" },
  { pattern: /\bhygiene|shower|skincare\b/i, pageId: "pg-hygiene", title: "Hygiene" },
  { pattern: /\bwork\b/i, pageId: "pg-work", title: "Work" },
  { pattern: /\blife\b/i, pageId: "pg-life", title: "Life" },
];

function result<T>(tool: string, summary: string, data?: T): string {
  return JSON.stringify({ ok: true, tool, summary, data } satisfies MelToolResult<T>);
}

function failure(tool: string, summary: string): string {
  return JSON.stringify({ ok: false, tool, summary } satisfies MelToolResult);
}

function pageReference(target?: string, currentPageId?: string): MelPageReference {
  const cleaned = (target || "").trim().replace(/^(?:the\s+)?page\s+/i, "");
  if (!cleaned || /^(?:this|current|here|it)(?:\s+page)?$/i.test(cleaned)) {
    return currentPageId ? { id: currentPageId } : { current: true };
  }
  return { title: cleaned.replace(/^["'`]+|["'`.,!?]+$/g, "").trim() };
}

function workspaceTool(tool: string, action: MelWorkspaceAction): string {
  const outcome = requestMelWorkspaceAction(action);
  return outcome.ok
    ? result(tool, outcome.summary, outcome.data ?? outcome)
    : failure(tool, outcome.summary);
}

function sidebarTool(tool: string, action: MelSidebarAction): string {
  const outcome = requestMelSidebarAction(action);
  return outcome.ok
    ? result(tool, outcome.summary, outcome.data ?? outcome)
    : failure(tool, outcome.summary);
}

function notify(detail: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent(MEL_DATA_EVENT, { detail }));
}

function loadMealDay(day: string): MealDay {
  try {
    const parsed = JSON.parse(localStorage.getItem(`dr-melani-meals-usuals:${day}`) || "null") as MealDay | null;
    if (parsed?.totals && Array.isArray(parsed.loggedIds)) {
      return { loggedIds: parsed.loggedIds, totals: { ...EMPTY_MACROS, ...parsed.totals } };
    }
  } catch {
    /* use empty day */
  }
  return { loggedIds: [], totals: { ...EMPTY_MACROS } };
}

function saveMealDay(day: string, value: MealDay): void {
  localStorage.setItem(`dr-melani-meals-usuals:${day}`, JSON.stringify(value));
  notify({ domain: "meals", day });
}

function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function normalizeBookText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function bookMatchScore(book: Book, query: string): number {
  const q = normalizeBookText(query);
  const title = normalizeBookText(book.title);
  const author = normalizeBookText(book.author);
  if (!q) return 0;
  if (title === q) return 100;
  if (title.startsWith(q) || q.startsWith(title)) return 92;
  if (title.includes(q) || q.includes(title)) return 88;
  const words = book.title.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 5);
  if (words.some((word) => q.includes(normalizeBookText(word)))) return 78;
  if (`${title}${author}`.includes(q)) return 72;
  return 0;
}

export function parseToolResult(raw: string): MelToolResult {
  try {
    return JSON.parse(raw) as MelToolResult;
  } catch {
    return { ok: false, tool: "unknown", summary: raw };
  }
}

export function get_live_snapshot(pageId?: string, pageTitle?: string): string {
  const day = todayKey();
  const goals = loadGoals();
  const meals = loadMealDay(day);
  const sleep = loadSleepDay(day);
  const fogMap = loadFogMap();
  const derived = deriveCycle(loadCycle());
  const food = buildFoodOsPlan(day);
  const waterMl = Math.max(0, Number(localStorage.getItem(`dr-melani-water-ml:${day}`)) || 0);
  const loggedMeals = meals.loggedIds.map((id) => MEAL_PRESETS.find((meal) => meal.id === id)?.title || id);
  const data = {
    day,
    page: { id: pageId || "", title: pageTitle || "" },
    goals,
    water: { ml: waterMl, goalMl: goals.water_ml, remainingMl: Math.max(0, goals.water_ml - waterMl) },
    meals: { logged: loggedMeals, totals: meals.totals },
    sleep,
    brainFog: Object.hasOwn(fogMap, day) ? fogMap[day] : null,
    cycle: { phase: derived.phaseLabel, day: derived.currentDay, nextPeriodEstimate: derived.nextPeriodEst },
    food,
    pins: loadPins(),
    recentLogs: loadLifeLog().slice(-8),
    liveContext: buildLiveContext(pageId, pageTitle),
  };
  return result("get_live_snapshot", "Read the live Wonder snapshot.", data);
}

export function write_body_brief(): string {
  const brief = writeTonightBrief();
  notify({ domain: "brief", day: brief.day });
  return result("write_body_brief", `Wrote the body brief for ${brief.day}.`, brief);
}

export function get_food_plan(): string {
  const plan = buildFoodOsPlan();
  return result("get_food_plan", `${plan.meat === "beef" ? "Beef" : "Salmon"} is today's plate.`, plan);
}

export function lock_meat(meat: FoodOsMeat): string {
  const value = lockTodayMeat(meat);
  notify({ domain: "food", meat });
  return result("lock_meat", `Locked ${meat} for today.`, value);
}

export function log_meat_eaten(meat?: FoodOsMeat): string {
  const value = markTodayMeatEaten(meat);
  appendLifeLog(`Food OS: ate ${value.meat}.`);
  notify({ domain: "food", meat: value.meat });
  return result("log_meat_eaten", `Logged ${value.meat} as eaten today.`, value);
}

export function undo_meat_eaten(): string {
  const value = undoTodayMeatEaten();
  notify({ domain: "food", meat: value.meat });
  return result("undo_meat_eaten", `Removed today's eaten mark for ${value.meat}.`, value);
}

export function log_usual_meal(presetId: string): string {
  const preset = MEAL_PRESETS.find((meal) => meal.id === presetId);
  if (!preset) return failure("log_usual_meal", `No usual meal matches ${presetId}.`);
  const day = todayKey();
  const current = loadMealDay(day);
  if (current.loggedIds.includes(preset.id)) {
    return result("log_usual_meal", `${preset.title} is already logged today.`, current);
  }
  const totals = { ...current.totals };
  (Object.keys(EMPTY_MACROS) as Array<keyof MacroBag>).forEach((key) => {
    totals[key] = (Number(totals[key]) || 0) + preset[key];
  });
  const next = { loggedIds: [...current.loggedIds, preset.id], totals };
  saveMealDay(day, next);

  const consumeKey = `dr-melani-meals-consume:${day}`;
  try {
    const consume = JSON.parse(localStorage.getItem(consumeKey) || "{}") as Record<string, { done: boolean; time: string }>;
    consume[`meal-${preset.id}`] = { done: true, time: formatClock(new Date()) };
    localStorage.setItem(consumeKey, JSON.stringify(consume));
  } catch {
    /* macro record is already saved */
  }
  return result(
    "log_usual_meal",
    `Logged ${preset.title.toLowerCase()}: ${preset.calories} calories and ${preset.protein_g}g protein.`,
    next
  );
}

export function undo_usual_meal(presetId: string): string {
  const preset = MEAL_PRESETS.find((meal) => meal.id === presetId);
  if (!preset) return failure("undo_usual_meal", `No usual meal matches ${presetId}.`);
  const day = todayKey();
  const current = loadMealDay(day);
  if (!current.loggedIds.includes(preset.id)) return result("undo_usual_meal", `${preset.title} was not logged today.`, current);
  const totals = { ...current.totals };
  (Object.keys(EMPTY_MACROS) as Array<keyof MacroBag>).forEach((key) => {
    totals[key] = Math.max(0, (Number(totals[key]) || 0) - preset[key]);
  });
  const next = { loggedIds: current.loggedIds.filter((id) => id !== preset.id), totals };
  saveMealDay(day, next);
  return result("undo_usual_meal", `Undid ${preset.title.toLowerCase()}.`, next);
}

export function log_water(amountMl: number): string {
  if (!Number.isFinite(amountMl) || amountMl <= 0) return failure("log_water", "Water amount must be above zero.");
  const day = todayKey();
  const key = `dr-melani-water-ml:${day}`;
  const historyKey = `dr-melani-water-hist:${day}`;
  const before = Math.max(0, Number(localStorage.getItem(key)) || 0);
  const next = before + Math.round(amountMl);
  localStorage.setItem(key, String(next));
  let history: number[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(historyKey) || "[]") as number[];
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    /* use empty history */
  }
  localStorage.setItem(historyKey, JSON.stringify([...history, Math.round(amountMl)]));
  notify({ domain: "water", day });
  return result("log_water", `Logged ${(amountMl / 1000).toFixed(amountMl % 1000 ? 2 : 1)} L. Water is now ${(next / 1000).toFixed(1)} L today.`, { amountMl, totalMl: next });
}

export function undo_water(): string {
  const day = todayKey();
  const key = `dr-melani-water-ml:${day}`;
  const historyKey = `dr-melani-water-hist:${day}`;
  let history: number[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(historyKey) || "[]") as number[];
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    /* use empty history */
  }
  const amount = history.pop();
  if (!amount) return result("undo_water", "There is no water entry to undo today.");
  const next = Math.max(0, (Number(localStorage.getItem(key)) || 0) - amount);
  localStorage.setItem(key, String(next));
  localStorage.setItem(historyKey, JSON.stringify(history));
  notify({ domain: "water", day });
  return result("undo_water", `Undid ${(amount / 1000).toFixed(amount % 1000 ? 2 : 1)} L. Water is now ${(next / 1000).toFixed(1)} L today.`, { amountMl: amount, totalMl: next });
}

export function log_sleep_hours(hours: number): string {
  if (!Number.isFinite(hours) || hours < 1 || hours > 16) return failure("log_sleep_hours", "Sleep must be between 1 and 16 hours.");
  const wake = new Date();
  const bed = new Date(wake.getTime() - hours * 60 * 60 * 1000);
  const value = saveSleepDay(todayKey(), formatClock(bed), formatClock(wake));
  notify({ domain: "sleep", day: todayKey() });
  return result("log_sleep_hours", `Logged ${value.hours} hours of sleep ending at ${value.wake}.`, value);
}

export function get_sleep_today(): string {
  const value = loadSleepDay(todayKey());
  const summary = value.hours == null ? "Sleep is not logged today." : `Sleep is ${value.hours} hours today.`;
  return result("get_sleep_today", summary, value);
}

export function log_brain_fog(value: boolean): string {
  saveFogMap({ ...loadFogMap(), [todayKey()]: value });
  notify({ domain: "brainFog", day: todayKey() });
  return result("log_brain_fog", `Brain fog is logged as ${value ? "yes" : "no"} for today.`, { value });
}

export function log_all_supplements(): string {
  const done = Object.fromEntries(DAILY_SUPPLEMENTS.map((item) => [item.id, true]));
  localStorage.setItem(`dr-melani-supplements-done:${todayKey()}`, JSON.stringify(done));
  notify({ domain: "supplements", day: todayKey() });
  return result("log_all_supplements", "Logged all supplements for today.", done);
}

export function set_goal(key: string, value: string | number): string {
  const goals = applyGoalCommand(`goal ${key} ${value}`);
  if (!goals) return failure("set_goal", `I could not set the ${key} goal.`);
  notify({ domain: "goals" });
  return result("set_goal", `Saved the ${key} goal as ${value}.`, goals);
}

export function pin_fact(fact: string): string {
  const summary = applyPinCommand(`pin ${fact}`);
  return summary ? result("pin", summary, loadPins()) : failure("pin", "Nothing was pinned.");
}

export function unpin_fact(fact: string): string {
  const summary = applyPinCommand(`unpin ${fact}`);
  return summary ? result("unpin", summary, loadPins()) : failure("unpin", "Nothing was unpinned.");
}

export function list_pins(): string {
  const pins = loadPins();
  return result("list_pins", pins.length ? `You have ${pins.length} pinned facts.` : "No pins saved.", pins);
}

export function life_log(text: string): string {
  const entry = appendLifeLog(text);
  notify({ domain: "lifeLog", day: entry.day });
  return result("life_log", "Logged to your life record.", entry);
}

export function search_logs(query: string): string {
  const hits = searchLifeLog(query, 12);
  return result("search_logs", hits.length ? `Found ${hits.length} matching logs.` : `No logs match ${query}.`, hits);
}

export function create_workspace_page(
  title?: string,
  parent?: string,
  currentPageId?: string,
  asAgent = false,
  content?: string
): string {
  let parentRef: MelPageReference | null = null;
  if (parent && !/^(?:root|top(?: level)?|private)$/i.test(parent.trim())) {
    parentRef = pageReference(parent, currentPageId);
  }
  return workspaceTool("create_workspace_page", {
    kind: "create-page",
    title: title?.trim() || undefined,
    parent: parentRef,
    asAgent,
    content,
  });
}

export function open_workspace_page(target: string, currentPageId?: string): string {
  return workspaceTool("open_workspace_page", {
    kind: "open-page",
    target: pageReference(target, currentPageId),
  });
}

export function list_workspace_pages(): string {
  return workspaceTool("list_workspace_pages", { kind: "list-pages" });
}

export function rename_workspace_page(
  target: string | undefined,
  title: string,
  currentPageId?: string
): string {
  return workspaceTool("rename_workspace_page", {
    kind: "rename-page",
    target: pageReference(target, currentPageId),
    title,
  });
}

export function trash_workspace_page(target?: string, currentPageId?: string): string {
  return workspaceTool("trash_workspace_page", {
    kind: "trash-page",
    target: pageReference(target, currentPageId),
  });
}

export function restore_workspace_page(target: string): string {
  return workspaceTool("restore_workspace_page", {
    kind: "restore-page",
    target: pageReference(target),
  });
}

export function duplicate_workspace_page(target?: string, currentPageId?: string): string {
  return workspaceTool("duplicate_workspace_page", {
    kind: "duplicate-page",
    target: pageReference(target, currentPageId),
  });
}

export function move_workspace_page(
  target: string | undefined,
  destination: string,
  position: "inside" | "before" | "after",
  currentPageId?: string
): string {
  return workspaceTool("move_workspace_page", {
    kind: "move-page",
    target: pageReference(target, currentPageId),
    destination: pageReference(destination),
    position,
  });
}

export function write_workspace_page(
  target: string | undefined,
  content: string,
  mode: "append" | "replace",
  currentPageId?: string,
  blockType?: "paragraph" | "heading1" | "heading2" | "heading3" | "bullet" | "numbered" | "todo" | "quote" | "callout"
): string {
  return workspaceTool("write_workspace_page", {
    kind: "write-page",
    target: pageReference(target, currentPageId),
    content,
    mode,
    blockType,
  });
}

export function clear_workspace_page(target?: string, currentPageId?: string): string {
  return workspaceTool("clear_workspace_page", {
    kind: "clear-page",
    target: pageReference(target, currentPageId),
  });
}

export function favorite_workspace_page(
  target: string | undefined,
  favorite: boolean,
  currentPageId?: string
): string {
  return workspaceTool("favorite_workspace_page", {
    kind: "favorite-page",
    target: pageReference(target, currentPageId),
    favorite,
  });
}

export function undo_workspace_action(): string {
  return workspaceTool("undo_workspace_action", { kind: "undo-workspace" });
}

export function collapse_sidebar_sections(): string {
  return sidebarTool("collapse_sidebar_sections", { kind: "collapse-all" });
}

export function set_sidebar_section(target: string, open: boolean): string {
  return sidebarTool("set_sidebar_section", {
    kind: "set-section",
    target,
    collapsed: !open,
  });
}

export function open_page_hint(page: string): string {
  const found = PAGE_ALIASES.find((entry) => entry.pattern.test(page)) || PAGE_ALIASES.find((entry) => entry.pageId === page);
  if (!found) return failure("open_page_hint", `I could not find a page matching ${page}.`);
  return result("open_page_hint", `${found.title} is at ?page=${found.pageId}.`, { ...found, pattern: undefined, href: `?page=${found.pageId}` });
}

export function find_books(query: string): string {
  const matches = loadBooks()
    .map((book) => ({ book, score: bookMatchScore(book, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title))
    .slice(0, 5)
    .map(({ book }) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      progress: Math.max(book.readerProgress || 0, book.localReaderProgress || 0, book.appleProgress || 0),
      canReadHere: Boolean(book.readerUrl),
    }));
  return result("find_books", matches.length ? `Found ${matches.length} matching books.` : `No book matches ${query}.`, matches);
}

export function open_book(query: string): string {
  const matches = parseToolResult(find_books(query));
  const rows = Array.isArray(matches.data) ? matches.data as Array<{ id: string }> : [];
  const matchId = rows[0]?.id;
  const book = loadBooks().find((entry) => entry.id === matchId);
  if (!book) return failure("open_book", `I could not find ${query} in your Bookshelf.`);

  const request = requestBookOpen(book);
  window.dispatchEvent(new CustomEvent(MEL_NAVIGATE_EVENT, { detail: { pageId: "pg-life" } }));
  const progress = Math.max(book.readerProgress || 0, book.localReaderProgress || 0, book.appleProgress || 0);
  const percent = Math.round(progress * 100);
  const place = request.startCfi ? (percent > 0 ? ` at ${percent}%` : " at your saved place") : " from the beginning";
  const summary = book.readerUrl
    ? `Opening ${book.title}${place}.`
    : `Opened ${book.title} in Bookshelf. Its readable file is not available inside Wonder yet.`;
  return result("open_book", summary, {
    id: book.id,
    title: book.title,
    author: book.author,
    progress,
    resumed: Boolean(request.startCfi),
    destination: book.readerUrl ? "reader" : "book details",
  });
}

export function find_book_source(query: string): string {
  const cleaned = query.trim();
  if (!cleaned) return failure("find_book_source", "Tell me which book to find.");
  requestBookDiscovery(cleaned);
  window.dispatchEvent(new CustomEvent(MEL_NAVIGATE_EVENT, { detail: { pageId: "pg-life" } }));
  return result(
    "find_book_source",
    `Searching legal book catalogs for ${cleaned}. I opened the results in Bookshelf.`,
    { query: cleaned, destination: "pg-life" }
  );
}

export function navigate_page(page: string): string {
  const workspace = parseToolResult(open_workspace_page(page));
  if (workspace.ok) return JSON.stringify(workspace);
  const hint = parseToolResult(open_page_hint(page));
  const data = hint.data as { pageId?: string; title?: string; href?: string } | undefined;
  if (!hint.ok || !data?.pageId) return JSON.stringify(hint);
  window.dispatchEvent(new CustomEvent(MEL_NAVIGATE_EVENT, { detail: { pageId: data.pageId } }));
  return result("navigate_page", `Opened ${data.title || page}.`, data);
}

export function run_task_command(text: string): string {
  const summary = applyTaskCommand(text);
  return summary ? result("task", summary) : failure("task", "I could not turn that into a task safely.");
}

export function run_shopping_command(text: string): string {
  const summary = applyShoppingCommand(text);
  return summary ? result("shopping", summary) : failure("shopping", "I could not apply that shopping update safely.");
}

export function current_meat(): FoodOsMeat {
  return ensureTodayMeat().meat;
}
