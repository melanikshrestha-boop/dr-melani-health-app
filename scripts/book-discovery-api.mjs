const SEARCH_FIELDS = [
  "key",
  "title",
  "author_name",
  "first_publish_year",
  "cover_i",
  "ebook_access",
  "public_scan_b",
  "ia",
].join(",");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function normalizeResult(doc) {
  const access =
    doc.ebook_access === "public" || doc.public_scan_b
      ? "public"
      : doc.ebook_access === "borrowable"
        ? "borrow"
        : "catalog";
  const archiveId = Array.isArray(doc.ia) ? doc.ia[0] : "";
  return {
    id: String(doc.key || doc.title || ""),
    title: String(doc.title || "Untitled"),
    author: Array.isArray(doc.author_name) ? doc.author_name.join(", ") : "",
    year: Number(doc.first_publish_year) || null,
    coverUrl: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : "",
    access,
    catalogUrl: doc.key ? `https://openlibrary.org${doc.key}` : "https://openlibrary.org",
    getCopyUrl:
      access === "public" && archiveId
        ? `https://archive.org/details/${encodeURIComponent(archiveId)}`
        : doc.key
          ? `https://openlibrary.org${doc.key}`
          : "https://openlibrary.org",
    source: "Open Library",
  };
}

export function bookDiscoveryApi() {
  return {
    name: "wonder-book-discovery-api",
    configureServer(server) {
      server.middlewares.use("/api/book-discovery", async (req, res) => {
        if (req.method !== "GET") {
          json(res, 405, { error: "Method not allowed" });
          return;
        }
        const url = new URL(req.url || "/", "http://localhost");
        const query = (url.searchParams.get("q") || "").trim();
        if (!query) {
          json(res, 400, { error: "A book title is required." });
          return;
        }

        try {
          const target = new URL("https://openlibrary.org/search.json");
          target.searchParams.set("q", query);
          target.searchParams.set("fields", SEARCH_FIELDS);
          target.searchParams.set("limit", "10");
          const response = await fetch(target, {
            headers: {
              Accept: "application/json",
              "User-Agent": "WonderBookshelf/1.0 (personal reading assistant)",
            },
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) throw new Error(`Open Library returned ${response.status}`);
          const payload = await response.json();
          const results = Array.isArray(payload.docs)
            ? payload.docs.map(normalizeResult).filter((book) => book.id).slice(0, 8)
            : [];
          json(res, 200, { query, results, source: "Open Library" });
        } catch (error) {
          json(res, 502, {
            error: error instanceof Error ? error.message : "Book search is unavailable.",
          });
        }
      });
    },
  };
}
