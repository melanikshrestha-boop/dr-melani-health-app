/**
 * Policy engine — defaults as data, not 400 if-statements.
 * Food meat + dress weather hints evaluate the same way.
 */
import type { MeatId, PolicyContext, PolicyDecision } from "./types";
import { wonderEmit } from "./eventBus";
import { offlineGetJson, offlineSetJson } from "./offlineStore";

export type PolicyRule<T extends string = string> = {
  id: string;
  domain: "meat" | "dress" | "general";
  /** Higher wins when several match */
  priority: number;
  /** Human reason Mel can quote */
  reason: string;
  when: (ctx: PolicyContext) => boolean;
  /** What to force / prefer */
  prefer: T;
};

const PREFS_KEY = "wonder-policy-prefs-v1";

export type PolicyPrefs = {
  noBackToBackMeat: boolean;
  preferSalmonForLipids: boolean;
  beefOnMenstrual: boolean;
};

export function loadPolicyPrefs(): PolicyPrefs {
  return {
    noBackToBackMeat: true,
    preferSalmonForLipids: true,
    beefOnMenstrual: true,
    ...offlineGetJson<Partial<PolicyPrefs>>(PREFS_KEY, {}),
  };
}

export function savePolicyPrefs(prefs: PolicyPrefs) {
  offlineSetJson(PREFS_KEY, prefs, "policyEngine");
}

/** Built-in meat rotation rules (editable via prefs flags) */
export function meatRules(prefs: PolicyPrefs = loadPolicyPrefs()): PolicyRule<MeatId>[] {
  return [
    {
      id: "no-back-to-back",
      domain: "meat",
      priority: 100,
      reason: "No same meat two days in a row.",
      when: (ctx) => prefs.noBackToBackMeat && ctx.yesterdayMeat != null,
      prefer: "beef", // overridden in evaluate by flipping yesterday
    },
    {
      id: "menstrual-iron-beef",
      domain: "meat",
      priority: 90,
      reason: "Period window: prefer beef for iron support.",
      when: (ctx) => prefs.beefOnMenstrual && ctx.phaseId === "menstrual",
      prefer: "beef",
    },
    {
      id: "lipid-salmon",
      domain: "meat",
      priority: 70,
      reason: "Lipid-friendly pattern: prefer salmon when the panel runs high.",
      when: (ctx) => prefs.preferSalmonForLipids && ctx.lipidPressure,
      prefer: "salmon",
    },
    {
      id: "hard-train-beef",
      domain: "meat",
      priority: 40,
      reason: "Training day: lean beef is a solid protein default.",
      when: (ctx) =>
        Boolean(ctx.gymToday && ctx.gymToday !== "-" && /lower|upper|glute|lift/i.test(ctx.gymToday)),
      prefer: "beef",
    },
    {
      id: "default-alternate",
      domain: "meat",
      priority: 10,
      reason: "Default alternate by calendar day.",
      when: () => true,
      prefer: "salmon",
    },
  ];
}

export function dressRules(): PolicyRule<string>[] {
  return [
    {
      id: "rain-shell",
      domain: "dress",
      priority: 80,
      reason: "Rain risk: prefer water-safe layers and shoes.",
      when: (ctx) => ctx.rain,
      prefer: "rain-ready",
    },
    {
      id: "hot-light",
      domain: "dress",
      priority: 50,
      reason: "Hot out: lighter layers.",
      when: (ctx) => ctx.temperatureF != null && ctx.temperatureF >= 78,
      prefer: "light",
    },
    {
      id: "cold-layer",
      domain: "dress",
      priority: 50,
      reason: "Cold out: add a real layer.",
      when: (ctx) => ctx.temperatureF != null && ctx.temperatureF <= 48,
      prefer: "layered",
    },
    {
      id: "default-everyday",
      domain: "dress",
      priority: 10,
      reason: "Everyday clean default.",
      when: () => true,
      prefer: "everyday",
    },
  ];
}

/**
 * Evaluate rules: highest priority match wins.
 * Special-case meat back-to-back: flip yesterday's meat.
 */
export function evaluatePolicy<T extends string>(
  rules: PolicyRule<T>[],
  ctx: PolicyContext,
  domain: PolicyRule["domain"]
): PolicyDecision<T> {
  const prefs = loadPolicyPrefs();
  const ranked = rules
    .filter((r) => r.domain === domain && r.when(ctx))
    .sort((a, b) => b.priority - a.priority);

  const reasons: string[] = [];
  const ruleIds: string[] = [];
  let value: T | null = null;

  for (const rule of ranked) {
    // Back-to-back meat: force opposite of yesterday
    if (rule.id === "no-back-to-back" && ctx.yesterdayMeat) {
      const flipped = (ctx.yesterdayMeat === "beef" ? "salmon" : "beef") as T;
      value = flipped;
      reasons.push(rule.reason);
      ruleIds.push(rule.id);
      // Period can override once if we were forced to salmon and menstrual wants beef
      const menstrual = ranked.find((r) => r.id === "menstrual-iron-beef");
      if (
        menstrual
        && prefs.beefOnMenstrual
        && ctx.phaseId === "menstrual"
        && flipped === ("salmon" as T)
        && ctx.salmonStreak >= 1
      ) {
        value = "beef" as T;
        reasons.push(menstrual.reason);
        ruleIds.push(menstrual.id);
      }
      break;
    }

    if (value == null) {
      value = rule.prefer;
      reasons.push(rule.reason);
      ruleIds.push(rule.id);
      // keep first (highest) only for value; still collect lipid note if present
      break;
    }
  }

  // Attach secondary reasons (lipid note) without changing value
  for (const rule of ranked.slice(0, 3)) {
    if (!ruleIds.includes(rule.id) && rule.id === "lipid-salmon") {
      reasons.push(rule.reason);
      ruleIds.push(rule.id);
    }
  }

  if (value == null) {
    value = "salmon" as T;
    reasons.push("Fallback salmon.");
    ruleIds.push("fallback");
  }

  // Calendar alternate if only default matched
  if (ruleIds[0] === "default-alternate") {
    const dayNum = Number(ctx.day.slice(-2)) || 0;
    value = (dayNum % 2 === 0 ? "salmon" : "beef") as T;
  }

  const decision: PolicyDecision<T> = { value, ruleIds, reasons };
  wonderEmit("policy.decided", "policyEngine", { domain, decision, ctx });
  return decision;
}

export function decideMeat(ctx: PolicyContext): PolicyDecision<MeatId> {
  return evaluatePolicy(meatRules(), ctx, "meat");
}

export function decideDressHint(ctx: PolicyContext): PolicyDecision<string> {
  return evaluatePolicy(dressRules(), ctx, "dress");
}
