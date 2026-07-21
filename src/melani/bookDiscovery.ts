const REQUEST_KEY = "wonder-book-discovery-request-v1";

export const BOOK_DISCOVERY_EVENT = "wonder-book-discovery";

export type BookDiscoveryRequest = {
  query: string;
  requestedAt: number;
};

export type BookDiscoveryResult = {
  id: string;
  title: string;
  author: string;
  year: number | null;
  coverUrl: string;
  access: "public" | "borrow" | "catalog";
  catalogUrl: string;
  getCopyUrl: string;
  source: "Open Library";
};

export function requestBookDiscovery(query: string): BookDiscoveryRequest {
  const request = { query: query.trim(), requestedAt: Date.now() };
  try {
    localStorage.setItem(REQUEST_KEY, JSON.stringify(request));
  } catch {
    /* The event still works while Bookshelf is mounted. */
  }
  window.dispatchEvent(new CustomEvent(BOOK_DISCOVERY_EVENT, { detail: request }));
  return request;
}

export function takeBookDiscoveryRequest(): BookDiscoveryRequest | null {
  try {
    const raw = localStorage.getItem(REQUEST_KEY);
    localStorage.removeItem(REQUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookDiscoveryRequest>;
    if (typeof parsed.query !== "string" || !parsed.query.trim()) return null;
    return {
      query: parsed.query.trim(),
      requestedAt: Number(parsed.requestedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export async function searchLegalBooks(query: string): Promise<BookDiscoveryResult[]> {
  const response = await fetch(`/api/book-discovery?q=${encodeURIComponent(query.trim())}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json() as {
    results?: BookDiscoveryResult[];
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error || "Book search is unavailable.");
  return Array.isArray(payload.results) ? payload.results : [];
}
