import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  analyzePurchaseCandidate,
  auditWardrobeIntegrity,
  buildLaundryPlan,
  buildPackingPlan,
  buildResaleCandidates,
  buildRotationPlan,
  buildWardrobeGraph,
  buildWardrobeOverview,
  findItem,
  generateOutfits,
  searchWardrobe,
} from "./wardrobe-intelligence.mjs";
import { createWardrobeStore } from "./wardrobe-store.mjs";

const ROOT = "/api/wardrobe";
const HEX = /^#[0-9a-f]{6}$/i;
const PARTS = new Set(["upperbody", "dresses", "wholebody_up", "lowerbody", "accessories_up", "shoes"]);

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}

async function requestBody(req, limit = 512 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Request body too large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Expected a JSON request body"), { status: 400 });
  }
}

async function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

function cleanString(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function cleanItemPatch(input = {}) {
  const patch = {};
  if ("name" in input) patch.name = cleanString(input.name) || "Untitled piece";
  if ("part" in input && PARTS.has(input.part)) patch.part = input.part;
  if ("color" in input && HEX.test(String(input.color))) patch.color = String(input.color).toLowerCase();
  if ("secondaryColor" in input) patch.secondaryColor = input.secondaryColor && HEX.test(String(input.secondaryColor)) ? String(input.secondaryColor).toLowerCase() : null;
  if ("tags" in input && Array.isArray(input.tags)) {
    patch.tags = [...new Set(input.tags.map((tag) => cleanString(tag, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
  }
  if ("forSale" in input) patch.forSale = Boolean(input.forSale);
  if ("askingPrice" in input) patch.askingPrice = cleanString(input.askingPrice, 30);
  if ("condition" in input) patch.condition = cleanString(input.condition, 40) || "Excellent";
  return patch;
}

function parseBoolean(value) {
  return value === true || value === "true" || value === "1";
}

function publicEvent(event) {
  const copy = { ...event };
  delete copy.before;
  return copy;
}

export function wardrobeIntelligenceApi(options = {}) {
  let root = process.cwd();
  let libraryFile;
  let store;

  async function loadLibrary() {
    try {
      const value = JSON.parse(await readFile(libraryFile, "utf8"));
      return Array.isArray(value) ? value : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function resolveItem(library, query) {
    const match = findItem(library, query);
    if (!match || match.score < 44) throw Object.assign(new Error(`I could not match "${query}" to a wardrobe item`), { status: 404 });
    return match;
  }

  async function handler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(ROOT)) return next();
    try {
      const library = await loadLibrary();
      const state = await store.load(library);

      if (url.pathname === `${ROOT}/overview` && req.method === "GET") {
        return json(res, 200, {
          ...buildWardrobeOverview(library, state),
          recentEvents: (await store.readEvents(12)).map(publicEvent),
        });
      }
      if (url.pathname === `${ROOT}/health` && req.method === "GET") {
        return json(res, 200, auditWardrobeIntegrity(library, state, await store.readEvents(1000)));
      }
      if (url.pathname === `${ROOT}/recommend` && req.method === "POST") {
        const output = generateOutfits(library, state, await requestBody(req));
        const recorded = await store.recordDecision(library, { type: "recommendation", payload: output, actor: "mel" });
        return json(res, 200, { ...output, decisionId: recorded.event.id });
      }
      if (url.pathname === `${ROOT}/pack` && req.method === "POST") {
        const output = buildPackingPlan(library, state, await requestBody(req));
        const recorded = await store.recordDecision(library, { type: "packing-plan", payload: output, actor: "mel" });
        return json(res, 200, { ...output, decisionId: recorded.event.id });
      }
      if (url.pathname === `${ROOT}/rotation` && req.method === "POST") {
        return json(res, 200, buildRotationPlan(library, state, await requestBody(req)));
      }
      if (url.pathname === `${ROOT}/purchase-check` && req.method === "POST") {
        return json(res, 200, analyzePurchaseCandidate(library, state, await requestBody(req)));
      }
      if (url.pathname === `${ROOT}/laundry` && req.method === "GET") {
        return json(res, 200, buildLaundryPlan(library, state));
      }
      if (url.pathname === `${ROOT}/graph` && req.method === "GET") {
        return json(res, 200, buildWardrobeGraph(library, state));
      }
      if (url.pathname === `${ROOT}/resale` && req.method === "GET") {
        return json(res, 200, buildResaleCandidates(library, state));
      }
      if (url.pathname === `${ROOT}/search` && req.method === "GET") {
        return json(res, 200, { query: url.searchParams.get("q") || "", items: searchWardrobe(library, state, url.searchParams.get("q") || "") });
      }
      if (url.pathname === `${ROOT}/events` && req.method === "GET") {
        const limit = Math.max(1, Math.min(250, Number(url.searchParams.get("limit")) || 50));
        return json(res, 200, { events: (await store.readEvents(limit)).map(publicEvent) });
      }
      if (url.pathname === `${ROOT}/export` && req.method === "GET") {
        res.setHeader("Content-Disposition", `attachment; filename="wonder-wardrobe-${new Date().toISOString().slice(0, 10)}.json"`);
        return json(res, 200, {
          format: "wonder-wardrobe-backup",
          version: 1,
          exportedAt: new Date().toISOString(),
          library,
          operations: state,
          events: await store.readEvents(1000),
        });
      }
      if (url.pathname === `${ROOT}/undo` && req.method === "POST") {
        const result = await store.undo(library, "mel");
        return json(res, 200, { undone: result.target.type, itemId: result.target.itemId, state: result.state.items[result.target.itemId] });
      }
      if (url.pathname === `${ROOT}/outfit/wear` && req.method === "POST") {
        const input = await requestBody(req);
        const result = await store.actOnLook(library, {
          index: input.index,
          actor: input.actor || "mel",
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
        });
        return json(res, 200, {
          repeated: result.repeated,
          eventId: result.event.id,
          look: result.look,
          operations: Object.fromEntries(result.event.itemIds.map((id) => [id, result.state.items[id]])),
        });
      }
      if (url.pathname === `${ROOT}/outfit/feedback` && req.method === "POST") {
        const input = await requestBody(req);
        const result = await store.recordFeedback(library, {
          index: input.index,
          value: input.value,
          actor: input.actor || "mel",
        });
        return json(res, 200, {
          eventId: result.event.id,
          value: result.event.value,
          repeated: result.repeated,
          look: result.look,
          learnedItems: result.event.itemIds.length,
        });
      }
      if (url.pathname === `${ROOT}/action` && req.method === "POST") {
        const input = await requestBody(req);
        const match = await resolveItem(library, input.query || input.itemId || "");
        const action = cleanString(input.action, 30).toLowerCase();
        const mutation = { itemId: match.item.id, actor: input.actor || "mel", idempotencyKey: input.idempotencyKey, reason: input.reason };
        if (action === "wear") {
          mutation.type = "wear";
          mutation.idempotencyKey = `wear:${new Date().toISOString().slice(0, 10)}:${match.item.id}`;
        }
        else if (action === "status") { mutation.type = "status"; mutation.value = cleanString(input.value, 30).toLowerCase(); }
        else if (action === "value") {
          mutation.type = "value";
          mutation.value = Number(input.value);
          mutation.acquiredAt = input.acquiredAt || null;
          if (!Number.isFinite(mutation.value) || mutation.value < 0) throw Object.assign(new Error("Acquisition cost must be a positive number"), { status: 400 });
        } else if (action === "favorite") { mutation.type = "favorite"; mutation.value = parseBoolean(input.value); }
        else if (action === "location") { mutation.type = "location"; mutation.value = cleanString(input.value, 80) || "closet"; }
        else throw Object.assign(new Error(`Unknown wardrobe action: ${action}`), { status: 400 });
        const result = await store.mutate(library, mutation);
        return json(res, 200, {
          item: { id: match.item.id, name: match.item.name, part: match.item.part, color: match.item.color },
          match: match.score,
          operation: result.state.items[match.item.id],
          repeated: result.repeated,
          eventId: result.event.id,
        });
      }

      const itemMatch = url.pathname.match(/^\/api\/wardrobe\/items\/([a-z0-9][a-z0-9._-]{1,180})$/i);
      if (itemMatch && req.method === "PATCH") {
        const index = library.findIndex((item) => item.id === itemMatch[1]);
        if (index < 0) return json(res, 404, { error: "Wardrobe item not found" });
        const patch = cleanItemPatch(await requestBody(req));
        const updated = { ...library[index], ...patch, updatedAt: new Date().toISOString(), schemaVersion: 3 };
        if (updated.intelligence) {
          updated.intelligence = { ...updated.intelligence, color: updated.color, part: updated.part };
        }
        const next = [...library];
        next[index] = updated;
        await atomicJson(libraryFile, next);
        return json(res, 200, updated);
      }

      return json(res, 404, { error: "Wardrobe intelligence route not found" });
    } catch (error) {
      return json(res, error.status || (error.code === "ENOENT" ? 404 : 500), { error: error.message || "Wardrobe intelligence failed" });
    }
  }

  return {
    name: "wardrobe-intelligence-api",
    apply: "serve",
    async configResolved(config) {
      root = config.root;
      const dataDir = path.resolve(root, options.dataDir || process.env.WARDROBE_DATA_DIR || "data");
      libraryFile = path.join(dataDir, "library.json");
      store = createWardrobeStore({ root, dataDir });
    },
    configureServer(server) {
      server.middlewares.use(handler);
    },
  };
}
