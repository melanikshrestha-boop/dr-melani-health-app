import type { MelToolResult } from "../melTools";
import { getFreshSavedWeather, weatherWardrobeContext } from "../weather/weatherCore";

const API = "/api/wardrobe";
const WARDROBE_PAGE_ID = "pg-fashion-os";

type JsonRecord = Record<string, unknown>;

async function request(path: string, init?: RequestInit): Promise<JsonRecord> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...(init.headers || {}) } : init?.headers,
  });
  const payload = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) throw new Error(String(payload.error || "Wardrobe could not complete that action."));
  return payload;
}

function result(tool: string, summary: string, data?: unknown): MelToolResult {
  return { ok: true, tool, summary, data };
}

function failure(summary: string): MelToolResult {
  return { ok: false, tool: "wardrobe", summary };
}

function modeFrom(text: string): string {
  const low = text.toLowerCase();
  if (/\b(stream|streaming|camera|zoom|video call)\b/.test(low)) return "stream";
  if (/\b(build|coding|work|engineering|focus)\b/.test(low)) return "build";
  if (/\b(content|shoot|film|photo|instagram|tiktok|youtube)\b/.test(low)) return "content";
  if (/\b(out|dinner|party|date|event|club)\b/.test(low)) return "out";
  return "everyday";
}

async function recommendationRequest(text: string, useSavedWeather = true): Promise<JsonRecord> {
  const temperature = text.match(/(-?\d{1,3})\s*(?:°|degrees?)(?:\s*f(?:ahrenheit)?)?/i);
  const count = text.match(/\b(\d{1,2})\s+(?:looks?|outfits?)\b/i);
  const explicitRain = /\b(rain|raining|storm|wet weather)\b/i.test(text);
  const liveSnapshot = useSavedWeather && (!temperature || !explicitRain)
    ? await getFreshSavedWeather()
    : null;
  const liveWeather = liveSnapshot ? weatherWardrobeContext(liveSnapshot) : null;
  return {
    mode: modeFrom(text),
    temperatureF: temperature ? Number(temperature[1]) : liveWeather?.temperatureF,
    rain: explicitRain || Boolean(liveWeather?.rain),
    count: count ? Number(count[1]) : 3,
    weatherLocation: liveWeather?.location,
    weatherCondition: liveWeather?.condition,
  };
}

function formatLooks(payload: JsonRecord): string {
  const looks = Array.isArray(payload.looks) ? payload.looks as Array<JsonRecord> : [];
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.map(String) : [];
  if (!looks.length) return [...warnings, "I need a complete clean base before I can build a real outfit."].filter(Boolean).join("\n");
  const lines = looks.map((look, index) => {
    const items = Array.isArray(look.items) ? look.items as Array<JsonRecord> : [];
    const names = items.map((item) => String(item.name)).join(" + ");
    const breakdown = (look.breakdown || {}) as JsonRecord;
    const reasons = Array.isArray(look.reasons) ? look.reasons.map(String) : [];
    return [
      `${index + 1}. ${names}`,
      `Fit score ${look.score}/100 · confidence ${Math.round(Number(look.confidence || 0) * 100)}%`,
      `Color ${breakdown.color ?? "-"} · context ${breakdown.mode ?? "-"} · weather ${breakdown.weather ?? "-"} · rotation ${breakdown.rotation ?? "-"}`,
      ...reasons.map((reason) => `Why: ${reason}`),
    ].join("\n");
  });
  if (warnings.length) lines.push(`Watch: ${warnings.join(" ")}`);
  lines.push("Say 'wear outfit 1' when you choose. Say 'I liked outfit 1' or 'I disliked outfit 1' so I can learn your taste.");
  return lines.join("\n\n");
}

function formatOverview(payload: JsonRecord): string {
  const counts = (payload.counts || {}) as JsonRecord;
  const categories = (payload.byCategory || {}) as JsonRecord;
  const gaps = Array.isArray(payload.gaps) ? payload.gaps.map(String) : [];
  return [
    `${counts.total || 0} pieces · ${counts.available || 0} ready · ${counts.laundry || 0} laundry · ${counts.repair || 0} repair`,
    `Catalog: ${Object.entries(categories).map(([name, value]) => `${name} ${value}`).join(" · ") || "empty"}`,
    `Metadata confidence ${Math.round(Number(payload.metadataConfidence || 0) * 100)}% · ${payload.totalWearEvents || 0} logged wears`,
    ...gaps.map((gap) => `Gap: ${gap}`),
    String(payload.learning || ""),
  ].filter(Boolean).join("\n");
}

function formatPacking(payload: JsonRecord): string {
  const items = Array.isArray(payload.items) ? payload.items as Array<JsonRecord> : [];
  const outfits = Array.isArray(payload.outfits) ? payload.outfits as Array<JsonRecord> : [];
  const checklist = Array.isArray(payload.checklist) ? payload.checklist.map(String) : [];
  const lines = [
    `Pack ${items.length} wardrobe pieces for ${payload.days} ${Number(payload.days) === 1 ? "day" : "days"}:`,
    ...items.map((item) => `• ${item.name}`),
  ];
  if (outfits.length) {
    lines.push("", "Outfit order:");
    outfits.forEach((look, index) => {
      const lookItems = Array.isArray(look.items) ? look.items as Array<JsonRecord> : [];
      lines.push(`${index + 1}. ${lookItems.map((item) => item.name).join(" + ")}`);
    });
  }
  if (checklist.length) lines.push("", ...checklist.map((entry) => `Check: ${entry}`));
  return lines.join("\n");
}

function ordinalIndex(text: string): number {
  const numeric = text.match(/\b(?:outfit|look)\s*(\d{1,2})\b/i) || text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:outfit|look)\b/i);
  if (numeric?.[1]) return Number(numeric[1]);
  if (/\b(?:first|one)\b/i.test(text)) return 1;
  if (/\b(?:second|two)\b/i.test(text)) return 2;
  if (/\b(?:third|three)\b/i.test(text)) return 3;
  return 1;
}

function namedColor(text: string): string {
  const colors: Record<string, string> = {
    black: "#111111", white: "#f5f5f2", gray: "#777777", grey: "#777777",
    red: "#b9313f", pink: "#d985a8", orange: "#d76f32", yellow: "#d8b334",
    green: "#477b55", olive: "#77733b", blue: "#3d6f9e", navy: "#24344f",
    purple: "#74558e", brown: "#76523d", beige: "#c5b79a", cream: "#e8dfc8",
  };
  const match = Object.keys(colors).find((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
  return match ? colors[match] : "#777777";
}

function purchasePart(text: string): string {
  if (/\b(dress|gown)\b/i.test(text)) return "dresses";
  if (/\b(pants|trousers|jeans|skirt|shorts)\b/i.test(text)) return "lowerbody";
  if (/\b(jacket|coat|blazer|cardigan)\b/i.test(text)) return "wholebody_up";
  if (/\b(shoe|sneaker|boot|heel|loafer)\b/i.test(text)) return "shoes";
  if (/\b(bag|belt|hat|scarf|glasses|jewelry|necklace)\b/i.test(text)) return "accessories_up";
  return "upperbody";
}

function formatRotation(payload: JsonRecord): string {
  const schedule = Array.isArray(payload.schedule) ? payload.schedule as Array<JsonRecord> : [];
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.map(String) : [];
  return [
    ...schedule.map((entry) => {
      const items = Array.isArray(entry.items) ? entry.items as Array<JsonRecord> : [];
      return `Day ${entry.day}: ${items.map((item) => item.name).join(" + ")} (${entry.score}/100)`;
    }),
    ...warnings.map((warning) => `Watch: ${warning}`),
  ].join("\n");
}

function formatPurchase(payload: JsonRecord): string {
  const candidate = (payload.candidate || {}) as JsonRecord;
  const nearest = (payload.nearestOwnedPiece || {}) as JsonRecord;
  const nearestItem = (nearest.item || {}) as JsonRecord;
  const reasons = Array.isArray(payload.reasons) ? payload.reasons.map(String) : [];
  return [
    `${String(payload.verdict || "consider").replace("-", " ").toUpperCase()} · leverage ${payload.score}/100`,
    `${candidate.name || "Candidate"}: ${payload.compatibleOwnedPieces ? (payload.compatibleOwnedPieces as unknown[]).length : 0} compatible owned pieces · versatility ${payload.versatility}%`,
    nearestItem.name ? `Closest owned piece: ${nearestItem.name} (${nearest.similarity}% similar in category/color).` : "No same-category owned piece is close enough to flag.",
    ...reasons.map((reason) => `Why: ${reason}`),
  ].join("\n");
}

function statusValue(text: string): string | null {
  if (/\b(laundry|dirty|wash(?:ing)?)\b/i.test(text)) return "laundry";
  if (/\b(clean|ready)\b/i.test(text)) return "clean";
  if (/\b(repair|fix|tailor)\b/i.test(text)) return "repair";
  if (/\b(donate|donation)\b/i.test(text)) return "donate";
  if (/\b(sold)\b/i.test(text)) return "sold";
  if (/\b(pack(?:ed)?)\b/i.test(text)) return "packed";
  return null;
}

function stripActionWords(text: string): string {
  return text
    .replace(/^(?:please\s+)?(?:mark|put|move|set|log|say|tell mel|i)\s+/i, "")
    .replace(/\b(?:as|is|was|to|in|into|needs?|for)\s+(?:the\s+)?(?:laundry|dirty|clean|ready|repair|fixing|donate|donation|sold|packed)\b.*$/i, "")
    .replace(/^(?:wore|wearing|worn)\s+/i, "")
    .replace(/\s+(?:today|tonight|yesterday)[.!]?$/i, "")
    .trim();
}

function isWardrobeContext(text: string, pageId?: string): boolean {
  return pageId === WARDROBE_PAGE_ID
    || /\b(wardrobe|closet|clothes?|outfit|wear|wore|worn|dress|gown|hoodie|sweater|jacket|coat|blazer|cardigan|shirt|tee|top|pants|trousers|jeans|skirt|shorts|shoes?|sneakers?|boots?|heels?|loafers?|bag|belt|scarf|laundry|resale|depop)\b/i.test(text)
    || /\bpack me (?:for|to)\b/i.test(text);
}

export async function runWardrobeCommand(text: string, pageId?: string): Promise<MelToolResult | null> {
  const q = text.trim();
  const low = q.toLowerCase();
  if (!q || !isWardrobeContext(q, pageId)) return null;

  try {
    if (/\b(?:wear|log|choose|pick)\s+(?:the\s+)?(?:first|second|third|\d+(?:st|nd|rd|th)?)?\s*(?:outfit|look)\b/i.test(low)) {
      const index = ordinalIndex(q);
      const payload = await request("/outfit/wear", {
        method: "POST",
        body: JSON.stringify({ index, actor: "mel", idempotencyKey: `wear-look:${new Date().toISOString().slice(0, 10)}:${index}` }),
      });
      const look = (payload.look || {}) as JsonRecord;
      const items = Array.isArray(look.items) ? look.items as Array<JsonRecord> : [];
      return result("wardrobe_wear_look", `${payload.repeated ? "Already logged" : "Logged"} outfit ${index}: ${items.map((item) => item.name).join(" + ")}.`, payload);
    }

    if (/\b(?:liked?|loved?|disliked?|hated?)\s+(?:the\s+)?(?:first|second|third|\d+(?:st|nd|rd|th)?)?\s*(?:outfit|look)\b/i.test(low)) {
      const index = ordinalIndex(q);
      const value = /\b(dislike|disliked|hate|hated)\b/i.test(low) ? "dislike" : "like";
      const payload = await request("/outfit/feedback", { method: "POST", body: JSON.stringify({ index, value, actor: "mel" }) });
      return result("wardrobe_feedback", `${payload.repeated ? "Already learned" : "Learned"}: you ${value === "like" ? "liked" : "did not like"} outfit ${index}. Future rankings will account for those pieces together.`, payload);
    }

    if (/\b(?:what should i wear|pick (?:me )?an outfit|dress me|build (?:me )?(?:an? |\d+ )?(?:look|outfit)|outfit for|give me \d+ (?:looks|outfits))\b/i.test(low)) {
      const payload = await request("/recommend", { method: "POST", body: JSON.stringify(await recommendationRequest(q)) });
      return result("wardrobe_recommend", formatLooks(payload), payload);
    }

    if (/\b(?:wardrobe|closet)\s+(?:health|integrity|diagnostics)|\bcheck (?:my )?(?:wardrobe|closet) system\b/i.test(low)) {
      const payload = await request("/health");
      const failures = Array.isArray(payload.failures) ? payload.failures.map(String) : [];
      return result(
        "wardrobe_health",
        payload.ok
          ? `Wardrobe is healthy. Revision ${payload.revision}; records, operational state, visual fingerprints, and event chain all pass.`
          : `Wardrobe needs attention: ${failures.join(", ")}.`,
        payload,
      );
    }

    if (/\bpack(?: me)?\b/i.test(low) && /\b(?:trip|days?|night|vacation|travel|for|to)\b/i.test(low)) {
      const days = q.match(/\b(\d{1,2})\s*(?:days?|nights?)\b/i);
      const destination = q.match(/\b(?:to|in)\s+([a-z][a-z .'-]{1,50})(?:\s+for\b|[,.!?]|$)/i);
      const payload = await request("/pack", {
        method: "POST",
        body: JSON.stringify({ ...await recommendationRequest(q, false), days: days ? Number(days[1]) : 3, destination: destination?.[1]?.trim() }),
      });
      return result("wardrobe_pack", formatPacking(payload), payload);
    }

    if (/\b(?:plan|rotate|rotation|outfits?)\b/i.test(low) && /\b(?:week|days?)\b/i.test(low)) {
      const days = q.match(/\b(\d{1,2})\s*days?\b/i);
      const payload = await request("/rotation", { method: "POST", body: JSON.stringify({ ...await recommendationRequest(q), days: days ? Number(days[1]) : 7 }) });
      return result("wardrobe_rotation", formatRotation(payload), payload);
    }

    if (/\b(?:laundry plan|what should i wash|what is in (?:my )?laundry|prioritize (?:my )?laundry)\b/i.test(low)) {
      const payload = await request("/laundry");
      const items = Array.isArray(payload.items) ? payload.items as Array<JsonRecord> : [];
      const summary = items.length
        ? [String(payload.summary), ...items.map((entry, index) => {
          const item = (entry.item || {}) as JsonRecord;
          return `${index + 1}. ${item.name} · unlocks ${entry.blockedConnections} connections · ${entry.careNote}`;
        })].join("\n")
        : String(payload.summary);
      return result("wardrobe_laundry", summary, payload);
    }

    if (/\b(?:should i buy|purchase check|buying)\b/i.test(low)) {
      const price = q.match(/\$(\d+(?:\.\d{1,2})?)/);
      const name = q.replace(/^.*?\b(?:buy|buying)\b/i, "").replace(/\bfor\s+\$\d+(?:\.\d{1,2})?.*$/i, "").trim() || "Candidate piece";
      const payload = await request("/purchase-check", {
        method: "POST",
        body: JSON.stringify({ name, part: purchasePart(q), color: namedColor(q), price: price ? Number(price[1]) : null }),
      });
      return result("wardrobe_purchase_check", formatPurchase(payload), payload);
    }

    if (/\b(?:capsule|connectivity|wardrobe graph|closet graph|orphan pieces|most versatile)\b/i.test(low)) {
      const payload = await request("/graph");
      const hubs = Array.isArray(payload.hubs) ? payload.hubs as Array<JsonRecord> : [];
      const orphans = Array.isArray(payload.orphans) ? payload.orphans as Array<JsonRecord> : [];
      const itemName = (entry: JsonRecord) => String(((entry.item || {}) as JsonRecord).name || "piece");
      const summary = [
        `${payload.possiblePairs || 0} compatible owned-item connections.`,
        hubs.length ? `Highest leverage: ${hubs.map((entry) => `${itemName(entry)} (${entry.connections})`).join(" · ")}` : "No hub pieces yet.",
        orphans.length ? `Orphans: ${orphans.map(itemName).join(" · ")}` : "No isolated pieces.",
      ].join("\n");
      return result("wardrobe_graph", summary, payload);
    }

    if (/\b(?:wardrobe|closet)\s+(?:status|overview|audit|analysis)|\b(?:analyze|audit)\s+(?:my\s+)?(?:wardrobe|closet)|\bwhat (?:clothes|pieces) do i (?:own|have)\b/i.test(low)) {
      const payload = await request("/overview");
      return result("wardrobe_overview", formatOverview(payload), payload);
    }

    if (/\bwhat should i sell|\b(?:resale|sell)\s+(?:analysis|candidates|recommendations)|\bwhat (?:clothes|pieces) (?:can|should) i (?:sell|list)\b/i.test(low)) {
      const payload = await request("/resale");
      const candidates = Array.isArray(payload.candidates) ? payload.candidates as Array<JsonRecord> : [];
      const summary = candidates.length
        ? candidates.map((candidate, index) => `${index + 1}. ${((candidate.item || {}) as JsonRecord).name}: ${candidate.reason}${candidate.costPerWear ? ` Cost per wear $${candidate.costPerWear}.` : ""}`).join("\n")
        : String(payload.reason || "Nothing has enough evidence to sell yet.");
      return result("wardrobe_resale", summary, payload);
    }

    const paid = q.match(/\b(?:i paid|cost(?: me)?|set (?:the )?cost(?: of)?)\s*\$?(\d+(?:\.\d{1,2})?)\s+(?:for\s+)?(.+)$/i);
    if (paid?.[1] && paid[2]) {
      const payload = await request("/action", { method: "POST", body: JSON.stringify({ action: "value", value: Number(paid[1]), query: paid[2], actor: "mel" }) });
      const item = (payload.item || {}) as JsonRecord;
      return result("wardrobe_value", `Saved $${Number(paid[1]).toFixed(2)} as the acquisition cost for ${item.name}.`, payload);
    }

    const wore = q.match(/^(?:i\s+)?(?:wore|wearing|worn|log\s+(?:a\s+)?wear(?:\s+for)?)\s+(.+?)(?:\s+(?:today|tonight|yesterday))?[.!]?$/i)
      || q.match(/^mark\s+(.+?)\s+(?:as\s+)?worn(?:\s+(?:today|tonight|yesterday))?[.!]?$/i);
    if (wore) {
      const query = (wore[1] || "").trim();
      const payload = await request("/action", { method: "POST", body: JSON.stringify({ action: "wear", query, actor: "mel", idempotencyKey: `wear:${new Date().toISOString().slice(0, 10)}:${query.toLowerCase()}` }) });
      const item = (payload.item || {}) as JsonRecord;
      const operation = (payload.operation || {}) as JsonRecord;
      return result("wardrobe_wear", `${payload.repeated ? "Already logged" : "Logged"}: ${item.name}, wear ${operation.wearCount}.`, payload);
    }

    const nextStatus = statusValue(q);
    if (nextStatus && /\b(mark|put|move|set|is|dirty|clean|laundry|repair|donate|sold|packed)\b/i.test(low)) {
      const query = stripActionWords(q);
      if (query) {
        const payload = await request("/action", { method: "POST", body: JSON.stringify({ action: "status", value: nextStatus, query, actor: "mel" }) });
        const item = (payload.item || {}) as JsonRecord;
        return result("wardrobe_status", `${item.name} is now ${nextStatus}. Recommendations will ${["laundry", "repair", "donate", "sold"].includes(nextStatus) ? "exclude it" : "treat it as available"}.`, payload);
      }
    }

    if (/^(?:undo|undo that|undo wardrobe(?: action)?|undo the last wardrobe action)[.!]?$/i.test(low)) {
      const payload = await request("/undo", { method: "POST" });
      return result("wardrobe_undo", `Undid the last wardrobe ${payload.undone} action.`, payload);
    }

    const find = q.match(/^(?:find|show me|do i have|where is)\s+(?:my\s+)?(.+)$/i);
    if (find?.[1] && pageId === WARDROBE_PAGE_ID) {
      const payload = await request(`/search?q=${encodeURIComponent(find[1])}`);
      const items = Array.isArray(payload.items) ? payload.items as Array<JsonRecord> : [];
      return result("wardrobe_search", items.length ? items.map((item) => `${item.name} · ${item.status} · ${item.color}`).join("\n") : `No wardrobe item matches ${find[1]}.`, payload);
    }
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Wardrobe could not complete that action.");
  }

  return null;
}
