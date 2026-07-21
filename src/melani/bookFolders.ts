import {
  CATEGORY_ORDER,
  type Book,
  type BookCategory,
  type BuiltInBookCategory,
} from "./booksStore";

export type BookFolder = {
  id: BookCategory;
  label: string;
  accent: string;
  builtIn: boolean;
  createdAt: number;
};

const KEY = "wonder-books-folders-v1";

const BUILT_IN_ACCENTS: Record<BuiltInBookCategory, string> = {
  "Autobiography & Memoir": "#e58fa3",
  "Physics & Science": "#72b9d6",
  "Literature & Fiction": "#b89adc",
  "Technology & Innovation": "#65c5a6",
  "Business & Money": "#d6b367",
  "Psychology & Self-Development": "#e59b72",
  "Philosophy & Spirituality": "#8296d8",
  "Music & Culture": "#cf87bd",
  Unsorted: "#8e98a6",
};

const CUSTOM_ACCENTS = [
  "#69c4aa",
  "#e08ca4",
  "#79aee8",
  "#d7b365",
  "#ad94db",
  "#df966f",
  "#76bfc9",
];

function defaultFolders(): BookFolder[] {
  return CATEGORY_ORDER.map((category) => ({
    id: category,
    label: category,
    accent: BUILT_IN_ACCENTS[category],
    builtIn: true,
    createdAt: 0,
  }));
}

function normalizeFolder(value: Partial<BookFolder>): BookFolder | null {
  if (typeof value.id !== "string" || typeof value.label !== "string") return null;
  const label = value.label.trim();
  if (!label) return null;
  return {
    id: value.id as BookCategory,
    label,
    accent: typeof value.accent === "string" ? value.accent : "#8e98a6",
    builtIn: Boolean(value.builtIn),
    createdAt: Number(value.createdAt) || 0,
  };
}

export function loadBookFolders(): BookFolder[] {
  let saved: BookFolder[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as Partial<BookFolder>[];
    if (Array.isArray(parsed)) {
      saved = parsed.map(normalizeFolder).filter((folder): folder is BookFolder => Boolean(folder));
    }
  } catch {
    /* Use the built-in folder set when storage is malformed. */
  }

  const savedById = new Map(saved.map((folder) => [folder.id, folder]));
  const builtIns = defaultFolders().map((folder) => ({
    ...folder,
    ...savedById.get(folder.id),
    id: folder.id,
    builtIn: true,
  }));
  const custom = saved.filter((folder) => folder.id.startsWith("custom:"));
  return [...builtIns, ...custom];
}

export function saveBookFolders(folders: BookFolder[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(folders));
  } catch {
    /* Keep the current in-memory folders when storage is unavailable. */
  }
}

export function createBookFolder(label: string, existing: BookFolder[]): BookFolder | null {
  const cleaned = label.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  if (existing.some((folder) => folder.label.toLowerCase() === cleaned.toLowerCase())) {
    return null;
  }
  const slug = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "folder";
  return {
    id: `custom:${Date.now().toString(36)}-${slug}`,
    label: cleaned,
    accent: CUSTOM_ACCENTS[existing.filter((folder) => !folder.builtIn).length % CUSTOM_ACCENTS.length],
    builtIn: false,
    createdAt: Date.now(),
  };
}

function orphanLabel(id: BookCategory): string {
  return id.startsWith("custom:")
    ? id.slice(7).replace(/^[a-z0-9]+-/, "").replace(/-/g, " ") || "Custom folder"
    : id;
}

export function includeBookFolders(folders: BookFolder[], books: Book[]): BookFolder[] {
  const known = new Set(folders.map((folder) => folder.id));
  const next = [...folders];
  for (const book of books) {
    if (known.has(book.category)) continue;
    next.push({
      id: book.category,
      label: orphanLabel(book.category),
      accent: CUSTOM_ACCENTS[next.length % CUSTOM_ACCENTS.length],
      builtIn: false,
      createdAt: book.createdAt,
    });
    known.add(book.category);
  }
  return next;
}
