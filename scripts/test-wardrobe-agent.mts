import assert from "node:assert/strict";
import { runWardrobeCommand } from "../src/melani/wardrobe/wardrobeAgent.ts";

type Call = { url: string; body: Record<string, unknown> };
const calls: Call[] = [];

const olive = { id: "olive", name: "Olive Dress", part: "dresses", kind: "dress", color: "#8b7a39", status: "clean" };

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url);
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
  calls.push({ url: path, body });
  let payload: Record<string, unknown> = {};
  if (path.endsWith("/recommend")) {
    payload = { looks: [{ id: "look-olive", score: 91, confidence: 0.9, items: [olive], breakdown: { color: 92, mode: 90, weather: 88, rotation: 86 }, reasons: ["Owned and available."] }], warnings: [] };
  } else if (path.endsWith("/outfit/wear")) {
    payload = { repeated: false, look: { items: [olive] }, operations: { olive: { wearCount: 1 } } };
  } else if (path.endsWith("/outfit/feedback")) {
    payload = { value: body.value, look: { items: [olive] }, learnedItems: 1 };
  } else if (path.endsWith("/rotation")) {
    payload = { schedule: [{ day: 1, score: 91, items: [olive] }], warnings: [] };
  } else if (path.endsWith("/purchase-check")) {
    payload = { verdict: "consider", score: 64, candidate: { name: body.name }, compatibleOwnedPieces: [olive], versatility: 72, nearestOwnedPiece: { item: olive, similarity: 91 }, reasons: ["It overlaps with an owned dress."] };
  } else if (path.endsWith("/laundry")) {
    payload = { summary: "One item.", items: [{ item: olive, blockedConnections: 2, careNote: "Read the label." }] };
  } else if (path.endsWith("/graph")) {
    payload = { possiblePairs: 4, hubs: [{ item: olive, connections: 4 }], orphans: [] };
  } else if (path.endsWith("/health")) {
    payload = { ok: true, revision: 12, failures: [] };
  } else if (path.endsWith("/action")) {
    payload = { item: olive, operation: { wearCount: body.action === "wear" ? 1 : 0 }, repeated: false };
  } else if (path.endsWith("/undo")) {
    payload = { undone: "wear-look" };
  }
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

const recommend = await runWardrobeCommand("what should I wear for streaming", "pg-fashion-os");
assert.equal(recommend?.tool, "wardrobe_recommend");
assert.match(recommend?.summary || "", /wear outfit 1/i);

const wearLook = await runWardrobeCommand("wear outfit 1", "pg-fashion-os");
assert.equal(wearLook?.tool, "wardrobe_wear_look");
assert.equal(calls.at(-1)?.body.index, 1);

const feedback = await runWardrobeCommand("I hated the first outfit", "pg-fashion-os");
assert.equal(feedback?.tool, "wardrobe_feedback");
assert.equal(calls.at(-1)?.body.value, "dislike");

const rotation = await runWardrobeCommand("plan my outfits for 7 days", "pg-fashion-os");
assert.equal(rotation?.tool, "wardrobe_rotation");
assert.equal(calls.at(-1)?.body.days, 7);

const purchase = await runWardrobeCommand("should I buy an olive dress for $120", "pg-fashion-os");
assert.equal(purchase?.tool, "wardrobe_purchase_check");
assert.equal(calls.at(-1)?.body.part, "dresses");
assert.equal(calls.at(-1)?.body.price, 120);
assert.equal((await runWardrobeCommand("should I buy a blue sweater for $80", "pg-life"))?.tool, "wardrobe_purchase_check");
assert.equal((await runWardrobeCommand("pack me for 3 days", "pg-life"))?.tool, "wardrobe_pack");

assert.equal((await runWardrobeCommand("what should I wash", "pg-fashion-os"))?.tool, "wardrobe_laundry");
assert.equal((await runWardrobeCommand("show my wardrobe graph", "pg-fashion-os"))?.tool, "wardrobe_graph");
assert.equal((await runWardrobeCommand("wardrobe health", "pg-life"))?.tool, "wardrobe_health");

const wearItem = await runWardrobeCommand("I wore the Olive Dress", "pg-fashion-os");
assert.equal(wearItem?.tool, "wardrobe_wear");
assert.equal(calls.at(-1)?.body.query, "the Olive Dress");

const markWorn = await runWardrobeCommand("mark Olive Dress worn", "pg-fashion-os");
assert.equal(markWorn?.tool, "wardrobe_wear");
assert.equal(calls.at(-1)?.body.query, "Olive Dress");

const laundryStatus = await runWardrobeCommand("put Olive Dress in laundry", "pg-fashion-os");
assert.equal(laundryStatus?.tool, "wardrobe_status");
assert.equal(calls.at(-1)?.body.value, "laundry");

assert.equal((await runWardrobeCommand("undo that", "pg-fashion-os"))?.tool, "wardrobe_undo");

const values = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  },
  window: new EventTarget(),
});
Object.assign(window, { setTimeout, clearTimeout, open: () => null });
const { runMelAgent } = await import("../src/melani/melAgent.ts");
const integrated = await runMelAgent({
  text: "what should I wear for streaming",
  pageId: "pg-fashion-os",
  cloudAvailable: true,
  localModelAvailable: true,
});
assert.equal(integrated.mode, "action", "a deterministic wardrobe action must not be overwritten by a model");
assert.equal(integrated.toolResults[0]?.tool, "wardrobe_recommend");
assert.match(integrated.reply, /Olive Dress/);
assert.equal(values.get("wonder-mel-last-action-domain-v1"), "wardrobe");
const integratedUndo = await runMelAgent({ text: "undo that", pageId: "pg-life" });
assert.equal(integratedUndo.toolResults[0]?.tool, "wardrobe_undo", "the next undo should follow the last successful wardrobe action across pages");

console.log("WARDROBE_AGENT_TEST_OK");
