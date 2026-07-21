import { applyLearnCommand, polishReply } from "./melLearn";
import { pushSessionMemory } from "./melContext";
import { runWardrobeCommand } from "./wardrobe/wardrobeAgent";
import { runWeatherCommand } from "./weather/weatherAgentTool";
import {
  clear_workspace_page,
  collapse_sidebar_sections,
  create_workspace_page,
  duplicate_workspace_page,
  favorite_workspace_page,
  get_food_plan,
  get_live_snapshot,
  get_sleep_today,
  find_book_source,
  life_log,
  list_workspace_pages,
  list_pins,
  lock_meat,
  log_all_supplements,
  log_brain_fog,
  log_meat_eaten,
  log_sleep_hours,
  log_usual_meal,
  log_water,
  navigate_page,
  open_book,
  parseToolResult,
  pin_fact,
  rename_workspace_page,
  restore_workspace_page,
  search_logs,
  set_goal,
  set_sidebar_section,
  move_workspace_page,
  run_shopping_command,
  run_task_command,
  trash_workspace_page,
  type MelToolResult,
  undo_meat_eaten,
  undo_usual_meal,
  undo_water,
  undo_workspace_action,
  unpin_fact,
  write_workspace_page,
  write_body_brief,
} from "./melTools";

export type MelAgentMode = "offline-local" | "local-model" | "action" | "grok-connected" | "research";

export type MelHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MelAgentRequest = {
  text: string;
  pageId?: string;
  pageTitle?: string;
  history?: MelHistoryMessage[];
  cloudAvailable?: boolean;
  localModelAvailable?: boolean;
  forceLocal?: boolean;
};

export type MelAgentResponse = {
  reply: string;
  mode: MelAgentMode;
  toolResults: MelToolResult[];
};

type Snapshot = {
  day: string;
  goals: { protein_g: number; calories: number; water_ml: number; sleep_hours: number };
  water: { ml: number; goalMl: number; remainingMl: number };
  meals: { logged: string[]; totals: { protein_g: number; calories: number } };
  sleep: { hours: number | null; bedtime: string; wake: string };
  brainFog: boolean | null;
  cycle: { phase: string; day: number; nextPeriodEstimate: string | null };
  food: {
    meat: "beef" | "salmon";
    locked: boolean;
    eaten: boolean;
    plate: string;
    proteinRemaining_g: number;
    caloriesRemaining: number;
    note: string;
  };
  liveContext: string;
};

const LAST_ACTION_DOMAIN_KEY = "wonder-mel-last-action-domain-v1";

function lastActionDomain(): string | null {
  try { return localStorage.getItem(LAST_ACTION_DOMAIN_KEY); }
  catch { return null; }
}

function rememberActionDomain(toolResults: MelToolResult[]): void {
  if (!toolResults.length) return;
  try {
    if (toolResults.some((item) => item.ok && item.tool.startsWith("wardrobe_"))) {
      localStorage.setItem(LAST_ACTION_DOMAIN_KEY, "wardrobe");
    } else if (toolResults.some((item) => item.ok)) {
      localStorage.removeItem(LAST_ACTION_DOMAIN_KEY);
    }
  } catch {
    /* action routing still works from the current page without storage */
  }
}

function cleanReply(text: string): string {
  return polishReply(text)
    .replace(/\u2014/g, ",")
    .replace(/\u2013/g, "-")
    .replace(/—/g, ",")
    .replace(/–/g, "-")
    .trim();
}

function envelope(tool: string, summary: string, data?: unknown, ok = true): MelToolResult {
  return { ok, tool, summary, data };
}

function addTool(results: MelToolResult[], raw: string): void {
  const parsed = parseToolResult(raw);
  if (!results.some((item) => item.tool === parsed.tool && item.summary === parsed.summary)) results.push(parsed);
}

function parseAmountMl(text: string): number | null {
  const match = text.match(/(?:drank|drink|logged?|add(?:ed)?|had)\s+(\d+(?:\.\d+)?)\s*(l|liters?|litres?|ml|milliliters?)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return match[2].toLowerCase().startsWith("l") ? amount * 1000 : amount;
}

function cleanCommandValue(value: string | undefined): string | undefined {
  const clean = (value || "")
    .trim()
    .replace(/^["'`\u201c\u201d]+|["'`\u201c\u201d.,!?]+$/g, "")
    .trim();
  return clean || undefined;
}

type CreatePageCommand = {
  title?: string;
  parent?: string;
  asAgent: boolean;
};

function parseCreatePageCommand(text: string): CreatePageCommand | null {
  const q = text.trim().replace(/[.!]+$/, "");
  const placedAndNamed = q.match(
    /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:create|make|add|open)\s+(?:me\s+)?(?:a\s+)?new\s+(page|sub[ -]?page|agent)\s+(?:under|inside|into|in)\s+(?:the\s+)?(?:page\s+)?(.+?)\s+(?:and\s+)?(?:call|name|title)\s+it\s+(.+)$/i
  );
  if (placedAndNamed?.[1] && placedAndNamed[2] && placedAndNamed[3]) {
    return {
      title: cleanCommandValue(placedAndNamed[3]),
      parent: cleanCommandValue(placedAndNamed[2]),
      asAgent: placedAndNamed[1].toLowerCase() === "agent",
    };
  }

  const match = q.match(
    /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:create|make|add)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?(page|sub[ -]?page|agent)(?:\s+(.+))?$/i
  ) || q.match(/^(?:please\s+)?open\s+(?:me\s+)?(?:a\s+)?new\s+(page|sub[ -]?page|agent)(?:\s+(.+))?$/i)
    || q.match(/^(?:please\s+)?new\s+(page|sub[ -]?page|agent)(?:\s+(.+))?$/i);
  if (!match) return null;

  const kind = match[1].toLowerCase();
  let tail = (match[2] || "").trim();
  let parent: string | undefined;
  const location = tail.match(/\s+(?:under|inside|into|in)\s+(?:the\s+)?(?:page\s+)?(.+)$/i);
  if (location?.[1]) {
    parent = cleanCommandValue(location[1]);
    tail = tail.slice(0, location.index).trim();
  }
  if (/^(?:here|inside this page|under this page)$/i.test(tail)) {
    parent = "this page";
    tail = "";
  }
  if (kind.startsWith("sub") && !parent) parent = "this page";
  tail = tail.replace(/^(?:called|named|titled|for)\s+/i, "");
  return {
    title: cleanCommandValue(tail),
    parent,
    asAgent: kind === "agent",
  };
}

function parseRenamePageCommand(text: string): { target?: string; title: string } | null {
  const q = text.trim().replace(/[.!]+$/, "");
  let match = q.match(/^rename\s+(?:this|current)(?:\s+page)?\s+to\s+(.+)$/i);
  if (match?.[1]) return { title: cleanCommandValue(match[1]) || "" };
  match = q.match(/^rename\s+(?:the\s+)?page\s+(.+?)\s+to\s+(.+)$/i);
  if (match?.[1] && match[2]) {
    return { target: cleanCommandValue(match[1]), title: cleanCommandValue(match[2]) || "" };
  }
  match = q.match(/^rename\s+(.+?)\s+to\s+(.+)$/i);
  if (match?.[1] && match[2]) {
    return { target: cleanCommandValue(match[1]), title: cleanCommandValue(match[2]) || "" };
  }
  return null;
}

function currentOrNamedPage(value: string | undefined): string | undefined {
  const clean = cleanCommandValue(value?.replace(/^(?:the\s+)?page\s+/i, ""));
  return clean && !/^(?:(?:this|that|current|last|new)(?:\s+page)?|it)$/i.test(clean)
    ? clean
    : undefined;
}

function parseWritePageCommand(text: string): {
  target?: string;
  content: string;
  mode: "append" | "replace";
} | null {
  const q = text.trim().replace(/[.!]+$/, "");
  let match = q.match(/^replace\s+(?:(?:the\s+)?(?:content|text)\s+)?(?:on|in)\s+(.+?)\s+with\s+(.+)$/i);
  if (match?.[1] && match[2]) {
    return {
      target: currentOrNamedPage(match[1]),
      content: cleanCommandValue(match[2]) || "",
      mode: "replace",
    };
  }
  match = q.match(/^write\s+(?:on|to|in)\s+(.+?)\s*:\s*(.+)$/i);
  if (match?.[1] && match[2]) {
    return {
      target: currentOrNamedPage(match[1]),
      content: cleanCommandValue(match[2]) || "",
      mode: "append",
    };
  }
  match = q.match(/^(?:add|append|write|put)\s+["\u201c](.+?)["\u201d]\s+(?:to|on|in)\s+(.+)$/i);
  if (match?.[1] && match[2]) {
    return {
      target: currentOrNamedPage(match[2]),
      content: match[1].trim(),
      mode: "append",
    };
  }
  match = q.match(/^(?:add|append|write|put)\s+(.+?)\s+(?:to|on|in)\s+((?:this|current)\s+page|(?:the\s+)?page\s+.+)$/i);
  if (match?.[1] && match[2]) {
    return {
      target: currentOrNamedPage(match[2]),
      content: cleanCommandValue(match[1]) || "",
      mode: "append",
    };
  }
  return null;
}

function planAndExecute(text: string, pageId?: string, pageTitle?: string): MelToolResult[] {
  const q = text.trim();
  const low = q.toLowerCase();
  const results: MelToolResult[] = [];

  const learned = applyLearnCommand(q);
  if (learned) return [envelope("learn", learned)];

  const wantsHelp = /^(help|commands|what can you do|how do i use mel)\??$/i.test(q);
  if (wantsHelp) {
    return [envelope("help", "Help requested.")];
  }

  if (/^undo(?:\s+(?:that|the\s+last\s+(?:workspace\s+)?(?:change|action)))?[.!]?$/i.test(q)) {
    addTool(results, undo_workspace_action());
    return results;
  }

  if (/^(?:close|collapse|shut)\s+(?:all\s+)?(?:the\s+)?(?:sidebar\s+)?(?:toggles?|folders?|sections?|subpages?|trees?|totals?)(?:\s+(?:in|on)\s+(?:the\s+)?(?:main\s+)?page)?[.!]?$/i.test(q)
    || /^(?:close|collapse)\s+(?:the\s+)?(?:whole\s+)?sidebar[.!]?$/i.test(q)) {
    addTool(results, collapse_sidebar_sections());
    return results;
  }

  const sidebarSection = q.match(
    /^(open|expand|close|collapse)\s+(?:the\s+)?(.+?)\s+(?:toggle|folder|section)(?:\s+(?:in|on)\s+(?:the\s+)?sidebar)?[.!]?$/i
  ) || q.match(
    /^(open|expand|close|collapse)\s+(?:the\s+)?(.+?)\s+(?:in|on)\s+(?:the\s+)?sidebar[.!]?$/i
  );
  if (sidebarSection?.[1] && sidebarSection[2]) {
    addTool(
      results,
      set_sidebar_section(
        cleanCommandValue(sidebarSection[2]) || "",
        /open|expand/i.test(sidebarSection[1])
      )
    );
    return results;
  }

  const createPage = parseCreatePageCommand(q);
  if (createPage) {
    addTool(
      results,
      create_workspace_page(
        createPage.title,
        createPage.parent,
        pageId,
        createPage.asAgent
      )
    );
    return results;
  }

  const renamePage = parseRenamePageCommand(q);
  if (renamePage) {
    addTool(results, rename_workspace_page(renamePage.target, renamePage.title, pageId));
    return results;
  }

  const trashPage = q.match(/^(?:delete|trash|remove)\s+(?:(?:this|current)\s+page|(?:the\s+)?page(?:\s+(?:called|named))?\s+(.+))$/i)
    || q.match(/^(?:delete|trash|remove)\s+(.+?)\s+page$/i);
  if (trashPage) {
    addTool(results, trash_workspace_page(currentOrNamedPage(trashPage[1]), pageId));
    return results;
  }

  const restorePage = q.match(/^restore\s+(?:the\s+)?(?:page\s+)?(.+)$/i);
  if (restorePage?.[1]) {
    addTool(results, restore_workspace_page(cleanCommandValue(restorePage[1]) || ""));
    return results;
  }

  const duplicatePage = q.match(/^duplicate\s+(?:(?:this|current)\s+page|(?:the\s+)?(?:page\s+)?(.+))$/i);
  if (duplicatePage) {
    addTool(results, duplicate_workspace_page(currentOrNamedPage(duplicatePage[1]), pageId));
    return results;
  }

  const movePage = q.match(/^(?:move|put|place)\s+(.+?)\s+(under|inside|into|above|before|below|after)\s+(?:the\s+)?(?:page\s+)?(.+)$/i);
  if (movePage?.[1] && movePage[2] && movePage[3]) {
    const relation = movePage[2].toLowerCase();
    const position = /under|inside|into/.test(relation)
      ? "inside"
      : /above|before/.test(relation)
        ? "before"
        : "after";
    addTool(
      results,
      move_workspace_page(
        currentOrNamedPage(movePage[1]),
        cleanCommandValue(movePage[3]) || "",
        position,
        pageId
      )
    );
    return results;
  }

  const writePage = parseWritePageCommand(q);
  if (writePage) {
    addTool(
      results,
      write_workspace_page(writePage.target, writePage.content, writePage.mode, pageId)
    );
    return results;
  }

  const clearPage = q.match(/^clear\s+(?:(?:this|current)\s+page|(?:the\s+)?(?:page\s+)?(.+))$/i);
  if (clearPage) {
    addTool(results, clear_workspace_page(currentOrNamedPage(clearPage[1]), pageId));
    return results;
  }

  const favoritePage = q.match(/^(favorite|unfavorite)\s+(?:(?:this|current)\s+page|(?:the\s+)?(?:page\s+)?(.+))$/i);
  if (favoritePage) {
    addTool(
      results,
      favorite_workspace_page(
        currentOrNamedPage(favoritePage[2]),
        favoritePage[1].toLowerCase() === "favorite",
        pageId
      )
    );
    return results;
  }

  if (/^(?:list|show)(?:\s+me)?\s+(?:all\s+)?(?:my\s+)?pages$|^what pages do i have\??$/i.test(q)) {
    addTool(results, list_workspace_pages());
    return results;
  }

  if (/\b(?:write|show|give me|open|refresh)?\s*(?:my\s+)?(?:nightly\s+|body\s+)?brief\b/i.test(low) || low === "tonight") {
    addTool(results, write_body_brief());
  }

  if (/^(?:status|today|snapshot|check in|check-in)$/i.test(q) || /\b(?:what(?:'s| is) left|how am i doing|show (?:me )?(?:my )?(?:status|numbers)|today'?s status)\b/i.test(low)) {
    addTool(results, get_live_snapshot(pageId, pageTitle));
  }

  if (/^pins$/i.test(q)) addTool(results, list_pins());
  const pin = q.match(/^pin\s+(.+)$/i);
  if (pin?.[1]) addTool(results, pin_fact(pin[1].trim()));
  const unpin = q.match(/^unpin\s+(.+)$/i);
  if (unpin?.[1]) addTool(results, unpin_fact(unpin[1].trim()));

  const goal = q.match(/^goal\s+([a-z_]+)\s+(.+)$/i);
  if (goal?.[1] && goal[2]) addTool(results, set_goal(goal[1], goal[2].trim()));

  const search = q.match(/^(?:find|search)\s+(?:my\s+)?logs?\s+(?:for\s+)?(.+)$/i)
    || q.match(/^logs\s+(.+)$/i);
  if (search?.[1]) addTool(results, search_logs(search[1].trim()));

  if (/\bundo\s+(?:the\s+)?(?:last\s+)?water\b/i.test(low)) addTool(results, undo_water());
  const amountMl = parseAmountMl(q);
  if (amountMl != null && !/\bundo\b/i.test(low)) addTool(results, log_water(amountMl));

  if (/\bundo\s+(?:my\s+)?(?:usual\s+)?breakfast\b/i.test(low)) {
    addTool(results, undo_usual_meal("breakfast_usual"));
  } else if (/\b(?:log|ate|had)\s+(?:my\s+)?(?:usual\s+)?breakfast(?:\s+today)?\b/i.test(low)) {
    addTool(results, log_usual_meal("breakfast_usual"));
  }

  const fog = low.match(/(?:log\s+)?brain fog\s*(?:is|was|:)?\s*(yes|no|on|off|true|false)\b/i);
  if (fog) addTool(results, log_brain_fog(/yes|on|true/.test(fog[1])));

  const slept = low.match(/(?:i\s+)?(?:slept|log sleep)\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  if (slept) addTool(results, log_sleep_hours(Number(slept[1])));
  if (/^(?:sleep|sleep today|how much did i sleep|what was my sleep)\??$/i.test(q)) addTool(results, get_sleep_today());

  if (/\b(?:took|done with|finished|log)(?:\s+all|\s+my)?\s+supplements?\b/i.test(low)) {
    addTool(results, log_all_supplements());
  }

  if (/\bundo\s+(?:today'?s\s+)?(?:meat|beef|salmon)\b/i.test(low)) {
    addTool(results, undo_meat_eaten());
  } else {
    const ateMeat = low.match(/\b(?:ate|had|finished|log(?:ged)?)\s+(?:the\s+)?(beef|salmon)\b/i);
    if (ateMeat?.[1]) addTool(results, log_meat_eaten(ateMeat[1] as "beef" | "salmon"));
    const lockMeat = low.match(/^(?:lock|choose|pick|make it|do)\s+(beef|salmon)(?:\s+today)?[.!]?$/i);
    if (lockMeat?.[1]) addTool(results, lock_meat(lockMeat[1] as "beef" | "salmon"));
    if (/^(beef|salmon)[.!]?$/i.test(q)) addTool(results, lock_meat(low.replace(/[.!]/g, "") as "beef" | "salmon"));
  }

  const asksFood = /^(food|food plan|what meat|what am i eating|what should i eat|what do i eat|today'?s plate|today'?s meat)\??$/i.test(q)
    || /\b(?:what meat|food plan|what should i eat today|what am i eating today)\b/i.test(low);
  if (asksFood && !results.some((item) => item.tool === "lock_meat" || item.tool === "log_meat_eaten")) {
    addTool(results, get_food_plan());
  }

  const logNote = q.match(/^log\s*:\s*(.+)$/i);
  if (logNote?.[1] && results.length === 0) addTool(results, life_log(logNote[1].trim()));

  if (/\bcostco\b/i.test(q)) {
    const costco = parseToolResult(run_shopping_command(q));
    if (costco.ok) {
      results.push(costco);
      return results;
    }
  }

  const sourceCommand =
    q.match(/^(?:please\s+)?(?:can you\s+)?(?:get|download)(?:\s+me)?(?:\s+a)?(?:\s+legal|\s+free)?(?:\s+copy\s+of)?(?:\s+the)?(?:\s+book)?\s+(.+)$/i) ||
    q.match(/^(?:please\s+)?(?:find|search for)\s+(?:me\s+)?(?:a\s+)?(?:legal\s+|free\s+)?(?:copy\s+of\s+|book\s+)(.+)$/i);
  if (sourceCommand?.[1]) {
    const title = sourceCommand[1].replace(/\s+for\s+me[.!]?$/i, "").trim();
    addTool(results, find_book_source(title));
  }

  const bookCommand = q.match(/^(?:open|read|resume|continue)(?:\s+reading)?\s+(.+)$/i);
  if (bookCommand?.[1]) {
    const bookQuery = bookCommand[1]
      .replace(/^(?:my\s+)?(?:book\s+)?/i, "")
      .replace(/\s+(?:from\s+)?where\s+i\s+left\s+(?:off|it)$/i, "")
      .replace(/\s+(?:from|at)\s+(?:my\s+)?(?:saved\s+)?(?:place|bookmark)$/i, "")
      .trim();
    const bookResult = parseToolResult(open_book(bookQuery));
    if (bookResult.ok) results.push(bookResult);
  }

  const navigation = q.match(/^(?:please\s+)?(?:go|open|show|take me|navigate)(?:\s+me)?(?:\s+to)?\s+(.+)$/i);
  if (navigation?.[1] && !/\bbrief\b/i.test(low) && !results.some((item) => item.tool === "open_book")) {
    addTool(results, navigate_page(navigation[1]));
  }

  if (results.length === 0 && (
    /^(?:hey\s+)?(?:i(?:'m| am) going to|i gotta|task:?|remind me to|focus on)\s+.+/i.test(q)
    || /^(?:add|create|make)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?task\b/i.test(q)
  )) {
    addTool(results, run_task_command(q));
  }

  if (results.length === 0) {
    const shopping = parseToolResult(run_shopping_command(q));
    if (shopping.ok) results.push(shopping);
  }

  return results;
}

function asSnapshot(toolResults: MelToolResult[], pageId?: string, pageTitle?: string): Snapshot {
  const existing = toolResults.find((item) => item.tool === "get_live_snapshot")?.data as Snapshot | undefined;
  if (existing) return existing;
  return parseToolResult(get_live_snapshot(pageId, pageTitle)).data as Snapshot;
}

function nextAction(snapshot: Snapshot): string {
  if (snapshot.meals.logged.length === 0) return "Next: log breakfast when you eat it.";
  if (snapshot.water.remainingMl >= 1000) return "Next: drink 500 ml of water.";
  if (snapshot.food.proteinRemaining_g >= 30 && !snapshot.food.eaten) return `Next: build your next plate around ${snapshot.food.meat}.`;
  if (snapshot.sleep.hours == null) return "Next: log sleep.";
  return "Next: keep the next planned meal simple and log it when you finish.";
}

function statusReply(snapshot: Snapshot): string {
  const sleep = snapshot.sleep.hours == null ? "not logged" : `${snapshot.sleep.hours}h`;
  const fog = snapshot.brainFog == null ? "not logged" : snapshot.brainFog ? "yes" : "no";
  return [
    `Today, ${snapshot.day}`,
    `Protein: ${snapshot.meals.totals.protein_g}/${snapshot.goals.protein_g}g`,
    `Calories: ${snapshot.meals.totals.calories}/${snapshot.goals.calories}`,
    `Water: ${snapshot.water.ml}/${snapshot.water.goalMl} ml`,
    `Sleep: ${sleep}`,
    `Brain fog: ${fog}`,
    `Cycle: ${snapshot.cycle.phase}${snapshot.cycle.day ? `, day ${snapshot.cycle.day}` : ""}`,
    `Food: ${snapshot.food.meat}${snapshot.food.locked ? " locked" : " rotation"}${snapshot.food.eaten ? ", eaten" : ""}`,
    nextAction(snapshot),
  ].join("\n");
}

function foodReply(data: Snapshot["food"]): string {
  return [
    `Today: ${data.meat}.`,
    data.plate,
    `Remaining from logged food: ${data.proteinRemaining_g}g protein and ${data.caloriesRemaining} calories.`,
    data.note,
    data.eaten ? "It is already marked eaten." : `Next: say "ate ${data.meat}" when you finish.`,
  ].join("\n");
}

function composeFromTools(toolResults: MelToolResult[], pageId?: string, pageTitle?: string): string {
  const brief = toolResults.find((item) => item.tool === "write_body_brief");
  if (brief?.data && typeof brief.data === "object" && "fullText" in brief.data) {
    return String((brief.data as { fullText: string }).fullText);
  }

  const status = toolResults.find((item) => item.tool === "get_live_snapshot");
  if (status?.data) return statusReply(status.data as Snapshot);

  const food = toolResults.find((item) => item.tool === "get_food_plan");
  if (food?.data) return foodReply(food.data as Snapshot["food"]);

  const logs = toolResults.find((item) => item.tool === "search_logs");
  if (logs) {
    const rows = Array.isArray(logs.data) ? logs.data as Array<{ day: string; text: string }> : [];
    return rows.length ? rows.map((row) => `${row.day}: ${row.text}`).join("\n") : logs.summary;
  }

  const pins = toolResults.find((item) => item.tool === "list_pins");
  if (pins) {
    const rows = Array.isArray(pins.data) ? pins.data as string[] : [];
    return rows.length ? rows.map((row, index) => `${index + 1}. ${row}`).join("\n") : pins.summary;
  }

  const pages = toolResults.find((item) => item.tool === "list_workspace_pages");
  if (pages) {
    const rows = Array.isArray(pages.data)
      ? pages.data as Array<{ title: string; parent: string | null }>
      : [];
    return rows.length
      ? rows.map((row) => row.parent ? `${row.parent} / ${row.title}` : row.title).join("\n")
      : pages.summary;
  }

  if (toolResults.some((item) => item.tool === "help")) {
    return [
      "Tell me the outcome in one line. Examples:",
      '"drank 1L and ate breakfast"',
      '"what meat" or "beef"',
      '"brief" or "status"',
      '"goal protein 130"',
      '"pin I stream Tuesday nights"',
      '"open wardrobe"',
      '"what should I wear for streaming"',
      '"I wore the olive dress"',
      '"put the olive dress in laundry"',
      '"pack me for 3 days"',
      '"create a page called Neurotech Ideas under Work"',
      '"rename this page to Research"',
      '"add prototype notes to this page"',
      '"move Research under Work"',
      '"undo that"',
    ].join("\n");
  }

  if (toolResults.length) return toolResults.map((item) => item.summary).join("\n");
  return statusReply(asSnapshot(toolResults, pageId, pageTitle));
}

function localChat(text: string, pageId?: string, pageTitle?: string): string {
  const low = text.trim().toLowerCase();
  if (/^(hi|hey|yo+|hello|sup|what'?s up|whatsup|wassup)[.!?]*$/i.test(low)) return "Hey. What do you need done?";
  if (/^(thanks|thank you|ty|perfect|cool|okay|ok)[.!]*$/i.test(low)) return "Got you.";
  if (/\b(protein|water|macros?|phase|cycle|sleep|today|logged)\b/i.test(low)) {
    return statusReply(asSnapshot([], pageId, pageTitle));
  }
  return "I did not recognize a safe app action in that request yet. Tell me the exact outcome, for example: create a page called Research, move Research under Work, or log 1L of water.";
}

function localComposer(text: string, toolResults: MelToolResult[], pageId?: string, pageTitle?: string): string {
  return toolResults.length ? composeFromTools(toolResults, pageId, pageTitle) : localChat(text, pageId, pageTitle);
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 12_000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

const LOCAL_MODEL = "llama3:latest";

type LocalWorkspacePlan = {
  intent?: string;
  action?: string;
  title?: string;
  target?: string;
  parent?: string;
  destination?: string;
  position?: "inside" | "before" | "after";
  content?: string;
  mode?: "append" | "replace";
  open?: boolean;
  favorite?: boolean;
  asAgent?: boolean;
};

async function callLocalModel(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  jsonOnly = false
): Promise<string> {
  const response = await fetchJson(
    "/api/ollama/api/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LOCAL_MODEL,
        messages,
        stream: false,
        keep_alive: "20m",
        ...(jsonOnly ? { format: "json" } : {}),
        options: { temperature: jsonOnly ? 0 : 0.35 },
      }),
    },
    75_000
  );
  const payload = await response.json() as {
    message?: { content?: string };
    error?: string;
  };
  const content = payload.message?.content?.trim();
  if (!response.ok || !content) throw new Error(payload.error || "Local model unavailable");
  return content;
}

function parseLocalPlan(text: string): LocalWorkspacePlan | null {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const value = JSON.parse(clean) as LocalWorkspacePlan;
    if (!value || typeof value !== "object") return null;
    if (!value.intent && value.action) value.intent = value.action;
    return value;
  } catch {
    return null;
  }
}

function mayNeedWorkspacePlanner(text: string): boolean {
  return /\b(page|workspace|sidebar|folder|section|document)\b/i.test(text)
    && /\b(create|make|add|rename|delete|trash|remove|restore|duplicate|copy|move|reorder|write|append|replace|clear|open|show|close|collapse|expand|favorite|unfavorite)\b/i.test(text);
}

async function planWorkspaceWithLocalModel(request: MelAgentRequest): Promise<LocalWorkspacePlan | null> {
  const pagesResult = parseToolResult(list_workspace_pages());
  const pages = Array.isArray(pagesResult.data)
    ? (pagesResult.data as Array<{ title: string; parent: string | null }>).slice(0, 80)
    : [];
  const content = await callLocalModel([
    {
      role: "system",
      content: [
        "You route one request into one safe Wonder workspace action.",
        "Return only JSON. Never answer conversationally.",
        "Allowed intent values: create_page, open_page, list_pages, rename_page, trash_page, restore_page, duplicate_page, move_page, write_page, clear_page, favorite_page, collapse_sidebar, set_sidebar_section, undo_workspace, none.",
        "Use target='this page' when the user means the open page.",
        "For create_page use title, optional parent, and optional asAgent.",
        "For move_page use target, destination, and position: inside, before, or after.",
        "For write_page use target, content, and mode: append or replace.",
        "For set_sidebar_section use target and open: true or false.",
        "Do not invent a title, target, destination, or content the user did not request.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Open page: ${request.pageTitle || "Untitled"} (${request.pageId || "unknown"})`,
        `Known pages: ${JSON.stringify(pages)}`,
        `Request: ${request.text}`,
      ].join("\n"),
    },
  ], true);
  return parseLocalPlan(content);
}

function executeLocalWorkspacePlan(
  plan: LocalWorkspacePlan | null,
  pageId?: string
): MelToolResult[] {
  if (!plan?.intent || plan.intent === "none") return [];
  const results: MelToolResult[] = [];
  const add = (raw: string) => addTool(results, raw);
  switch (plan.intent) {
    case "create_page":
      add(create_workspace_page(plan.title, plan.parent, pageId, Boolean(plan.asAgent)));
      break;
    case "open_page":
      if (plan.target) add(navigate_page(plan.target));
      break;
    case "list_pages":
      add(list_workspace_pages());
      break;
    case "rename_page":
      if (plan.title) add(rename_workspace_page(plan.target, plan.title, pageId));
      break;
    case "trash_page":
      add(trash_workspace_page(plan.target, pageId));
      break;
    case "restore_page":
      if (plan.target) add(restore_workspace_page(plan.target));
      break;
    case "duplicate_page":
      add(duplicate_workspace_page(plan.target, pageId));
      break;
    case "move_page":
      if (plan.destination) {
        add(move_workspace_page(plan.target, plan.destination, plan.position || "inside", pageId));
      }
      break;
    case "write_page":
      if (plan.content) {
        add(write_workspace_page(plan.target, plan.content, plan.mode || "append", pageId));
      }
      break;
    case "clear_page":
      add(clear_workspace_page(plan.target, pageId));
      break;
    case "favorite_page":
      add(favorite_workspace_page(plan.target, plan.favorite !== false, pageId));
      break;
    case "collapse_sidebar":
      add(collapse_sidebar_sections());
      break;
    case "set_sidebar_section":
      if (plan.target) add(set_sidebar_section(plan.target, plan.open !== false));
      break;
    case "undo_workspace":
      add(undo_workspace_action());
      break;
  }
  return results;
}

async function localModelReply(request: MelAgentRequest): Promise<string> {
  const snapshot = asSnapshot([], request.pageId, request.pageTitle);
  const history = (request.history || []).slice(-12).map((message) => ({
    role: message.role,
    content: message.content,
  }));
  return callLocalModel([
    {
      role: "system",
      content: [
        "You are Mel, Melani's private operating assistant inside Wonder.",
        "Be sharp, capable, warm, and concise. Answer the actual question.",
        "Use only the supplied snapshot for personal numbers. Never invent an app action or claim you changed something.",
        "Give soft health education, never a diagnosis. For urgent symptoms recommend appropriate professional care.",
        "Do not explain your architecture. Do not dump a command menu unless asked. Never use em or en dashes.",
        `Current page: ${request.pageTitle || "unknown"} (${request.pageId || "unknown"}).`,
        snapshot.liveContext.slice(0, 9000),
      ].join("\n\n"),
    },
    ...history,
    { role: "user", content: request.text },
  ]);
}

async function cloudReply(request: MelAgentRequest, toolResults: MelToolResult[]): Promise<{ reply: string; research: boolean }> {
  const snapshot = asSnapshot(toolResults, request.pageId, request.pageTitle);
  const isResearch = /^(research|look up|find out|compare|investigate)\b/i.test(request.text.trim());
  if (isResearch) {
    const response = await fetchJson("/api/melani-ai/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: request.text, live_context: snapshot.liveContext }),
    }, 90_000);
    const payload = await response.json() as { answer?: string; detail?: string };
    if (!response.ok || !payload.answer) throw new Error(payload.detail || "Research unavailable");
    return { reply: payload.answer, research: true };
  }

  const history = [...(request.history || []), { role: "user" as const, content: request.text }].slice(-20);
  const response = await fetchJson("/api/melani-ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: history,
      page_id: request.pageId,
      page_title: request.pageTitle,
      live_context: snapshot.liveContext,
      system_context: toolResults.length
        ? `These tools already ran. Treat them as final facts and do not claim any other action:\n${JSON.stringify(toolResults).slice(0, 7000)}`
        : "No app tool ran. Answer only from the live snapshot and conversation.",
    }),
  });
  const payload = await response.json() as { reply?: string; detail?: string };
  if (!response.ok || !payload.reply) throw new Error(payload.detail || "Grok unavailable");
  return { reply: payload.reply, research: false };
}

export function runLocalMelAgent(text: string, pageId?: string, pageTitle?: string): MelAgentResponse {
  const toolResults = planAndExecute(text, pageId, pageTitle);
  const reply = cleanReply(localComposer(text, toolResults, pageId, pageTitle));
  pushSessionMemory(text, reply);
  return { reply, mode: toolResults.length ? "action" : "offline-local", toolResults };
}

export async function runMelAgent(request: MelAgentRequest): Promise<MelAgentResponse> {
  let toolResults: MelToolResult[] = [];
  const wardrobeUndoFirst = /^(?:undo|undo that)[.!]?$/i.test(request.text.trim())
    && (request.pageId === "pg-fashion-os" || lastActionDomain() === "wardrobe");
  if (wardrobeUndoFirst || /^undo (?:the last )?wardrobe(?: action)?[.!]?$/i.test(request.text.trim())) {
    const wardrobeResult = await runWardrobeCommand(request.text, wardrobeUndoFirst ? "pg-fashion-os" : request.pageId);
    if (wardrobeResult) toolResults = [wardrobeResult];
  }
  if (toolResults.length === 0) toolResults = planAndExecute(request.text, request.pageId, request.pageTitle);
  if (toolResults.length === 0) {
    const weatherResult = await runWeatherCommand(request.text, request.pageId);
    if (weatherResult) toolResults = [weatherResult];
  }
  if (toolResults.length === 0) {
    const wardrobeResult = await runWardrobeCommand(request.text, request.pageId);
    if (wardrobeResult) toolResults = [wardrobeResult];
  }
  const deterministicAction = toolResults.some((item) => item.tool.startsWith("wardrobe_") || item.tool.startsWith("weather_"));
  if (
    toolResults.length === 0
    && request.localModelAvailable
    && mayNeedWorkspacePlanner(request.text)
  ) {
    try {
      toolResults = executeLocalWorkspacePlan(
        await planWorkspaceWithLocalModel(request),
        request.pageId
      );
    } catch {
      /* deterministic tools and the normal local reply remain available */
    }
  }
  let reply = localComposer(request.text, toolResults, request.pageId, request.pageTitle);
  let mode: MelAgentMode = toolResults.length ? "action" : "offline-local";

  const researchRequested = /^(research|look up|find out|compare|investigate)\b/i.test(request.text.trim());
  if (researchRequested && !request.cloudAvailable) {
    reply = "Live research needs the optional Grok bridge. App actions and your saved data still work locally.";
  } else if (request.cloudAvailable && !request.forceLocal && !deterministicAction) {
    try {
      const cloud = await cloudReply(request, toolResults);
      reply = cloud.reply;
      mode = cloud.research ? "research" : "grok-connected";
    } catch {
      mode = toolResults.length ? "action" : "offline-local";
    }
  } else if (toolResults.length === 0 && request.localModelAvailable && !deterministicAction) {
    try {
      reply = await localModelReply(request);
      mode = "local-model";
    } catch {
      mode = "offline-local";
    }
  }

  reply = cleanReply(reply);
  rememberActionDomain(toolResults);
  pushSessionMemory(request.text, reply);
  return { reply, mode, toolResults };
}

export async function checkMelCloud(): Promise<boolean> {
  try {
    const response = await fetchJson("/api/melani-ai/health", { method: "GET" }, 2500);
    if (!response.ok) return false;
    const payload = await response.json() as { has_key?: boolean };
    return Boolean(payload.has_key);
  } catch {
    return false;
  }
}

export async function checkMelLocalModel(): Promise<boolean> {
  try {
    const response = await fetchJson("/api/ollama/api/tags", { method: "GET" }, 2500);
    if (!response.ok) return false;
    const payload = await response.json() as { models?: Array<{ name?: string }> };
    return Boolean(payload.models?.some((model) => model.name === LOCAL_MODEL));
  } catch {
    return false;
  }
}
