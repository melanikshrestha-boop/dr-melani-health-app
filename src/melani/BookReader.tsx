import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CaretRight,
  Minus,
  Plus,
  BookmarkSimple,
  HighlighterCircle,
  NotePencil,
  X,
} from "@phosphor-icons/react";
import ePub, {
  type Book as EpubBook,
  type Location,
  type NavItem,
  type Rendition,
} from "epubjs";
import { newQuote, type Book, type BookQuote } from "./booksStore";

type ReaderContents = {
  document: Document;
  window: Window;
};

type ReaderProps = {
  book: Book;
  startCfi?: string;
  onClose: () => void;
  onProgress: (cfi: string, progress: number) => void;
  onBookmark: (bookmark: Book["smartBookmark"] | undefined) => void;
  onSaveQuote: (quote: BookQuote) => void;
};

function flattenToc(items: NavItem[], depth = 0): Array<NavItem & { depth: number }> {
  const output: Array<NavItem & { depth: number }> = [];
  for (const item of items) {
    output.push({ ...item, depth });
    if (item.subitems?.length) output.push(...flattenToc(item.subitems, depth + 1));
  }
  return output;
}

function normalizedHref(href: string): string {
  const withoutHash = href.split("#")[0].replace(/\\/g, "/");
  try {
    return decodeURIComponent(withoutHash).replace(/^(?:\.\.\/|\.\/)+/, "");
  } catch {
    return withoutHash.replace(/^(?:\.\.\/|\.\/)+/, "");
  }
}

function sameDocument(left: string, right: string): boolean {
  const a = normalizedHref(left);
  const b = normalizedHref(right);
  return Boolean(a && b) && (a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`));
}

export function BookReader({ book, startCfi, onClose, onProgress, onBookmark, onSaveQuote }: ReaderProps) {
  const resumableCfi = startCfi
    || book.smartBookmark?.cfi
    || ((book.localReaderProgress || 0) >= 0.01 ? book.readerCfi : undefined);
  const stageRef = useRef<HTMLDivElement>(null);
  const epubRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const progressCallback = useRef(onProgress);
  const bookmarkCallback = useRef(onBookmark);
  const quoteCallback = useRef(onSaveQuote);
  const bookmarkRef = useRef<Book["smartBookmark"]>(book.smartBookmark);
  const initialQuotes = useRef(book.quotes);
  const initialCfi = useRef(resumableCfi);
  const chaptersRef = useRef<Array<NavItem & { depth: number }>>([]);
  const lastProgress = useRef(book.readerProgress || 0);
  const lastCfi = useRef(startCfi || book.smartBookmark?.cfi || book.readerCfi || "");
  const wheelState = useRef({ amount: 0, lastDirection: 0, lastTurnAt: 0 });
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches
  );
  const readingModeRef = useRef<"pages" | "scroll">(isNarrow ? "scroll" : "pages");
  const appliedModeRef = useRef<"pages" | "scroll">(readingModeRef.current);
  const [chapters, setChapters] = useState<Array<NavItem & { depth: number }>>([]);
  const [chapterHref, setChapterHref] = useState("");
  const [showContents, setShowContents] = useState(() => !resumableCfi);
  const [fontSize, setFontSize] = useState(100);
  const [progress, setProgress] = useState(book.readerProgress || 0);
  const [message, setMessage] = useState("Opening book...");
  const [selection, setSelection] = useState<{ cfi: string; text: string } | null>(null);
  const [addingThought, setAddingThought] = useState(false);
  const [thoughtDraft, setThoughtDraft] = useState("");
  const [closePrompt, setClosePrompt] = useState(false);
  const [bookmark, setBookmark] = useState(book.smartBookmark);

  function turnPage(direction: "next" | "prev", throttle = false) {
    if (readingModeRef.current !== "pages") return;
    const now = Date.now();
    if (throttle && now - wheelState.current.lastTurnAt < 360) return;
    wheelState.current.lastTurnAt = now;
    void renditionRef.current?.[direction]();
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    const element = target instanceof Element ? target : null;
    return Boolean(element?.closest("input, textarea, select, button, [contenteditable='true']"));
  }

  function handleReaderKey(event: KeyboardEvent) {
    if (readingModeRef.current !== "pages" || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
    if (event.key === "ArrowRight" || event.key === "PageDown" || (event.key === " " && !event.shiftKey)) {
      event.preventDefault();
      turnPage("next");
    } else if (event.key === "ArrowLeft" || event.key === "PageUp" || (event.key === " " && event.shiftKey)) {
      event.preventDefault();
      turnPage("prev");
    }
  }

  function handleReaderWheel(event: WheelEvent) {
    if (readingModeRef.current !== "pages") return;
    const horizontal = Math.abs(event.deltaX) > Math.max(10, Math.abs(event.deltaY) * 0.7) || event.shiftKey;
    if (!horizontal) return;
    event.preventDefault();
    const delta = event.shiftKey && Math.abs(event.deltaX) < 1 ? event.deltaY : event.deltaX;
    const direction = Math.sign(delta);
    if (!direction) return;
    if (wheelState.current.lastDirection && wheelState.current.lastDirection !== direction) wheelState.current.amount = 0;
    wheelState.current.lastDirection = direction;
    wheelState.current.amount += delta;
    if (Math.abs(wheelState.current.amount) >= 44) {
      turnPage(direction > 0 ? "next" : "prev", true);
      wheelState.current.amount = 0;
    }
  }

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setIsNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleReaderKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleReaderKey);
    };
  }, []);

  useEffect(() => {
    progressCallback.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    bookmarkCallback.current = onBookmark;
  }, [onBookmark]);

  useEffect(() => {
    quoteCallback.current = onSaveQuote;
  }, [onSaveQuote]);

  useEffect(() => {
    const warnBeforeTabClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeTabClose);
    return () => window.removeEventListener("beforeunload", warnBeforeTabClose);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !book.readerUrl) return;

    const epub = ePub(book.readerUrl);
    const rendition = epub.renderTo(stage, {
      width: "100%",
      height: "100%",
      flow: readingModeRef.current === "scroll" ? "scrolled-doc" : "paginated",
      spread: "none",
      manager: "default",
    });
    epubRef.current = epub;
    renditionRef.current = rendition;

    rendition.themes.default({
      body: {
        color: "#e9e7e2 !important",
        background: "#080808 !important",
        "font-family": 'Georgia, "Times New Roman", serif !important',
        "line-height": "1.7 !important",
        padding: "0 3% !important",
      },
      p: { color: "#e9e7e2 !important" },
      h1: { color: "#ffffff !important" },
      h2: { color: "#ffffff !important" },
      h3: { color: "#ffffff !important" },
      a: { color: "#9bbce7 !important" },
    });

    let disposed = false;
    const contentCleanups: Array<() => void> = [];
    const attachedDocuments = new WeakSet<Document>();

    const attachReaderInput = (contents: ReaderContents) => {
      const readerDocument = contents.document;
      if (!readerDocument || attachedDocuments.has(readerDocument)) return;
      attachedDocuments.add(readerDocument);
      let touchStart: { x: number; y: number } | null = null;
      const touchStarted = (event: TouchEvent) => {
        const touch = event.touches[0];
        if (touch) touchStart = { x: touch.clientX, y: touch.clientY };
      };
      const touchEnded = (event: TouchEvent) => {
        if (readingModeRef.current !== "pages" || !touchStart) return;
        const touch = event.changedTouches[0];
        if (!touch) return;
        const horizontal = touch.clientX - touchStart.x;
        const vertical = touch.clientY - touchStart.y;
        touchStart = null;
        if (Math.abs(horizontal) < 52 || Math.abs(horizontal) < Math.abs(vertical) * 1.2) return;
        event.preventDefault();
        turnPage(horizontal < 0 ? "next" : "prev", true);
      };
      readerDocument.addEventListener("wheel", handleReaderWheel, { passive: false });
      readerDocument.addEventListener("keydown", handleReaderKey);
      readerDocument.addEventListener("touchstart", touchStarted, { passive: true });
      readerDocument.addEventListener("touchend", touchEnded, { passive: false });
      contentCleanups.push(() => {
        readerDocument.removeEventListener("wheel", handleReaderWheel);
        readerDocument.removeEventListener("keydown", handleReaderKey);
        readerDocument.removeEventListener("touchstart", touchStarted);
        readerDocument.removeEventListener("touchend", touchEnded);
      });
    };
    rendition.hooks.content.register(attachReaderInput);

    const relocated = (location: Location) => {
      const nextProgress = Number.isFinite(location.start.percentage)
        ? Math.min(1, Math.max(0, location.start.percentage))
        : lastProgress.current;
      lastProgress.current = nextProgress;
      setProgress(nextProgress);
      const activeChapter = chaptersRef.current.find((chapter) =>
        sameDocument(chapter.href, location.start.href || "")
      );
      setChapterHref(activeChapter?.href || "");
      lastCfi.current = location.start.cfi;
      progressCallback.current(location.start.cfi, nextProgress);
      const saved = bookmarkRef.current;
      if (saved && nextProgress > saved.progress + 0.006) {
        rendition.annotations.remove(saved.cfi, "underline");
        bookmarkRef.current = undefined;
        setBookmark(undefined);
        bookmarkCallback.current(undefined);
      }
    };
    rendition.on("relocated", relocated);

    const selected = (cfi: string, contents: { window?: Window }) => {
      const text = contents?.window?.getSelection?.()?.toString().trim() || "";
      if (text) {
        setSelection({ cfi, text });
        setAddingThought(false);
        setThoughtDraft("");
      }
    };
    rendition.on("selected", selected);

    void (async () => {
      try {
        const navigation = await epub.loaded.navigation;
        if (disposed) return;
        const nextChapters = flattenToc(navigation.toc || []).filter(
          (chapter) => Boolean(chapter.href && chapter.label?.trim())
        );
        chaptersRef.current = nextChapters;
        setChapters(nextChapters);

        const contentsLandmark = navigation.landmarks?.find(
          (item) => item.type?.toLowerCase() === "toc"
        )?.href;
        const contentsItem = nextChapters.find((item) =>
          /^(?:table\s+of\s+)?contents$/i.test(item.label.trim())
        )?.href;
        const targets = [
          initialCfi.current,
          contentsLandmark,
          contentsItem,
          nextChapters[0]?.href,
        ].filter((target, index, all): target is string => Boolean(target) && all.indexOf(target) === index);

        let opened = false;
        for (const target of targets) {
          try {
            await rendition.display(target);
            opened = true;
            break;
          } catch {
            /* try the next valid navigation target */
          }
        }
        if (!opened) await rendition.display();
        if (disposed) return;
        setMessage("");
        for (const quote of initialQuotes.current) {
          if (!quote.location) continue;
          rendition.annotations.add(
            "highlight",
            quote.location,
            { quoteId: quote.id },
            undefined,
            "reader-quote-highlight",
            { fill: "#f2c94c", "fill-opacity": "0.34", "mix-blend-mode": "screen" }
          );
        }
        if (bookmarkRef.current?.cfi) {
          rendition.annotations.add(
            "underline",
            bookmarkRef.current.cfi,
            {},
            undefined,
            "smart-bookmark",
            { stroke: "#76b9ff", "stroke-opacity": "0.9" }
          );
        }
      } catch {
        if (!disposed) setMessage("This book could not be opened.");
      }
    })();

    return () => {
      disposed = true;
      rendition.off("relocated", relocated);
      rendition.off("selected", selected);
      rendition.hooks.content.deregister(attachReaderInput);
      contentCleanups.forEach((cleanup) => cleanup());
      rendition.destroy();
      epub.destroy();
      renditionRef.current = null;
      epubRef.current = null;
    };
  }, [book.id, book.readerUrl]);

  useEffect(() => {
    const nextMode = isNarrow ? "scroll" : "pages";
    readingModeRef.current = nextMode;
    if (appliedModeRef.current === nextMode) return;
    appliedModeRef.current = nextMode;
    const rendition = renditionRef.current;
    if (!rendition) return;
    rendition.flow(nextMode === "scroll" ? "scrolled-doc" : "paginated");
    wheelState.current.amount = 0;
    if (lastCfi.current) void rendition.display(lastCfi.current);
  }, [isNarrow]);

  function openChapter(href: string) {
    if (!href || !renditionRef.current) return;
    setShowContents(false);
    setChapterHref(href);
    setMessage("Opening chapter...");
    void renditionRef.current.display(href)
      .then(() => setMessage(""))
      .catch(() => setMessage("That chapter could not be opened."));
  }

  function savePlace(candidate = selection) {
    const cfi = candidate?.cfi || lastCfi.current;
    if (!cfi) return;
    if (bookmark?.cfi) renditionRef.current?.annotations.remove(bookmark.cfi, "underline");
    const next = { cfi, text: candidate?.text || "Resume from this page", progress: lastProgress.current, createdAt: Date.now() };
    renditionRef.current?.annotations.add(
      "underline",
      cfi,
      {},
      undefined,
      "smart-bookmark",
      { stroke: "#76b9ff", "stroke-opacity": "0.9" }
    );
    setBookmark(next);
    bookmarkRef.current = next;
    bookmarkCallback.current(next);
    setSelection(null);
    setAddingThought(false);
    setThoughtDraft("");
    setClosePrompt(false);
  }

  function saveHighlight(note = "") {
    if (!selection) return;
    const quote = newQuote(selection.text, undefined, note, selection.cfi);
    renditionRef.current?.annotations.add(
      "highlight",
      selection.cfi,
      { quoteId: quote.id },
      undefined,
      "reader-quote-highlight",
      { fill: "#f2c94c", "fill-opacity": "0.34", "mix-blend-mode": "screen" }
    );
    quoteCallback.current(quote);
    setSelection(null);
    setAddingThought(false);
    setThoughtDraft("");
  }

  function requestClose() {
    setClosePrompt(true);
  }

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontSize}%`);
  }, [fontSize]);

  const progressLabel = `${Math.round(progress * 100)}%`;

  return (
    <div className={`bl-reader ${isNarrow ? "is-scroll-reader" : "is-page-reader"}`}>
      <header className="bl-reader-head">
        <button type="button" className="bl-icon-btn" onClick={requestClose} title="Back to bookshelf">
          <ArrowLeft size={18} aria-hidden />
        </button>
        <div className="bl-reader-title">
          <strong>{book.title}</strong>
          <span>{book.author || "Wonder Bookshelf"}</span>
        </div>
        <div className="bl-reader-progress" aria-label={`${progressLabel} complete`}>
          <i style={{ width: progressLabel }} />
        </div>
        <span className="bl-reader-percent">{progressLabel}</span>
      </header>

      <div className="bl-reader-tools">
        <select
          className="bl-reader-chapters"
          value={showContents ? "__contents__" : chapterHref}
          onChange={(event) => {
            const href = event.target.value;
            if (href === "__contents__") {
              setShowContents(true);
              return;
            }
            openChapter(href);
          }}
          aria-label="Book chapter"
        >
          <option value="__contents__">Table of Contents</option>
          {!showContents && !chapterHref ? <option value="">Current page</option> : null}
          {chapters.map((chapter) => (
            <option key={`${chapter.id}-${chapter.href}`} value={chapter.href}>
              {`${"  ".repeat(chapter.depth)}${chapter.label.trim()}`}
            </option>
          ))}
        </select>
        <div className="bl-reader-size" aria-label="Text size">
          <button
            type="button"
            className="bl-icon-btn"
            onClick={() => setFontSize((value) => Math.max(80, value - 10))}
            title="Smaller text"
          >
            <Minus size={16} aria-hidden />
          </button>
          <span>Text</span>
          <button
            type="button"
            className="bl-icon-btn"
            onClick={() => setFontSize((value) => Math.min(150, value + 10))}
            title="Larger text"
          >
            <Plus size={16} aria-hidden />
          </button>
        </div>
      </div>

      <div className="bl-reader-stage-wrap">
        {showContents ? (
          <section className="bl-reader-toc" aria-label="Table of Contents">
            <header>
              <div>
                <span>Book navigation</span>
                <h2>Table of Contents</h2>
              </div>
              {resumableCfi ? (
                <button
                  type="button"
                  className="bl-icon-btn"
                  onClick={() => setShowContents(false)}
                  title="Return to saved place"
                  aria-label="Return to saved place"
                >
                  <X size={15} aria-hidden />
                </button>
              ) : null}
            </header>
            {chapters.length ? (
              <nav>
                {chapters.map((chapter) => (
                  <button
                    key={`${chapter.id}-${chapter.href}`}
                    type="button"
                    style={{ paddingLeft: `${12 + chapter.depth * 18}px` }}
                    onClick={() => openChapter(chapter.href)}
                  >
                    <span>{chapter.label.trim()}</span>
                    <CaretRight size={14} aria-hidden />
                  </button>
                ))}
              </nav>
            ) : (
              <p>This EPUB does not include a chapter list.</p>
            )}
          </section>
        ) : null}
        {message ? <p className="bl-reader-message">{message}</p> : null}
        <div ref={stageRef} className="bl-reader-stage" />
      </div>

      {selection ? (
        <div className={`bl-smart-selection${addingThought ? " is-writing" : ""}`}>
          <div className="bl-selection-copy">
            <span>Selected</span>
            <p>{selection.text}</p>
          </div>
          {addingThought ? (
            <div className="bl-selection-thought">
              <textarea
                value={thoughtDraft}
                placeholder="Your interpretation, connection, or question..."
                autoFocus
                onChange={(event) => setThoughtDraft(event.target.value)}
              />
              <div>
                <button type="button" className="is-primary" onClick={() => saveHighlight(thoughtDraft)}>
                  Save highlight + thought
                </button>
                <button type="button" onClick={() => setAddingThought(false)}>Back</button>
              </div>
            </div>
          ) : (
            <div className="bl-selection-actions">
              <button type="button" className="is-primary" onClick={() => saveHighlight()}>
                <HighlighterCircle size={15} weight="fill" /> Highlight
              </button>
              <button type="button" onClick={() => setAddingThought(true)}>
                <NotePencil size={15} /> Add thought
              </button>
              <button type="button" onClick={() => savePlace()}>
                <BookmarkSimple size={15} weight="fill" /> Bookmark
              </button>
            </div>
          )}
          <button
            type="button"
            className="bl-selection-close"
            onClick={() => {
              setSelection(null);
              setAddingThought(false);
              setThoughtDraft("");
            }}
            aria-label="Dismiss selection tools"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {closePrompt && <div className="bl-bookmark-prompt" role="dialog" aria-modal="true" aria-label="Save reading position"><div><p>Where did you leave off?</p><h2>{selection ? "Use the sentence you highlighted?" : "Highlight a sentence, or save this page."}</h2><div>{selection && <button type="button" className="is-primary" onClick={() => savePlace(selection)}>Save highlighted point</button>}<button type="button" onClick={() => savePlace(null)}>Save current page</button><button type="button" onClick={onClose}>Close without changing bookmark</button><button type="button" className="bl-prompt-cancel" onClick={() => setClosePrompt(false)}>Keep reading</button></div></div></div>}

    </div>
  );
}
