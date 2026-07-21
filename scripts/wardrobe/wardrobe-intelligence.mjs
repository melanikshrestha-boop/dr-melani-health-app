import sharp from "sharp";

export const WARDROBE_SCHEMA_VERSION = 3;

const ACTIVE_STATUSES = new Set(["clean", "ready", "worn-once", "packed"]);
const BLOCKED_STATUSES = new Set(["laundry", "repair", "donate", "sold", "archived"]);
const MODES = new Set(["everyday", "stream", "build", "content", "out"]);
const STATEMENT_WORDS = /\b(statement|sequin|metallic|neon|graphic|embellished|sparkle|bold)\b/i;
const COMFORT_WORDS = /\b(soft|relaxed|oversized|cotton|knit|stretch|sweat|hoodie|comfortable)\b/i;
const FORMAL_WORDS = /\b(formal|tailored|silk|satin|blazer|heel|dress|evening)\b/i;
const RAIN_WORDS = /\b(waterproof|water-resistant|rain|rubber|leather|boot)\b/i;
const CAMERA_RISK_WORDS = /\b(tiny stripe|micro stripe|moire|neon|reflective)\b/i;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function cleanHex(value, fallback = "#777777") {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
}

function hexToRgb(value) {
  const hex = cleanHex(value).slice(1);
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHsl({ red, green, blue }) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (!delta) return { hue: 0, saturation: 0, lightness };
  const saturation = delta / (1 - Math.abs((2 * lightness) - 1));
  let hue = max === r
    ? ((g - b) / delta) % 6
    : max === g
      ? ((b - r) / delta) + 2
      : ((r - g) / delta) + 4;
  hue = ((hue * 60) + 360) % 360;
  return { hue, saturation, lightness };
}

function hueDistance(first, second) {
  const distance = Math.abs(first - second);
  return Math.min(distance, 360 - distance);
}

function isNeutral(color) {
  return color.saturation < 0.16 || color.lightness < 0.13 || color.lightness > 0.88;
}

function itemText(item) {
  return `${item.name || ""} ${(item.tags || []).join(" ")}`.trim().toLowerCase();
}

function daysSince(value, now = Date.now()) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 86_400_000) : null;
}

function normalizedMode(value) {
  const mode = String(value || "everyday").toLowerCase();
  return MODES.has(mode) ? mode : "everyday";
}

function partKind(part) {
  if (part === "dresses") return "dress";
  if (part === "upperbody") return "top";
  if (part === "lowerbody") return "bottom";
  if (part === "wholebody_up") return "jacket";
  if (part === "shoes") return "shoes";
  return "accessory";
}

function defaultOperationalState() {
  return {
    status: "clean",
    wearCount: 0,
    lastWornAt: null,
    lastCleanedAt: null,
    acquisitionCost: null,
    acquiredAt: null,
    location: "closet",
    favorite: false,
  };
}

function defaultPreferences() {
  return { items: {}, pairs: {}, looks: {} };
}

function lookKey(items) {
  return items.map((item) => item.id).filter(Boolean).sort().join("|");
}

function pairKey(first, second) {
  return [first, second].sort().join("|");
}

export async function createVisualDescriptor(bytes, metadata = {}) {
  const normalized = sharp(bytes).rotate().ensureAlpha();
  const { data: alphaData, info: alphaInfo } = await normalized
    .clone()
    .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let visible = 0;
  for (let index = 3; index < alphaData.length; index += alphaInfo.channels) {
    if (alphaData[index] > 24) visible += 1;
  }
  const coverage = visible / (alphaInfo.width * alphaInfo.height);

  const { data: hashPixels } = await normalized
    .clone()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(9, 8, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hash = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      hash <<= 1n;
      if (hashPixels[(y * 9) + x] > hashPixels[(y * 9) + x + 1]) hash |= 1n;
    }
  }

  const { data: texturePixels } = await normalized
    .clone()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(32, 32, { fit: "fill" })
    .flatten({ background: cleanHex(metadata.color, "#777777") })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let gradient = 0;
  let comparisons = 0;
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 31; x += 1) {
      gradient += Math.abs(texturePixels[(y * 32) + x] - texturePixels[(y * 32) + x + 1]);
      comparisons += 1;
    }
  }

  return {
    version: 1,
    visualHash: hash.toString(16).padStart(16, "0"),
    silhouetteCoverage: Number(coverage.toFixed(4)),
    textureEnergy: Number(clamp(gradient / Math.max(1, comparisons) / 64).toFixed(4)),
    color: cleanHex(metadata.color),
    part: metadata.part || "upperbody",
  };
}

export function hashSimilarity(first, second) {
  if (!/^[0-9a-f]{16}$/i.test(String(first || "")) || !/^[0-9a-f]{16}$/i.test(String(second || ""))) return 0;
  let value = BigInt(`0x${first}`) ^ BigInt(`0x${second}`);
  let differences = 0;
  while (value) {
    differences += Number(value & 1n);
    value >>= 1n;
  }
  return 1 - (differences / 64);
}

export function colorSimilarity(first, second) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const distance = Math.sqrt(((a.red - b.red) ** 2) + ((a.green - b.green) ** 2) + ((a.blue - b.blue) ** 2));
  return clamp(1 - (distance / 441.7));
}

export function duplicateScore(first, second) {
  if (!first || !second) return 0;
  const category = first.part === second.part ? 1 : 0;
  const silhouette = 1 - Math.min(1, Math.abs(Number(first.silhouetteCoverage || 0) - Number(second.silhouetteCoverage || 0)) / 0.35);
  return Number(((hashSimilarity(first.visualHash, second.visualHash) * 0.58)
    + (colorSimilarity(first.color, second.color) * 0.24)
    + (category * 0.13)
    + (silhouette * 0.05)).toFixed(4));
}

export function buildItemProfile(item, operational = {}) {
  const state = { ...defaultOperationalState(), ...(operational || {}) };
  const color = rgbToHsl(hexToRgb(item.color));
  const text = itemText(item);
  const kind = partKind(item.part);
  const statement = STATEMENT_WORDS.test(text);
  const comfort = COMFORT_WORDS.test(text) || ["top", "bottom"].includes(kind);
  const formal = FORMAL_WORDS.test(text) || kind === "dress";
  const cameraSafe = !CAMERA_RISK_WORDS.test(text) && color.saturation < 0.88 && color.lightness > 0.08 && color.lightness < 0.93;
  const warmthBase = kind === "jacket" ? 0.82 : kind === "bottom" ? 0.48 : kind === "dress" ? 0.42 : kind === "top" ? 0.35 : 0.2;
  const warmth = clamp(warmthBase + (/\b(wool|fleece|puffer|thermal|heavy)\b/i.test(text) ? 0.18 : 0) - (/\b(linen|mesh|sleeveless|short)\b/i.test(text) ? 0.15 : 0));
  const metadataSignals = [item.name, item.part, item.color, item.image, (item.tags || []).length > 0, item.intelligence?.visualHash].filter(Boolean).length;
  return {
    ...item,
    kind,
    operational: state,
    colorProfile: { ...color, neutral: isNeutral(color) },
    traits: {
      statement,
      comfort,
      formal,
      cameraSafe,
      rainSafe: RAIN_WORDS.test(text),
      warmth,
    },
    available: !BLOCKED_STATUSES.has(state.status),
    metadataConfidence: Number((0.46 + (metadataSignals / 6) * 0.48).toFixed(2)),
  };
}

function pairColorScore(first, second) {
  const a = first.colorProfile;
  const b = second.colorProfile;
  if (a.neutral || b.neutral) return 92;
  const distance = hueDistance(a.hue, b.hue);
  if (distance <= 28) return 96 - distance * 0.35;
  if (distance >= 145 && distance <= 215) return 88;
  if (distance <= 62) return 78;
  return 48;
}

function colorCoherence(items) {
  if (items.length < 2) return 92;
  let score = 0;
  let pairs = 0;
  for (let first = 0; first < items.length; first += 1) {
    for (let second = first + 1; second < items.length; second += 1) {
      score += pairColorScore(items[first], items[second]);
      pairs += 1;
    }
  }
  return score / Math.max(1, pairs);
}

function modeScore(items, mode) {
  const statementCount = items.filter((item) => item.traits.statement).length;
  const cameraSafe = items.filter((item) => item.traits.cameraSafe).length / items.length;
  const comfort = items.filter((item) => item.traits.comfort).length / items.length;
  const formal = items.filter((item) => item.traits.formal).length / items.length;
  if (mode === "stream") return (cameraSafe * 78) + (statementCount <= 1 ? 22 : 0);
  if (mode === "build") return (comfort * 76) + (statementCount === 0 ? 24 : 10);
  if (mode === "content") return Math.min(100, 58 + (statementCount === 1 ? 32 : 8) + (cameraSafe * 10));
  if (mode === "out") return Math.min(100, 50 + (formal * 42) + (statementCount <= 1 ? 8 : 0));
  return Math.min(100, 68 + (comfort * 22) + (statementCount <= 1 ? 10 : 0));
}

function weatherScore(items, temperatureF, rain) {
  const averageWarmth = items.reduce((sum, item) => sum + item.traits.warmth, 0) / items.length;
  const desiredWarmth = clamp((72 - temperatureF) / 48 + 0.28);
  const temperatureScore = 100 - Math.abs(averageWarmth - desiredWarmth) * 90;
  const rainScore = rain ? (items.some((item) => item.traits.rainSafe) ? 100 : 54) : 100;
  return (temperatureScore * 0.72) + (rainScore * 0.28);
}

function rotationScore(items, now = Date.now()) {
  return items.reduce((sum, item) => {
    const age = daysSince(item.operational.lastWornAt, now);
    if (age == null) return sum + 86;
    if (age >= 14) return sum + 100;
    return sum + 46 + (age / 14) * 54;
  }, 0) / items.length;
}

function itemCompatibility(item, baseItems) {
  return colorCoherence([...baseItems, item]) + rotationScore([item]) * 0.2 + item.metadataConfidence * 10;
}

function bestOptional(options, baseItems, offset = 0) {
  if (!options.length) return null;
  const sorted = [...options].sort((first, second) => itemCompatibility(second, baseItems) - itemCompatibility(first, baseItems));
  return sorted[offset % sorted.length];
}

function learnedPreferenceScore(items, state = {}) {
  const preferences = { ...defaultPreferences(), ...(state.preferences || {}) };
  const itemSignals = items.map((item) => Number(preferences.items?.[item.id] || 0));
  const pairSignals = [];
  for (let first = 0; first < items.length; first += 1) {
    for (let second = first + 1; second < items.length; second += 1) {
      pairSignals.push(Number(preferences.pairs?.[pairKey(items[first].id, items[second].id)] || 0));
    }
  }
  const signals = [...itemSignals, ...pairSignals];
  if (!signals.length || signals.every((signal) => signal === 0)) return 72;
  const average = signals.reduce((sum, signal) => sum + signal, 0) / signals.length;
  return clamp(72 + (average * 9), 28, 100);
}

function scoreLook(items, context, state = {}) {
  const completeBase = items.some((item) => item.kind === "dress")
    || (items.some((item) => item.kind === "top") && items.some((item) => item.kind === "bottom"));
  const color = colorCoherence(items);
  const mode = modeScore(items, context.mode);
  const weather = weatherScore(items, context.temperatureF, context.rain);
  const rotation = rotationScore(items);
  const preference = learnedPreferenceScore(items, state);
  const availability = items.every((item) => item.available) ? 100 : 0;
  const total = (completeBase ? 20 : 0)
    + (color * 0.20)
    + (mode * 0.18)
    + (weather * 0.16)
    + (rotation * 0.10)
    + (preference * 0.11)
    + (availability * 0.05);
  return {
    total: Math.round(clamp(total / 100) * 100),
    breakdown: {
      composition: completeBase ? 100 : 0,
      color: Math.round(color),
      mode: Math.round(mode),
      weather: Math.round(weather),
      rotation: Math.round(rotation),
      preference: Math.round(preference),
      availability,
    },
  };
}

function explainLook(items, context, score) {
  const reasons = [];
  if (items.some((item) => item.kind === "dress")) reasons.push("The dress is a complete one-piece base, so there is less to coordinate.");
  else reasons.push("The top and bottom form a complete base outfit.");
  if (score.breakdown.color >= 85) reasons.push("The colors are neutral, tonal, analogous, or deliberately complementary.");
  if (context.mode === "stream" && items.every((item) => item.traits.cameraSafe)) reasons.push("The visible pieces avoid the color and micro-pattern risks that commonly fight a camera.");
  if (context.mode === "build") reasons.push("The score favors low-friction, comfortable pieces for a work block.");
  if (context.mode === "content") reasons.push(items.some((item) => item.traits.statement) ? "It keeps one clear statement piece and lets the rest support it." : "It stays visually coherent without competing focal points.");
  if (context.mode === "out") reasons.push("The mix leans toward the more polished pieces in your actual wardrobe.");
  if (score.breakdown.preference >= 84) reasons.push("Your previous outfit feedback favors this combination.");
  if (score.breakdown.preference <= 52) reasons.push("Your prior feedback weakens this combination, so it ranks below better matches.");
  if (context.rain && !items.some((item) => item.traits.rainSafe)) reasons.push("No rain-safe piece is logged, so protect the outfit or add an outer layer manually.");
  const neverWorn = items.filter((item) => !item.operational.lastWornAt);
  if (neverWorn.length) reasons.push(`${neverWorn.map((item) => item.name).join(" and ")} ${neverWorn.length === 1 ? "has" : "have"} no logged wear yet, so the rotation learns from this choice.`);
  return reasons;
}

function publicItem(item) {
  return {
    id: item.id,
    name: item.name,
    part: item.part,
    kind: item.kind,
    color: item.color,
    image: item.image,
    thumbnail: item.thumbnail,
    status: item.operational.status,
  };
}

export function generateOutfits(library, state = {}, request = {}) {
  const context = {
    mode: normalizedMode(request.mode),
    temperatureF: Number.isFinite(Number(request.temperatureF)) ? Number(request.temperatureF) : 70,
    rain: Boolean(request.rain),
    count: Math.max(1, Math.min(12, Math.round(Number(request.count) || 3))),
    destination: String(request.destination || "").trim() || null,
  };
  const profiles = library
    .map((item) => buildItemProfile(item, state.items?.[item.id]))
    .filter((item) => item.available);
  const groups = Object.groupBy
    ? Object.groupBy(profiles, (item) => item.kind)
    : profiles.reduce((result, item) => ({ ...result, [item.kind]: [...(result[item.kind] || []), item] }), {});
  const candidateRank = (item) => (
    (item.metadataConfidence * 18)
    + rotationScore([item])
    + modeScore([item], context.mode)
    + learnedPreferenceScore([item], state)
  );
  const limitGroup = (items) => [...items]
    .sort((first, second) => candidateRank(second) - candidateRank(first) || first.id.localeCompare(second.id))
    .slice(0, 60);
  const tops = limitGroup(groups.top || []);
  const bottoms = limitGroup(groups.bottom || []);
  const dresses = limitGroup(groups.dress || []);
  const baseLooks = [
    ...dresses.map((dress) => [dress]),
    ...tops.flatMap((top) => bottoms.map((bottom) => [top, bottom])),
  ];

  if (!baseLooks.length) {
    const missing = [];
    if (!dresses.length && !tops.length) missing.push("a dress or top");
    if (!dresses.length && !bottoms.length) missing.push("a dress or bottom");
    return {
      generatedAt: new Date().toISOString(),
      context,
      looks: [],
      warnings: [`A complete outfit needs ${missing.join(" and ")}. Import or mark one clean first.`],
      ownedItemCount: library.length,
      availableItemCount: profiles.length,
    };
  }

  const candidates = [];
  const desiredJacket = context.temperatureF < 66 || ["out", "content"].includes(context.mode);
  for (const [index, base] of baseLooks.entries()) {
    const items = [...base];
    const jacket = desiredJacket ? bestOptional(groups.jacket || [], items, index) : null;
    if (jacket) items.push(jacket);
    const shoes = bestOptional(groups.shoes || [], items, index);
    if (shoes) items.push(shoes);
    const accessory = bestOptional(groups.accessory || [], items, index);
    if (accessory && items.filter((item) => item.traits.statement).length < 1) items.push(accessory);
    const unique = [...new Map(items.map((item) => [item.id, item])).values()];
    const score = scoreLook(unique, context, state);
    candidates.push({
      id: `look-${unique.map((item) => item.id).join("-")}`,
      signature: lookKey(unique),
      score: score.total,
      confidence: Number(clamp(unique.reduce((sum, item) => sum + item.metadataConfidence, 0) / unique.length * 0.92).toFixed(2)),
      items: unique.map(publicItem),
      breakdown: score.breakdown,
      reasons: explainLook(unique, context, score),
    });
  }

  const seen = new Set();
  const looks = candidates
    .sort((first, second) => second.score - first.score || first.id.localeCompare(second.id))
    .filter((candidate) => {
      const key = candidate.items.map((item) => item.id).sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, context.count);

  return {
    generatedAt: new Date().toISOString(),
    context,
    looks,
    warnings: context.rain && !(groups.jacket || []).some((item) => item.traits.rainSafe)
      ? ["Rain is in the context, but no rain-safe outer layer is identified in the wardrobe."]
      : [],
    ownedItemCount: library.length,
    availableItemCount: profiles.length,
  };
}

export function buildPackingPlan(library, state = {}, request = {}) {
  const days = Math.max(1, Math.min(21, Math.round(Number(request.days) || 3)));
  const recommendation = generateOutfits(library, state, { ...request, count: Math.min(12, days * 2) });
  const selected = new Map();
  for (const look of recommendation.looks) {
    for (const item of look.items) selected.set(item.id, item);
    if (selected.size >= Math.max(3, Math.ceil(days * 1.8))) break;
  }
  const items = [...selected.values()];
  return {
    generatedAt: new Date().toISOString(),
    days,
    destination: String(request.destination || "").trim() || null,
    items,
    outfits: recommendation.looks.slice(0, days),
    checklist: [
      `${items.length} wardrobe pieces for ${days} ${days === 1 ? "day" : "days"}`,
      "Confirm underwear, socks, sleepwear, toiletries, and chargers separately.",
      recommendation.context.rain ? "Add weather protection." : null,
    ].filter(Boolean),
    warnings: recommendation.warnings,
  };
}

export function buildRotationPlan(library, state = {}, request = {}) {
  const days = Math.max(1, Math.min(14, Math.round(Number(request.days) || 7)));
  const recommendation = generateOutfits(library, state, { ...request, count: 12 });
  if (!recommendation.looks.length) {
    return { generatedAt: new Date().toISOString(), days, schedule: [], warnings: recommendation.warnings };
  }
  const usage = new Map();
  const schedule = [];
  for (let day = 0; day < days; day += 1) {
    const ranked = recommendation.looks
      .map((look) => ({
        look,
        reuse: look.items.reduce((sum, item) => sum + Number(usage.get(item.id) || 0), 0),
      }))
      .sort((first, second) => first.reuse - second.reuse || second.look.score - first.look.score || first.look.id.localeCompare(second.look.id));
    const selected = ranked[0].look;
    for (const item of selected.items) usage.set(item.id, Number(usage.get(item.id) || 0) + 1);
    schedule.push({ day: day + 1, ...selected });
  }
  return {
    generatedAt: new Date().toISOString(),
    days,
    schedule,
    uniqueLooks: new Set(schedule.map((entry) => entry.signature)).size,
    warnings: [
      ...recommendation.warnings,
      recommendation.looks.length < days
        ? `Only ${recommendation.looks.length} complete ${recommendation.looks.length === 1 ? "look is" : "looks are"} available, so repeats are unavoidable.`
        : null,
    ].filter(Boolean),
  };
}

function complementaryKinds(first, second) {
  if (first === "dress" || second === "dress") return [first, second].some((kind) => ["jacket", "shoes", "accessory"].includes(kind));
  if ((first === "top" && second === "bottom") || (first === "bottom" && second === "top")) return true;
  if (["jacket", "shoes", "accessory"].includes(first) && first !== second) return true;
  if (["jacket", "shoes", "accessory"].includes(second) && first !== second) return true;
  return false;
}

export function buildWardrobeGraph(library, state = {}) {
  const profiles = library.map((item) => buildItemProfile(item, state.items?.[item.id]));
  const nodes = profiles.map((item) => {
    const connections = profiles
      .filter((other) => other.id !== item.id && complementaryKinds(item.kind, other.kind))
      .map((other) => ({ id: other.id, score: Math.round(pairColorScore(item, other)) }))
      .filter((edge) => edge.score >= 76)
      .sort((first, second) => second.score - first.score);
    return {
      item: publicItem(item),
      connections: connections.length,
      strongest: connections.slice(0, 5),
      role: connections.length >= 5 ? "hub" : connections.length === 0 ? "orphan" : "support",
    };
  });
  const possiblePairs = nodes.reduce((sum, node) => sum + node.connections, 0) / 2;
  return {
    generatedAt: new Date().toISOString(),
    nodes,
    possiblePairs,
    hubs: nodes.filter((node) => node.role === "hub").sort((first, second) => second.connections - first.connections).slice(0, 8),
    orphans: nodes.filter((node) => node.role === "orphan"),
  };
}

export function buildLaundryPlan(library, state = {}) {
  const graph = buildWardrobeGraph(library, state);
  const connectivity = new Map(graph.nodes.map((node) => [node.item.id, node.connections]));
  const items = library
    .map((item) => buildItemProfile(item, state.items?.[item.id]))
    .filter((item) => item.operational.status === "laundry")
    .map((item) => ({
      item: publicItem(item),
      blockedConnections: Number(connectivity.get(item.id) || 0),
      priority: Math.round((Number(connectivity.get(item.id) || 0) * 10) + (item.operational.favorite ? 25 : 0) + Math.min(25, item.operational.wearCount * 3)),
      careNote: /\b(delicate|silk|satin|wool|cashmere)\b/i.test(itemText(item)) ? "Check the care label before washing." : "Use the garment care label as the source of truth.",
    }))
    .sort((first, second) => second.priority - first.priority || first.item.name.localeCompare(second.item.name));
  return {
    generatedAt: new Date().toISOString(),
    items,
    summary: items.length
      ? `${items.length} ${items.length === 1 ? "piece is" : "pieces are"} blocking ${items.reduce((sum, item) => sum + item.blockedConnections, 0)} compatible wardrobe connections.`
      : "No wardrobe pieces are marked for laundry.",
  };
}

export function analyzePurchaseCandidate(library, state = {}, request = {}) {
  const part = String(request.part || "upperbody");
  const candidate = buildItemProfile({
    id: "candidate",
    name: String(request.name || "Candidate piece").slice(0, 120),
    part,
    color: cleanHex(request.color),
    tags: Array.isArray(request.tags) ? request.tags.map(String) : [],
    image: null,
    intelligence: { visualHash: null },
  });
  const profiles = library.map((item) => buildItemProfile(item, state.items?.[item.id]));
  const comparable = profiles
    .filter((item) => item.kind === candidate.kind)
    .map((item) => ({ item: publicItem(item), similarity: Math.round(colorSimilarity(item.color, candidate.color) * 100) }))
    .sort((first, second) => second.similarity - first.similarity);
  const partners = profiles.filter((item) => complementaryKinds(candidate.kind, item.kind));
  const compatible = partners.filter((item) => pairColorScore(candidate, item) >= 76);
  const overview = buildWardrobeOverview(library, state);
  const fillsGap = (candidate.kind === "top" && !overview.byCategory.top)
    || (candidate.kind === "bottom" && !overview.byCategory.bottom)
    || (candidate.kind === "dress" && !overview.byCategory.dress)
    || (candidate.kind === "shoes" && !overview.byCategory.shoes);
  const redundancy = comparable[0]?.similarity || 0;
  const versatility = partners.length ? Math.round((compatible.length / partners.length) * 100) : 42;
  const score = Math.round(clamp((fillsGap ? 0.34 : 0.12) + (versatility / 100 * 0.43) + ((100 - redundancy) / 100 * 0.23)) * 100);
  const verdict = score >= 76 ? "high-leverage" : score >= 55 ? "consider" : "low-leverage";
  return {
    generatedAt: new Date().toISOString(),
    verdict,
    score,
    candidate: { name: candidate.name, part: candidate.part, kind: candidate.kind, color: candidate.color, price: Number.isFinite(Number(request.price)) ? Number(request.price) : null },
    fillsGap,
    versatility,
    compatibleOwnedPieces: compatible.map(publicItem).slice(0, 12),
    nearestOwnedPiece: comparable[0] || null,
    reasons: [
      fillsGap ? "It fills a structural category gap in the current wardrobe." : "It does not fill a missing base category.",
      `${compatible.length} of ${partners.length} complementary owned pieces clear the compatibility threshold.`,
      redundancy >= 88 ? `It is highly redundant with ${comparable[0].item.name}.` : "No near-color duplicate dominates the same category.",
      "Price is reported separately because value depends on your budget and real wear, not a fabricated luxury score.",
    ],
  };
}

export function buildWardrobeOverview(library, state = {}) {
  const profiles = library.map((item) => buildItemProfile(item, state.items?.[item.id]));
  const byCategory = profiles.reduce((counts, item) => ({ ...counts, [item.kind]: (counts[item.kind] || 0) + 1 }), {});
  const statusCounts = profiles.reduce((counts, item) => ({ ...counts, [item.operational.status]: (counts[item.operational.status] || 0) + 1 }), {});
  const gaps = [];
  if (!(byCategory.dress || byCategory.top)) gaps.push("No dress or top is available as an outfit base.");
  if (!(byCategory.dress || byCategory.bottom)) gaps.push("No dress or bottom is available as an outfit base.");
  if (!byCategory.shoes) gaps.push("No shoes are cataloged, so recommendations cannot finish a full look.");
  const totalWearEvents = profiles.reduce((sum, item) => sum + Number(item.operational.wearCount || 0), 0);
  const costed = profiles.filter((item) => Number(item.operational.acquisitionCost) > 0);
  const wardrobeValue = costed.reduce((sum, item) => sum + Number(item.operational.acquisitionCost), 0);
  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: WARDROBE_SCHEMA_VERSION,
    counts: {
      total: profiles.length,
      available: profiles.filter((item) => item.available).length,
      laundry: statusCounts.laundry || 0,
      repair: statusCounts.repair || 0,
      resale: profiles.filter((item) => item.forSale || item.operational.status === "donate").length,
    },
    byCategory,
    statusCounts,
    totalWearEvents,
    wardrobeValue: Number(wardrobeValue.toFixed(2)),
    costCoverage: profiles.length ? Number((costed.length / profiles.length).toFixed(2)) : 0,
    metadataConfidence: profiles.length
      ? Number((profiles.reduce((sum, item) => sum + item.metadataConfidence, 0) / profiles.length).toFixed(2))
      : 0,
    gaps,
    learning: totalWearEvents < 7
      ? `Log ${7 - totalWearEvents} more ${7 - totalWearEvents === 1 ? "wear" : "wears"} before rotation and resale signals become reliable.`
      : "The wardrobe has enough wear history for personal rotation signals.",
  };
}

export function auditWardrobeIntegrity(library, state = {}, events = []) {
  const ids = library.map((item) => item.id);
  const uniqueIds = new Set(ids);
  const stateIds = Object.keys(state.items || {});
  const sequenced = events.filter((event) => Number.isFinite(Number(event.sequence)));
  const chainBreaks = [];
  for (let index = 1; index < sequenced.length; index += 1) {
    const previous = sequenced[index - 1];
    const current = sequenced[index];
    if (Number(current.sequence) !== Number(previous.sequence) + 1) chainBreaks.push(`sequence ${previous.sequence} to ${current.sequence}`);
    if (current.previousEventId && current.previousEventId !== previous.id) chainBreaks.push(`link before ${current.id}`);
  }
  const checks = {
    uniqueItemIds: { ok: uniqueIds.size === ids.length, value: `${uniqueIds.size}/${ids.length}` },
    operationalCoverage: { ok: ids.every((id) => state.items?.[id]), value: `${ids.filter((id) => state.items?.[id]).length}/${ids.length}` },
    noStaleOperations: { ok: stateIds.every((id) => uniqueIds.has(id)), value: stateIds.filter((id) => !uniqueIds.has(id)).length },
    visualFingerprints: { ok: library.every((item) => item.intelligence?.visualHash), value: `${library.filter((item) => item.intelligence?.visualHash).length}/${library.length}` },
    eventChain: { ok: chainBreaks.length === 0, value: chainBreaks },
  };
  const failures = Object.entries(checks).filter(([, check]) => !check.ok).map(([name]) => name);
  return {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    schemaVersion: WARDROBE_SCHEMA_VERSION,
    revision: Number(state.revision || 0),
    lastEventId: state.lastEventId || null,
    checks,
    failures,
  };
}

export function buildResaleCandidates(library, state = {}) {
  const profiles = library.map((item) => buildItemProfile(item, state.items?.[item.id]));
  const totalWearEvents = profiles.reduce((sum, item) => sum + Number(item.operational.wearCount || 0), 0);
  if (totalWearEvents < 7) {
    return { candidates: [], reason: "Not enough wear history yet. I will not pretend an unworn new import should be sold." };
  }
  const now = Date.now();
  const candidates = profiles
    .filter((item) => !item.operational.favorite && item.operational.status !== "sold")
    .map((item) => {
      const lastWornDays = daysSince(item.operational.lastWornAt, now);
      const acquiredDays = daysSince(item.operational.acquiredAt || item.createdAt, now);
      const score = (lastWornDays == null ? 25 : Math.min(55, lastWornDays / 2))
        + (item.operational.wearCount <= 1 ? 25 : 0)
        + (acquiredDays != null && acquiredDays > 120 ? 20 : 0);
      return {
        item: publicItem(item),
        score: Math.round(score),
        costPerWear: Number(item.operational.acquisitionCost) > 0 && item.operational.wearCount > 0
          ? Number((Number(item.operational.acquisitionCost) / item.operational.wearCount).toFixed(2))
          : null,
        reason: lastWornDays == null ? "No wear is logged despite an established wardrobe history." : `Not worn for ${Math.round(lastWornDays)} days.`,
      };
    })
    .filter((candidate) => candidate.score >= 55)
    .sort((first, second) => second.score - first.score);
  return { candidates, reason: candidates.length ? null : "Nothing has enough evidence to recommend selling yet." };
}

function normalizedWords(value) {
  return String(value || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function itemMatchScore(item, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return 0;
  const title = String(item.name || "").toLowerCase();
  const haystack = `${title} ${item.part || ""} ${(item.tags || []).join(" ")} ${item.color || ""}`.toLowerCase();
  if (title === needle) return 100;
  if (title.includes(needle) || needle.includes(title)) return 92;
  const words = normalizedWords(needle);
  const matching = words.filter((word) => haystack.includes(word)).length;
  return words.length ? Math.round((matching / words.length) * 82) : 0;
}

export function findItem(library, query) {
  return [...library]
    .map((item) => ({ item, score: itemMatchScore(item, query) }))
    .sort((first, second) => second.score - first.score)[0] || null;
}

export function searchWardrobe(library, state = {}, query = "") {
  return library
    .map((item) => ({ profile: buildItemProfile(item, state.items?.[item.id]), score: itemMatchScore(item, query) }))
    .filter((entry) => entry.score >= 40)
    .sort((first, second) => second.score - first.score)
    .slice(0, 20)
    .map(({ profile, score }) => ({ ...publicItem(profile), match: score }));
}

export function defaultWardrobeState() {
  return {
    schemaVersion: WARDROBE_SCHEMA_VERSION,
    revision: 0,
    items: {},
    history: [],
    idempotency: {},
    decisions: { lastRecommendation: null, lastPackingPlan: null },
    preferences: defaultPreferences(),
    lastEventId: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export function ensureWardrobeState(state, library) {
  const base = state && typeof state === "object" ? state : defaultWardrobeState();
  const items = { ...(base.items || {}) };
  for (const item of library) items[item.id] = { ...defaultOperationalState(), ...(items[item.id] || {}) };
  for (const id of Object.keys(items)) {
    if (!library.some((item) => item.id === id)) delete items[id];
  }
  return {
    ...defaultWardrobeState(),
    ...base,
    schemaVersion: WARDROBE_SCHEMA_VERSION,
    items,
    history: Array.isArray(base.history) ? base.history.slice(-250) : [],
    idempotency: base.idempotency && typeof base.idempotency === "object" ? base.idempotency : {},
    decisions: { ...defaultWardrobeState().decisions, ...(base.decisions || {}) },
    preferences: {
      items: { ...(base.preferences?.items || {}) },
      pairs: { ...(base.preferences?.pairs || {}) },
      looks: { ...(base.preferences?.looks || {}) },
    },
  };
}

export function reduceWardrobeEvent(state, event) {
  const next = structuredClone(state);
  const current = next.items[event.itemId];
  const itemEvents = new Set(["wear", "status", "value", "favorite", "location"]);
  if (itemEvents.has(event.type) && !current) throw new Error(`Wardrobe item ${event.itemId} does not exist`);
  if (event.type === "wear") {
    current.wearCount = Number(current.wearCount || 0) + 1;
    current.lastWornAt = event.at;
    current.status = current.status === "clean" ? "worn-once" : current.status;
  } else if (event.type === "status") {
    current.status = event.value;
    if (event.value === "clean") current.lastCleanedAt = event.at;
  } else if (event.type === "value") {
    current.acquisitionCost = event.value;
    if (event.acquiredAt) current.acquiredAt = event.acquiredAt;
  } else if (event.type === "favorite") {
    current.favorite = Boolean(event.value);
  } else if (event.type === "location") {
    current.location = String(event.value || "closet");
  } else if (event.type === "recommendation") {
    next.decisions.lastRecommendation = event.payload;
  } else if (event.type === "packing-plan") {
    next.decisions.lastPackingPlan = event.payload;
  } else if (event.type === "wear-look") {
    for (const itemId of event.itemIds || []) {
      const item = next.items[itemId];
      if (!item) continue;
      item.wearCount = Number(item.wearCount || 0) + 1;
      item.lastWornAt = event.at;
      if (item.status === "clean") item.status = "worn-once";
    }
  } else if (event.type === "outfit-feedback") {
    const previousValue = next.preferences.looks[event.lookId] || null;
    const previousDelta = previousValue === "like" ? 1 : previousValue === "dislike" ? -1 : 0;
    const nextDelta = event.value === "like" ? 1 : -1;
    const delta = nextDelta - previousDelta;
    next.preferences.looks[event.lookId] = event.value;
    for (const itemId of event.itemIds || []) {
      next.preferences.items[itemId] = Number(next.preferences.items[itemId] || 0) + delta;
    }
    for (let first = 0; first < (event.itemIds || []).length; first += 1) {
      for (let second = first + 1; second < event.itemIds.length; second += 1) {
        const key = pairKey(event.itemIds[first], event.itemIds[second]);
        next.preferences.pairs[key] = Number(next.preferences.pairs[key] || 0) + delta;
      }
    }
  } else if (event.type === "undo") {
    if (event.before?.itemId && event.before?.state) next.items[event.before.itemId] = event.before.state;
    if (event.before?.items) {
      for (const [itemId, itemState] of Object.entries(event.before.items)) next.items[itemId] = itemState;
    }
    if (event.before?.preferences) next.preferences = event.before.preferences;
    if (event.targetIdempotencyKey) delete next.idempotency[event.targetIdempotencyKey];
  }
  next.revision = Number.isFinite(Number(event.sequence))
    ? Math.max(Number(next.revision || 0) + 1, Number(event.sequence))
    : Number(next.revision || 0) + 1;
  next.lastEventId = event.id;
  next.updatedAt = event.at;
  next.history = [...(next.history || []), { id: event.id, type: event.type, itemId: event.itemId || null, itemIds: event.itemIds || null, at: event.at }].slice(-250);
  return next;
}

export const wardrobeStatuses = [...ACTIVE_STATUSES, ...BLOCKED_STATUSES];
