/**
 * Wonder Library local database.
 * Apple Books metadata is merged into this record without replacing local notes.
 */

export type BookStatus = "reading" | "want" | "finished" | "paused";

export type BuiltInBookCategory =
  | "Autobiography & Memoir"
  | "Physics & Science"
  | "Literature & Fiction"
  | "Technology & Innovation"
  | "Business & Money"
  | "Psychology & Self-Development"
  | "Philosophy & Spirituality"
  | "Music & Culture"
  | "Unsorted";

export type BookCategory = BuiltInBookCategory | `custom:${string}`;

export type BookSource = "manual" | "apple-books" | "wonder-page";

export type BookFormat = "epub" | "audiobook" | "cloud" | "archive" | "manual";
export type ReadingFormat = "digital" | "physical+digital";

export type BookQuote = {
  id: string;
  text: string;
  page?: string;
  note?: string;
  interpretation?: string;
  location?: string;
  source?: "manual" | "apple-books";
  createdAt: number;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  status: BookStatus;
  category: BookCategory;
  source: BookSource;
  sourceId?: string;
  sourceGenre?: string;
  description?: string;
  coverUrl?: string;
  readerUrl?: string;
  externalUrl?: string;
  format?: BookFormat;
  cloudOnly?: boolean;
  chapterCount?: number;
  readingFormat?: ReadingFormat;
  wonderPageId?: string;
  readerCfi?: string;
  smartBookmark?: {
    cfi: string;
    text: string;
    progress: number;
    createdAt: number;
  };
  /** Reader progress from 0 to 1. */
  readerProgress?: number;
  /** Progress reported by Apple Books. */
  appleProgress?: number;
  /** Progress made inside Wonder's EPUB reader. */
  localReaderProgress?: number;
  statusOverride?: boolean;
  categoryOverride?: boolean;
  rating: number;
  pageNow: number;
  pageTotal: number;
  notes: string;
  quotes: BookQuote[];
  color: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: number;
  updatedAt: number;
};

const KEY = "wonder-books-library-v1";
const OPEN_REQUEST_KEY = "wonder-books-open-request-v1";

export const BOOK_OPEN_EVENT = "wonder-books-open";

export type BookOpenRequest = {
  bookId: string;
  startCfi?: string;
  requestedAt: number;
};

const SPINE_COLORS = [
  "#c97b84",
  "#4faf8c",
  "#9b7fd4",
  "#6b9ec4",
  "#c4a06a",
  "#e07a5f",
  "#81b29a",
  "#3d405b",
  "#f2cc8f",
  "#a8dadc",
];

export const CATEGORY_ORDER: BuiltInBookCategory[] = [
  "Autobiography & Memoir",
  "Physics & Science",
  "Literature & Fiction",
  "Technology & Innovation",
  "Business & Money",
  "Psychology & Self-Development",
  "Philosophy & Spirituality",
  "Music & Culture",
  "Unsorted",
];

function uid(): string {
  return `bk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function isMichaelJacksonBook(title: string, author = ""): boolean {
  const identity = `${title} ${author}`.toLowerCase();
  return includesAny(identity, [
    "michael jackson",
    "moonwalk",
    "man in the music",
  ]);
}

export function categorizeBook(
  title: string,
  author = "",
  genre = "",
  description = ""
): BookCategory {
  const value = `${title} ${author} ${genre} ${description}`.toLowerCase();

  if (isMichaelJacksonBook(title, author)) {
    return "Autobiography & Memoir";
  }

  if (
    includesAny(value, [
      "feynman",
      "physics",
      "quantum",
      "biology",
      "chemistry",
      "astronomy",
      "science",
    ])
  ) {
    return "Physics & Science";
  }
  if (
    includesAny(value, [
      "music industry",
      "musician",
    ])
  ) {
    return "Music & Culture";
  }
  if (
    includesAny(value, [
      "elon musk",
      "steve jobs",
      "moonwalk",
      "benjamin franklin",
      "titan",
      "tuesdays with morrie",
      "autobiograph",
      "biograph",
      "memoir",
    ])
  ) {
    return "Autobiography & Memoir";
  }
  if (
    includesAny(value, [
      "1984",
      "fahrenheit 451",
      "to kill a mocking",
      "the stranger",
      "five people you meet in heaven",
      "literature",
      "fiction",
      "novel",
      "prose_",
    ])
  ) {
    return "Literature & Fiction";
  }
  if (
    includesAny(value, [
      "innovator",
      "zero to one",
      "automate the boring stuff",
      "programming",
      "computer",
      "technology",
      "startup",
      "digital revolution",
    ])
  ) {
    return "Technology & Innovation";
  }
  if (
    includesAny(value, [
      "psychology of money",
      "$100m offers",
      "teach you to be rich",
      "talk like ted",
      "influence",
      "business",
      "economics",
      "finance",
      "money",
      "marketing",
    ])
  ) {
    return "Business & Money";
  }
  if (
    includesAny(value, [
      "atomic habits",
      "deep work",
      "psycho-cybernetics",
      "man's search for meaning",
      "psychology",
      "self-help",
      "self development",
      "time management",
      "productivity",
    ])
  ) {
    return "Psychology & Self-Development";
  }
  if (
    includesAny(value, [
      "bhagavad gita",
      "philosophy",
      "spiritual",
      "religion",
      "meditation",
    ])
  ) {
    return "Philosophy & Spirituality";
  }
  return "Unsorted";
}

function seedBooks(): Book[] {
  const now = Date.now();
  return [
    {
      id: uid(),
      title: "The Innovators",
      author: "Walter Isaacson",
      status: "reading",
      category: "Technology & Innovation",
      source: "wonder-page",
      wonderPageId: "pg-book-innovators",
      rating: 0,
      pageNow: 0,
      pageTotal: 560,
      notes: "",
      quotes: [],
      color: SPINE_COLORS[3],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function normalizeStoredBook(value: Partial<Book>, index: number): Book {
  const now = Date.now();
  const title = typeof value.title === "string" ? value.title : "Untitled";
  const author = typeof value.author === "string" ? value.author : "";
  const genre = typeof value.sourceGenre === "string" ? value.sourceGenre : "";
  const description = typeof value.description === "string" ? value.description : "";
  const forcedBiography = isMichaelJacksonBook(title, author);
  const categoryOverride = forcedBiography ? false : Boolean(value.categoryOverride);
  const storedCategory =
    typeof value.category === "string" &&
    (CATEGORY_ORDER.includes(value.category as BuiltInBookCategory) ||
      value.category.startsWith("custom:"))
      ? (value.category as BookCategory)
      : null;
  const category = forcedBiography
    ? "Autobiography & Memoir"
    : value.source === "apple-books" && !categoryOverride
      ? categorizeBook(title, author, genre, description)
      : storedCategory || categorizeBook(title, author, genre, description);
  const legacyProgress = typeof value.readerProgress === "number"
    ? Math.min(1, Math.max(0, value.readerProgress))
    : 0;
  const localReaderProgress = typeof value.localReaderProgress === "number"
    ? Math.min(1, Math.max(0, value.localReaderProgress))
    : value.source === "apple-books" && value.readerCfi
      ? legacyProgress
      : value.source === "apple-books"
        ? 0
        : legacyProgress;
  const appleProgress = typeof value.appleProgress === "number"
    ? Math.min(1, Math.max(0, value.appleProgress))
    : 0;
  const format: BookFormat = ["epub", "audiobook", "cloud", "archive", "manual"].includes(
    value.format || ""
  )
    ? (value.format as BookFormat)
    : value.source === "apple-books"
      ? "epub"
      : "manual";

  return {
    id: typeof value.id === "string" ? value.id : uid(),
    title,
    author,
    status: STATUS_ORDER.includes(value.status as BookStatus)
      ? (value.status as BookStatus)
      : "want",
    category,
    source:
      value.source === "apple-books" || value.source === "wonder-page"
        ? value.source
        : "manual",
    sourceId: value.sourceId,
    sourceGenre: genre || undefined,
    description: description || undefined,
    coverUrl: value.coverUrl,
    readerUrl: value.readerUrl,
    externalUrl: value.externalUrl,
    format,
    cloudOnly: Boolean(value.cloudOnly),
    chapterCount: Math.max(0, Number(value.chapterCount) || 0),
    readingFormat:
      value.readingFormat === "physical+digital" ? "physical+digital" : "digital",
    wonderPageId: value.wonderPageId,
    readerCfi: value.readerCfi,
    smartBookmark:
      value.smartBookmark && typeof value.smartBookmark.cfi === "string"
        ? {
            cfi: value.smartBookmark.cfi,
            text: String(value.smartBookmark.text || ""),
            progress: Math.max(0, Math.min(1, Number(value.smartBookmark.progress) || 0)),
            createdAt: Number(value.smartBookmark.createdAt) || now,
          }
        : undefined,
    readerProgress: Math.max(localReaderProgress, appleProgress),
    appleProgress,
    localReaderProgress,
    statusOverride: Boolean(value.statusOverride),
    categoryOverride,
    rating: Math.min(5, Math.max(0, Number(value.rating) || 0)),
    pageNow: Math.max(0, Number(value.pageNow) || 0),
    pageTotal: Math.max(0, Number(value.pageTotal) || 0),
    notes: typeof value.notes === "string" ? value.notes : "",
    quotes: Array.isArray(value.quotes)
      ? value.quotes
          .filter((quote) => quote && typeof quote.text === "string")
          .map((quote) => {
            const source = quote.source === "apple-books" ? "apple-books" : "manual";
            return {
              id: typeof quote.id === "string" ? quote.id : uid(),
              text: quote.text.trim(),
              page: typeof quote.page === "string" ? quote.page : undefined,
              note:
                source === "apple-books" && typeof quote.note === "string"
                  ? quote.note
                  : undefined,
              interpretation:
                typeof quote.interpretation === "string"
                  ? quote.interpretation
                  : source === "manual" && typeof quote.note === "string"
                    ? quote.note
                    : undefined,
              location: typeof quote.location === "string" ? quote.location : undefined,
              source,
              createdAt: Number(quote.createdAt) || now,
            };
          })
      : [],
    color:
      typeof value.color === "string"
        ? value.color
        : SPINE_COLORS[index % SPINE_COLORS.length],
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    createdAt: Number(value.createdAt) || now,
    updatedAt: Number(value.updatedAt) || now,
  };
}

export function loadBooks(): Book[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw) as Partial<Book>[];
      if (Array.isArray(arr)) return arr.map(normalizeStoredBook).filter(keepBook);
    }
  } catch {
    /* Use the starter shelf when storage is unavailable or malformed. */
  }
  const seed = seedBooks();
  saveBooks(seed);
  return seed;
}

const REMOVED_TITLES = [
  "bhagavad gita",
  "automate the boring stuff with python",
  "five people you meet in heaven",
  "tuesdays with morrie",
  "history of photography",
];

export function keepBook(book: Pick<Book, "title" | "category">): boolean {
  const title = book.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (REMOVED_TITLES.some((removed) => title.includes(removed))) return false;
  if (book.category === "Literature & Fiction" && !title.includes("zero to one")) return false;
  return true;
}

export function saveBooks(books: Book[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(books));
  } catch {
    /* The library remains usable in memory when storage is unavailable. */
  }
}

export function requestBookOpen(book: Book): BookOpenRequest {
  const request: BookOpenRequest = {
    bookId: book.id,
    startCfi: book.smartBookmark?.cfi || book.readerCfi,
    requestedAt: Date.now(),
  };
  try {
    localStorage.setItem(OPEN_REQUEST_KEY, JSON.stringify(request));
  } catch {
    /* The event still opens the book when Bookshelf is already mounted. */
  }
  window.dispatchEvent(new CustomEvent(BOOK_OPEN_EVENT, { detail: request }));
  return request;
}

export function takeBookOpenRequest(): BookOpenRequest | null {
  try {
    const raw = localStorage.getItem(OPEN_REQUEST_KEY);
    localStorage.removeItem(OPEN_REQUEST_KEY);
    if (!raw) return null;
    const request = JSON.parse(raw) as Partial<BookOpenRequest>;
    if (typeof request.bookId !== "string") return null;
    return {
      bookId: request.bookId,
      startCfi: typeof request.startCfi === "string" ? request.startCfi : undefined,
      requestedAt: Number(request.requestedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export function newBook(partial?: Partial<Book>): Book {
  const now = Date.now();
  const color = SPINE_COLORS[Math.floor(Math.random() * SPINE_COLORS.length)];
  const title = partial?.title || "";
  const author = partial?.author || "";
  return {
    id: uid(),
    title,
    author,
    status: "want",
    category: categorizeBook(title, author),
    source: "manual",
    format: "manual",
    readingFormat: "digital",
    appleProgress: 0,
    localReaderProgress: 0,
    statusOverride: Boolean(partial?.status),
    categoryOverride: Boolean(partial?.category),
    rating: 0,
    pageNow: 0,
    pageTotal: 0,
    notes: "",
    quotes: [],
    color,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function newQuote(
  text: string,
  page?: string,
  interpretation?: string,
  location?: string
): BookQuote {
  return {
    id: uid(),
    text: text.trim(),
    page: page?.trim() || undefined,
    interpretation: interpretation?.trim() || undefined,
    location: location?.trim() || undefined,
    source: "manual",
    createdAt: Date.now(),
  };
}

export const STATUS_LABEL: Record<BookStatus, string> = {
  reading: "Reading",
  want: "Want to read",
  finished: "Finished",
  paused: "Paused",
};

export const STATUS_ORDER: BookStatus[] = [
  "reading",
  "want",
  "paused",
  "finished",
];

export { SPINE_COLORS };
