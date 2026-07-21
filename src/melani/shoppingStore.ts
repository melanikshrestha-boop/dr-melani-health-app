export type StockState = "out" | "low" | "stocked";
export type HomeItem = { id: string; name: string; area: string; state: StockState; preferredStore: "costco" | "walmart" | "either"; updatedAt: string };
export type CostcoPlanItem = {
  id: string;
  name: string;
  quantity: number;
  done: boolean;
};
export type CostcoPlan = {
  id: string;
  items: CostcoPlanItem[];
  createdAt: string;
  launchedAt?: string;
  launchUrl?: string;
};

export const SHOPPING_KEY = "dr-melani-home-inventory-v1";
export const SHOPPING_EVENT = "dr-melani-shopping-update";
export const COSTCO_PLAN_KEY = "dr-melani-costco-plan-v1";
export const COSTCO_LOGIN_URL = "https://sameday.costco.com/login";
export const COSTCO_STOREFRONT_URL = "https://sameday.costco.com/store/costco/storefront";

const SEED: HomeItem[] = [
  { id: "greek-yogurt", name: "Fage 0% Greek yogurt", area: "Fridge", state: "low", preferredStore: "costco", updatedAt: "" },
  { id: "kefir", name: "Plain kefir", area: "Fridge", state: "stocked", preferredStore: "walmart", updatedAt: "" },
  { id: "blueberries", name: "Blueberries", area: "Fridge", state: "low", preferredStore: "costco", updatedAt: "" },
  { id: "eggs", name: "Eggs", area: "Fridge", state: "stocked", preferredStore: "costco", updatedAt: "" },
  { id: "chia", name: "Chia seeds", area: "Pantry", state: "stocked", preferredStore: "either", updatedAt: "" },
  { id: "water", name: "Water", area: "Pantry", state: "stocked", preferredStore: "costco", updatedAt: "" },
];

export function loadInventory(): HomeItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHOPPING_KEY) || "null");
    if (Array.isArray(parsed)) return parsed;
  } catch { /* use seed */ }
  return SEED;
}

export function saveInventory(items: HomeItem[]) {
  localStorage.setItem(SHOPPING_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(SHOPPING_EVENT));
}

export function missingItems(items = loadInventory()) {
  return items.filter((item) => item.state !== "stocked");
}

export function loadCostcoPlan(): CostcoPlan | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(COSTCO_PLAN_KEY) || "null") as CostcoPlan | null;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return {
      ...parsed,
      items: parsed.items
        .filter((item) => item && typeof item.name === "string")
        .map((item) => ({
          id: String(item.id || `costco-${Date.now()}`),
          name: item.name.trim(),
          quantity: Math.max(1, Number(item.quantity) || 1),
          done: Boolean(item.done),
        })),
    };
  } catch {
    return null;
  }
}

export function saveCostcoPlan(plan: CostcoPlan | null) {
  if (plan) localStorage.setItem(COSTCO_PLAN_KEY, JSON.stringify(plan));
  else localStorage.removeItem(COSTCO_PLAN_KEY);
  window.dispatchEvent(new CustomEvent(SHOPPING_EVENT));
}

export function costcoSameDaySearchUrl(query: string) {
  return `https://sameday.costco.com/store/costco/s?k=${encodeURIComponent(query)}`;
}

function splitShoppingItems(value: string): Array<{ name: string; quantity: number }> {
  return value
    .replace(/[.!]+$/, "")
    .split(/\s*(?:,|;|\n|\band\b)\s*/i)
    .map((part) => part.trim().replace(/^(?:some|a|an|the)\s+/i, ""))
    .filter(Boolean)
    .map((part) => {
      const quantity = part.match(/^(\d+)\s*(?:x\s*)?(.+)$/i);
      return quantity?.[2]
        ? { name: quantity[2].trim(), quantity: Math.max(1, Number(quantity[1])) }
        : { name: part, quantity: 1 };
    });
}

export function stageCostcoPlan(nextItems: Array<{ name: string; quantity?: number }>): CostcoPlan {
  const existing = loadCostcoPlan();
  const items = existing?.items ? [...existing.items] : [];
  for (const candidate of nextItems) {
    const name = candidate.name.trim();
    if (!name) continue;
    const match = items.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (match) {
      match.quantity = Math.max(match.quantity, candidate.quantity || 1);
      match.done = false;
    } else {
      items.push({
        id: `costco-${Date.now()}-${items.length}`,
        name,
        quantity: Math.max(1, candidate.quantity || 1),
        done: false,
      });
    }
  }
  const plan: CostcoPlan = {
    id: existing?.id || `costco-plan-${Date.now()}`,
    items,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  saveCostcoPlan(plan);
  return plan;
}

export function storeSearchUrl(store: "costco" | "walmart", query: string) {
  const q = encodeURIComponent(query);
  return store === "costco"
    ? costcoSameDaySearchUrl(query)
    : `https://www.walmart.com/search?q=${q}`;
}

export function applyShoppingCommand(text: string): string | null {
  const low = text.trim().toLowerCase();
  let items = loadInventory();
  const openCostco = low.match(/^(?:please\s+)?(?:open|connect|sign\s+(?:me\s+)?in(?:to)?|go\s+to)\s+(?:my\s+)?costco(?:\s+(?:account|same[ -]?day|shopping))?[.!]?$/i);
  if (openCostco) {
    window.open(COSTCO_LOGIN_URL, "_blank", "noopener,noreferrer");
    return "Opened Costco Same-Day sign-in. Your Costco.com login works there.";
  }

  const costcoCart = text.trim().match(
    /^(?:please\s+)?(?:add|put|queue|buy|order|get)(?:\s+me)?\s+(.+?)\s+(?:to|into|in|from|at)\s+(?:my\s+)?costco(?:\s+(?:cart|order|list))?[.!]?$/i
  );
  if (costcoCart?.[1]) {
    const requested = /^(?:everything|all)(?:\s+(?:that(?:'s| is)?|i(?:'m| am)?))?\s+(?:missing|low|out)/i.test(costcoCart[1])
      ? missingItems(items).map((item) => ({ name: item.name, quantity: 1 }))
      : splitShoppingItems(costcoCart[1]);
    if (!requested.length) return "Nothing is currently marked low or out.";
    const plan = stageCostcoPlan(requested);
    window.dispatchEvent(new CustomEvent("wonder-mel-navigate", { detail: { pageId: "pg-agent-shopping" } }));
    return `Staged ${requested.length} ${requested.length === 1 ? "item" : "items"} for Costco. ${plan.items.length} total in the current Costco run.`;
  }

  const mark = low.match(/^(?:we are|i am|i'm|mark|set)?\s*(?:out of|low on|stocked on|have)\s+(.+)$/i);
  if (mark?.[1]) {
    const name = mark[1].replace(/[.!]+$/, "").trim();
    const state: StockState = low.includes("out of") ? "out" : low.includes("low on") ? "low" : "stocked";
    const found = items.find((item) => item.name.toLowerCase().includes(name) || name.includes(item.name.toLowerCase()));
    if (found) items = items.map((item) => item.id === found.id ? { ...item, state, updatedAt: new Date().toISOString() } : item);
    else items = [...items, { id: `home-${Date.now()}`, name, area: "Home", state, preferredStore: "either", updatedAt: new Date().toISOString() }];
    saveInventory(items);
    return `${name} is marked ${state}.`;
  }
  if (/what(?:'s| is) missing|what do i need|shopping list|restock/i.test(low)) {
    const missing = missingItems(items);
    return missing.length ? `Missing or low:\n${missing.map((item) => `- ${item.name} (${item.state})`).join("\n")}` : "Nothing is marked low or out right now.";
  }
  return null;
}
