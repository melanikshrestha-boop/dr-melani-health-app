import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { segmentFashionImage } from "./local-fashion-segmentation.mjs";
import { createVisualDescriptor } from "./wardrobe-intelligence.mjs";

const root = process.cwd();
const dataDir = path.resolve(root, process.env.WARDROBE_DATA_DIR || "data");
const importedDir = path.join(dataDir, "imported");
const libraryFile = path.join(dataDir, "library.json");
const records = JSON.parse(await readFile(libraryFile, "utf8"));
const requestedId = process.argv[2];
const current = requestedId
  ? records.find((record) => record.id === requestedId)
  : records.find((record) => record.id?.startsWith("import-"));

if (!current) throw new Error("No matching imported wardrobe item was found.");

const assetName = (url) => path.basename(new URL(url, "http://localhost").pathname);
const sourceName = current.sourceImage ? assetName(current.sourceImage) : assetName(current.image);
const sourcePath = path.join(importedDir, sourceName);
const preservedSourceName = `${current.id}-source.png`;
if (!current.sourceImage) await copyFile(sourcePath, path.join(importedDir, preservedSourceName));
const sourceBytes = await readFile(sourcePath);
const segmented = await segmentFashionImage(sourceBytes, {
  root,
  modelRoot: path.join(dataDir, "models"),
  name: current.name,
});
if (!segmented.items.length) throw new Error("No clothing was detected in the imported photo.");

const selected = segmented.items.find((item) => item.metadata.part === current.part) || segmented.items[0];
const version = Date.now();
const garmentName = `${current.id}-garment.png`;
const modeledName = `${current.id}-modeled.png`;
await writeFile(path.join(importedDir, garmentName), selected.garmentBytes);
if (selected.subjectBytes) await writeFile(path.join(importedDir, modeledName), selected.subjectBytes);
const intelligence = await createVisualDescriptor(selected.garmentBytes, selected.metadata);

const updated = {
  ...current,
  ...selected.metadata,
  intelligence,
  image: `/api/import/library/${garmentName}?v=${version}`,
  thumbnail: selected.subjectBytes ? `/api/import/library/${modeledName}?v=${version}` : `/api/import/library/${garmentName}?v=${version}`,
  modeledImage: selected.subjectBytes ? `/api/import/library/${modeledName}?v=${version}` : current.modeledImage,
  subjectCutout: Boolean(selected.subjectBytes),
  sourceImage: current.sourceImage || `/api/import/library/${preservedSourceName}`,
  analysisVersion: 2,
  analysisUpdatedAt: new Date().toISOString(),
  schemaVersion: 3,
  updatedAt: new Date().toISOString(),
};
const next = [...records.filter((record) => record.id !== current.id), updated];
const temporary = `${libraryFile}.reprocess.tmp`;
await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
await rename(temporary, libraryFile);
console.log(JSON.stringify({
  id: updated.id,
  name: updated.name,
  part: updated.part,
  color: updated.color,
  palette: updated.palette,
  labels: segmented.labels,
}, null, 2));
