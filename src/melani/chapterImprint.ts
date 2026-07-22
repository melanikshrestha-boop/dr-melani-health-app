/**
 * Chapter Imprint — animated card summary + quiz from real chapter text.
 * Extractive (no paid API). Stores per book + chapter in localStorage.
 */

export type ImprintCard = {
  id: string;
  kind: "hook" | "idea" | "beat" | "detail" | "close";
  title: string;
  body: string;
};

export type ImprintQuizItem = {
  id: string;
  type: "recall" | "cloze" | "truefalse";
  prompt: string;
  /** For cloze / truefalse */
  answer: string;
  /** Multiple choices when present */
  choices?: string[];
  explanation: string;
};

export type ChapterImprint = {
  bookId: string;
  chapterHref: string;
  chapterLabel: string;
  createdAt: number;
  wordCount: number;
  cards: ImprintCard[];
  quiz: ImprintQuizItem[];
  sourceSentences: string[];
};

const STORE_KEY = "wonder-chapter-imprints-v1";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function loadAll(): Record<string, ChapterImprint> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ChapterImprint>;
  } catch {
    return {};
  }
}

function saveAll(map: Record<string, ChapterImprint>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

export function imprintKey(bookId: string, chapterHref: string): string {
  return `${bookId}::${chapterHref}`;
}

export function loadImprint(
  bookId: string,
  chapterHref: string
): ChapterImprint | null {
  return loadAll()[imprintKey(bookId, chapterHref)] || null;
}

export function saveImprint(imprint: ChapterImprint): void {
  const map = loadAll();
  map[imprintKey(imprint.bookId, imprint.chapterHref)] = imprint;
  saveAll(map);
}

/** Clean HTML / epub text into plain prose */
export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Drop script/style
  doc.querySelectorAll("script, style, nav, [epub\\:type='pagebreak']").forEach((n) => n.remove());
  const text = doc.body?.textContent || "";
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
  return parts
    .map((s) => s.trim())
    .filter((s) => s.length >= 28 && s.length <= 320)
    .filter((s) => /[a-zA-Z]{3,}/.test(s));
}

const STOP = new Set(
  `a an the and or but if in on at to for of as is was were be been being it this that these those with from by not no so than then into about over after before between under again further once here there when where why how all each few more most other some such only own same too very can will just don should now you your we our they their he she his her i me my`.split(
    " "
  )
);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Score sentences by term frequency + position (start/end boost) */
function rankSentences(sentences: string[]): { sentence: string; score: number }[] {
  const freq = new Map<string, number>();
  for (const s of sentences) {
    for (const w of tokenize(s)) freq.set(w, (freq.get(w) || 0) + 1);
  }
  return sentences
    .map((sentence, i) => {
      const words = tokenize(sentence);
      let score = words.reduce((sum, w) => sum + (freq.get(w) || 0), 0);
      // Prefer denser, mid-length ideas
      if (sentence.length > 60 && sentence.length < 200) score *= 1.15;
      // Opening thesis + closing takeaway
      if (i < 3) score *= 1.25;
      if (i >= sentences.length - 3) score *= 1.2;
      // Boost contrast / claim language
      if (/\b(because|therefore|however|important|key|means|shows|argues|proves)\b/i.test(sentence)) {
        score *= 1.2;
      }
      return { sentence, score };
    })
    .sort((a, b) => b.score - a.score);
}

function pickDiverse(
  ranked: { sentence: string; score: number }[],
  count: number
): string[] {
  const picked: string[] = [];
  for (const row of ranked) {
    if (picked.length >= count) break;
    const tokens = new Set(tokenize(row.sentence));
    const tooClose = picked.some((p) => {
      const pt = tokenize(p);
      const overlap = pt.filter((w) => tokens.has(w)).length;
      return overlap / Math.max(pt.length, 1) > 0.55;
    });
    if (!tooClose) picked.push(row.sentence);
  }
  return picked;
}

function buildCards(
  chapterLabel: string,
  ideas: string[],
  wordCount: number
): ImprintCard[] {
  const cards: ImprintCard[] = [];
  cards.push({
    id: uid("hook"),
    kind: "hook",
    title: chapterLabel || "This chapter",
    body:
      wordCount > 0
        ? `Imprint · ${wordCount.toLocaleString()} words distilled into the ideas that matter.`
        : "Imprint · the spine of this chapter, card by card.",
  });

  if (ideas[0]) {
    cards.push({
      id: uid("idea"),
      kind: "idea",
      title: "Core idea",
      body: ideas[0],
    });
  }

  ideas.slice(1, 4).forEach((s, i) => {
    cards.push({
      id: uid("beat"),
      kind: "beat",
      title: `Beat ${i + 1}`,
      body: s,
    });
  });

  ideas.slice(4, 6).forEach((s, i) => {
    cards.push({
      id: uid("detail"),
      kind: "detail",
      title: i === 0 ? "Hold this" : "Also note",
      body: s,
    });
  });

  cards.push({
    id: uid("close"),
    kind: "close",
    title: "Before you go on",
    body:
      ideas.length > 1
        ? `If you only remember one line: ${ideas[0]}`
        : "Read once more, then take the quiz on the main ideas.",
  });

  return cards;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuiz(ideas: string[], allSentences: string[]): ImprintQuizItem[] {
  const quiz: ImprintQuizItem[] = [];
  const pool = ideas.length ? ideas : allSentences.slice(0, 6);

  // 1) True/false from core idea
  if (pool[0]) {
    const trueStmt = pool[0];
    const decoy =
      allSentences.find(
        (s) => s !== trueStmt && tokenize(s).length > 5 && !pool.includes(s)
      ) || trueStmt.replace(/\b(not|never|always|most|all)\b/gi, "sometimes");
    const askTrue = Math.random() > 0.4;
    quiz.push({
      id: uid("q"),
      type: "truefalse",
      prompt: `True or false for this chapter:\n\n“${askTrue ? trueStmt : decoy}”`,
      answer: askTrue ? "True" : "False",
      choices: ["True", "False"],
      explanation: askTrue
        ? "That tracks the chapter’s main claim."
        : "That is not the chapter’s main claim. The real idea is closer to: " + trueStmt,
    });
  }

  // 2–3) Cloze on key idea sentences
  for (const idea of pool.slice(0, 3)) {
    const words = idea.split(/\s+/);
    if (words.length < 8) continue;
    // Blank a content word near the middle
    const mid = Math.floor(words.length / 2);
    let blankAt = mid;
    for (let d = 0; d < 5; d++) {
      const i = mid + (d % 2 === 0 ? d : -d);
      if (i > 0 && i < words.length - 1 && tokenize(words[i]).length) {
        blankAt = i;
        break;
      }
    }
    const answer = words[blankAt].replace(/[^\w'-]/g, "");
    if (answer.length < 3) continue;
    const clozeWords = [...words];
    clozeWords[blankAt] = "______";
    // Wrong options from other sentences
    const distractors = shuffle(
      allSentences
        .flatMap((s) => tokenize(s))
        .filter((w) => w.length >= 4 && w !== answer.toLowerCase())
    )
      .slice(0, 8)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    const unique = [...new Set(distractors)].filter(
      (d) => d.toLowerCase() !== answer.toLowerCase()
    );
    const choices = shuffle([answer, ...unique.slice(0, 3)]).slice(0, 4);
    if (choices.length < 2) continue;
    quiz.push({
      id: uid("q"),
      type: "cloze",
      prompt: `Fill the blank from this chapter idea:\n\n${clozeWords.join(" ")}`,
      answer,
      choices,
      explanation: `The full line: ${idea}`,
    });
  }

  // 4) Recall — which idea belongs
  if (pool.length >= 2) {
    const correct = pool[1] || pool[0];
    const wrongPool = shuffle(
      allSentences.filter((s) => s !== correct && !pool.slice(0, 3).includes(s))
    ).slice(0, 2);
    const choices = shuffle([correct, ...wrongPool]).slice(0, 3);
    if (choices.length >= 2) {
      quiz.push({
        id: uid("q"),
        type: "recall",
        prompt: "Which statement best matches a main idea of this chapter?",
        answer: correct,
        choices,
        explanation: "That sentence was ranked as a core beat of the chapter.",
      });
    }
  }

  // 5) Second true/false if we have material
  if (pool[1] && quiz.length < 5) {
    quiz.push({
      id: uid("q"),
      type: "truefalse",
      prompt: `True or false:\n\n“${pool[1]}”`,
      answer: "True",
      choices: ["True", "False"],
      explanation: "This was extracted as one of the chapter’s main beats.",
    });
  }

  return quiz.slice(0, 6);
}

/**
 * Build imprint from plain chapter text.
 */
export function buildChapterImprint(input: {
  bookId: string;
  chapterHref: string;
  chapterLabel: string;
  plainText: string;
}): ChapterImprint {
  const sentences = splitSentences(input.plainText);
  const wordCount = input.plainText.split(/\s+/).filter(Boolean).length;
  const ranked = rankSentences(sentences);
  const ideas = pickDiverse(ranked, 6);
  const cards = buildCards(input.chapterLabel, ideas, wordCount);
  const quiz = buildQuiz(ideas, sentences);

  return {
    bookId: input.bookId,
    chapterHref: input.chapterHref,
    chapterLabel: input.chapterLabel,
    createdAt: Date.now(),
    wordCount,
    cards,
    quiz,
    sourceSentences: ideas,
  };
}

/**
 * Pull plain text for a chapter href from an epub.js Book.
 */
export async function extractChapterText(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  epub: any,
  chapterHref: string
): Promise<string> {
  if (!epub || !chapterHref) return "";
  try {
    // Resolve spine item by href
    const href = chapterHref.split("#")[0];
    let section =
      typeof epub.spine?.get === "function" ? epub.spine.get(href) : null;
    if (!section && epub.spine?.spineItems) {
      section = epub.spine.spineItems.find(
        (item: { href?: string }) =>
          item.href === href ||
          item.href?.endsWith(href) ||
          href.endsWith(item.href || "")
      );
    }
    if (!section) {
      // Fallback: load via load method
      const loaded = await epub.load(href);
      if (typeof loaded === "string") return htmlToPlainText(loaded);
      if (loaded?.documentElement || loaded?.body) {
        return htmlToPlainText(
          loaded.documentElement?.outerHTML || loaded.body?.innerHTML || ""
        );
      }
    }
    if (section?.load) {
      const doc = await section.load(epub.load.bind(epub));
      if (typeof doc === "string") return htmlToPlainText(doc);
      const html =
        doc?.documentElement?.outerHTML ||
        doc?.body?.innerHTML ||
        (doc as Document)?.documentElement?.outerHTML ||
        "";
      if (html) return htmlToPlainText(html);
    }
    // Last resort: request section by URL
    const res = await epub.archive?.getText?.(href);
    if (typeof res === "string") return htmlToPlainText(res);
  } catch {
    /* try alternate */
  }
  return "";
}
