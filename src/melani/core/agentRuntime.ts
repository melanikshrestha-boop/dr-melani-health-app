/**
 * Mel agent runtime: plan → execute → reply with a hard latency budget.
 * Tools are the hands. Network LLMs are optional and never block actions.
 */
import type { MelToolResult } from "../melTools";
import type { ToolCapability } from "./types";
import { wonderEmit } from "./eventBus";
import { preferOfflinePath } from "./offlineStore";

export type MelPlanStep = {
  id: string;
  tool: string;
  args?: Record<string, unknown>;
  /** If true, runtime stops for user confirm (future UI) */
  needsConfirm?: boolean;
};

export type MelPlan = {
  id: string;
  intent: string;
  steps: MelPlanStep[];
  /** ms budget for optional cloud polish */
  cloudBudgetMs: number;
  createdAt: string;
};

export type MelRuntimeResult = {
  plan: MelPlan;
  toolResults: MelToolResult[];
  reply: string;
  mode: "offline-local" | "action" | "grok-connected" | "research" | "local-model";
  latencyMs: number;
  timedOut: boolean;
};

/** Capability matrix — illegal combos refused at the edges */
export const MEL_CAPABILITIES: ToolCapability[] = [
  { name: "get_live_snapshot", sideEffect: "read", latency: "sync", needsConfirm: false },
  { name: "get_food_plan", sideEffect: "read", latency: "sync", needsConfirm: false },
  { name: "get_weather", sideEffect: "read", latency: "async", needsConfirm: false },
  { name: "lock_meat", sideEffect: "write", latency: "sync", needsConfirm: false },
  { name: "log_usual_meal", sideEffect: "write", latency: "sync", needsConfirm: false },
  { name: "write_body_brief", sideEffect: "write", latency: "sync", needsConfirm: false },
  { name: "trash_workspace_page", sideEffect: "write", latency: "sync", needsConfirm: true },
];

export function capabilityFor(tool: string): ToolCapability | undefined {
  return MEL_CAPABILITIES.find((c) => c.name === tool);
}

export function makePlan(intent: string, steps: MelPlanStep[], cloudBudgetMs = 3500): MelPlan {
  return {
    id: `plan-${Date.now().toString(36)}`,
    intent,
    steps,
    cloudBudgetMs,
    createdAt: new Date().toISOString(),
  };
}

export async function withBudget<T>(
  ms: number,
  work: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; timedOut: true }> {
  if (ms <= 0 || preferOfflinePath()) return { ok: false, timedOut: true };
  let timer: number | undefined;
  try {
    const value = await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("budget")), ms);
      }),
    ]);
    return { ok: true, value };
  } catch {
    return { ok: false, timedOut: true };
  } finally {
    if (timer != null) window.clearTimeout(timer);
  }
}

/** Run sync tool steps; skip confirm-gated destructive tools unless allowed */
export function executePlanSteps(
  plan: MelPlan,
  runners: Record<string, (args?: Record<string, unknown>) => MelToolResult | string>,
  opts?: { allowConfirm?: boolean }
): MelToolResult[] {
  const out: MelToolResult[] = [];
  for (const step of plan.steps) {
    const cap = capabilityFor(step.tool);
    if (cap?.needsConfirm && !opts?.allowConfirm && step.needsConfirm !== false) {
      out.push({
        ok: false,
        tool: step.tool,
        summary: `Skipped ${step.tool} (needs confirm).`,
      });
      continue;
    }
    const run = runners[step.tool];
    if (!run) {
      out.push({ ok: false, tool: step.tool, summary: `No runner for ${step.tool}.` });
      continue;
    }
    try {
      const raw = run(step.args);
      if (typeof raw === "string") {
        try {
          out.push(JSON.parse(raw) as MelToolResult);
        } catch {
          out.push({ ok: true, tool: step.tool, summary: raw });
        }
      } else {
        out.push(raw);
      }
      wonderEmit("mel.action", "agentRuntime", { tool: step.tool, ok: true });
    } catch (e) {
      out.push({
        ok: false,
        tool: step.tool,
        summary: e instanceof Error ? e.message : "Tool failed",
      });
    }
  }
  wonderEmit("mel.plan", "agentRuntime", { plan, results: out.length });
  return out;
}

export function runtimeStamp(started: number): { latencyMs: number } {
  return { latencyMs: Math.max(0, Date.now() - started) };
}
