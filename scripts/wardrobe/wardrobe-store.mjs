import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultWardrobeState,
  ensureWardrobeState,
  reduceWardrobeEvent,
  wardrobeStatuses,
} from "./wardrobe-intelligence.mjs";

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

export function createWardrobeStore(options = {}) {
  const root = options.root || process.cwd();
  const dataDir = path.resolve(root, options.dataDir || process.env.WARDROBE_DATA_DIR || "data");
  const stateFile = path.join(dataDir, "wardrobe-state.json");
  const eventFile = path.join(dataDir, "wardrobe-events.ndjson");
  let mutationQueue = Promise.resolve();

  async function load(library = []) {
    await mkdir(dataDir, { recursive: true });
    let state = ensureWardrobeState(await readJson(stateFile, defaultWardrobeState()), library);
    const recoveryWindow = Number(state.revision || 0) === 0 ? await readAllEvents() : await readEvents(64);
    const pending = recoveryWindow
      .filter((event) => Number.isFinite(Number(event.sequence)) && Number(event.sequence) > Number(state.revision || 0))
      .sort((first, second) => Number(first.sequence) - Number(second.sequence));
    if (pending.length) {
      for (const event of pending) {
        if (event.previousEventId && state.lastEventId && event.previousEventId !== state.lastEventId) {
          throw new Error(`Wardrobe event chain is broken before ${event.id}`);
        }
        state = reduceWardrobeEvent(state, event);
        if (event.idempotencyKey) state.idempotency[event.idempotencyKey] = event;
      }
      await atomicJson(stateFile, state);
    }
    return state;
  }

  function serial(task) {
    const run = mutationQueue.then(task, task);
    mutationQueue = run.catch(() => undefined);
    return run;
  }

  async function save(state, event) {
    await appendFile(eventFile, `${JSON.stringify(event)}\n`);
    await atomicJson(stateFile, state);
  }

  async function mutate(library, input) {
    return serial(async () => {
      const state = await load(library);
      const idempotencyKey = String(input.idempotencyKey || "").trim();
      if (idempotencyKey && state.idempotency[idempotencyKey]) {
        return { state, event: state.idempotency[idempotencyKey], repeated: true };
      }
      if (!state.items[input.itemId]) throw Object.assign(new Error("Wardrobe item not found"), { status: 404 });
      if (input.type === "status" && !wardrobeStatuses.includes(input.value)) {
        throw Object.assign(new Error(`Unknown wardrobe status: ${input.value}`), { status: 400 });
      }
      const before = structuredClone(state.items[input.itemId]);
      const event = {
        id: randomUUID(),
        sequence: Number(state.revision || 0) + 1,
        previousEventId: state.lastEventId || null,
        type: input.type,
        itemId: input.itemId,
        value: input.value,
        acquiredAt: input.acquiredAt || null,
        actor: input.actor || "mel",
        at: input.at || new Date().toISOString(),
        reason: String(input.reason || "").slice(0, 240) || null,
        idempotencyKey: idempotencyKey || null,
        before: { itemId: input.itemId, state: before },
      };
      const next = reduceWardrobeEvent(state, event);
      if (idempotencyKey) {
        next.idempotency = { ...next.idempotency, [idempotencyKey]: event };
        const keys = Object.keys(next.idempotency);
        for (const key of keys.slice(0, Math.max(0, keys.length - 120))) delete next.idempotency[key];
      }
      await save(next, event);
      return { state: next, event, repeated: false };
    });
  }

  async function recordDecision(library, input) {
    return serial(async () => {
      const state = await load(library);
      const type = input.type === "packing-plan" ? "packing-plan" : "recommendation";
      const event = {
        id: randomUUID(),
        sequence: Number(state.revision || 0) + 1,
        previousEventId: state.lastEventId || null,
        type,
        itemId: null,
        actor: input.actor || "mel",
        at: new Date().toISOString(),
        payload: input.payload,
      };
      const next = reduceWardrobeEvent(state, event);
      await save(next, event);
      return { state: next, event };
    });
  }

  async function actOnLook(library, input) {
    return serial(async () => {
      const state = await load(library);
      const recommendation = state.decisions?.lastRecommendation;
      const index = Math.max(0, Math.round(Number(input.index || 1)) - 1);
      const look = recommendation?.looks?.[index];
      if (!look) throw Object.assign(new Error(`Outfit ${index + 1} is not available. Ask Mel for outfits first.`), { status: 409 });
      const itemIds = [...new Set((look.items || []).map((item) => item.id).filter((id) => state.items[id]))];
      if (!itemIds.length) throw Object.assign(new Error("That outfit no longer contains owned wardrobe pieces"), { status: 409 });
      const requestedKey = String(input.idempotencyKey || "").trim();
      const idempotencyKey = requestedKey.startsWith("wear-look:")
        ? `wear-look:${new Date(input.at || Date.now()).toISOString().slice(0, 10)}:${look.id}`
        : requestedKey;
      if (idempotencyKey && state.idempotency[idempotencyKey]) {
        return { state, event: state.idempotency[idempotencyKey], repeated: true, look };
      }
      const event = {
        id: randomUUID(),
        sequence: Number(state.revision || 0) + 1,
        previousEventId: state.lastEventId || null,
        type: "wear-look",
        itemId: null,
        itemIds,
        lookId: look.id,
        actor: input.actor || "mel",
        at: input.at || new Date().toISOString(),
        reason: String(input.reason || "Chosen from Mel's latest recommendation").slice(0, 240),
        idempotencyKey: idempotencyKey || null,
        before: { items: Object.fromEntries(itemIds.map((id) => [id, structuredClone(state.items[id])])) },
      };
      const next = reduceWardrobeEvent(state, event);
      if (idempotencyKey) next.idempotency = { ...next.idempotency, [idempotencyKey]: event };
      await save(next, event);
      return { state: next, event, repeated: false, look };
    });
  }

  async function recordFeedback(library, input) {
    return serial(async () => {
      const state = await load(library);
      const recommendation = state.decisions?.lastRecommendation;
      const index = Math.max(0, Math.round(Number(input.index || 1)) - 1);
      const look = recommendation?.looks?.[index];
      if (!look) throw Object.assign(new Error(`Outfit ${index + 1} is not available. Ask Mel for outfits first.`), { status: 409 });
      const value = input.value === "dislike" ? "dislike" : "like";
      const itemIds = [...new Set((look.items || []).map((item) => item.id).filter((id) => state.items[id]))];
      const idempotencyKey = `feedback:${look.id}:${value}`;
      if (state.idempotency[idempotencyKey]) {
        return { state, event: state.idempotency[idempotencyKey], look, repeated: true };
      }
      const event = {
        id: randomUUID(),
        sequence: Number(state.revision || 0) + 1,
        previousEventId: state.lastEventId || null,
        type: "outfit-feedback",
        itemId: null,
        itemIds,
        lookId: look.id,
        value,
        idempotencyKey,
        actor: input.actor || "mel",
        at: new Date().toISOString(),
        before: { preferences: structuredClone(state.preferences) },
      };
      const next = reduceWardrobeEvent(state, event);
      next.idempotency = { ...next.idempotency, [idempotencyKey]: event };
      await save(next, event);
      return { state: next, event, look, repeated: false };
    });
  }

  async function undo(library, actor = "mel") {
    return serial(async () => {
      const state = await load(library);
      const events = await readEvents(250);
      const undone = new Set(events.filter((event) => event.type === "undo").map((event) => event.targetEventId));
      const target = [...events].reverse().find((event) => event.type !== "undo" && event.before && !undone.has(event.id));
      if (!target) throw Object.assign(new Error("There is no wardrobe action to undo"), { status: 409 });
      const event = {
        id: randomUUID(),
        sequence: Number(state.revision || 0) + 1,
        previousEventId: state.lastEventId || null,
        type: "undo",
        itemId: target.itemId,
        targetEventId: target.id,
        targetIdempotencyKey: target.idempotencyKey || null,
        actor,
        at: new Date().toISOString(),
        before: target.before,
      };
      const next = reduceWardrobeEvent(state, event);
      await save(next, event);
      return { state: next, event, target };
    });
  }

  async function readEvents(limit = 100) {
    let handle;
    try {
      handle = await open(eventFile, "r");
      const file = await handle.stat();
      const requested = Math.max(1, Math.min(100_000, Number(limit) || 100));
      const bytesToRead = Math.min(file.size, Math.max(1_048_576, Math.min(16_777_216, requested * 65_536)));
      const buffer = Buffer.alloc(bytesToRead);
      await handle.read(buffer, 0, bytesToRead, file.size - bytesToRead);
      let text = buffer.toString("utf8");
      if (file.size > bytesToRead) text = text.slice(text.indexOf("\n") + 1);
      const lines = text.split(/\r?\n/).filter(Boolean);
      return lines.slice(-Math.max(1, Math.min(1000, limit))).map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    } finally {
      await handle?.close();
    }
  }

  async function readAllEvents() {
    try {
      return (await readFile(eventFile, "utf8"))
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  return { load, mutate, recordDecision, actOnLook, recordFeedback, undo, readEvents, paths: { dataDir, stateFile, eventFile } };
}
