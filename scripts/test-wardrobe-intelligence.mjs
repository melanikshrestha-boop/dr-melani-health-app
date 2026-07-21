import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  analyzePurchaseCandidate,
  auditWardrobeIntegrity,
  buildLaundryPlan,
  buildPackingPlan,
  buildResaleCandidates,
  buildRotationPlan,
  buildWardrobeGraph,
  buildWardrobeOverview,
  createVisualDescriptor,
  defaultWardrobeState,
  duplicateScore,
  generateOutfits,
  searchWardrobe,
} from "./wardrobe/wardrobe-intelligence.mjs";
import { createWardrobeStore } from "./wardrobe/wardrobe-store.mjs";

const library = [
  { id: "top-black", name: "Black Fitted Tee", part: "upperbody", color: "#151515", tags: ["basic", "camera-safe"], image: "/black.png" },
  { id: "top-neon", name: "Neon Micro Stripe Top", part: "upperbody", color: "#e8ff22", tags: ["neon", "micro stripe"], image: "/neon.png" },
  { id: "bottom-gray", name: "Gray Trousers", part: "lowerbody", color: "#777777", tags: ["tailored"], image: "/gray.png" },
  { id: "dress-olive", name: "Olive Dress", part: "dresses", color: "#8b7a39", tags: ["satin"], image: "/olive.png" },
  { id: "jacket-black", name: "Black Jacket", part: "wholebody_up", color: "#111111", tags: ["warm"], image: "/jacket.png" },
  { id: "shoes-black", name: "Black Boots", part: "shoes", color: "#101010", tags: ["leather", "rain"], image: "/boots.png" },
];

const state = {
  items: Object.fromEntries(library.map((item) => [item.id, { status: "clean", wearCount: 0, lastWornAt: null }])),
};
state.items["top-neon"].status = "laundry";

const stream = generateOutfits(library, state, { mode: "stream", temperatureF: 64, rain: true, count: 4 });
assert.ok(stream.looks.length >= 1, "stream recommendations should exist");
assert.ok(stream.looks.every((look) => look.items.every((item) => item.id !== "top-neon")), "laundry items must be excluded");
assert.ok(stream.looks.every((look) => look.items.some((item) => item.kind === "dress") || (look.items.some((item) => item.kind === "top") && look.items.some((item) => item.kind === "bottom"))), "every look needs a complete base");
assert.deepEqual(stream.looks.map((look) => look.id), generateOutfits(library, state, { mode: "stream", temperatureF: 64, rain: true, count: 4 }).looks.map((look) => look.id), "recommendations must be deterministic");

const packing = buildPackingPlan(library, state, { days: 3, mode: "everyday", temperatureF: 70 });
assert.equal(packing.days, 3);
assert.ok(packing.items.length >= 1);

const rotation = buildRotationPlan(library, state, { days: 7, mode: "build", temperatureF: 68 });
assert.equal(rotation.schedule.length, 7, "rotation should cover every requested day");
assert.ok(rotation.uniqueLooks >= 1);

const graph = buildWardrobeGraph(library, state);
assert.equal(graph.nodes.length, library.length);
assert.ok(graph.possiblePairs >= 1, "wardrobe graph should expose usable combinations");

const laundry = buildLaundryPlan(library, state);
assert.equal(laundry.items[0].item.id, "top-neon", "laundry plan should include blocked pieces");

const duplicatePurchase = analyzePurchaseCandidate(library, state, { name: "Another black tee", part: "upperbody", color: "#161616", price: 80 });
assert.ok(duplicatePurchase.nearestOwnedPiece.similarity >= 95, "purchase check should expose near-duplicate owned pieces");
assert.ok(["consider", "low-leverage"].includes(duplicatePurchase.verdict), "a near duplicate should not be labeled high leverage");

const overview = buildWardrobeOverview(library, state);
assert.equal(overview.counts.total, library.length);
assert.equal(overview.counts.laundry, 1);
assert.equal(buildResaleCandidates(library, state).candidates.length, 0, "resale must wait for evidence");
assert.equal(searchWardrobe(library, state, "olive dress")[0].id, "dress-olive");
const integrity = auditWardrobeIntegrity(library, state, []);
assert.equal(integrity.checks.uniqueItemIds.ok, true);
assert.equal(integrity.checks.visualFingerprints.ok, false, "integrity checks should expose missing fingerprints instead of hiding incomplete imports");
assert.equal(auditWardrobeIntegrity([...library, library[0]], state, []).checks.uniqueItemIds.ok, false, "integrity checks should detect duplicate record ids");

const firstImage = await sharp({ create: { width: 80, height: 120, channels: 4, background: "#8b7a39" } }).png().toBuffer();
const secondImage = await sharp({ create: { width: 80, height: 120, channels: 4, background: "#8b7a39" } }).png().toBuffer();
const differentImage = await sharp({ create: { width: 120, height: 60, channels: 4, background: "#2233aa" } }).png().toBuffer();
const firstDescriptor = await createVisualDescriptor(firstImage, { part: "dresses", color: "#8b7a39" });
const secondDescriptor = await createVisualDescriptor(secondImage, { part: "dresses", color: "#8b7a39" });
const differentDescriptor = await createVisualDescriptor(differentImage, { part: "upperbody", color: "#2233aa" });
assert.ok(duplicateScore(firstDescriptor, secondDescriptor) > 0.98, "identical items should be duplicates");
assert.ok(duplicateScore(firstDescriptor, differentDescriptor) < 0.8, "different items should not be duplicates");

const temporary = await mkdtemp(path.join(os.tmpdir(), "wonder-wardrobe-test-"));
try {
  const store = createWardrobeStore({ root: temporary, dataDir: temporary });
  const mutation = { type: "wear", itemId: "dress-olive", idempotencyKey: "wear-once", actor: "test" };
  const firstWear = await store.mutate(library, mutation);
  const repeatedWear = await store.mutate(library, mutation);
  assert.equal(firstWear.state.items["dress-olive"].wearCount, 1);
  assert.equal(repeatedWear.state.items["dress-olive"].wearCount, 1, "idempotent repeats must not double-log");
  assert.equal(repeatedWear.repeated, true);
  const undone = await store.undo(library, "test");
  assert.equal(undone.state.items["dress-olive"].wearCount, 0, "undo should restore the previous operational state");
  const wearAfterUndo = await store.mutate(library, mutation);
  assert.equal(wearAfterUndo.repeated, false, "undo should release the idempotency receipt so an intentional redo can run");
  assert.equal(wearAfterUndo.state.items["dress-olive"].wearCount, 1);
  await store.undo(library, "test");

  await store.recordDecision(library, { type: "recommendation", payload: stream, actor: "test" });
  const selectedIds = stream.looks[0].items.map((item) => item.id);
  const firstLookWear = await store.actOnLook(library, { index: 1, idempotencyKey: "look-once", actor: "test" });
  const repeatedLookWear = await store.actOnLook(library, { index: 1, idempotencyKey: "look-once", actor: "test" });
  assert.ok(selectedIds.every((id) => firstLookWear.state.items[id].wearCount === 1), "wearing a look should atomically log every piece");
  assert.ok(selectedIds.every((id) => repeatedLookWear.state.items[id].wearCount === 1), "look idempotency should prevent double logging");
  assert.equal(repeatedLookWear.repeated, true);

  const feedback = await store.recordFeedback(library, { index: 1, value: "like", actor: "test" });
  assert.ok(selectedIds.every((id) => feedback.state.preferences.items[id] === 1), "outfit feedback should teach item preferences");
  const repeatedFeedback = await store.recordFeedback(library, { index: 1, value: "like", actor: "test" });
  assert.equal(repeatedFeedback.repeated, true, "repeating the same feedback should not overweight it");
  assert.ok(selectedIds.every((id) => repeatedFeedback.state.preferences.items[id] === 1));
  const changedFeedback = await store.recordFeedback(library, { index: 1, value: "dislike", actor: "test" });
  assert.ok(selectedIds.every((id) => changedFeedback.state.preferences.items[id] === -1), "changed feedback should replace the prior vote");
  const undoChangedFeedback = await store.undo(library, "test");
  assert.ok(selectedIds.every((id) => undoChangedFeedback.state.preferences.items[id] === 1), "undo should restore the prior feedback vote");
  const undoFeedback = await store.undo(library, "test");
  assert.ok(selectedIds.every((id) => !undoFeedback.state.preferences.items[id]), "feedback should undo as one transaction");
  const undoLook = await store.undo(library, "test");
  assert.ok(selectedIds.every((id) => undoLook.state.items[id].wearCount === 0), "a whole outfit wear should undo atomically");

  const replayDir = path.join(temporary, "replay");
  const replayStore = createWardrobeStore({ root: temporary, dataDir: replayDir });
  await replayStore.mutate(library, { type: "status", itemId: "dress-olive", value: "laundry", idempotencyKey: "replay-status", actor: "test" });
  await writeFile(replayStore.paths.stateFile, `${JSON.stringify(defaultWardrobeState())}\n`);
  const recovered = await replayStore.load(library);
  assert.equal(recovered.items["dress-olive"].status, "laundry", "the event ledger should recover a state snapshot lost after append");
  assert.equal(recovered.idempotency["replay-status"]?.type, "status", "replay should also restore idempotency receipts");
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log("WARDROBE_INTELLIGENCE_TEST_OK");
