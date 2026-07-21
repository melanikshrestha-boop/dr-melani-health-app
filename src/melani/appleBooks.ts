import type { Block, Page } from "../types";
import {
  SPINE_COLORS,
  categorizeBook,
  isMichaelJacksonBook,
  newBook,
  keepBook,
  type Book,
  type BookFormat,
  type BookQuote,
  type BookStatus,
} from "./booksStore";

export type AppleBookAnnotation = {
  id: string;
  text: string;
  note: string;
  location: string;
  createdAt: number;
};

export type AppleBookRecord = {
  id: string;
  title: string;
  author: string;
  genre: string;
  description: string;
  progress: number;
  isFinished: boolean;
  readerCfi: string;
  chapterCount: number;
  format: BookFormat;
  cloudOnly: boolean;
  externalUrl: string;
  annotations: AppleBookAnnotation[];
  coverUrl: string;
  readerUrl: string;
};

type AppleBooksResponse = {
  source: string;
  count: number;
  syncedAt: string;
  books: AppleBookRecord[];
};

function normalizedTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function baseTitle(value: string): string {
  return normalizedTitle(value).split(/\b(?:how|the new millennium edition)\b/)[0].trim();
}

function sameBook(a: Pick<Book, "title" | "author">, b: AppleBookRecord): boolean {
  const aTitle = normalizedTitle(a.title);
  const bTitle = normalizedTitle(b.title);
  if (aTitle === bTitle) return true;
  const aBase = baseTitle(a.title);
  const bBase = baseTitle(b.title);
  const authorMatches =
    !a.author ||
    !b.author ||
    normalizedTitle(a.author) === normalizedTitle(b.author) ||
    normalizedTitle(a.author).includes(normalizedTitle(b.author)) ||
    normalizedTitle(b.author).includes(normalizedTitle(a.author));
  return (
    authorMatches &&
    Math.min(aBase.length, bBase.length) >= 8 &&
    (aBase.startsWith(bBase) || bBase.startsWith(aBase))
  );
}

function statusFromProgress(progress: number, isFinished = false): BookStatus {
  if (isFinished || progress >= 0.995) return "finished";
  if (progress > 0) return "reading";
  return "want";
}

function hasPhysicalCopy(title: string): boolean {
  const normalized = normalizedTitle(title);
  return (
    normalized.startsWith("elon musk") ||
    normalized.startsWith("steve jobs") ||
    normalized.startsWith("the innovators")
  );
}

function importedQuotes(item: AppleBookRecord): BookQuote[] {
  return (item.annotations || []).map((annotation) => ({
    id: `apple-${item.id.toLowerCase()}-${annotation.id}`,
    text: annotation.text,
    note: annotation.note || undefined,
    location: annotation.location || undefined,
    source: "apple-books",
    createdAt: annotation.createdAt,
  }));
}

function stableColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return SPINE_COLORS[Math.abs(hash) % SPINE_COLORS.length];
}

export async function fetchAppleBooks(): Promise<AppleBooksResponse> {
  const response = await fetch("/api/apple-books", {
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as AppleBooksResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Apple Books could not be reached.");
  }
  return payload;
}

export function mergeAppleBooks(
  current: Book[],
  incoming: AppleBookRecord[]
): Book[] {
  const next = [...current];
  for (const item of incoming) {
    const incomingCategory = categorizeBook(item.title, item.author, item.genre, item.description);
    if (!keepBook({ title: item.title, category: incomingCategory })) continue;
    const index = next.findIndex(
      (book) => book.sourceId === item.id || sameBook(book, item)
    );
    if (index >= 0) {
      const existing = next[index];
      const forcedBiography = isMichaelJacksonBook(item.title, item.author);
      const localReaderProgress = existing.localReaderProgress || 0;
      const manualQuotes = existing.quotes.filter(
        (quote) => quote.source !== "apple-books"
      );
      const syncedQuotes = importedQuotes(item).map((quote) => ({
        ...quote,
        interpretation: existing.quotes.find((saved) => saved.id === quote.id)
          ?.interpretation,
      }));
      next[index] = {
        ...existing,
        source: "apple-books",
        sourceId: item.id,
        sourceGenre: item.genre || existing.sourceGenre,
        description: item.description || existing.description,
        coverUrl: item.coverUrl,
        readerUrl: item.readerUrl || undefined,
        externalUrl: item.externalUrl || undefined,
        format: item.format,
        cloudOnly: item.cloudOnly,
        chapterCount: item.chapterCount,
        readingFormat: hasPhysicalCopy(item.title)
          ? "physical+digital"
          : "digital",
        appleProgress: item.progress || 0,
        localReaderProgress,
        readerProgress: Math.max(localReaderProgress, item.progress || 0),
        readerCfi:
          localReaderProgress > 0 && existing.readerCfi
            ? existing.readerCfi
            : item.readerCfi || existing.readerCfi,
        status: existing.statusOverride
          ? existing.status
          : statusFromProgress(item.progress, item.isFinished),
        category: forcedBiography
          ? "Autobiography & Memoir"
          : existing.categoryOverride
            ? existing.category
            : categorizeBook(item.title, item.author, item.genre, item.description),
        categoryOverride: forcedBiography ? false : existing.categoryOverride,
        quotes: [...manualQuotes, ...syncedQuotes].sort(
          (a, b) => b.createdAt - a.createdAt
        ),
        author: existing.author || item.author,
        updatedAt: Date.now(),
      };
      continue;
    }

    next.push(
      newBook({
        id: `apple-${item.id.toLowerCase()}`,
        title: item.title,
        author: item.author,
        status: statusFromProgress(item.progress, item.isFinished),
        category: categorizeBook(
          item.title,
          item.author,
          item.genre,
          item.description
        ),
        source: "apple-books",
        sourceId: item.id,
        sourceGenre: item.genre || undefined,
        description: item.description || undefined,
        coverUrl: item.coverUrl,
        readerUrl: item.readerUrl || undefined,
        externalUrl: item.externalUrl || undefined,
        format: item.format,
        cloudOnly: item.cloudOnly,
        chapterCount: item.chapterCount,
        readingFormat: hasPhysicalCopy(item.title)
          ? "physical+digital"
          : "digital",
        readerCfi: item.readerCfi || undefined,
        readerProgress: item.progress || 0,
        appleProgress: item.progress || 0,
        localReaderProgress: 0,
        statusOverride: false,
        categoryOverride: false,
        quotes: importedQuotes(item),
        color: stableColor(item.id),
      })
    );
  }
  return next.filter(keepBook);
}

function blockText(blocks: Block[], depth = 0): string[] {
  const lines: string[] = [];
  for (const block of blocks) {
    const text = block.text?.trim();
    if (text) {
      const prefix = block.type.startsWith("heading") ? `${"#".repeat(Math.min(3, depth + 1))} ` : "";
      lines.push(`${prefix}${text}`);
    }
    if (block.children?.length) lines.push(...blockText(block.children, depth + 1));
  }
  return lines;
}

function descendantsOf(rootId: string, pages: Page[]): Page[] {
  const found: Page[] = [];
  const visit = (parentId: string) => {
    for (const page of pages) {
      if (page.parentId !== parentId || page.trashedAt) continue;
      found.push(page);
      visit(page.id);
    }
  };
  visit(rootId);
  return found;
}

function pageNotes(page: Page, pages: Page[]): string {
  const sections = blockText(page.blocks);
  for (const child of descendantsOf(page.id, pages)) {
    const childLines = blockText(child.blocks);
    if (childLines.length) sections.push(`## ${child.title}`, ...childLines);
  }
  return sections.join("\n\n").trim();
}

export function mergeWonderBookPages(current: Book[], pages: Page[]): Book[] {
  const libraryPages = pages.filter(
    (page) =>
      !page.trashedAt &&
      (page.parentId === "pg-books" || page.parentId === "pg-library")
  );
  if (!libraryPages.length) return current;

  const next = [...current];
  for (const page of libraryPages) {
    const title = page.title.trim() || "Untitled book";
    const notes = pageNotes(page, pages);
    const match = next.findIndex(
      (book) =>
        book.wonderPageId === page.id ||
        normalizedTitle(book.title) === normalizedTitle(title)
    );
    if (match >= 0) {
      const existing = next[match];
      next[match] = {
        ...existing,
        wonderPageId: page.id,
        notes: existing.notes || notes,
        updatedAt: Date.now(),
      };
      continue;
    }

    next.push(
      newBook({
        id: `wonder-${page.id}`,
        title,
        category: categorizeBook(title, "", "", notes),
        source: "wonder-page",
        wonderPageId: page.id,
        notes,
      })
    );
  }
  return next.filter(keepBook);
}
