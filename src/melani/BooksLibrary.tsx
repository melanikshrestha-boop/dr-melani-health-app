/** Wonder Library: Apple Books, Wonder reading pages, progress, notes, and quotes. */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  BookOpen,
  CaretRight,
  Check,
  DownloadSimple,
  FolderPlus,
  FolderSimple,
  MagnifyingGlass,
  NotePencil,
  PencilSimple,
  Plus,
  Quotes,
  X,
} from "@phosphor-icons/react";
import { MinimalIcon } from "../components/MinimalIcon";
import type { Page } from "../types";
import {
  fetchAppleBooks,
  mergeAppleBooks,
  mergeWonderBookPages,
} from "./appleBooks";
import {
  BOOK_OPEN_EVENT,
  type Book,
  type BookCategory,
  type BookQuote,
  type BookStatus,
  STATUS_LABEL,
  STATUS_ORDER,
  categorizeBook,
  loadBooks,
  newBook,
  newQuote,
  saveBooks,
  takeBookOpenRequest,
  type BookOpenRequest,
} from "./booksStore";
import {
  createBookFolder,
  includeBookFolders,
  loadBookFolders,
  saveBookFolders,
  type BookFolder,
} from "./bookFolders";
import {
  BOOK_DISCOVERY_EVENT,
  searchLegalBooks,
  takeBookDiscoveryRequest,
  type BookDiscoveryRequest,
  type BookDiscoveryResult,
} from "./bookDiscovery";
import "./books-library.css";

const BookReader = lazy(async () => {
  const module = await import("./BookReader");
  return { default: module.BookReader };
});

type Filter = "all" | BookStatus;
type GroupMode = "subjects" | "status";
type ShelfGroup = {
  id: string;
  label: string;
  books: Book[];
  accent: string;
  canRename: boolean;
  custom: boolean;
};
type SyncState =
  | { state: "idle"; message: string }
  | { state: "syncing"; message: string }
  | { state: "done"; message: string }
  | { state: "error"; message: string };
type FinderState = "idle" | "searching" | "done" | "error";

function stars(n: number): string {
  if (n <= 0) return "";
  return "★".repeat(Math.min(5, n));
}

function progressPercent(progress: number): string {
  const percent = Math.max(0, Math.min(100, progress * 100));
  return percent > 0 && percent < 1 ? percent.toFixed(1) : String(Math.round(percent));
}

type FolderTone = CSSProperties & {
  "--bl-folder-accent": string;
  "--bl-folder-wash": string;
};

const STATUS_TONES: Record<BookStatus, string> = {
  reading: "#72b9d6",
  want: "#b89adc",
  paused: "#d6b367",
  finished: "#65c5a6",
};

function folderTone(accent: string): FolderTone {
  const normalized = /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#8e98a6";
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return {
    "--bl-folder-accent": normalized,
    "--bl-folder-wash": `rgba(${red}, ${green}, ${blue}, 0.09)`,
  };
}

export function isBooksPage(pageId: string): boolean {
  return pageId === "pg-books" || pageId === "pg-library";
}

export function BooksLibrary({
  onGo,
  workspacePages = [],
}: {
  onGo?: (id: string) => void;
  workspacePages?: Page[];
}) {
  const [books, setBooks] = useState<Book[]>(() => loadBooks());
  const [folders, setFolders] = useState<BookFolder[]>(() =>
    includeBookFolders(loadBookFolders(), loadBooks())
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [groupMode, setGroupMode] = useState<GroupMode>("subjects");
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [readerId, setReaderId] = useState<string | null>(null);
  const [readerStartCfi, setReaderStartCfi] = useState<string | undefined>();
  const [showAllHighlights, setShowAllHighlights] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderNameDraft, setFolderNameDraft] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameDraft, setFolderRenameDraft] = useState("");
  const [draggingBookId, setDraggingBookId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [finderOpen, setFinderOpen] = useState(false);
  const [finderQuery, setFinderQuery] = useState("");
  const [finderState, setFinderState] = useState<FinderState>("idle");
  const [finderMessage, setFinderMessage] = useState("");
  const [finderResults, setFinderResults] = useState<BookDiscoveryResult[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAuthor, setDraftAuthor] = useState("");
  const [draftCategory, setDraftCategory] = useState<BookCategory>("Unsorted");
  const [quoteDraft, setQuoteDraft] = useState("");
  const [quotePage, setQuotePage] = useState("");
  const [quoteNoteDraft, setQuoteNoteDraft] = useState("");
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [interpretationDraft, setInterpretationDraft] = useState("");
  const [sync, setSync] = useState<SyncState>({
    state: "idle",
    message: "Apple Books",
  });

  useEffect(() => {
    saveBooks(books);
  }, [books]);

  useEffect(() => {
    saveBookFolders(folders);
  }, [folders]);

  useEffect(() => {
    setFolders((current) => includeBookFolders(current, books));
  }, [books]);

  useEffect(() => {
    setShowAllHighlights(false);
  }, [openId]);

  useEffect(() => {
    if (!workspacePages.length) return;
    setBooks((current) => mergeWonderBookPages(current, workspacePages));
  }, [workspacePages]);

  const syncApple = useCallback(async () => {
    setSync({ state: "syncing", message: "Syncing Apple Books" });
    try {
      const result = await fetchAppleBooks();
      setBooks((current) => mergeAppleBooks(current, result.books));
      setSync({
        state: "done",
        message: `${result.count} from Apple Books`,
      });
    } catch (error) {
      setSync({
        state: "error",
        message:
          error instanceof Error ? error.message : "Apple Books unavailable",
      });
    }
  }, []);

  useEffect(() => {
    void syncApple();
  }, [syncApple]);

  const runFinderSearch = useCallback(async (query: string) => {
    const cleaned = query.trim();
    if (!cleaned) return;
    setFinderOpen(true);
    setFinderQuery(cleaned);
    setFinderState("searching");
    setFinderMessage("Searching legal catalogs...");
    try {
      const results = await searchLegalBooks(cleaned);
      setFinderResults(results);
      setFinderState("done");
      setFinderMessage(
        results.length
          ? `${results.length} legal sources found`
          : "No catalog match found"
      );
    } catch (error) {
      setFinderResults([]);
      setFinderState("error");
      setFinderMessage(
        error instanceof Error ? error.message : "Book search is unavailable."
      );
    }
  }, []);

  useEffect(() => {
    const openFinder = (request: BookDiscoveryRequest | null) => {
      if (!request) return;
      void runFinderSearch(request.query);
    };
    const onRequest = (event: Event) => {
      takeBookDiscoveryRequest();
      openFinder((event as CustomEvent<BookDiscoveryRequest>).detail);
    };
    window.addEventListener(BOOK_DISCOVERY_EVENT, onRequest);
    openFinder(takeBookDiscoveryRequest());
    return () => window.removeEventListener(BOOK_DISCOVERY_EVENT, onRequest);
  }, [runFinderSearch]);

  const open = books.find((book) => book.id === openId) || null;
  const reader = books.find((book) => book.id === readerId) || null;

  useEffect(() => {
    const openRequestedBook = (request: BookOpenRequest | null) => {
      if (!request) return;
      const requested = books.find((book) => book.id === request.bookId);
      if (!requested) return;
      setOpenId(null);
      if (requested.readerUrl) {
        setReaderStartCfi(request.startCfi);
        setReaderId(requested.id);
      } else {
        setReaderId(null);
        setReaderStartCfi(undefined);
        setOpenId(requested.id);
      }
    };
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<BookOpenRequest>).detail;
      takeBookOpenRequest();
      openRequestedBook(detail);
    };
    window.addEventListener(BOOK_OPEN_EVENT, onRequest);
    openRequestedBook(takeBookOpenRequest());
    return () => window.removeEventListener(BOOK_OPEN_EVENT, onRequest);
  }, [books]);

  const stats = useMemo(
    () => ({
      total: books.length,
      reading: books.filter((book) => book.status === "reading").length,
      finished: books.filter((book) => book.status === "finished").length,
      quotes: books.reduce((count, book) => count + book.quotes.length, 0),
    }),
    [books]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return books.filter((book) => {
      if (filter !== "all" && book.status !== filter) return false;
      if (!query) return true;
      return [
        book.title,
        book.author,
        book.category,
        book.notes,
        book.description || "",
        ...book.quotes.flatMap((quote) => [
          quote.text,
          quote.note || "",
          quote.interpretation || "",
        ]),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [books, filter, q]);

  const groups = useMemo<ShelfGroup[]>(() => {
    if (groupMode === "subjects") {
      return folders
        .map((folder) => ({
          id: folder.id,
          label: folder.label,
          books: filtered.filter((book) => book.category === folder.id),
          accent: folder.accent,
          canRename: true,
          custom: !folder.builtIn,
        }))
        .filter((group) =>
          group.books.length > 0 ||
          (group.custom && filter === "all" && !q.trim())
        );
    }
    return STATUS_ORDER.map((status) => ({
      id: status,
      label: STATUS_LABEL[status],
      books: filtered.filter((book) => book.status === status),
      accent: STATUS_TONES[status],
      canRename: false,
      custom: false,
    })).filter((group) => group.books.length);
  }, [filter, filtered, folders, groupMode, q]);

  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders]
  );

  function patchBook(id: string, patch: Partial<Book>) {
    setBooks((current) =>
      current.map((book) =>
        book.id === id ? { ...book, ...patch, updatedAt: Date.now() } : book
      )
    );
  }

  function addBook() {
    const title = draftTitle.trim();
    if (!title) return;
    const book = newBook({
      title,
      author: draftAuthor.trim(),
      category: draftCategory,
      status: "want",
    });
    setBooks((current) => [book, ...current]);
    setDraftTitle("");
    setDraftAuthor("");
    setDraftCategory("Unsorted");
    setAdding(false);
    setOpenId(book.id);
  }

  function addDiscoveredBook(found: BookDiscoveryResult) {
    const normalizedTitle = found.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const existing = books.find(
      (book) =>
        book.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === normalizedTitle
    );
    if (existing) {
      setOpenId(existing.id);
      return;
    }
    const category = categorizeBook(found.title, found.author);
    const book = newBook({
      title: found.title,
      author: found.author,
      category,
      categoryOverride: false,
      status: "want",
      statusOverride: true,
      coverUrl: found.coverUrl || undefined,
      externalUrl: found.catalogUrl,
      source: "manual",
    });
    setBooks((current) => [book, ...current]);
    setOpenFolders((current) => ({ ...current, [category]: true }));
  }

  function addFolder() {
    const folder = createBookFolder(folderNameDraft, folders);
    if (!folder) return;
    setFolders((current) => [...current, folder]);
    setFolderNameDraft("");
    setAddingFolder(false);
    setOpenFolders((current) => ({ ...current, [folder.id]: true }));
  }

  function beginRenameFolder(folder: ShelfGroup) {
    setRenamingFolderId(folder.id);
    setFolderRenameDraft(folder.label);
  }

  function saveFolderName() {
    if (!renamingFolderId) return;
    const label = folderRenameDraft.trim().replace(/\s+/g, " ");
    if (!label) return;
    const duplicate = folders.some(
      (folder) =>
        folder.id !== renamingFolderId &&
        folder.label.toLowerCase() === label.toLowerCase()
    );
    if (duplicate) return;
    setFolders((current) =>
      current.map((folder) =>
        folder.id === renamingFolderId ? { ...folder, label } : folder
      )
    );
    setRenamingFolderId(null);
    setFolderRenameDraft("");
  }

  function moveBookToFolder(bookId: string, folderId: string) {
    setBooks((current) =>
      current.map((book) =>
        book.id === bookId
          ? {
              ...book,
              category: folderId as BookCategory,
              categoryOverride: true,
              updatedAt: Date.now(),
            }
          : book
      )
    );
    setOpenFolders((current) => ({ ...current, [folderId]: true }));
    setDraggingBookId(null);
    setDropFolderId(null);
  }

  function removeBook(id: string) {
    if (!window.confirm("Remove this book from your local Wonder library?")) return;
    setBooks((current) => current.filter((book) => book.id !== id));
    setOpenId(null);
  }

  function addQuote() {
    if (!open || !quoteDraft.trim()) return;
    patchBook(open.id, {
      quotes: [newQuote(quoteDraft, quotePage, quoteNoteDraft), ...open.quotes],
    });
    setQuoteDraft("");
    setQuotePage("");
    setQuoteNoteDraft("");
  }

  function startInterpretation(quote: BookQuote) {
    setEditingQuoteId(quote.id);
    setInterpretationDraft(quote.interpretation || "");
  }

  function saveInterpretation() {
    if (!open || !editingQuoteId) return;
    patchBook(open.id, {
      quotes: open.quotes.map((quote) =>
        quote.id === editingQuoteId
          ? { ...quote, interpretation: interpretationDraft.trim() || undefined }
          : quote
      ),
    });
    setEditingQuoteId(null);
    setInterpretationDraft("");
  }

  function removeQuote(id: string) {
    if (!open) return;
    patchBook(open.id, {
      quotes: open.quotes.filter((quote) => quote.id !== id),
    });
  }

  function readBook(id: string, cfi?: string) {
    setReaderStartCfi(cfi);
    setReaderId(id);
  }

  if (reader?.readerUrl) {
    return (
      <Suspense fallback={<div className="bl-reader-loading">Opening reader...</div>}>
        <BookReader
          book={reader}
          startCfi={readerStartCfi}
          onClose={() => {
            setReaderId(null);
            setReaderStartCfi(undefined);
          }}
          onProgress={(cfi, progress) => {
            const localProgress = Math.max(
              progress,
              reader.localReaderProgress || 0
            );
            patchBook(reader.id, {
              readerCfi: cfi,
              localReaderProgress: localProgress,
              readerProgress: Math.max(localProgress, reader.appleProgress || 0),
              status: reader.status === "finished" ? "finished" : "reading",
            });
          }}
          onBookmark={(smartBookmark) => patchBook(reader.id, { smartBookmark })}
          onSaveQuote={(quote) =>
            patchBook(reader.id, {
              quotes: [quote, ...reader.quotes],
            })
          }
        />
      </Suspense>
    );
  }

  if (open) {
    const visibleQuotes = showAllHighlights ? open.quotes : open.quotes.slice(0, 40);
    const importedHighlightCount = open.quotes.filter(
      (quote) => quote.source === "apple-books"
    ).length;
    return (
      <div className="bl bl-detail">
        <button type="button" className="bl-back" onClick={() => setOpenId(null)}>
          ← Bookshelf
        </button>

        <div className="bl-detail-head">
          <BookCover
            book={open}
            className="bl-cover"
            folderLabel={folderById.get(open.category)?.label}
          />
          <div className="bl-detail-fields">
            <div className="bl-source-line">
              <span>{sourceLabel(open)}</span>
              <span className="bl-source-facts">
                {open.readerProgress ? `${progressPercent(open.readerProgress)}% read` : "Not started"}
                {open.chapterCount ? ` · ${open.chapterCount} chapters` : ""}
              </span>
            </div>
            <input
              className="bl-input bl-input-title"
              value={open.title}
              placeholder="Title"
              onChange={(event) => patchBook(open.id, { title: event.target.value })}
            />
            <input
              className="bl-input bl-input-author"
              value={open.author}
              placeholder="Author"
              onChange={(event) => patchBook(open.id, { author: event.target.value })}
            />
            <div className="bl-detail-actions">
              {open.readerUrl ? (
                <button
                  type="button"
                  className="bl-btn bl-btn-primary"
                  onClick={() => readBook(open.id)}
                >
                  <BookOpen size={15} aria-hidden />
                  Read here
                </button>
              ) : null}
              {open.externalUrl ? (
                <a
                  className="bl-btn"
                  href={open.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ArrowSquareOut size={15} aria-hidden />
                  Open in Apple Books
                </a>
              ) : null}
              {open.wonderPageId && onGo ? (
                <button
                  type="button"
                  className="bl-btn"
                  onClick={() => onGo(open.wonderPageId as string)}
                >
                  <ArrowSquareOut size={15} aria-hidden />
                  Open notes page
                </button>
              ) : null}
            </div>
            <div className="bl-row">
              <label>Status</label>
              <select
                className="bl-select"
                value={open.status}
                onChange={(event) => {
                  const status = event.target.value as BookStatus;
                  const patch: Partial<Book> = { status, statusOverride: true };
                  if (status === "reading" && !open.startedAt) {
                    patch.startedAt = new Date().toISOString().slice(0, 10);
                  }
                  if (status === "finished") {
                    patch.finishedAt = new Date().toISOString().slice(0, 10);
                  }
                  patchBook(open.id, patch);
                }}
              >
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
              <label>Folder</label>
              <select
                className="bl-select bl-select-category"
                value={open.category}
                onChange={(event) =>
                  patchBook(open.id, {
                    category: event.target.value as BookCategory,
                    categoryOverride: true,
                  })
                }
              >
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="bl-row">
              <label>Pages</label>
              <input
                className="bl-input bl-num"
                type="number"
                min={0}
                value={open.pageNow || ""}
                placeholder="now"
                onChange={(event) =>
                  patchBook(open.id, {
                    pageNow: Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
              <span className="bl-divider-text">/</span>
              <input
                className="bl-input bl-num"
                type="number"
                min={0}
                value={open.pageTotal || ""}
                placeholder="total"
                onChange={(event) =>
                  patchBook(open.id, {
                    pageTotal: Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
              <label>Rate</label>
              {[1, 2, 3, 4, 5].map((number) => (
                <button
                  key={number}
                  type="button"
                  className={`bl-stars-btn${open.rating >= number ? " is-on" : ""}`}
                  onClick={() =>
                    patchBook(open.id, {
                      rating: open.rating === number ? 0 : number,
                    })
                  }
                  aria-label={`${number} stars`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        </div>

        {open.description ? (
          <details className="bl-description">
            <summary>About this book</summary>
            <p>{open.description}</p>
          </details>
        ) : null}

        <section className="bl-section">
          <div className="bl-section-title-row">
            <h3 className="bl-section-h">Highlights &amp; notes</h3>
            {importedHighlightCount ? (
              <span>{importedHighlightCount} from Apple Books</span>
            ) : null}
          </div>
          <div className="bl-quote-add">
            <div className="bl-quote-compose-main">
              <Quotes size={17} aria-hidden />
              <textarea
                className="bl-textarea bl-quote-input"
                value={quoteDraft}
                placeholder="Paste or write the line you want to keep..."
                onChange={(event) => setQuoteDraft(event.target.value)}
              />
            </div>
            <div className="bl-quote-compose-main is-thought">
              <NotePencil size={17} aria-hidden />
              <textarea
                className="bl-textarea bl-quote-thought-input"
                value={quoteNoteDraft}
                placeholder="Your interpretation, connection, or question (optional)"
                onChange={(event) => setQuoteNoteDraft(event.target.value)}
              />
            </div>
            <div className="bl-quote-actions">
              <input
                className="bl-input bl-quote-page"
                value={quotePage}
                placeholder="page / chapter"
                onChange={(event) => setQuotePage(event.target.value)}
              />
              <button
                type="button"
                className="bl-btn bl-btn-primary"
                onClick={addQuote}
                disabled={!quoteDraft.trim()}
              >
                Save to this book
              </button>
            </div>
          </div>
          {open.quotes.length === 0 ? (
            <p className="bl-empty-shelf">No quotes saved yet.</p>
          ) : (
            <ul className="bl-quote-list">
              {visibleQuotes.map((quote) => (
                <li key={quote.id} className={`bl-quote-item${quote.note || quote.interpretation ? " has-thought" : ""}`}>
                  <span className="bl-quote-kicker">
                    {quote.source === "apple-books" ? "Apple Books highlight" : "Saved quote"}
                  </span>
                  <p className="bl-quote-text">“{quote.text}”</p>
                  {quote.note ? (
                    <div className="bl-quote-note">
                      <span>Apple Books note</span>
                      <p>{quote.note}</p>
                    </div>
                  ) : null}
                  {quote.interpretation ? (
                    <div className="bl-quote-note is-interpretation">
                      <span>Your interpretation</span>
                      <p>{quote.interpretation}</p>
                    </div>
                  ) : null}
                  {editingQuoteId === quote.id ? (
                    <div className="bl-interpret-editor">
                      <textarea
                        className="bl-textarea"
                        value={interpretationDraft}
                        placeholder="What does this mean to you? Where does it connect?"
                        autoFocus
                        onChange={(event) => setInterpretationDraft(event.target.value)}
                      />
                      <div>
                        <button type="button" className="bl-btn bl-btn-primary" onClick={saveInterpretation}>
                          Save interpretation
                        </button>
                        <button
                          type="button"
                          className="bl-btn"
                          onClick={() => {
                            setEditingQuoteId(null);
                            setInterpretationDraft("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="bl-quote-meta">
                    <span>
                      {quote.page
                        ? `p. ${quote.page}`
                        : quote.source === "apple-books"
                          ? "Imported highlight"
                          : "Saved here"}
                      {" · "}
                      {new Date(quote.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="bl-quote-controls">
                      <button
                        type="button"
                        className="bl-quote-open"
                        onClick={() => startInterpretation(quote)}
                      >
                        {quote.interpretation ? "Edit interpretation" : "Add interpretation"}
                      </button>
                      {quote.location && open.readerUrl ? (
                        <button
                          type="button"
                          className="bl-quote-open"
                          onClick={() => readBook(open.id, quote.location)}
                        >
                          Open in book
                        </button>
                      ) : null}
                      {quote.source !== "apple-books" ? (
                        <button
                          type="button"
                          className="bl-quote-del"
                          onClick={() => removeQuote(quote.id)}
                        >
                          remove
                        </button>
                      ) : null}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {open.quotes.length > 40 ? (
            <button
              type="button"
              className="bl-show-highlights"
              onClick={() => setShowAllHighlights((value) => !value)}
            >
              {showAllHighlights
                ? "Show fewer"
                : `Show all ${open.quotes.length} highlights and notes`}
            </button>
          ) : null}
        </section>

        <section className="bl-section">
          <h3 className="bl-section-h">Notes</h3>
          <textarea
            className="bl-textarea"
            value={open.notes}
            placeholder="Ideas, arguments, connections, questions..."
            onChange={(event) => patchBook(open.id, { notes: event.target.value })}
          />
        </section>

        {open.source !== "apple-books" ? (
          <div className="bl-footer-actions">
            <button
              type="button"
              className="bl-btn bl-btn-danger"
              onClick={() => removeBook(open.id)}
            >
              Remove
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="bl">
      <header className="bl-head">
        <div className="bl-head-main">
          <div>
            <h1 className="bl-title">
              <MinimalIcon name="books" size={22} />
              Bookshelf
            </h1>
          </div>
          <button
            type="button"
            className={`bl-sync${sync.state === "syncing" ? " is-syncing" : ""}`}
            onClick={() => void syncApple()}
            title="Refresh Apple Books"
          >
            <ArrowsClockwise size={15} aria-hidden />
            <span>{sync.message}</span>
          </button>
        </div>
        <div className="bl-stats">
          <span><b>{stats.total}</b> books</span>
          <span><b>{stats.reading}</b> reading</span>
          <span><b>{stats.finished}</b> finished</span>
          <span><b>{stats.quotes}</b> quotes</span>
        </div>
      </header>

      <div className="bl-toolbar">
        <label className="bl-search-wrap">
          <MagnifyingGlass size={15} aria-hidden />
          <input
            className="bl-search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search titles, authors, notes, or quotes"
          />
        </label>
        <div className="bl-view-tabs" aria-label="Library arrangement">
          <button
            type="button"
            className={groupMode === "subjects" ? "is-on" : ""}
            onClick={() => setGroupMode("subjects")}
          >
            Folders
          </button>
          <button
            type="button"
            className={groupMode === "status" ? "is-on" : ""}
            onClick={() => setGroupMode("status")}
          >
            Status
          </button>
        </div>
        <button
          type="button"
          className="bl-add-btn"
          onClick={() => setFinderOpen((value) => !value)}
          title="Find a legal copy"
        >
          <MagnifyingGlass size={15} aria-hidden />
          Find
        </button>
        {groupMode === "subjects" ? (
          <button
            type="button"
            className="bl-add-btn bl-folder-add-btn"
            onClick={() => {
              setAddingFolder((value) => !value);
              setAdding(false);
            }}
            title={addingFolder ? "Close folder creator" : "Create a folder"}
          >
            <FolderPlus size={15} aria-hidden />
            Folder
          </button>
        ) : null}
        <button
          type="button"
          className="bl-add-btn"
          onClick={() => {
            setAdding((value) => !value);
            setAddingFolder(false);
          }}
          title={adding ? "Close add book" : "Add a book"}
        >
          <Plus size={15} aria-hidden />
          {adding ? "Close" : "Add book"}
        </button>
      </div>

      {addingFolder ? (
        <form
          className="bl-folder-create"
          onSubmit={(event) => {
            event.preventDefault();
            addFolder();
          }}
        >
          <FolderSimple size={20} weight="duotone" aria-hidden />
          <input
            className="bl-input"
            value={folderNameDraft}
            placeholder="New folder name"
            autoFocus
            onChange={(event) => setFolderNameDraft(event.target.value)}
          />
          <button
            type="submit"
            className="bl-icon-btn"
            disabled={!folderNameDraft.trim()}
            title="Create folder"
            aria-label="Create folder"
          >
            <Check size={16} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            className="bl-icon-btn"
            onClick={() => {
              setAddingFolder(false);
              setFolderNameDraft("");
            }}
            title="Cancel"
            aria-label="Cancel creating folder"
          >
            <X size={15} aria-hidden />
          </button>
        </form>
      ) : null}

      {finderOpen ? (
        <section className="bl-finder" aria-label="Book Finder">
          <div className="bl-finder-head">
            <div>
              <span>Book Finder</span>
              <strong>Public-domain, borrowing, and catalog sources</strong>
            </div>
            <button
              type="button"
              className="bl-icon-btn"
              onClick={() => setFinderOpen(false)}
              title="Close Book Finder"
              aria-label="Close Book Finder"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
          <form
            className="bl-finder-search"
            onSubmit={(event) => {
              event.preventDefault();
              void runFinderSearch(finderQuery);
            }}
          >
            <MagnifyingGlass size={16} aria-hidden />
            <input
              className="bl-input"
              value={finderQuery}
              placeholder="Title or author"
              onChange={(event) => setFinderQuery(event.target.value)}
            />
            <button
              type="submit"
              className="bl-btn bl-btn-primary"
              disabled={!finderQuery.trim() || finderState === "searching"}
            >
              {finderState === "searching" ? "Searching" : "Search"}
            </button>
          </form>
          {finderMessage ? (
            <p className={`bl-finder-status is-${finderState}`}>{finderMessage}</p>
          ) : null}
          {finderResults.length ? (
            <div className="bl-finder-results">
              {finderResults.map((found) => (
                <article key={found.id} className="bl-finder-result">
                  <div className="bl-finder-cover">
                    {found.coverUrl ? (
                      <img src={found.coverUrl} alt="" loading="lazy" />
                    ) : (
                      <BookOpen size={20} aria-hidden />
                    )}
                  </div>
                  <div className="bl-finder-copy">
                    <strong>{found.title}</strong>
                    <span>
                      {found.author || "Unknown author"}
                      {found.year ? ` · ${found.year}` : ""}
                    </span>
                    <small className={`is-${found.access}`}>
                      {found.access === "public"
                        ? "Free public copy"
                        : found.access === "borrow"
                          ? "Borrowing available"
                          : "Catalog listing"}
                    </small>
                  </div>
                  <div className="bl-finder-actions">
                    <button
                      type="button"
                      className="bl-btn"
                      onClick={() => addDiscoveredBook(found)}
                    >
                      <Plus size={14} aria-hidden />
                      Add
                    </button>
                    <a
                      className="bl-btn bl-btn-primary"
                      href={found.getCopyUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {found.access === "public" ? (
                        <DownloadSimple size={14} aria-hidden />
                      ) : (
                        <ArrowSquareOut size={14} aria-hidden />
                      )}
                      {found.access === "public"
                        ? "Free copy"
                        : found.access === "borrow"
                          ? "Borrow"
                          : "View"}
                    </a>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="bl-filter" aria-label="Reading status filter">
        {(
          [
            ["all", "All"],
            ["reading", "Reading"],
            ["want", "Want"],
            ["paused", "Paused"],
            ["finished", "Done"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`bl-chip${filter === id ? " is-on" : ""}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {adding ? (
        <div className="bl-add-panel">
          <input
            className="bl-input bl-input-title"
            value={draftTitle}
            placeholder="Book title"
            autoFocus
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addBook();
            }}
          />
          <div className="bl-add-row">
            <input
              className="bl-input"
              value={draftAuthor}
              placeholder="Author"
              onChange={(event) => setDraftAuthor(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addBook();
              }}
            />
            <select
              className="bl-select"
              value={draftCategory}
              onChange={(event) => setDraftCategory(event.target.value as BookCategory)}
            >
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="bl-btn bl-btn-primary"
              onClick={addBook}
              disabled={!draftTitle.trim()}
            >
              Add to bookshelf
            </button>
          </div>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <p className="bl-empty-all">
          {q ? "No books match that search." : "Your library is ready for its first book."}
        </p>
      ) : (
        groups.map((group) => {
          const expanded = Boolean(openFolders[group.id]) || Boolean(q.trim());
          return <section
            key={group.id}
            className={`bl-shelf${expanded ? " is-open" : ""}${dropFolderId === group.id ? " is-drop-target" : ""}`}
            style={folderTone(group.accent)}
            onDragOver={(event) => {
              if (groupMode !== "subjects") return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropFolderId(group.id);
            }}
            onDragLeave={() => {
              if (dropFolderId === group.id) setDropFolderId(null);
            }}
            onDrop={(event) => {
              if (groupMode !== "subjects") return;
              event.preventDefault();
              const bookId = draggingBookId || event.dataTransfer.getData("text/wonder-book-id");
              if (bookId) moveBookToFolder(bookId, group.id);
            }}
          >
            <div className="bl-folder-row">
              <button type="button" className="bl-folder" onClick={() => setOpenFolders((current) => ({ ...current, [group.id]: !current[group.id] }))} aria-expanded={expanded}>
                <CaretRight className="bl-folder-caret" size={14} aria-hidden />
                <FolderSimple className="bl-folder-icon" size={22} weight="fill" aria-hidden />
                <span className="bl-folder-copy"><strong>{group.label}</strong><small>{group.books.length} {group.books.length === 1 ? "book" : "books"}</small></span>
              </button>
              {group.canRename ? (
                <button
                  type="button"
                  className="bl-folder-edit"
                  onClick={() => beginRenameFolder(group)}
                  title={`Rename ${group.label}`}
                  aria-label={`Rename ${group.label}`}
                >
                  <PencilSimple size={14} aria-hidden />
                </button>
              ) : null}
            </div>
            {renamingFolderId === group.id ? (
              <form
                className="bl-folder-rename"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveFolderName();
                }}
              >
                <input
                  className="bl-input"
                  value={folderRenameDraft}
                  autoFocus
                  onChange={(event) => setFolderRenameDraft(event.target.value)}
                  aria-label="Folder name"
                />
                <button type="submit" className="bl-icon-btn" title="Save name" aria-label="Save folder name">
                  <Check size={16} weight="bold" aria-hidden />
                </button>
                <button
                  type="button"
                  className="bl-icon-btn"
                  onClick={() => {
                    setRenamingFolderId(null);
                    setFolderRenameDraft("");
                  }}
                  title="Cancel"
                  aria-label="Cancel renaming folder"
                >
                  <X size={15} aria-hidden />
                </button>
              </form>
            ) : null}
            {expanded && <div className="bl-grid">
              {group.books.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  folderLabel={group.label}
                  draggable={groupMode === "subjects"}
                  dragging={draggingBookId === book.id}
                  onOpen={() => setOpenId(book.id)}
                  onDragStart={(event) => {
                    setDraggingBookId(book.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/wonder-book-id", book.id);
                  }}
                  onDragEnd={() => {
                    setDraggingBookId(null);
                    setDropFolderId(null);
                  }}
                />
              ))}
            </div>}
          </section>;
        })
      )}
    </div>
  );
}

function sourceLabel(book: Book): string {
  if (book.readingFormat === "physical+digital") return "Physical + digital";
  if (book.format === "audiobook") return "Apple Books audiobook";
  if (book.format === "cloud") return "Apple Books · online";
  if (book.format === "archive") return "Apple Books · archived reading data";
  if (book.source === "apple-books") return "Apple Books · digital";
  if (book.source === "wonder-page") return "Wonder page";
  return "Wonder Bookshelf";
}

function BookCover({
  book,
  className = "",
  folderLabel,
}: {
  book: Book;
  className?: string;
  folderLabel?: string;
}) {
  const style: CSSProperties = {
    backgroundColor: book.color,
    backgroundImage: `linear-gradient(165deg, rgba(255,255,255,.14), transparent 42%), linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.58))`,
  };
  return (
    <div className={className} style={style}>
      <span className="bl-cover-fallback" aria-hidden>
        <small>{book.author || folderLabel || book.category}</small>
        <strong>{book.title || "Untitled"}</strong>
      </span>
      {book.coverUrl ? (
        <img
          src={book.coverUrl}
          alt=""
          className="bl-cover-image"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </div>
  );
}

function BookCard({
  book,
  folderLabel,
  draggable,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  book: Book;
  folderLabel: string;
  draggable: boolean;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}) {
  const pageProgress =
    book.pageTotal > 0 ? Math.min(1, book.pageNow / book.pageTotal) : 0;
  const progress = Math.max(book.readerProgress || 0, pageProgress);
  const progressLabel =
    progress > 0
      ? `${progressPercent(progress)}%`
      : book.quotes.length
        ? `${book.quotes.length} quote${book.quotes.length === 1 ? "" : "s"}`
        : STATUS_LABEL[book.status];

  return (
    <button
      type="button"
      className={`bl-card${dragging ? " is-dragging" : ""}`}
      draggable={draggable}
      onClick={onOpen}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={draggable ? "Open, or drag to another folder" : "Open book"}
    >
      <BookCover book={book} className="bl-card-cover" folderLabel={folderLabel} />
      <span className="bl-card-title">{book.title || "Untitled"}</span>
      {book.author ? <span className="bl-card-author">{book.author}</span> : null}
      <span className="bl-card-meta">
        <span>{progressLabel}</span>
        {book.rating > 0 ? (
          <span className="bl-card-stars">{stars(book.rating)}</span>
        ) : book.readingFormat === "physical+digital" ? (
          <span>physical + digital</span>
        ) : null}
      </span>
      {progress > 0 ? (
        <span className="bl-card-progress" aria-hidden>
          <i style={{ width: `${Math.max(1, progress * 100)}%` }} />
        </span>
      ) : null}
    </button>
  );
}
