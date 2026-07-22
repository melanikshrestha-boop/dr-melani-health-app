import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import {
  buildChapterImprint,
  extractChapterText,
  htmlToPlainText,
  loadImprint,
  saveImprint,
  type ChapterImprint,
} from "./chapterImprint";
import { ChapterImprintView } from "./ChapterImprintView";

/** Soft light-pink default for highlights (clean, not muddy yellow) */
const HIGHLIGHT_PINK = {
  fill: "#ffb6c8",
  "fill-opacity": "0.42",
  "mix-blend-mode": "normal",
} as const;

const HIGHLIGHT_CLASS = "reader-quote-highlight";

type ReaderContents = {
  document: Document;
  window: Window;
};

type FlipDir = "next" | "prev";

/**
 * Free page pose — the leaf can move any direction, not only left/right.
 * x/y = position on screen, rotZ = spin (circles), rotX/rotY = 3D tilt.
 */
type LeafPose = {
  active: boolean;
  x: number;
  y: number;
  rotZ: number;
  rotY: number;
  rotX: number;
  scale: number;
  opacity: number;
};

/** Flat page resting on the book (nothing moving yet) */
const IDLE_LEAF: LeafPose = {
  active: false,
  x: 0,
  y: 0,
  rotZ: 0,
  rotY: 0,
  rotX: 0,
  scale: 1,
  opacity: 0,
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
  const flipBusy = useRef(false);
  /**
   * Free drag tracker — page can move left/right/up/down and spin in circles.
   * pathLen + angleAccum make circular swipes feel real (not only sideways).
   */
  const freeDrag = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    width: number;
    height: number;
    pathLen: number;
    angleAccum: number;
    lastSegAngle: number | null;
  } | null>(null);
  /** Live leaf pose while dragging / flying (ref stays fresh mid-gesture) */
  const leafRef = useRef<LeafPose>(IDLE_LEAF);
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
  /**
   * Free page leaf: move anywhere (x/y), spin (rotZ for circles), tilt (rotX/rotY).
   * Not locked to right-to-left — you steer it.
   */
  const [leaf, setLeaf] = useState<LeafPose>(IDLE_LEAF);
  const [imprint, setImprint] = useState<ChapterImprint | null>(null);
  const [imprintBusy, setImprintBusy] = useState(false);
  const [imprintError, setImprintError] = useState("");
  const locationHrefRef = useRef("");

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /** Push leaf pose to React state + ref together (ref used mid-gesture) */
  function applyLeaf(next: LeafPose) {
    leafRef.current = next;
    setLeaf(next);
  }

  /**
   * Build a free pose from how far/where the finger moved.
   * - x/y follow the finger (any direction)
   * - rotZ grows when you arc (circles) and gets a little spin from diagonal pulls
   * - rotX/rotY tilt so it feels like a real sheet of paper in 3D space
   */
  function poseFromDrag(
    dx: number,
    dy: number,
    angleAccum: number,
    pathLen: number
  ): LeafPose {
    const dist = Math.hypot(dx, dy); // straight-line distance from grab start
    // Spin from curved path (main "circle" feel) + soft spin from direction
    const rotZ =
      angleAccum * (180 / Math.PI) * 0.62 + // path curvature → degrees
      dx * -0.045 + // pull left → slight counter-clockwise
      dy * 0.035; // pull down → slight clock-ish tilt
    // 3D paper tilt: pull left peels Y, pull up/down peels X
    const rotY = Math.max(-70, Math.min(70, -dx * 0.14));
    const rotX = Math.max(-55, Math.min(55, dy * 0.1));
    // How "lifted" the page feels (mix of straight pull + looping path)
    const lift = Math.min(1, (dist + pathLen * 0.18) / 160);
    return {
      active: true,
      x: dx,
      y: dy,
      rotZ,
      rotY,
      rotX,
      scale: 1 - lift * 0.08, // shrink a bit as it lifts off the stack
      opacity: Math.min(1, 0.28 + lift * 0.85),
    };
  }

  /** Decide next vs previous from final drag direction + path (works for circles too) */
  function directionFromGesture(
    dx: number,
    dy: number,
    pathLen: number,
    angleAccum: number
  ): FlipDir | null {
    const dist = Math.hypot(dx, dy);
    // Need a real swipe OR a long looping path before we commit a turn
    const spunEnough = Math.abs(angleAccum) > 1.15 || pathLen > 170;
    const pulledEnough = dist > 72;
    if (!spunEnough && !pulledEnough) return null;

    // Pure-ish spin / circle → still counts as "next" if you circled a lot
    if (spunEnough && dist < 48) {
      return angleAccum < 0 ? "next" : "prev";
    }

    // Prefer the stronger axis so up/down turns work, not only sideways
    if (Math.abs(dx) >= Math.abs(dy) * 0.85) {
      return dx < 0 ? "next" : "prev"; // left = next (natural book), right = back
    }
    return dy < 0 ? "next" : "prev"; // up = next, down = previous
  }

  /** Fly the leaf off-screen in a free path, then change the real EPUB page */
  async function completeFreeTurn(from: LeafPose, direction: FlipDir) {
    if (readingModeRef.current !== "pages" || !renditionRef.current || flipBusy.current) return;
    flipBusy.current = true;
    const duration = 520;
    const start = performance.now();
    let navigated = false;

    // End pose: keep going the way you were dragging, with extra spin (feels free, not a slide)
    const endX =
      direction === "next"
        ? (from.x <= 0 ? from.x - 520 : -480) - Math.abs(from.y) * 0.15
        : (from.x >= 0 ? from.x + 520 : 480) + Math.abs(from.y) * 0.15;
    const endY =
      from.y +
      (Math.abs(from.y) > 20 ? from.y * 0.55 : direction === "next" ? -140 : 140);
    const endRotZ = from.rotZ + (direction === "next" ? -150 : 150);
    const endRotY = direction === "next" ? -95 : 95;
    const endRotX = from.rotX + (direction === "next" ? -18 : 18);

    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeInOutCubic(t);
        applyLeaf({
          active: true,
          x: from.x + (endX - from.x) * e,
          y: from.y + (endY - from.y) * e,
          rotZ: from.rotZ + (endRotZ - from.rotZ) * e,
          rotY: from.rotY + (endRotY - from.rotY) * e,
          rotX: from.rotX + (endRotX - from.rotX) * e,
          scale: from.scale * (1 - e * 0.12),
          opacity: from.opacity * (1 - e * 0.92),
        });
        // Swap the real page once the leaf is mostly out of the way
        if (!navigated && t >= 0.38) {
          navigated = true;
          if (direction === "next") void renditionRef.current?.next();
          else void renditionRef.current?.prev();
        }
        if (t < 1) window.requestAnimationFrame(frame);
        else resolve();
      };
      window.requestAnimationFrame(frame);
    });

    applyLeaf(IDLE_LEAF);
    flipBusy.current = false;
  }

  /** Soft snap back when the gesture was too small (page returns home) */
  async function snapLeafBack(from: LeafPose) {
    const duration = 260;
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeOutCubic(t);
        const live = 1 - e;
        applyLeaf({
          active: live > 0.02,
          x: from.x * live,
          y: from.y * live,
          rotZ: from.rotZ * live,
          rotY: from.rotY * live,
          rotX: from.rotX * live,
          scale: 1 - (1 - from.scale) * live,
          opacity: from.opacity * live,
        });
        if (t < 1) window.requestAnimationFrame(frame);
        else resolve();
      };
      window.requestAnimationFrame(frame);
    });
    applyLeaf(IDLE_LEAF);
  }

  /**
   * Keyboard / wheel preset: free arc + spin (not a boring left-right slide).
   * Next flies up-left while spinning; prev flies down-right while spinning the other way.
   */
  async function animatePresetTurn(direction: FlipDir) {
    if (readingModeRef.current !== "pages" || !renditionRef.current || flipBusy.current) return;
    flipBusy.current = true;
    const duration = 560;
    const start = performance.now();
    let navigated = false;
    const sign = direction === "next" ? -1 : 1;

    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeInOutCubic(t);
        // Parametric free path: diagonal + sine wave so it can feel like a curve/loop
        const wave = Math.sin(e * Math.PI); // 0 → 1 → 0 bump for arc
        const loop = Math.sin(e * Math.PI * 2) * 0.35; // small circle-ish wiggle
        applyLeaf({
          active: true,
          x: sign * e * 540 + loop * 90 * sign,
          y: sign * e * 90 - wave * 160 * (direction === "next" ? 1 : -0.6) + loop * 70,
          rotZ: sign * e * 170 + loop * 40,
          rotY: sign * e * 80,
          rotX: -wave * 28 * (direction === "next" ? 1 : -1),
          scale: 1 - e * 0.1,
          opacity: Math.min(1, 0.4 + e * 0.7) * (1 - Math.max(0, e - 0.7) / 0.3),
        });
        if (!navigated && t >= 0.4) {
          navigated = true;
          if (direction === "next") void renditionRef.current?.next();
          else void renditionRef.current?.prev();
        }
        if (t < 1) window.requestAnimationFrame(frame);
        else resolve();
      };
      window.requestAnimationFrame(frame);
    });

    applyLeaf(IDLE_LEAF);
    flipBusy.current = false;
  }

  /** Turn page with free motion (keyboard, wheel, buttons all use this) */
  function turnPage(direction: FlipDir, throttle = false) {
    if (readingModeRef.current !== "pages") return;
    const now = Date.now();
    if (throttle && now - wheelState.current.lastTurnAt < 420) return;
    wheelState.current.lastTurnAt = now;
    void animatePresetTurn(direction);
  }

  /**
   * Start free drag from any edge (top/right/bottom/left) — not right-corner only.
   * Center stays free so you can still select text.
   */
  function isFreeGrabZone(
    clientX: number,
    clientY: number,
    width: number,
    height: number,
    rectLeft: number,
    rectTop: number
  ): boolean {
    const x = clientX - rectLeft;
    const y = clientY - rectTop;
    const edgeX = Math.max(48, width * 0.14); // how thick the left/right grab strip is
    const edgeY = Math.max(44, height * 0.12); // how thick the top/bottom grab strip is
    const onLeft = x <= edgeX;
    const onRight = x >= width - edgeX;
    const onTop = y <= edgeY;
    const onBottom = y >= height - edgeY;
    return onLeft || onRight || onTop || onBottom;
  }

  /** Shared: begin free page drag from a pointer/touch point */
  function beginFreeDrag(clientX: number, clientY: number): boolean {
    if (readingModeRef.current !== "pages" || flipBusy.current) return false;
    const host = stageRef.current;
    const rect = host?.getBoundingClientRect();
    const width = rect?.width || window.innerWidth;
    const height = rect?.height || window.innerHeight;
    const left = rect?.left || 0;
    const top = rect?.top || 0;
    if (!isFreeGrabZone(clientX, clientY, width, height, left, top)) {
      freeDrag.current = null;
      return false;
    }
    freeDrag.current = {
      active: true,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      width,
      height,
      pathLen: 0,
      angleAccum: 0,
      lastSegAngle: null,
    };
    // Tiny lift so the leaf appears the moment you grab an edge
    applyLeaf({
      active: true,
      x: 0,
      y: 0,
      rotZ: 0,
      rotY: 0,
      rotX: 0,
      scale: 0.995,
      opacity: 0.35,
    });
    return true;
  }

  /** Shared: move free leaf — tracks arcs for circle spin */
  function moveFreeDrag(clientX: number, clientY: number, preventable?: Event) {
    const drag = freeDrag.current;
    if (!drag?.active || flipBusy.current) return;
    const dx = clientX - drag.startX;
    const dy = clientY - drag.startY;
    const segX = clientX - drag.lastX;
    const segY = clientY - drag.lastY;
    const segLen = Math.hypot(segX, segY);
    if (segLen < 0.5 && Math.hypot(dx, dy) < 4) return;

    // Path length = how far the finger traveled (circles add up even if you end near start)
    drag.pathLen += segLen;

    // Angle delta between segments → spinning the page when you go in circles
    if (segLen > 1.2) {
      const segAngle = Math.atan2(segY, segX);
      if (drag.lastSegAngle != null) {
        let delta = segAngle - drag.lastSegAngle;
        // Keep delta in (-π, π] so full loops don't jump
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        drag.angleAccum += delta;
      }
      drag.lastSegAngle = segAngle;
    }
    drag.lastX = clientX;
    drag.lastY = clientY;

    preventable?.preventDefault?.();
    applyLeaf(poseFromDrag(dx, dy, drag.angleAccum, drag.pathLen));
  }

  /** Shared: release free drag — complete turn or snap home */
  function endFreeDrag(clientX: number, clientY: number) {
    const drag = freeDrag.current;
    freeDrag.current = null;
    if (!drag?.active) return;
    const dx = clientX - drag.startX;
    const dy = clientY - drag.startY;
    const from = leafRef.current;
    const dir = directionFromGesture(dx, dy, drag.pathLen, drag.angleAccum);
    if (dir) void completeFreeTurn(from.active ? from : poseFromDrag(dx, dy, drag.angleAccum, drag.pathLen), dir);
    else void snapLeafBack(from.active ? from : poseFromDrag(dx, dy, drag.angleAccum, drag.pathLen));
  }

  function injectHighlightStyles(doc: Document) {
    if (doc.getElementById("wonder-reader-highlight-css")) return;
    const style = doc.createElement("style");
    style.id = "wonder-reader-highlight-css";
    style.textContent = `
      ::selection {
        background: rgba(255, 182, 200, 0.48) !important;
        color: inherit !important;
      }
      ::-moz-selection {
        background: rgba(255, 182, 200, 0.48) !important;
        color: inherit !important;
      }
      /* epub.js highlight rects — clean light pink, no muddy blend */
      svg.epubjs-hl,
      .epubjs-hl,
      g[class*="epubjs-hl"] rect,
      .${HIGHLIGHT_CLASS},
      rect.${HIGHLIGHT_CLASS} {
        fill: #ffb6c8 !important;
        fill-opacity: 0.42 !important;
        mix-blend-mode: normal !important;
        stroke: none !important;
      }
    `;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function addPinkHighlight(cfi: string, quoteId?: string) {
    renditionRef.current?.annotations.add(
      "highlight",
      cfi,
      quoteId ? { quoteId } : {},
      undefined,
      HIGHLIGHT_CLASS,
      { ...HIGHLIGHT_PINK }
    );
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
      injectHighlightStyles(readerDocument);

      // Free page drag from any edge — finger can then go anywhere (up/down/circles)
      const touchStarted = (event: TouchEvent) => {
        const t = event.touches[0];
        if (t) beginFreeDrag(t.clientX, t.clientY);
      };
      const touchMoved = (event: TouchEvent) => {
        const t = event.touches[0];
        if (t && freeDrag.current?.active) moveFreeDrag(t.clientX, t.clientY, event);
      };
      const touchEnded = (event: TouchEvent) => {
        const t = event.changedTouches[0];
        const fallbackX = freeDrag.current?.lastX ?? freeDrag.current?.startX ?? 0;
        const fallbackY = freeDrag.current?.lastY ?? freeDrag.current?.startY ?? 0;
        endFreeDrag(t?.clientX ?? fallbackX, t?.clientY ?? fallbackY);
      };

      readerDocument.addEventListener("wheel", handleReaderWheel, { passive: false });
      readerDocument.addEventListener("keydown", handleReaderKey);
      readerDocument.addEventListener("touchstart", touchStarted, { passive: true });
      readerDocument.addEventListener("touchmove", touchMoved, { passive: false });
      readerDocument.addEventListener("touchend", touchEnded, { passive: false });
      readerDocument.addEventListener("touchcancel", touchEnded, { passive: false });
      contentCleanups.push(() => {
        readerDocument.removeEventListener("wheel", handleReaderWheel);
        readerDocument.removeEventListener("keydown", handleReaderKey);
        readerDocument.removeEventListener("touchstart", touchStarted);
        readerDocument.removeEventListener("touchmove", touchMoved);
        readerDocument.removeEventListener("touchend", touchEnded);
        readerDocument.removeEventListener("touchcancel", touchEnded);
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
      locationHrefRef.current = location.start.href || activeChapter?.href || "";
      setChapterHref(activeChapter?.href || location.start.href || "");
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
          try {
            addPinkHighlight(quote.location, quote.id);
          } catch {
            /* bad CFI — skip */
          }
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
    try {
      // Remove any sloppy partial mark at this CFI first
      renditionRef.current?.annotations.remove(selection.cfi, "highlight");
    } catch {
      /* none yet */
    }
    try {
      addPinkHighlight(selection.cfi, quote.id);
    } catch {
      /* CFI may fail on some EPUBs — still save the quote */
    }
    quoteCallback.current(quote);
    // Clear native selection so UI feels clean
    try {
      const contents = renditionRef.current?.getContents?.() as
        | Array<{ window?: Window }>
        | { window?: Window }
        | undefined;
      const list = Array.isArray(contents) ? contents : contents ? [contents] : [];
      list.forEach((c) => c.window?.getSelection?.()?.removeAllRanges());
    } catch {
      /* ignore */
    }
    setSelection(null);
    setAddingThought(false);
    setThoughtDraft("");
  }

  function requestClose() {
    setClosePrompt(true);
  }

  async function openChapterImprint(forceRebuild = false) {
    const href = chapterHref || locationHrefRef.current;
    if (!href || !epubRef.current) {
      setImprintError("Open a chapter first (leave the table of contents).");
      return;
    }
    const label =
      chapters.find((c) => sameDocument(c.href, href))?.label?.trim() ||
      "Current chapter";

    if (!forceRebuild) {
      const cached = loadImprint(book.id, href);
      if (cached?.cards?.length) {
        setImprint(cached);
        setImprintError("");
        return;
      }
    }

    setImprintBusy(true);
    setImprintError("");
    try {
      let plain = await extractChapterText(epubRef.current, href);
      // Fallback: live rendered document text
      if (plain.length < 120) {
        try {
          const contents = renditionRef.current?.getContents?.() as
            | Array<{ document?: Document }>
            | { document?: Document }
            | undefined;
          const list = Array.isArray(contents)
            ? contents
            : contents
              ? [contents]
              : [];
          const chunks = list
            .map((c) => c.document?.body?.innerText || "")
            .filter(Boolean);
          if (chunks.length) plain = chunks.join("\n\n");
        } catch {
          /* ignore */
        }
      }
      if (plain.length < 80) {
        plain = htmlToPlainText(plain);
      }
      if (plain.trim().length < 80) {
        setImprintError(
          "Not enough chapter text to imprint. Try a content chapter, not the cover or TOC."
        );
        return;
      }
      const built = buildChapterImprint({
        bookId: book.id,
        chapterHref: href,
        chapterLabel: label,
        plainText: plain,
      });
      if (!built.cards.length || built.cards.length < 2) {
        setImprintError("Could not distill enough ideas from this chapter.");
        return;
      }
      saveImprint(built);
      setImprint(built);
    } catch {
      setImprintError("Imprint failed on this chapter. Try another section.");
    } finally {
      setImprintBusy(false);
    }
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
          <button
            type="button"
            className="bl-imprint-btn"
            disabled={imprintBusy || showContents}
            onClick={() => void openChapterImprint(false)}
            title="Animated chapter summary + quiz"
          >
            {imprintBusy ? "…" : "Imprint"}
          </button>
        </div>
      </div>
      {imprintError ? <p className="bl-imprint-error">{imprintError}</p> : null}

      <div
        className={`bl-reader-stage-wrap${leaf.active ? " is-free-leaf" : ""}${
          !isNarrow ? " is-3d-pages" : ""
        }`}
      >
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

        <div className="bl-flip-scene">
          <div ref={stageRef} className="bl-reader-stage" />

          {/* Free page leaf — follows finger any direction (x/y/spin/tilt) */}
          <div
            className={`bl-page-leaf${leaf.active ? " is-on" : ""}`}
            style={
              {
                ["--lx" as string]: `${leaf.x}px`,
                ["--ly" as string]: `${leaf.y}px`,
                ["--rz" as string]: `${leaf.rotZ}deg`,
                ["--ry" as string]: `${leaf.rotY}deg`,
                ["--rx" as string]: `${leaf.rotX}deg`,
                ["--sc" as string]: String(leaf.scale),
                ["--op" as string]: String(leaf.opacity),
              } as CSSProperties
            }
            aria-hidden
          >
            <div className="bl-page-leaf-front" />
            <div className="bl-page-leaf-back" />
            <div className="bl-page-leaf-glow" />
          </div>

          {/*
            Grab from ANY edge (top/right/bottom/left), then drag anywhere —
            up, down, diagonal, full circles. Middle stays free for text select.
          */}
          {!isNarrow && !showContents ? (
            <div className="bl-free-hit-frame" aria-hidden>
              {(["top", "right", "bottom", "left"] as const).map((edge) => (
                <div
                  key={edge}
                  className={`bl-free-hit bl-free-hit-${edge}`}
                  title="Grab any edge — drag anywhere (even in circles) to turn"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    if (!beginFreeDrag(event.clientX, event.clientY)) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    if (!freeDrag.current?.active) return;
                    moveFreeDrag(event.clientX, event.clientY);
                  }}
                  onPointerUp={(event) => {
                    if (!freeDrag.current?.active && !leafRef.current.active) return;
                    try {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    } catch {
                      /* ignore */
                    }
                    endFreeDrag(event.clientX, event.clientY);
                  }}
                  onPointerCancel={() => {
                    const drag = freeDrag.current;
                    freeDrag.current = null;
                    if (drag?.active || leafRef.current.active) {
                      void snapLeafBack(leafRef.current);
                    }
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
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

      {imprint ? (
        <ChapterImprintView
          imprint={imprint}
          onClose={() => setImprint(null)}
          onRebuild={() => void openChapterImprint(true)}
        />
      ) : null}
    </div>
  );
}
