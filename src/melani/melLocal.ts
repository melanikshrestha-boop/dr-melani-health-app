/**
 * Mel local coach. Tier 1 + 2. No API. No web.
 * Dense. No fluff. No em dashes.
 * Answers the actual question first — never dumps "TODAY" status on food asks.
 */
import {
  applyPinCommand,
  buildLiveContext,
  loadPins,
  loadSessionMemory,
  pushSessionMemory,
  searchLifeLog,
} from "./melContext";
import {
  applyLearnCommand,
  polishReply,
  wantsPureSmalltalk,
} from "./melLearn";
import { MEAL_PRESETS } from "./data";
import { writeTonightBrief } from "./bodyBrief";

function noEm(s: string): string {
  return s
    .replace(/\u2014/g, ",")
    .replace(/\u2013/g, "-")
    .replace(/—/g, ",")
    .replace(/–/g, "-");
}

function pick(hay: string, re: RegExp): boolean {
  return re.test(hay);
}

function finish(q: string, draft: string): string {
  const reply = noEm(polishReply(draft));
  pushSessionMemory(q, reply);
  return reply;
}

export function melLocalReply(
  userText: string,
  pageId?: string,
  pageTitle?: string
): string {
  const q = userText.trim();
  const low = q.toLowerCase();

  // Learn from corrections first (fix: ..., never say ..., natural "wtf")
  const learned = applyLearnCommand(q);
  if (learned) return finish(q, learned);

  const snap = buildLiveContext(pageId, pageTitle);

  const water = snap.match(/Water:\s*([\d.]+)\/(\d+)/);
  const protein = snap.match(/Protein:\s*([\d.]+)\/([\d.]+)g/);
  const cals = snap.match(/Calories:\s*([\d.]+)\/([\d.]+)/);
  const phase = snap.match(/Phase estimate:\s*(.+)/);
  const sleep = snap.match(/SLEEP TODAY\n(.+)/);
  const flagsBlock = snap.match(
    /RED FLAGS[\s\S]*?\n([\s\S]*?)\n\nDOCTOR QUESTIONS/
  );
  const flags =
    flagsBlock?.[1]
      ?.split("\n")
      .map((l) => l.replace(/^\d+\.\s*/, "").trim())
      .filter((l) => l && !/^None computed/i.test(l)) || [];
  const doctorBlock = snap.match(
    /DOCTOR QUESTIONS PACK[\s\S]*?\n([\s\S]*?)\n\nLIFE LOG/
  );
  const doctorQs =
    doctorBlock?.[1]
      ?.split("\n")
      .map((l) => l.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 6) || [];
  const weekWater = snap.match(/Water avg:\s*([\d.]+)/);
  const weekProt = snap.match(/Protein avg[^:]*:\s*([\d.]+)g/);
  const mealsToday = snap.match(/Meals logged today:\s*(.+)/)?.[1]?.trim();
  const gymWeek = snap.match(/Week plan \(sat to fri\):\s*(.+)/)?.[1]?.trim();
  const session = loadSessionMemory();
  const pins = loadPins();

  // Tier 2 pin commands
  const pinOut = applyPinCommand(q);
  if (pinOut) return finish(q, pinOut);

  // Nightly body brief — rebuild from live data and paste full report
  if (
    pick(low, /^(brief|body brief|nightly|nightly brief|tonight)\b/) ||
    pick(low, /\b(write|show|give me|open)\s+(my\s+)?(body\s+)?brief\b/)
  ) {
    const brief = writeTonightBrief();
    return finish(q, brief.fullText);
  }

  if (pick(low, /^log\s*:?\s+/)) {
    return finish(q, "Logged.");
  }

  if (pick(low, /^goal\s+/)) {
    return finish(
      q,
      `Goal saved.${protein ? ` Protein ${protein[1]}/${protein[2]}g.` : ""}`
    );
  }

  // find / search logs
  const findM = low.match(/^(find|search|logs?)\s+(.+)$/);
  if (findM?.[2]) {
    const hits = searchLifeLog(findM[2], 10);
    return finish(
      q,
      hits.length
        ? hits.map((e) => `${e.day}: ${e.text}`).join("\n")
        : `No logs match "${findM[2]}".`
    );
  }

  // Feelings / mood (e.g. "whatsup i feel goffy today")
  const feelM = low.match(
    /\b(i\s+)?(feel|feeling|im|i'm|i am)\s+([a-z][a-z' ]{1,40})/
  );
  const moodHit = low.match(
    /\b(goofy|goffy|silly|weird|off|bad|good|great|fine|tired|exhausted|sad|happy|anxious|stressed|stress|meh|blah|foggy|sick|mid|lazy|bored|lonely|angry|mad|upset)\b/
  );
  if (
    feelM ||
    (moodHit &&
      pick(low, /\b(feel|feeling|mood|today|rn|right now|kinda|kind of)\b/))
  ) {
    const raw = (feelM?.[3] || moodHit?.[1] || "that way")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\bgoffy\b/g, "goofy")
      .slice(0, 40);
    let reply = "";
    if (/\b(goofy|silly|weird)\b/.test(raw)) {
      reply = "Goofy is valid. Ride it. I'm here.";
    } else if (/\b(tired|exhausted|foggy|low)\b/.test(raw)) {
      reply =
        "Tired tracks. Water, protein, and a short break beat pushing through fog.";
      if (sleep) reply += ` Sleep log: ${sleep[1].trim()}.`;
    } else if (/\b(sad|down|upset|lonely|bad|blah|meh)\b/.test(raw)) {
      reply =
        "Sorry it's a rough one. You don't have to fix it in one chat. I'm here.";
    } else if (/\b(anxious|stress|stressed|mad|angry)\b/.test(raw)) {
      reply =
        "That load is real. One thing at a time. Want gym, food, or just to vent?";
    } else if (/\b(good|great|happy|fine|ok|okay|energetic)\b/.test(raw)) {
      reply = "Good. Keep that. What's the move today?";
    } else if (/\b(bored|lazy|mid)\b/.test(raw)) {
      reply = "Mid mode. Fair. Pick one small thing or just sit.";
    } else {
      reply = `Got you feeling ${raw}. I'm here. Say more if you want.`;
    }
    if (
      pick(low, /\b(hi|hey|yo|sup|wassup|whatsup|what's up|whats up|hello)\b/)
    ) {
      reply = `Hey. ${reply}`;
    }
    return finish(q, reply);
  }

  // Greetings (whatsup, hey, yo…). Match energy. No command menu.
  if (
    pick(
      low,
      /^(hi|hey|yo|yoo|yooo|hello|sup|wassup|whatsup|what's up|whats up|heyy+|hiya)\b/
    ) ||
    pick(low, /^(what'?s\s*up|whatsup|wassup)\b/)
  ) {
    const pure = wantsPureSmalltalk();
    const table: Record<string, string[]> = {
      yo: ["Yo.", "Yo. What's good.", "Yo. I'm here."],
      yoo: ["Yo.", "Yoo."],
      yooo: ["Yo."],
      hi: ["Hi.", "Hey.", "Hi. How's it going."],
      hey: ["Hey.", "Hey. What's up.", "Hey."],
      heyy: ["Hey."],
      hello: ["Hey.", "Hello."],
      sup: ["Sup.", "Not much. You?"],
      wassup: ["Sup.", "Hey. What's good."],
      whatsup: ["What's up.", "Hey. What's good."],
      whats: ["What's up."],
      what: ["What's up."],
      hiya: ["Hey."],
    };
    const key = low.split(/\s+/)[0].replace(/[^a-z']/g, "");
    const pool = table[key] || ["Hey.", "Yo.", "I'm here."];
    const pickI = (q.length + low.length) % pool.length;
    let extra = "";
    const rest = low
      .replace(
        /^(hi|hey|yo+|hello|sup|wassup|whatsup|what'?s\s*up|hiya)\b[,!.\s]*/i,
        ""
      )
      .trim();
    if (rest.length > 2) {
      extra = " I hear you.";
    } else if (
      !pure &&
      water &&
      Number(water[1]) / Number(water[2] || 1) < 0.25
    ) {
      extra = ` You're at ${water[1]} ml water.`;
    }
    return finish(q, pool[pickI] + extra);
  }

  // Short sly / small talk. Match energy. No menus.
  if (
    pick(
      low,
      /^(lol|lmao|bruh|bro|damn|ok|okay|k|nah|yeah|yep|bet|fr|true|idle|bored|ugh|meh|idk|nvm|nothing|nm|haha|ha|hm|hmm|cool|nice|wild|crazy|same|mood)\b/
    ) ||
    (low.length <= 24 &&
      !pick(
        low,
        /\b(status|protein|water|gym|sleep|lab|doctor|week|help|pin|log|goal|find|remember|fix|never|always|style|learn|breakfast|eat)\b/
      ))
  ) {
    const vibe: Record<string, string> = {
      lol: "Lol.",
      lmao: "Lmao.",
      haha: "Haha.",
      ha: "Ha.",
      bruh: "Bruh. What happened.",
      bro: "Bro.",
      damn: "Damn. You good?",
      ok: "Ok.",
      okay: "Okay.",
      k: "K.",
      nah: "Nah ok.",
      yeah: "Yeah.",
      yep: "Yep.",
      bet: "Bet.",
      fr: "Fr.",
      true: "True.",
      ugh: "Ugh. I'm here.",
      meh: "Meh. Fair.",
      idk: "Idk is fine. Sit with it a sec.",
      nvm: "Nvm. All good.",
      nothing: "Nothing works too.",
      nm: "Ok.",
      bored: "Bored. Same sometimes.",
      idle: "Idle mode. Cool.",
      hm: "Hm.",
      hmm: "Hmm.",
      cool: "Cool.",
      nice: "Nice.",
      wild: "Wild.",
      crazy: "Crazy.",
      same: "Same.",
      mood: "Mood.",
    };
    const key = low.split(/\s+/)[0].replace(/[^a-z']/g, "");
    return finish(
      q,
      vibe[key] || (session.lastUser ? "Yeah." : "I'm listening.")
    );
  }

  // Food / meal / breakfast first (before status — "today" in a food Q is not a status ask)
  const foodAsk = pick(
    low,
    /\b(eat|eating|food|meal|meals|breakfast|lunch|dinner|snack|hungry|protein|macro|macros|what should i (eat|have)|what do i eat|feed me)\b/
  );
  if (foodAsk) {
    const bfast = MEAL_PRESETS.find((m) => m.slot === "breakfast") || MEAL_PRESETS[0];
    const pHave = protein ? Number(protein[1]) : 0;
    const pWant = protein ? Number(protein[2]) : 125;
    const gap = Math.max(0, Math.round(pWant - pHave));
    const alreadyBf =
      mealsToday &&
      /breakfast/i.test(mealsToday) &&
      !/none/i.test(mealsToday);
    const phaseName = phase?.[1]?.trim() || "";
    const isMenses = /menstrual/i.test(phaseName);
    const isLuteal = /luteal/i.test(phaseName);

    // Explicit breakfast ask
    if (pick(low, /\bbreakfast\b/) || pick(low, /what should i (eat|have).*(morning|am)\b/)) {
      if (alreadyBf) {
        return finish(
          q,
          [
            "Breakfast is already logged today.",
            gap > 0
              ? `Still short ~${gap}g protein for the day. Build that at lunch.`
              : "Protein goal is on track from what you logged.",
            "If you want seconds: keep the same bowl, don't invent a second random meal.",
          ].join("\n")
        );
      }
      const lines = [
        "Run your usual breakfast (measured):",
        ...(bfast?.ingredients || []).map((x) => `- ${x}`),
        bfast
          ? `~${bfast.calories} cal · ${bfast.protein_g}g protein · ${bfast.carbs_g}g C · ${bfast.fat_g}g F · ${bfast.fiber_g}g fiber`
          : null,
        bfast?.notes || null,
        isMenses
          ? "Period window: keep the egg yolk (iron + choline). Don't skip protein."
          : null,
        isLuteal
          ? "Luteal: stick to measured honey (1 tsp max). Cravings lie."
          : null,
        "Log it in Meals when you eat it so macros update.",
      ];
      return finish(q, lines.filter(Boolean).join("\n"));
    }

    // Lunch / dinner / general eat
    if (pick(low, /\blunch\b/)) {
      return finish(
        q,
        [
          alreadyBf
            ? "Breakfast is in. Lunch should cover more of the protein gap."
            : "You haven't logged breakfast. Do the usual bowl first, then lunch.",
          gap > 0
            ? `Aim ~${Math.min(gap, 50)}g protein at lunch (fish, chicken, tofu, more Fage, eggs).`
            : "Protein already hit. Keep lunch normal size, not a second breakfast.",
          "0% added sugar. Same rules as the usual.",
        ].join("\n")
      );
    }

    if (pick(low, /\bdinner\b/)) {
      return finish(
        q,
        [
          gap > 0
            ? `Dinner needs ~${gap}g protein left (or whatever is still open after lunch).`
            : "Protein met. Dinner can be lighter protein, still real food.",
          "Plate: protein + veg + controlled carbs. No random sugar.",
          phaseName ? `Cycle note: ${phaseName}.` : null,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    // Generic "what should I eat" / food / protein
    return finish(
      q,
      [
        !alreadyBf
          ? "Default: your measured breakfast usual (Meals → What's in it)."
          : "Breakfast already logged.",
        `Protein ${pHave}/${pWant}g${gap > 0 ? ` · still need ~${gap}g` : " · met"}.`,
        cals ? `Cal ${cals[1]}/${cals[2]}.` : null,
        bfast
          ? `Usual breakfast pack: ~${bfast.protein_g}g protein / ${bfast.calories} cal if you log it.`
          : null,
        pins.find((p) => /dairy|food|eat|protein|sugar/i.test(p))
          ? `Pin: ${pins.find((p) => /dairy|food|eat|protein|sugar/i.test(p))}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  // Status only when they actually want a dashboard (not "what should I eat today")
  if (
    pick(low, /\b(status|how am i|summary|check in|check-in|dashboard)\b/) ||
    pick(low, /^(today|how's today|how is today)\??$/)
  ) {
    return finish(
      q,
      [
        "TODAY",
        water
          ? `Water ${water[1]}/${water[2]} ml`
          : "Water not logged",
        cals ? `Cal ${cals[1]}/${cals[2]}` : "Cal 0",
        protein ? `Protein ${protein[1]}/${protein[2]}g` : "Protein 0",
        mealsToday && mealsToday !== "none yet"
          ? `Meals: ${mealsToday}`
          : "Meals: none",
        sleep ? `Sleep: ${sleep[1].trim()}` : null,
        phase ? `Cycle: ${phase[1].trim()}` : null,
        gymWeek ? `Gym: ${gymWeek}` : null,
        pins.length ? `Pins: ${pins.slice(0, 3).join("; ")}` : null,
        flags.length
          ? `Flags:\n- ${flags.slice(0, 3).join("\n- ")}`
          : "No flags",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (pick(low, /\b(water|hydrat)\b/)) {
    const wHave = water ? Number(water[1]) : 0;
    const wWant = water ? Number(water[2]) : 4000;
    return finish(
      q,
      [
        `Water ${wHave}/${wWant} ml. Left ${Math.max(0, wWant - wHave)} ml.`,
        weekWater ? `7d avg ${weekWater[1]} ml.` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (pick(low, /\b(gym|train|lift|workout|cardio|lower|upper)\b/)) {
    return finish(
      q,
      [
        gymWeek ? `Plan: ${gymWeek}` : "No week plan saved yet.",
        "Rules: lower not consecutive. Cardio ≤2. Rest ≤1.",
        phase ? `Cycle: ${phase[1].trim()}` : null,
        pins.find((p) => /gym|train|lower/i.test(p))
          ? `Pin: ${pins.find((p) => /gym|train|lower/i.test(p))}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (pick(low, /\b(sleep|bed|wake|fog|tired)\b/)) {
    const migLogs = searchLifeLog("sleep", 5);
    return finish(
      q,
      [
        sleep ? sleep[1].trim() : "No sleep times logged today.",
        migLogs.length
          ? `Recent: ${migLogs.map((e) => e.text).join("; ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (pick(low, /\b(lab|ldl|lipid|doctor|ververis|visit|question)\b/)) {
    return finish(
      q,
      [
        flags
          .filter((f) => /lipid|LDL|lab|migraine/i.test(f))
          .slice(0, 3)
          .map((f) => `- ${f}`)
          .join("\n") || "Open Labs for the full panel.",
        doctorQs.length
          ? doctorQs.map((x, i) => `${i + 1}. ${x}`).join("\n")
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (pick(low, /\b(cycle|period|luteal|follicular|menstrual)\b/)) {
    return finish(
      q,
      phase ? `Phase: ${phase[1].trim()}` : "No period start logged yet."
    );
  }

  if (pick(low, /\b(week|weekly|trend|rollup)\b/)) {
    return finish(
      q,
      [
        weekWater ? `Water avg ${weekWater[1]} ml` : null,
        weekProt ? `Protein avg ${weekProt[1]}g` : null,
        gymWeek ? `Gym ${gymWeek}` : null,
        flags.length
          ? flags.slice(0, 3).map((f) => `- ${f}`).join("\n")
          : null,
      ]
        .filter(Boolean)
        .join("\n") || "Not much week data yet."
    );
  }

  if (pick(low, /\b(remember|memory|last|what did i)\b/)) {
    return finish(
      q,
      session.lastUser
        ? `Last you: ${session.lastUser}\nLast Mel: ${session.lastReply.slice(0, 280)}`
        : "Nothing in this tab yet."
    );
  }

  if (pick(low, /\b(help|commands)\b/)) {
    return finish(
      q,
      "status · brief · protein · water · gym · sleep · labs · week · log · pin · find · fix: ..."
    );
  }

  // Real how/what questions about health topics only → short menu
  if (
    pick(low, /\?$/) &&
    pick(
      low,
      /\b(protein|water|gym|sleep|lab|cycle|period|breakfast|eat|food|status|macro)\b/
    )
  ) {
    return finish(
      q,
      "Try: breakfast, water, protein, gym, sleep, cycle, labs, or status."
    );
  }

  // Open questions that aren't health keywords → human, not a robot menu
  if (
    pick(low, /\?$/) ||
    pick(low, /^(what|how|should|can|do i|why|when|where)\b/)
  ) {
    return finish(q, "Tell me more. Or ask food, water, gym, sleep, or status.");
  }

  // Default: short human ack. NEVER dump a command list for random chat.
  return finish(q, "I'm here. Say more.");
}
