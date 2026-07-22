/**
 * Mel learns from Melani over time (local only).
 * fix: ...  | never say ...  | always ...  | style: ...
 * Also auto-learns from short corrections.
 */
const LEARN_KEY = "dr-melani-mel-learn-v1";

export type MelLearn = {
  /** Things she said not to do / never say */
  never: string[];
  /** Always do this in replies */
  always: string[];
  /** Free style notes */
  style: string[];
  /** Explicit fixes from her */
  fixes: { at: string; text: string }[];
  /** smalltalk: pure | light_data | off */
  smalltalk: "pure" | "light_data";
};

function empty(): MelLearn {
  return {
    never: [
      "decorative",
      "half-assing",
      "ghosting",
      "bold strategy",
      "ask: status",
      "what to ask",
      "try:",
    ],
    always: ["small talk stays small talk", "no command menus unless she asks help"],
    style: [],
    fixes: [],
    smalltalk: "pure",
  };
}

export function loadLearn(): MelLearn {
  try {
    const raw = localStorage.getItem(LEARN_KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw) as Partial<MelLearn>;
    const base = empty();
    return {
      never: [...new Set([...(base.never || []), ...(data.never || [])])].slice(
        -60
      ),
      always: [...new Set([...(base.always || []), ...(data.always || [])])].slice(
        -40
      ),
      style: data.style || [],
      fixes: data.fixes || [],
      smalltalk: data.smalltalk === "light_data" ? "light_data" : "pure",
    };
  } catch {
    return empty();
  }
}

export function saveLearn(L: MelLearn) {
  try {
    localStorage.setItem(LEARN_KEY, JSON.stringify(L));
  } catch {
    /* ignore */
  }
}

function pushUnique(list: string[], item: string, max: number): string[] {
  const t = item.trim();
  if (!t) return list;
  return [...list.filter((x) => x.toLowerCase() !== t.toLowerCase()), t].slice(
    -max
  );
}

/**
 * Handle explicit learning commands. Returns Mel's ack or null.
 */
export function applyLearnCommand(raw: string): string | null {
  const t = raw.trim();
  const L = loadLearn();

  // fix: don't dump water stats on hi
  const fix = t.match(/^fix\s*:?\s+(.+)$/i);
  if (fix?.[1]) {
    const text = fix[1].trim();
    L.fixes = [...L.fixes, { at: new Date().toISOString(), text }].slice(-80);
    // Heuristics from common fixes
    if (/small talk|hi|hey|yo|casual/i.test(text)) {
      L.smalltalk = "pure";
      L.always = pushUnique(
        L.always,
        "on hi/yo only small talk, no water protein flags",
        40
      );
    }
    if (/never say|don't say|dont say|stop saying/i.test(text)) {
      const m = text.match(
        /(?:never say|don't say|dont say|stop saying)\s+["']?(.+?)["']?\s*$/i
      );
      if (m?.[1]) L.never = pushUnique(L.never, m[1], 60);
    }
    if (/no menu|no command|don't list|dont list/i.test(text)) {
      L.always = pushUnique(L.always, "no command menus unless help", 40);
    }
    if (/clearer|plain|simple|not weird|no metaphor/i.test(text)) {
      L.always = pushUnique(L.always, "plain English, no weird metaphors", 40);
      L.never = pushUnique(L.never, "decorative", 60);
    }
    saveLearn(L);
    return "Got it. I'll adjust from that.";
  }

  const never = t.match(/^never\s+say\s+(.+)$/i);
  if (never?.[1]) {
    L.never = pushUnique(L.never, never[1], 60);
    saveLearn(L);
    return `Won't say: ${never[1].trim()}`;
  }

  const always = t.match(/^always\s+(.+)$/i);
  if (always?.[1]) {
    L.always = pushUnique(L.always, always[1], 40);
    saveLearn(L);
    return `Always: ${always[1].trim()}`;
  }

  const style = t.match(/^style\s*:?\s+(.+)$/i);
  if (style?.[1]) {
    L.style = pushUnique(L.style, style[1], 30);
    saveLearn(L);
    return `Style noted: ${style[1].trim()}`;
  }

  if (/^learn$/i.test(t) || /^what did you learn$/i.test(t)) {
    const lines = [
      L.smalltalk === "pure" ? "Small talk: pure (no stats)." : "Small talk: light data ok.",
      L.never.length ? `Never: ${L.never.slice(-8).join("; ")}` : null,
      L.always.length ? `Always: ${L.always.slice(-6).join("; ")}` : null,
      L.style.length ? `Style: ${L.style.slice(-4).join("; ")}` : null,
      L.fixes.length ? `Fixes saved: ${L.fixes.length}` : null,
    ].filter(Boolean);
    return lines.join("\n") || "Nothing learned yet. Say: fix: ...";
  }

  // Natural corrections without prefix
  if (
    /^(wtf|what does that mean|that made no sense|makes no sense|confusing|weird|stop that|don't do that|dont do that|too much|chill|just talk|small talk)/i.test(
      t
    )
  ) {
    L.smalltalk = "pure";
    L.always = pushUnique(
      L.always,
      "on hi/yo only small talk, no water protein flags",
      40
    );
    L.always = pushUnique(L.always, "plain English, no weird metaphors", 40);
    L.never = pushUnique(L.never, "decorative", 60);
    L.fixes = [
      ...L.fixes,
      { at: new Date().toISOString(), text: t.slice(0, 160) },
    ].slice(-80);
    saveLearn(L);
    return "Fair. I'll keep small talk normal.";
  }

  return null;
}

/** Strip banned phrases from a draft reply — keep line breaks (scanning needs chunks) */
export function polishReply(draft: string): string {
  const L = loadLearn();
  let out = draft;
  for (const n of L.never) {
    if (!n) continue;
    const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "");
  }
  // Collapse only horizontal spaces/tabs on a line — NEVER squash newlines into one wall of text
  out = out
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\.\s*\./g, ".")
    .replace(/^\s*[.,]\s*/gm, "")
    .trim();
  return out || "Yeah.";
}

export function wantsPureSmalltalk(): boolean {
  return loadLearn().smalltalk === "pure";
}
