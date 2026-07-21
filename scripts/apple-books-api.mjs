import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import bplist from "bplist-parser";

const execFileAsync = promisify(execFile);
const DEFAULT_CATALOG = path.join(
  os.homedir(),
  "Library/Containers/com.apple.BKAgentService/Data/Documents/iBooks/Books/Books.plist"
);
const DEFAULT_COVER_ROOT = path.join(
  os.homedir(),
  "Library/Containers/com.apple.iBooksX/Data/Library/Caches/BCCoverCache-1/BICDiskDataStore"
);
const DEFAULT_LIBRARY_DB = path.join(
  os.homedir(),
  "Library/Containers/com.apple.iBooksX/Data/Documents/BKLibrary/BKLibrary-1-091020131601.sqlite"
);
const DEFAULT_CLOUD_DB = path.join(
  os.homedir(),
  "Library/Group Containers/group.com.apple.iBooks/Documents/BCCloudData-BookDataStoreService/BCAssetData/BCAssetData"
);
const DEFAULT_ANNOTATION_DB = path.join(
  os.homedir(),
  "Library/Containers/com.apple.iBooksX/Data/Documents/AEAnnotation/AEAnnotation_v10312011_1727_local.sqlite"
);
const COVER_CACHE = path.join(os.tmpdir(), "wonder-apple-books-covers");

const RECOVERED_BOOKS = {
  D65F4E7AED6C5354D2E759063B9C76AD: {
    title: "The Bhagavad Gita",
    author: "Eknath Easwaran",
    genre: "Philosophy & Spirituality",
    format: "cloud",
    externalUrl: "https://books.apple.com/us/book/the-bhagavad-gita/id457383796",
  },
  BB1813CAFDBAE6C5F90B6364EDE3141D: {
    title: "Jonathan Livingston Seagull",
    author: "Richard Bach",
    genre: "Literature & Fiction",
    format: "archive",
  },
  "1185661123": {
    title: "They Both Die at the End",
    author: "Adam Silvera",
    genre: "Young Adult Fiction",
    format: "cloud",
    externalUrl: "https://books.apple.com/us/book/they-both-die-at-the-end/id1185661123",
  },
};

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ncx": "application/x-dtbncx+xml",
  ".opf": "application/oebps-package+xml",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xhtml": "application/xhtml+xml; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (entity, code) => {
      try { return String.fromCodePoint(Number.parseInt(code, 16)); }
      catch { return entity; }
    })
    .replace(/&#(\d+);/g, (entity, code) => {
      try { return String.fromCodePoint(Number(code)); }
      catch { return entity; }
    })
    .replace(/\s+/g, " ")
    .trim();
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function safeId(value) {
  return typeof value === "string" && /^[A-Z0-9_-]{8,64}$/i.test(value);
}

async function sqliteRows(file, query) {
  const { stdout } = await execFileAsync("/usr/bin/sqlite3", ["-json", file, query], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim() ? JSON.parse(stdout) : [];
}

function coreDataDate(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.round((seconds + 978307200) * 1000)
    : Date.now();
}

async function epubChapterCount(root) {
  try {
    const container = await readFile(path.join(root, "META-INF/container.xml"), "utf8");
    const packagePath = container.match(/full-path=["']([^"']+)["']/i)?.[1];
    if (!packagePath) return 0;
    const packageXml = await readFile(path.join(root, packagePath), "utf8");
    return (packageXml.match(/<itemref\b/gi) || []).length;
  } catch {
    return 0;
  }
}

async function largestFile(files) {
  const candidates = await Promise.all(
    files.map(async (file) => ({ file, size: (await stat(file)).size }))
  );
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0]?.file || null;
}

export function appleBooksApi(options = {}) {
  const catalogPath = options.catalogPath || DEFAULT_CATALOG;
  const coverRoot = options.coverRoot || DEFAULT_COVER_ROOT;
  const libraryDb = options.libraryDb || DEFAULT_LIBRARY_DB;
  const cloudDb = options.cloudDb || DEFAULT_CLOUD_DB;
  const annotationDb = options.annotationDb || DEFAULT_ANNOTATION_DB;
  let catalogSignature = "";
  let publicBooks = [];
  let sourceById = new Map();
  let knownIds = new Set();

  async function loadCatalog() {
    const signatures = await Promise.all(
      [catalogPath, libraryDb, cloudDb, annotationDb].map(async (file) => {
        const fileStat = await stat(file);
        return `${fileStat.mtimeMs}:${fileStat.size}`;
      })
    );
    const nextSignature = signatures.join("|");
    if (nextSignature === catalogSignature && publicBooks.length) {
      return publicBooks;
    }

    const parsed = bplist.parseBuffer(await readFile(catalogPath));
    const rawBooks = parsed?.[0]?.Books;
    if (!Array.isArray(rawBooks)) {
      throw new Error("Apple Books catalog did not contain a Books list.");
    }

    const plistById = new Map(
      rawBooks
        .filter((raw) => safeId(raw?.BKGeneratedItemId))
        .map((raw) => [String(raw.BKGeneratedItemId).toUpperCase(), raw])
    );
    const [libraryRows, cloudRows, annotationRows] = await Promise.all([
      sqliteRows(
        libraryDb,
        `select ZASSETID as id, ZTITLE as title, ZAUTHOR as author, ZGENRE as genre,
          ZCONTENTTYPE as contentType, ZISFINISHED as isFinished,
          ZREADINGPROGRESS as progress, ZBOOKHIGHWATERMARKPROGRESS as highWatermark,
          ZPATH as sourcePath, ZURL as externalUrl
        from ZBKLIBRARYASSET
        where coalesce(ZISHIDDEN, 0) = 0
        order by lower(ZTITLE)`
      ),
      sqliteRows(
        cloudDb,
        `select ZASSETID as id, ZISFINISHED as isFinished,
          ZREADINGPROGRESS as progress,
          ZREADINGPROGRESSHIGHWATERMARK as highWatermark,
          ZREADINGPOSITIONCFISTRING as readerCfi
        from ZBCASSETDETAIL
        where coalesce(ZDELETEDFLAG, 0) = 0`
      ),
      sqliteRows(
        annotationDb,
        `select cast(Z_PK as text) as id, ZANNOTATIONASSETID as assetId,
          ZANNOTATIONSELECTEDTEXT as text, ZANNOTATIONNOTE as note,
          ZANNOTATIONLOCATION as location,
          ZANNOTATIONCREATIONDATE as createdAt
        from ZAEANNOTATION
        where coalesce(ZANNOTATIONDELETED, 0) = 0
          and length(coalesce(ZANNOTATIONASSETID, '')) > 0
          and (length(coalesce(ZANNOTATIONSELECTEDTEXT, '')) > 0
            or length(coalesce(ZANNOTATIONNOTE, '')) > 0)`
      ),
    ]);

    const cloudById = new Map(
      cloudRows
        .filter((row) => safeId(String(row.id || "")))
        .map((row) => [String(row.id).toUpperCase(), row])
    );
    const annotationsById = new Map();
    for (const row of annotationRows) {
      const assetId = String(row.assetId || "").toUpperCase();
      if (!safeId(assetId)) continue;
      const text = cleanText(row.text || "");
      const note = cleanText(row.note || "");
      if (!text && !note) continue;
      const list = annotationsById.get(assetId) || [];
      list.push({
        id: String(row.id),
        text: text || note,
        note: text && note ? note : "",
        location: String(row.location || ""),
        createdAt: coreDataDate(row.createdAt),
      });
      annotationsById.set(assetId, list);
    }

    const rowsById = new Map();
    for (const row of libraryRows) {
      const id = String(row.id || "").toUpperCase();
      if (!safeId(id) || Number(row.contentType) === 5) continue;
      rowsById.set(id, row);
    }
    // Downloaded books can briefly disappear from BKLibrary during an Apple sync.
    // The Books plist remains authoritative for local EPUBs in that window.
    for (const id of plistById.keys()) {
      if (!rowsById.has(id)) rowsById.set(id, { id });
    }
    for (const id of [...cloudById.keys(), ...annotationsById.keys()]) {
      if (!rowsById.has(id) && RECOVERED_BOOKS[id]) {
        rowsById.set(id, { id, ...RECOVERED_BOOKS[id] });
      }
    }

    const nextSources = new Map();
    const nextBooks = [];
    for (const [id, row] of rowsById) {
      const raw = plistById.get(id) || {};
      const cloud = cloudById.get(id) || {};
      const sourcePath = row.sourcePath || raw.path || raw.sourcePath;
      let sourceRoot = null;
      if (typeof sourcePath === "string") {
        try {
          const sourceStat = await stat(sourcePath);
          if (sourceStat.isDirectory()) sourceRoot = await realpath(sourcePath);
        } catch {
          sourceRoot = null;
        }
      }
      if (sourceRoot) nextSources.set(id, sourceRoot);

      const format = row.format || (Number(row.contentType) === 6 ? "audiobook" : sourceRoot ? "epub" : "cloud");
      const progressValues = [
        Number(row.progress),
        Number(row.highWatermark),
        Number(cloud.progress),
        Number(cloud.highWatermark),
      ].filter(Number.isFinite);
      const progress = progressValues.length
        ? Math.min(1, Math.max(0, ...progressValues))
        : 0;
      const title = String(row.title || raw.itemName || raw.BKDisplayName || "Untitled").replace(/\s+-0$/, "");
      const author = String(row.author || raw.artistName || "");
      const genre = String(row.genre || raw.genre || "");
      const externalUrl = String(row.externalUrl || "");
      nextBooks.push({
        id,
        title,
        author,
        genre,
        description: cleanText(raw.bookDescription).slice(0, 1800),
        progress,
        isFinished: Boolean(Number(row.isFinished) || Number(cloud.isFinished)),
        readerCfi: String(cloud.readerCfi || ""),
        chapterCount: sourceRoot ? await epubChapterCount(sourceRoot) : 0,
        format,
        cloudOnly: !sourceRoot,
        externalUrl: externalUrl || RECOVERED_BOOKS[id]?.externalUrl || "",
        annotations: annotationsById.get(id) || [],
        coverUrl: `/api/apple-books/${id}/cover`,
        readerUrl: sourceRoot ? `/api/apple-books/${id}/content/` : "",
      });
    }

    publicBooks = nextBooks.sort((a, b) => a.title.localeCompare(b.title));
    sourceById = nextSources;
    knownIds = new Set(nextBooks.map((book) => book.id));
    catalogSignature = nextSignature;
    return publicBooks;
  }

  async function coverFor(id) {
    const output = path.join(COVER_CACHE, `${id}.jpg`);
    try {
      if ((await stat(output)).isFile()) return output;
    } catch {
      /* Convert and cache below. */
    }

    const directory = path.join(coverRoot, id);
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return null;
    }
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(directory, entry.name));
    const direct = await largestFile(
      files.filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
    );
    if (direct) return direct;

    const heic = await largestFile(files.filter((file) => /\.heic$/i.test(file)));
    if (!heic) return null;
    await mkdir(COVER_CACHE, { recursive: true });
    await execFileAsync("/usr/bin/sips", ["-s", "format", "jpeg", heic, "--out", output]);
    return output;
  }

  async function serveFile(res, file, cacheControl) {
    const fileStat = await stat(file);
    if (!fileStat.isFile()) return false;
    res.statusCode = 200;
    res.setHeader(
      "Content-Type",
      MIME[path.extname(file).toLowerCase()] || "application/octet-stream"
    );
    res.setHeader("Content-Length", fileStat.size);
    res.setHeader("Cache-Control", cacheControl);
    createReadStream(file).pipe(res);
    return true;
  }

  async function handle(req, res, next) {
    const url = new URL(req.url || "/", "http://wonder.local");
    if (!url.pathname.startsWith("/api/apple-books")) return next();
    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    try {
      const books = await loadCatalog();
      if (url.pathname === "/api/apple-books") {
        return sendJson(res, 200, {
          source: "Apple Books",
          count: books.length,
          syncedAt: new Date().toISOString(),
          books,
        });
      }

      const coverMatch = url.pathname.match(
        /^\/api\/apple-books\/([A-Z0-9_-]+)\/cover$/i
      );
      if (coverMatch && safeId(coverMatch[1])) {
        const id = coverMatch[1].toUpperCase();
        if (!knownIds.has(id)) return sendJson(res, 404, { error: "Book not found" });
        const cover = await coverFor(id);
        if (!cover) return sendJson(res, 404, { error: "Cover not available" });
        await serveFile(res, cover, "private, max-age=86400");
        return;
      }

      const contentMatch = url.pathname.match(
        /^\/api\/apple-books\/([A-Z0-9_-]+)\/content\/(.*)$/i
      );
      if (contentMatch && safeId(contentMatch[1])) {
        const id = contentMatch[1].toUpperCase();
        const root = sourceById.get(id);
        if (!root) return sendJson(res, 404, { error: "Book not found" });
        let relative;
        try {
          relative = decodeURIComponent(contentMatch[2] || "");
        } catch {
          return sendJson(res, 400, { error: "Invalid book path" });
        }
        const requested = path.resolve(root, relative);
        if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) {
          return sendJson(res, 403, { error: "Invalid book path" });
        }
        let file;
        try {
          file = await realpath(requested);
        } catch {
          return sendJson(res, 404, { error: "Book file not found" });
        }
        if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
          return sendJson(res, 403, { error: "Invalid book path" });
        }
        if (!relative || !(await serveFile(res, file, "private, max-age=3600"))) {
          return sendJson(res, 404, { error: "Book file not found" });
        }
        return;
      }

      return sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Apple Books unavailable";
      return sendJson(res, 503, { error: message });
    }
  }

  const attach = (server) => {
    server.middlewares.use(handle);
  };

  return {
    name: "wonder-apple-books-api",
    apply: "serve",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
