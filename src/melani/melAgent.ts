import { applyLearnCommand, polishReply } from "./melLearn";
import { pushSessionMemory } from "./melContext";
import { runWardrobeCommand } from "./wardrobe/wardrobeAgent";
import { runWeatherCommand } from "./weather/weatherAgentTool";
import { makePlan, withBudget, runtimeStamp } from "./core/agentRuntime";
import { wonderEmit } from "./core/eventBus";
import { preferOfflinePath } from "./core/offlineStore";
import { ensureDefaultWeatherLocation } from "./weather/weatherCore";
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
  make_section_root,
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
  fetch_stock_quarterly,
  trading_knowledge_brief,
} from "./melTools";
import { MEL_TRADING_KNOWLEDGE, offlineTradingBrief } from "./melTrading";

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

/**
 * Strip chat fluff so "hey move the bookshelf under learn" still hits the move tool.
 * (Without this, Mel falls through to a slow model call and sits on "…".)
 */
function stripCommandFiller(text: string): string {
  let q = text.trim().replace(/[.!?]+$/g, "").trim();
  // Leading greetings / names
  q = q.replace(/^(?:hey|hi|hello|yo|sup|ok|okay|alright|please|pls|mel|wonder)\b[\s,!.:-]*/i, "");
  // "can you / could you / would you please …"
  q = q.replace(/^(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?/i, "");
  // "i want you to / just / go ahead and"
  q = q.replace(/^(?:i\s+(?:want|need|need\s+you\s+to|want\s+you\s+to)\s+|go\s+ahead\s+and\s+|just\s+)/i, "");
  return q.trim();
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
  // "the bookshelf page" → "bookshelf" (drop leading the/page and trailing "page")
  const clean = cleanCommandValue(
    value
      ?.replace(/^(?:the\s+)?page\s+/i, "")
      .replace(/^(?:the\s+)/i, "")
      .replace(/\s+page$/i, "")
      .replace(/\s+(?:section|folder|toggle)$/i, "")
  );
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
  // Strip "hey / can you / please" first so action lines still match
  const q = stripCommandFiller(text);
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

  /**
   * Move / nest / un-nest pages from chat. Smart about sections:
   * - "move Bookshelf under Learn" → put Bookshelf at TOP of Learn (parent cleared)
   * - "move Work under Learn" → nest Work inside Bookshelf (and open Learn)
   * - "put World Monitor under Work" → nest under Work page
   */
  const movePage =
    q.match(
      /^(?:move|put|place|nest|shuffle)\s+(?:the\s+)?(.+?)\s+(under|inside|into|above|before|below|after|to|into)\s+(?:the\s+)?(?:page\s+|section\s+|folder\s+)?(.+)$/i
    ) ||
    text.match(
      /(?:move|put|place|nest|shuffle)\s+(?:the\s+)?(.+?)\s+(under|inside|into|above|before|below|after)\s+(?:the\s+)?(?:page\s+|section\s+|folder\s+)?(.+?)(?:[.!?]|$)/i
    );
  if (movePage?.[1] && movePage[2] && movePage[3]) {
    const relation = movePage[2].toLowerCase();
    const position = /under|inside|into|to/.test(relation)
      ? "inside"
      : /above|before/.test(relation)
        ? "before"
        : "after";
    const targetName = currentOrNamedPage(movePage[1]);
    const destRaw = cleanCommandValue(
      movePage[3]
        .replace(/^(?:the\s+)?(?:page\s+|section\s+|folder\s+)?/i, "")
        .replace(/\s+(?:section|folder|toggle|page)$/i, "")
    ) || "";

    // Section labels: Health / Learn only (Work section is gone)
    const destSection: "health" | "learn" | null = /^(learn|learning)$/i.test(destRaw)
      ? "learn"
      : /^(health)$/i.test(destRaw)
        ? "health"
        : null;

    const isLearnRoot =
      !!targetName &&
      /^(bookshelf|library|books|learn|learning|world monitor|stocks?|markets?)$/i.test(targetName);
    const isHealthRoot =
      !!targetName && /^(fitness|hygiene|my data|data|health)$/i.test(targetName);

    if (destSection === "learn") {
      addTool(results, set_sidebar_section("learn", true));
      if (isLearnRoot) {
        // Put Bookshelf / World Monitor at the TOP of Learn
        const rootName = /world monitor|stocks?|markets?/i.test(targetName || "")
          ? "world monitor"
          : "bookshelf";
        addTool(results, make_section_root(rootName, "learn", pageId));
        return results;
      }
      // Nest other pages under Bookshelf inside Learn
      addTool(results, make_section_root("bookshelf", "learn", pageId));
      addTool(results, move_workspace_page(targetName, "bookshelf", "inside", pageId));
      return results;
    }

    if (destSection === "health") {
      addTool(results, set_sidebar_section("health", true));
      if (isHealthRoot) {
        addTool(results, make_section_root(targetName || "fitness", "health", pageId));
        return results;
      }
      addTool(results, make_section_root("fitness", "health", pageId));
      addTool(results, move_workspace_page(targetName, "fitness", "inside", pageId));
      return results;
    }

    // "under work" → World Monitor under Learn (Work section deleted)
    if (/^(work)$/i.test(destRaw)) {
      addTool(results, set_sidebar_section("learn", true));
      addTool(results, make_section_root("world monitor", "learn", pageId));
      if (targetName && !/^(work|world monitor)$/i.test(targetName)) {
        addTool(results, move_workspace_page(targetName, "world monitor", "inside", pageId));
      } else {
        addTool(results, navigate_page("world monitor"));
      }
      return results;
    }

    // Plain page-to-page move
    addTool(
      results,
      move_workspace_page(targetName, destRaw, position, pageId)
    );
    return results;
  }

  // One-shot fix: put Bookshelf + stocks back under Learn
  if (
    /^(?:fix|repair|reset)\s+(?:the\s+)?(?:sidebar|learn|bookshelf|layout)(?:\s+please)?$/i.test(q) ||
    /^(?:put|move)\s+(?:the\s+)?bookshelf\s+back(?:\s+(?:under|to)\s+learn)?$/i.test(q) ||
    /^fix learn$/i.test(q)
  ) {
    addTool(results, make_section_root("bookshelf", "learn", pageId));
    addTool(results, make_section_root("world monitor", "learn", pageId));
    addTool(results, set_sidebar_section("learn", true));
    addTool(results, navigate_page("bookshelf"));
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

  // Markets / options education offline (always available)
  if (
    /^(?:trading|markets?|options?)\s*(?:101|basics|desk|help)?$/i.test(q) ||
    /\b(?:teach me|explain)\b.*\b(?:options?|trading|iv crush|greeks|position siz)/i.test(low)
  ) {
    addTool(results, trading_knowledge_brief(q));
  }

  // "NVDA quarterly" / "quarterly reports" / "earnings for AAPL"
  const quarterlyAsk =
    q.match(
      /^(?:quarterly|earnings|fundamentals?)\s+(?:for\s+|on\s+|of\s+)?([A-Za-z.]{1,6}(?:\s*,\s*[A-Za-z.]{1,6})*)$/i
    ) ||
    q.match(
      /^([A-Za-z]{1,5})\s+(?:quarterly|earnings|fundamentals?|report|reports)$/i
    ) ||
    (/\b(quarterly reports?|earnings packs?|show (?:me )?quarters)\b/i.test(low)
      ? (["", "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AMD"] as RegExpMatchArray)
      : null);
  if (quarterlyAsk) {
    // Async tool is resolved in runMelAgent (see stock path below)
    results.push(
      envelope(
        "stock_quarterly_pending",
        String(quarterlyAsk[1] || "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AMD")
          .replace(/\s+/g, "")
          .toUpperCase()
      )
    );
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
  // Blank lines = separate chunks in Mel UI (easier to scan)
  return [
    `Today`,
    snapshot.day,
    ``,
    `— Fuel —`,
    `Protein ${snapshot.meals.totals.protein_g} / ${snapshot.goals.protein_g}g`,
    `Calories ${snapshot.meals.totals.calories} / ${snapshot.goals.calories}`,
    `Water ${snapshot.water.ml} / ${snapshot.water.goalMl} ml`,
    ``,
    `— Rest —`,
    `Sleep ${sleep}`,
    `Brain fog ${fog}`,
    ``,
    `— Body —`,
    `Cycle ${snapshot.cycle.phase}${snapshot.cycle.day ? `, day ${snapshot.cycle.day}` : ""}`,
    `Dinner meat ${snapshot.food.meat}${snapshot.food.locked ? " (locked)" : ""}${snapshot.food.eaten ? " · eaten" : ""}`,
    ``,
    `— Next —`,
    nextAction(snapshot).replace(/^Next:\s*/i, ""),
  ].join("\n");
}

function foodReply(data: Snapshot["food"]): string {
  return [
    `Dinner protein`,
    ``,
    `— Today —`,
    data.meat === "beef" ? "Beef" : "Salmon",
    data.plate,
    ``,
    `— Left after logs —`,
    `${data.proteinRemaining_g}g protein`,
    `${data.caloriesRemaining} calories`,
    ``,
    data.note,
    ``,
    data.eaten
      ? "Already marked eaten."
      : `When done: say "ate ${data.meat}"`,
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
      '"NVDA quarterly" or "quarterly reports"',
      '"options 101" or "trading desk"',
      '"create a page called Neurotech Ideas under Learn"',
      '"move Bookshelf under Learn"',
      '"undo that"',
    ].join("\n");
  }

  // Prefer full quarterly / trading text first
  const stockQ = toolResults.find((item) => item.tool === "stock_quarterly");
  if (stockQ?.summary) {
    return [
      stockQ.summary,
      "",
      "Framework: thesis, catalyst, invalidation, size. Not advice.",
    ].join("\n");
  }
  const trading = toolResults.find((item) => item.tool === "trading_knowledge");
  if (trading?.summary) return trading.summary;

  if (toolResults.length) return toolResults.map((item) => item.summary).join("\n");
  return statusReply(asSnapshot(toolResults, pageId, pageTitle));
}

/**
 * Instant path = tiny social lines only (hi / thanks / mood).
 * Never trap real questions, brainstorms, or "what's your name" in the dumb default.
 */
function isInstantChat(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 120) return false;

  // Anything that needs a real brain stays off this path
  if (
    /\b(idea|ideas|brainstorm|think of|help me|how (do|can|should)|why |what should|who are|what(?:'s| is|s) (?:your|ur) name|your name|who r u|who are you|explain|plan|build|startup|neuro|clinic|content|stream|invest|stock|trade|quarterly|options?|code|debug|fix|write|draft)\b/i.test(
      t
    )
  ) {
    return false;
  }
  if (
    /\b(log|logged|drink|drank|water|breakfast|brief|protein|gym|sleep|beef|salmon|meat|goal|pin|unpin|create|rename|delete|trash|move|open|wear|outfit|wardrobe|weather|research|look up|find out|status|macros?|quarterly)\b/i.test(
      t
    )
  ) {
    return false;
  }

  // Pure greetings
  if (/^(hi|hey|yo+|hello|sup|what'?s up|whatsup|wassup|howdy)([.!?\s].*)?$/i.test(t)) {
    return true;
  }
  // Pure ack
  if (/^(thanks|thank you|ty|thx|perfect|cool|okay|ok|k|nice|lol|lmao|haha+|bet|facts|true)[.!]*$/i.test(t)) {
    return true;
  }
  // Short mood lines only
  if (
    t.split(/\s+/).length <= 10 &&
    /\b(feel|feeling|felt|mood|goofy|goffy|silly|tired|exhausted|happy|sad|anxious|stressed|bored|meh|weird|off)\b/i.test(t) &&
    !/\?$/.test(t)
  ) {
    return true;
  }
  return false;
}

function instantChatReply(text: string): string {
  const low = text.trim().toLowerCase().replace(/[’']/g, "'");

  if (/^(hi|hey|yo+|hello|sup|what'?s up|whatsup|wassup|howdy)([.!?\s].*)?$/i.test(low)) {
    if (/\b(feel|feeling|goofy|goffy|silly|tired|weird|off|good|bad)\b/i.test(low)) {
      return "Goofy day accepted. Lean into it. Food, outfit, markets desk, or one tiny task?";
    }
    return "Hey. Mel here. Food, markets, books, pages, or ideas, say it plain.";
  }
  if (/^(thanks|thank you|ty|thx|perfect|cool|okay|ok|k|nice|bet|facts)[.!]*$/i.test(low)) {
    return "Got you.";
  }
  if (/\b(goofy|goffy|silly)\b/i.test(low)) {
    return "Goofy mode on. Still sharp if you need dinner, a page move, or a stock read.";
  }
  if (/\b(tired|exhausted|drained|sleepy)\b/i.test(low)) {
    return "Protect sleep. One easy win if you want: water, breakfast usual, or early bed.";
  }
  if (/\b(anxious|stressed|overwhelmed|panic)\b/i.test(low)) {
    return "Slow breath. One small thing only. Water, food, or a 10-minute task.";
  }
  if (/\b(happy|good|great|amazing|pumped)\b/i.test(low)) {
    return "Good. Point that energy at one ship, one stream moment, or one clinic/neurotech move.";
  }
  if (/\b(sad|down|meh|bad|off|weird)\b/i.test(low)) {
    return "With you. Want chatter, food, or one tiny reset?";
  }
  if (/\b(feel|feeling|mood)\b/i.test(low)) {
    return "Got it. I'm Mel. Food, outfit, brief, markets, or keep talking.";
  }
  if (/^(lol|lmao|haha+)/i.test(low)) return "Haha. What's next?";
  return "Mel here. What are we doing?";
}

/** Offline brainstorm packs for Melani's actual lanes */
function brainstormIdeas(text: string): string {
  const low = text.toLowerCase();
  if (/\b(neuro|brain|eeg|device|wearable)\b/i.test(low)) {
    return [
      "Neurotech angles (pick one to pressure-test this week):",
      "1. Early fatigue signal from HRV + sleep + simple cognitive tap test, doctor-readable weekly score.",
      "2. Clinic intake that maps symptoms to a 1-page twin brief before the visit (you already have Twin bones).",
      "3. Stream-safe demo: 60s live chart of a wearable proxy + plain-English explanation, no medical claims.",
      "4. Patent-style wedge: continuous peripheral signal for early neuropathy screening (research path, not diagnosis).",
      "5. Content loop: one case pattern → one protocol card → one Imprint quiz for med students.",
      "",
      "Next: say which number, or \"draft page Neurotech Ideas under Learn\".",
    ].join("\n");
  }
  if (/\b(clinic|doctor|sf|nyc|la|practice)\b/i.test(low)) {
    return [
      "Clinic build ideas:",
      "1. Concierge neuro-adjacent intake: 15 min async twin pack before every new patient.",
      "2. SF flagship = R&D + content studio; NYC = high-volume second opinion; LA = performance/sports nervous system.",
      "3. Productized follow-up: nightly body brief style check-ins patients actually open.",
      "4. Referral moat: one killer PDF doctors forward (early-warning dashboard sample).",
      "",
      "Next: pick a city or say create a page called Clinic OS under Learn.",
    ].join("\n");
  }
  if (/\b(content|stream|youtube|tiktok|post|influencer)\b/i.test(low)) {
    return [
      "Content / stream ideas:",
      "1. Build-in-public: 10 min Melani ships one Wonder feature live (World Monitor, Imprint, Mel).",
      "2. \"Doctor who codes\" series: one neuro paper → one product rule → one patient-safe takeaway.",
      "3. Markets desk stream: walk AAPL quarterly bars + how-to playbook, no fake tips.",
      "4. Bookshelf haul: Want tab legal finds + Imprint quiz on camera.",
      "5. Day-in-the-life OS: food OS beef/salmon + gym + brief, all inside Wonder.",
      "",
      "Next: pick a format and I'll outline the first episode.",
    ].join("\n");
  }
  if (/\b(stock|market|trade|option|invest)\b/i.test(low)) {
    return [
      "Markets desk ideas (process, not advice):",
      "1. One-ticker deep dive: thesis, catalyst, invalidation, size, using World Monitor charts + SEC quarters.",
      "2. Earnings checklist card Mel can spit on demand (rev YoY, margins, guide, multiple).",
      "3. Options sandbox: defined-risk structures only, IV crush note after prints.",
      "4. Watchlist ritual: 8 names, 5 minutes, log one observation to a page.",
      "",
      "Open World Monitor or say \"NVDA quarterly\".",
    ].join("\n");
  }
  if (/\b(app|product|feature|wonder|startup|saas)\b/i.test(low)) {
    return [
      "Wonder product ideas:",
      "1. Mel \"morning stack\": water + meat + top 3 tasks + one market flag in one message.",
      "2. Imprint → Mel quiz loop after every finished chapter.",
      "3. Digital twin doctor pack export as one PDF button.",
      "4. Fashion OS + weather: stream outfit locked from wardrobe + NYC default weather.",
      "5. Decision-fatigue kill: tonight's food + tomorrow's gym pre-chosen at 8pm.",
      "",
      "Next: pick a number and I'll spec the UI in plain English.",
    ].join("\n");
  }
  // Default: Melani-shaped idea spray
  return [
    "Ideas for you right now (Melani lanes):",
    "1. Neurotech: early-warning score from sleep + HRV + simple reaction test, doctor-readable.",
    "2. Clinics: SF/NYC/LA playbook page with intake twin pack as the product wedge.",
    "3. Wonder: Mel morning stack (food + tasks + one market note) in one tap.",
    "4. Content: build-in-public World Monitor earnings read, 8 minutes, serif UI on camera.",
    "5. Books: Want → legal find → Imprint quiz pipeline as a weekly series.",
    "6. Markets: one-name process card (thesis / catalyst / kill switch) stored under Learn.",
    "",
    "Say a number for a deeper plan, or name a domain: neuro, clinic, content, markets, product.",
  ].join("\n");
}

function localChat(text: string, pageId?: string, pageTitle?: string): string {
  const raw = text.trim();
  const low = raw.toLowerCase().replace(/[’']/g, "'");

  if (isInstantChat(raw)) return instantChatReply(raw);

  // Identity
  if (
    /\b(what(?:'s| is|s) (?:your|ur) name|who are you|who r u|your name|ur name|what are you)\b/i.test(low)
  ) {
    return "I'm Mel, your operator inside Wonder. Not a chatbot menu. I run food, markets, books, pages, and ideas with you. What do you want done?";
  }
  if (/\b(who am i|what(?:'s| is) my name)\b/i.test(low)) {
    return "You're Melani: doctor-in-training, inventor, builder. Clinics in your sights, neurotech as the long game, Wonder as the OS. What are we shipping?";
  }

  // Brainstorm / ideas
  if (
    /\b(idea|ideas|brainstorm|think of|help me think|inspire|what should i (build|make|do|post|ship))\b/i.test(low)
  ) {
    return brainstormIdeas(raw);
  }

  // Markets education offline
  if (/\b(options? 101|trading desk|how (do|to) (trade|read) (charts?|earnings|quarterly))\b/i.test(low)) {
    return offlineTradingBrief(raw);
  }

  // Status
  if (
    /^(status|how am i doing|macros?|protein|water|sleep|phase|cycle)\b/i.test(low)
    || /\b(show|give me|what(?:'s| is) my)\s+(status|macros?|protein|water|sleep)\b/i.test(low)
  ) {
    return statusReply(asSnapshot([], pageId, pageTitle));
  }

  // Page-aware nudge
  if (pageTitle) {
    if (/world monitor|market/i.test(pageTitle)) {
      return `You're on ${pageTitle}. I can pull quarterly packs (\"NVDA quarterly\"), explain a chart, or brainstorm a trade process. What do you want?`;
    }
    if (/bookshelf|library|book/i.test(pageTitle)) {
      return `You're on ${pageTitle}. Want list find, open a book, or Imprint a chapter. What title or task?`;
    }
  }

  // Questions get a real answer, not the command dump
  if (/\?$/.test(raw) || /^(what|why|how|when|where|who|which|can|could|should|do you|are you)\b/i.test(low)) {
    return [
      "Straight answer: I'm Mel, online inside Wonder, built to run your life OS not recite menus.",
      "I can: log food/water/sleep, write your body brief, move pages, pull stock quarterlies, file books you Want, brainstorm neurotech/clinic/content, undo workspace moves.",
      "",
      "Ask me like a human. Examples: \"ideas for neurotech\", \"NVDA quarterly\", \"brief\", \"move Bookshelf under Learn\".",
    ].join("\n");
  }

  // Last resort: still useful, not lobotomized
  return [
    "I'm Mel. I didn't map that to a tool yet, so here's how to drive me:",
    "• Life: brief, status, drank 1L, what meat, ate beef",
    "• Build: create a page called X under Learn, move Y under Bookshelf",
    "• Markets: NVDA quarterly, options 101, trading desk",
    "• Ideas: help me think of ideas (or neuro / clinic / content / product)",
    "",
    "Or rephrase in one clear line and I'll execute.",
  ].join("\n");
}

function localComposer(text: string, toolResults: MelToolResult[], pageId?: string, pageTitle?: string): string {
  return toolResults.length ? composeFromTools(toolResults, pageId, pageTitle) : localChat(text, pageId, pageTitle);
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 4_000): Promise<Response> {
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
    // Chat must stay snappy. Workspace planner uses a separate longer call below.
    8_000
  );
  const payload = await response.json() as {
    message?: { content?: string };
    error?: string;
  };
  const content = payload.message?.content?.trim();
  if (!response.ok || !content) throw new Error(payload.error || "Local model unavailable");
  return content;
}

async function callLocalModelSlow(
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
    20_000
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
  const content = await callLocalModelSlow([
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

  const history = [...(request.history || []), { role: "user" as const, content: request.text }].slice(-12);
  // Hard cap: never make casual chat wait on a hung bridge
  const response = await fetchJson("/api/melani-ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: history,
      page_id: request.pageId,
      page_title: request.pageTitle,
      // Smaller context = faster round trip
      live_context: snapshot.liveContext.slice(0, 4500),
      system_context: toolResults.length
        ? `These tools already ran. Treat them as final facts and do not claim any other action:\n${JSON.stringify(toolResults).slice(0, 3500)}`
        : "No app tool ran. Answer only from the live snapshot and conversation. Be short. No command menus.",
    }),
  }, 3_500);
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
  const started = Date.now();
  const trimmed = request.text.trim();
  // Mel owns weather — seed NYC once so retrieval never needs a page
  try {
    ensureDefaultWeatherLocation();
  } catch {
    /* ignore */
  }

  // 1) Instant path: greetings / mood / vibes — never wait on Grok or Ollama
  if (isInstantChat(trimmed)) {
    const reply = cleanReply(instantChatReply(trimmed));
    pushSessionMemory(trimmed, reply);
    wonderEmit("mel.plan", "melAgent", {
      intent: "instant-chat",
      ...runtimeStamp(started),
    });
    return { reply, mode: "offline-local", toolResults: [] };
  }

  let toolResults: MelToolResult[] = [];
  const plan = makePlan("mel-turn", [], preferOfflinePath() ? 0 : 3500);

  const wardrobeUndoFirst = /^(?:undo|undo that)[.!]?$/i.test(trimmed)
    && (request.pageId === "pg-fashion-os" || lastActionDomain() === "wardrobe");
  if (wardrobeUndoFirst || /^undo (?:the last )?wardrobe(?: action)?[.!]?$/i.test(trimmed)) {
    const wardrobeResult = await runWardrobeCommand(request.text, wardrobeUndoFirst ? "pg-fashion-os" : request.pageId);
    if (wardrobeResult) toolResults = [wardrobeResult];
  }
  if (toolResults.length === 0) toolResults = planAndExecute(request.text, request.pageId, request.pageTitle);

  // Resolve pending quarterly stock packs (async free Yahoo data)
  const pendingQ = toolResults.find((item) => item.tool === "stock_quarterly_pending");
  if (pendingQ) {
    const symbols = pendingQ.summary || "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AMD";
    const packed = parseToolResult(await fetch_stock_quarterly(symbols));
    toolResults = toolResults
      .filter((item) => item.tool !== "stock_quarterly_pending")
      .concat(packed);
  }

  if (toolResults.length === 0) {
    const weatherResult = await runWeatherCommand(request.text, request.pageId);
    if (weatherResult) toolResults = [weatherResult];
  }
  if (toolResults.length === 0) {
    const wardrobeResult = await runWardrobeCommand(request.text, request.pageId);
    if (wardrobeResult) toolResults = [wardrobeResult];
  }
  const deterministicAction = toolResults.some(
    (item) =>
      item.tool.startsWith("wardrobe_") ||
      item.tool.startsWith("weather_") ||
      item.tool === "stock_quarterly" ||
      item.tool === "trading_knowledge"
  );
  // Tools already answered (log water, meat, brief, weather, stocks, etc.) — return now
  if (toolResults.length > 0) {
    const reply = cleanReply(localComposer(request.text, toolResults, request.pageId, request.pageTitle));
    rememberActionDomain(toolResults);
    pushSessionMemory(request.text, reply);
    wonderEmit("mel.plan", "melAgent", {
      intent: deterministicAction ? "async-tool" : "sync-tool",
      planId: plan.id,
      ...runtimeStamp(started),
    });
    return { reply, mode: "action", toolResults };
  }

  // Only ask Ollama when the line is clearly a workspace action we didn't parse.
  // Keep the budget short so Mel never sits on "…" for 12s.
  if (
    toolResults.length === 0
    && request.localModelAvailable
    && mayNeedWorkspacePlanner(request.text)
  ) {
    try {
      const budgeted = await withBudget(4_500, () => planWorkspaceWithLocalModel(request));
      if (budgeted.ok) {
        toolResults = executeLocalWorkspacePlan(budgeted.value, request.pageId);
        if (toolResults.length) {
          const reply = cleanReply(localComposer(request.text, toolResults, request.pageId, request.pageTitle));
          rememberActionDomain(toolResults);
          pushSessionMemory(request.text, reply);
          return { reply, mode: "action", toolResults };
        }
      }
    } catch {
      /* fall through */
    }
    // Deterministic fallback so move/create-style asks never hang forever
    if (/\b(move|put|place|nest)\b/i.test(request.text)) {
      const reply = cleanReply(
        "I couldn't run that move. Try: move Work under Learn — or: put World Monitor under Work."
      );
      pushSessionMemory(request.text, reply);
      return { reply, mode: "offline-local", toolResults: [] };
    }
  }

  let reply = localComposer(request.text, toolResults, request.pageId, request.pageTitle);
  let mode: MelAgentMode = toolResults.length ? "action" : "offline-local";

  const researchRequested = /^(research|look up|find out|compare|investigate)\b/i.test(trimmed);
  if (researchRequested && !request.cloudAvailable) {
    reply = "Live research needs the optional Grok bridge. App actions and your saved data still work locally.";
  } else if (researchRequested && request.cloudAvailable && !request.forceLocal) {
    const budgeted = await withBudget(45_000, () => cloudReply(request, toolResults));
    if (budgeted.ok) {
      reply = budgeted.value.reply;
      mode = "research";
    } else {
      reply = "Research timed out. Try again, or ask an app action instead.";
      mode = "offline-local";
    }
  } else if (
    request.cloudAvailable
    && !request.forceLocal
    && !preferOfflinePath()
    && trimmed.length >= 12
    && !isInstantChat(trimmed)
  ) {
    // Hard latency budget for optional Grok polish
    const budgeted = await withBudget(plan.cloudBudgetMs, () => cloudReply(request, toolResults));
    if (budgeted.ok) {
      reply = budgeted.value.reply;
      mode = "grok-connected";
    } else {
      mode = "offline-local";
    }
  } else if (
    toolResults.length === 0
    && request.localModelAvailable
    && !request.forceLocal
    && /\b(think hard|go deep|detailed|explain fully)\b/i.test(trimmed)
  ) {
    const budgeted = await withBudget(8_000, () => localModelReply(request));
    if (budgeted.ok) {
      reply = budgeted.value;
      mode = "local-model";
    }
  }

  reply = cleanReply(reply);
  rememberActionDomain(toolResults);
  pushSessionMemory(request.text, reply);
  wonderEmit("mel.plan", "melAgent", {
    intent: mode,
    planId: plan.id,
    ...runtimeStamp(started),
  });
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
