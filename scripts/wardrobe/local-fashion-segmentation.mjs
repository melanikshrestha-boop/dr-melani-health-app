import path from "node:path";
import { access } from "node:fs/promises";
import sharp from "sharp";

const MODEL_ID = "Xenova/segformer_b0_clothes";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const GARMENT_GROUPS = [
  { id: "dress", labels: ["Dress"], part: "dresses", noun: "Dress" },
  { id: "upper", labels: ["Upper-clothes"], part: "upperbody", noun: "Top" },
  { id: "skirt", labels: ["Skirt"], part: "lowerbody", noun: "Skirt" },
  { id: "pants", labels: ["Pants"], part: "lowerbody", noun: "Pants" },
  { id: "shoes", labels: ["Left-shoe", "Right-shoe"], part: "shoes", noun: "Shoes" },
  { id: "bag", labels: ["Bag"], part: "accessories_up", noun: "Bag" },
  { id: "hat", labels: ["Hat"], part: "accessories_up", noun: "Hat" },
  { id: "scarf", labels: ["Scarf"], part: "accessories_up", noun: "Scarf" },
  { id: "belt", labels: ["Belt"], part: "accessories_up", noun: "Belt" },
  { id: "sunglasses", labels: ["Sunglasses"], part: "accessories_up", noun: "Sunglasses" },
];

let segmenterPromise = null;

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function colorDistance(first, second) {
  return Math.sqrt(
    ((first.red - second.red) ** 2)
    + ((first.green - second.green) ** 2)
    + ((first.blue - second.blue) ** 2),
  );
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

function colorName(color) {
  const { hue, saturation, lightness } = rgbToHsl(color);
  if (lightness < 0.13) return "Black";
  if (lightness > 0.88 && saturation < 0.16) return "White";
  if (saturation < 0.12) return lightness < 0.38 ? "Charcoal" : lightness < 0.72 ? "Gray" : "Silver";
  if (hue < 15 || hue >= 345) return lightness > 0.72 ? "Pink" : "Red";
  if (hue < 42) return lightness < 0.34 ? "Brown" : "Orange";
  if (hue < 72) return saturation < 0.38 ? "Khaki" : lightness < 0.48 ? "Olive" : "Yellow";
  if (hue < 95) return lightness < 0.52 ? "Olive" : "Lime";
  if (hue < 170) return lightness < 0.28 ? "Forest Green" : "Green";
  if (hue < 200) return "Teal";
  if (hue < 255) return lightness < 0.28 ? "Navy" : "Blue";
  if (hue < 290) return "Purple";
  if (hue < 345) return lightness > 0.66 ? "Pink" : "Magenta";
  return "Red";
}

function looksLikeCameraFilename(name) {
  const value = String(name || "").trim();
  return !value || /^(?:_?dsc|img|pxl|photo|image|screenshot|untitled)[-_\s]*\d*/i.test(value);
}

function combineMasks(outputs, labels) {
  const selected = outputs.filter((output) => labels.includes(output.label));
  if (!selected.length) return null;
  const first = selected[0].mask;
  const data = new Uint8Array(first.width * first.height);
  for (const output of selected) {
    if (output.mask.width !== first.width || output.mask.height !== first.height) continue;
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.max(data[index], output.mask.data[index]);
    }
  }
  return { data, width: first.width, height: first.height };
}

function maskCoverage(mask) {
  let count = 0;
  for (const value of mask.data) if (value > 127) count += 1;
  return count / mask.data.length;
}

async function resizeMask(mask, width, height, soften = true) {
  let image = sharp(mask.data, {
    raw: { width: mask.width, height: mask.height, channels: 1 },
  }).resize(width, height, { kernel: "nearest" });
  if (soften) image = image.median(3).blur(0.55);
  const { data } = await image.extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return data;
}

function boundingBoxFromMask(mask) {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < mask.data.length; index += 1) {
    if (mask.data[index] <= 127) continue;
    const x = index % mask.width;
    const y = Math.floor(index / mask.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width: 1000, height: 1000 };
  return {
    x: Math.round((minX / mask.width) * 1000),
    y: Math.round((minY / mask.height) * 1000),
    width: Math.max(1, Math.round(((maxX - minX + 1) / mask.width) * 1000)),
    height: Math.max(1, Math.round(((maxY - minY + 1) / mask.height) * 1000)),
  };
}

async function frameTransparentImage(bytes, canvasSize = 1024, occupancy = 0.88) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    if (data[index + 3] <= 10) continue;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) throw new Error("Fashion segmentation did not leave a visible subject");
  const trimmed = await sharp(data, { raw: info })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer();
  const target = Math.max(1, Math.round(canvasSize * occupancy));
  const resized = await sharp(trimmed)
    .resize(target, target, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });
  return sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: resized.data,
      left: Math.floor((canvasSize - resized.info.width) / 2),
      top: Math.floor((canvasSize - resized.info.height) / 2),
    }])
    .png()
    .toBuffer();
}

async function applyMask(sourceBytes, mask, options = {}) {
  const { data, info } = await sharp(sourceBytes)
    .rotate()
    .toColorspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = await resizeMask(mask, info.width, info.height, options.soften !== false);
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    data[index + 3] = Math.round((data[index + 3] * alpha[pixel]) / 255);
    if (data[index + 3] <= 5) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 0;
    }
  }
  const cutout = await sharp(data, { raw: info }).png().toBuffer();
  return frameTransparentImage(cutout, options.canvasSize || 1024, options.occupancy || 0.88);
}

async function extractPalette(sourceBytes, mask) {
  const { data, info } = await sharp(sourceBytes)
    .rotate()
    .toColorspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const resizedMask = await resizeMask(mask, info.width, info.height, false);
  const buckets = new Map();
  let eligiblePixels = 0;
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    if (resizedMask[pixel] < 180 || data[index + 3] < 180) continue;
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const luminance = ((red * 0.2126) + (green * 0.7152) + (blue * 0.0722)) / 255;
    if (luminance < 0.025 || luminance > 0.985) continue;
    eligiblePixels += 1;
    const key = `${Math.round(red / 20)}-${Math.round(green / 20)}-${Math.round(blue / 20)}`;
    const bucket = buckets.get(key) || { red: 0, green: 0, blue: 0, count: 0 };
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()]
    .map((bucket) => ({
      red: Math.round(bucket.red / bucket.count),
      green: Math.round(bucket.green / bucket.count),
      blue: Math.round(bucket.blue / bucket.count),
      count: bucket.count,
      coverage: eligiblePixels ? bucket.count / eligiblePixels : 0,
    }))
    .sort((first, second) => second.count - first.count);
  const selected = [];
  for (const color of ranked) {
    if (selected.every((existing) => colorDistance(existing, color) > 34)) selected.push(color);
    if (selected.length === 5) break;
  }
  if (!selected.length) selected.push({ red: 154, green: 146, blue: 134, count: 1, coverage: 1 });
  const strongest = selected[0];
  const primary = selected.find((candidate) => {
    const { lightness } = rgbToHsl(candidate);
    return lightness >= 0.18 && lightness <= 0.78 && candidate.count >= strongest.count * 0.18;
  }) || strongest;
  const primaryHsl = rgbToHsl(primary);
  const secondary = selected.filter((candidate) => candidate !== primary).find((candidate) => {
    if (candidate.coverage < 0.12 || colorDistance(primary, candidate) < 58) return false;
    const next = rgbToHsl(candidate);
    const hueDistance = Math.min(Math.abs(primaryHsl.hue - next.hue), 360 - Math.abs(primaryHsl.hue - next.hue));
    return hueDistance > 28 || Math.abs(primaryHsl.saturation - next.saturation) > 0.38;
  });
  return {
    primary: rgbToHex(primary.red, primary.green, primary.blue),
    secondary: secondary ? rgbToHex(secondary.red, secondary.green, secondary.blue) : null,
    colors: [primary, ...selected.filter((candidate) => candidate !== primary)]
      .map((color) => rgbToHex(color.red, color.green, color.blue)),
    primaryName: colorName(primary),
  };
}

async function getSegmenter(root, modelRoot) {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      const localModelPath = modelRoot || path.resolve(root, "data/models");
      let hasLocalModel = false;
      try {
        await access(path.join(localModelPath, MODEL_ID, "onnx/model_quantized.onnx"));
        hasLocalModel = true;
      } catch {
        hasLocalModel = false;
      }
      env.allowLocalModels = true;
      env.allowRemoteModels = !hasLocalModel;
      env.localModelPath = localModelPath;
      env.cacheDir = path.resolve(root, "data/models/.cache");
      return pipeline("image-segmentation", MODEL_ID, { dtype: "q8" });
    })().catch((error) => {
      segmenterPromise = null;
      throw error;
    });
  }
  return segmenterPromise;
}

export async function segmentFashionImage(sourceBytes, options = {}) {
  const segmenter = await getSegmenter(options.root || process.cwd(), options.modelRoot);
  const outputs = await segmenter(new Blob([sourceBytes], { type: "image/png" }));
  const subjectLabels = outputs.filter((output) => output.label !== "Background").map((output) => output.label);
  const subjectMask = combineMasks(outputs, subjectLabels);
  const subjectBytes = subjectMask && maskCoverage(subjectMask) >= 0.003
    ? await applyMask(sourceBytes, subjectMask, { occupancy: 0.92 })
    : null;
  const requestedName = String(options.name || "").trim();
  const items = [];
  for (const group of GARMENT_GROUPS) {
    const mask = combineMasks(outputs, group.labels);
    if (!mask || maskCoverage(mask) < 0.0004) continue;
    const palette = await extractPalette(sourceBytes, mask);
    const generatedName = `${palette.primaryName} ${group.noun}`;
    items.push({
      metadata: {
        name: looksLikeCameraFilename(requestedName) || items.length ? generatedName : requestedName,
        part: group.part,
        color: palette.primary,
        secondaryColor: palette.secondary,
        palette: palette.colors,
        tags: [group.noun.toLowerCase(), "smart cutout"],
        boundingBox: boundingBoxFromMask(mask),
      },
      garmentBytes: await applyMask(sourceBytes, mask),
      subjectBytes,
      coverage: maskCoverage(mask),
      label: group.id,
    });
  }
  return {
    items: items.sort((first, second) => second.coverage - first.coverage),
    labels: outputs.map((output) => output.label),
  };
}

export function isHexColor(value) {
  return typeof value === "string" && HEX_COLOR.test(value);
}
