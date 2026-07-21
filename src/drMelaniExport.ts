/**
 * Full Dr. Melani → Notion workspace export.
 * Structure mirrors the live app (Fitness / Work / Hygiene / My Data)
 * plus health analytics and real lab numbers from Melani’s chart.
 */
import type { Block, Page, Workspace } from "./types";

function uid(stable: string): string {
  return stable;
}

function b(type: Block["type"], text = "", extra: Partial<Block> = {}): Block {
  return {
    id: uid(`b-${Math.random().toString(36).slice(2, 9)}`),
    type,
    text,
    checked: type === "todo" ? false : undefined,
    open: type === "toggle" ? true : undefined,
    ...extra,
  };
}

function page(
  id: string,
  title: string,
  icon: string,
  parentId: string | null,
  blocks: Block[]
): Page {
  const now = Date.now();
  return {
    id,
    title,
    icon,
    parentId,
    createdAt: now,
    updatedAt: now,
    blocks,
  };
}

/** Entire Dr. Melani system as Notion pages */
export function buildDrMelaniWorkspace(): Workspace {
  const FITNESS = "pg-fitness";
  const SLEEP = "pg-sleep";
  const MEALS = "pg-meals";
  const GYM = "pg-gym";
  const WORK = "pg-work";
  const HYGIENE = "pg-hygiene";
  const SHOWER_DAILY = "pg-shower-daily";
  const SHOWER_EVERY = "pg-shower-everything";
  const HAIR = "pg-hair";
  const AM_SKIN = "pg-am-skin";
  const PM_SKIN = "pg-pm-skin";
  const DATA = "pg-data";
  const GROCERY = "pg-grocery";
  // Life hub + leisure writing
  const LIFE = "pg-life";
  // Personal pages (migrated from your old Notion — Live Longer workspace)
  const WARDROBE = "pg-fashion-os";
  const AGENTS = "pg-agents";

  const pages: Page[] = [
    // ── Fitness hub ──
    page(FITNESS, "Fitness", "💪", null, [
      b("heading1", "Fitness"),
      b("heading2", "Pages"),
      b("bullet", "Sleep: bedtime, wake, brain fog, weekly chart"),
      b("bullet", "Meals: macros, usuals, water"),
      b("bullet", "Gym: week plan, warm-up, weight, day checklists"),
      b("divider"),
    ]),

    page(SLEEP, "Sleep", "😴", FITNESS, [
      b("heading1", "Sleep"),
      b("heading2", "Today"),
      b("paragraph", "Day: (log in Dr. Melani app — Fitness → Sleep)"),
      b("paragraph", "Bedtime: —"),
      b("paragraph", "Wake: —"),
      b("divider"),
      b("heading2", "Brain fog"),
      b("paragraph", "Yes = red day · No = green day (for doctor chat)"),
      b("todo", "Log brain fog for today"),
      b("divider"),
      b("heading2", "Weekly sleep"),
      b("paragraph", "Target line ~8 hours (same as Fitness weekly chart)."),
      b("bullet", "Sat —"),
      b("bullet", "Sun —"),
      b("bullet", "Mon —"),
      b("bullet", "Tue —"),
      b("bullet", "Wed —"),
      b("bullet", "Thu —"),
      b("bullet", "Fri —"),
      b("callout", "Source of truth: Dr. Melani → Fitness → Sleep (port 8781)."),
    ]),

    page(MEALS, "Meals", "🍽️", FITNESS, [
      b("heading1", "Meals"),
      b("heading2", "Goals"),
      b("bullet", "Protein priority (from app goals)"),
      b("bullet", "0% added sugar · organic when possible · measured portions"),
      b("divider"),
      b("heading2", "Usual breakfast (exported)"),
      b("paragraph", "Usual breakfast — ~480 cal · 38g protein · 42g C · 16g F · 9g fiber"),
      b("paragraph", "0% added sugar · organic when possible · measured portions"),
      b("bullet", "Fage 0% Greek yogurt: 150g (about ⅔ cup)"),
      b("bullet", "Fage 0% kefir: 100ml (about ⅓–½ cup)"),
      b("heading3", "Seeds + nuts"),
      b("bullet", "1 tsp chia seeds"),
      b("bullet", "1 tsp flaxseeds"),
      b("bullet", "1 flat tbsp pumpkin seeds"),
      b("heading3", "Fruit"),
      b("bullet", "½ cup blueberries"),
      b("bullet", "3 medium strawberries"),
      b("heading3", "Extras"),
      b("bullet", "10–15 makhana (fox nuts)"),
      b("bullet", "1 tsp raw honey max (optional; skip if very sleepy)"),
      b("heading3", "Eggs"),
      b("bullet", "1 boiled egg with yolk + 1 egg white (optional)"),
      b("divider"),
      b("heading2", "Common / usuals"),
      b("bullet", "Breakfast usual — edit in app Meals"),
      b("bullet", "Lunch / dinner — add when you want"),
      b("divider"),
      b("heading2", "Water"),
      b("paragraph", "Goal: 4000 ml / day (profile)"),
      b("todo", "Log water glasses / ml"),
      b("heading2", "Bowel"),
      b("todo", "Log bowel Yes / No for today"),
      b("divider"),
      b("heading2", "Before 7pm"),
      b("paragraph", "Meal-before-7pm tracking lives in the app meals module."),
    ]),

    page(GYM, "Gym", "🏋️", FITNESS, [
      b("heading1", "Gym"),
      b("heading2", "Week structure (from Dr. Melani plans)"),
      b("bullet", "Monday — Glutes + Abs"),
      b("bullet", "Tuesday — Lower / upper plan day"),
      b("bullet", "Wednesday — plan day"),
      b("bullet", "Thursday — Upper + Abs"),
      b("bullet", "Friday — Glutes + Abs"),
      b("bullet", "Saturday — Glutes + Abs"),
      b("bullet", "Sunday — rest or cardio"),
      b("divider"),
      b("heading2", "Cardio options"),
      b("bullet", "Running program"),
      b("bullet", "Swimming"),
      b("divider"),
      b("heading2", "Plan files in app"),
      b("bullet", "lower_one / lower_two / lower_three"),
      b("bullet", "upper_abs_one / upper_abs_two"),
      b("bullet", "cardio_running / cardio_swimming"),
      b("divider"),
      b("heading2", "Warm-up"),
      b("todo", "Complete warm-up checklist before main lifts"),
    ]),

    // Body removed: weight/photos live under Gym

    // ── Work ──
    page(WORK, "Work", "💼", null, [
      b("heading2", "Focus"),
      b("todo", "Clinic plan: SF · NY · LA"),
      b("todo", "Neurotech device: early disease catch"),
      b("todo", "Silicon Valley / biotech updates"),
      b("heading2", "Learning"),
      b("bullet", "Electrical engineering"),
      b("bullet", "Computer engineering"),
      b("bullet", "Personal finance + business"),
      b("heading2", "Content"),
      b("todo", "Post ideas / LinkedIn"),
      b("todo", "Video / photography project"),
    ]),

    // ── Hygiene hub ──
    page(HYGIENE, "Hygiene", "✨", null, [
      b("heading1", "Hygiene"),
      b("heading2", "Shower"),
      b("bullet", "Daily shower"),
      b("bullet", "Everything shower"),
      b("bullet", "Hair care"),
      b("heading2", "Skincare"),
      b("bullet", "AM skincare"),
      b("bullet", "PM skincare (night types + calendar)"),
      b("divider"),
      b("heading2", "Products & restock"),
      b("bullet", "Using / Researching / Buy next lanes in app"),
    ]),

    page(SHOWER_DAILY, "Daily shower", "🚿", HYGIENE, [
      b("heading1", "Daily shower"),
      b("todo", "Body wash"),
      b("todo", "Face rinse / cleanse if needed"),
      b("todo", "Moisturize after"),
    ]),

    page(SHOWER_EVERY, "Everything shower", "🛁", HYGIENE, [
      b("heading1", "Everything shower"),
      b("paragraph", "Full routine night — scrub, hair, skincare."),
      b("todo", "Scrub"),
      b("todo", "Hair wash + treatment"),
      b("todo", "MediCube pore mask / face mask (guide in app)"),
      b("todo", "No acids or retinol same night if mask night"),
    ]),

    page(HAIR, "Hair care", "💇", HYGIENE, [
      b("heading1", "Hair care"),
      b("paragraph", "Wash day ~2× this week (plan in app calendar)."),
      b("todo", "Wash"),
      b("todo", "Condition / treatment"),
      b("todo", "Style / protect"),
    ]),

    page(AM_SKIN, "AM skincare", "☀️", HYGIENE, [
      b("heading1", "AM skincare"),
      b("todo", "Cleanse"),
      b("todo", "Treat / serum"),
      b("todo", "Moisturize"),
      b("todo", "SPF"),
    ]),

    page(PM_SKIN, "PM skincare", "🌙", HYGIENE, [
      b("heading1", "PM skincare"),
      b("paragraph", "Four night types — see calendar in Dr. Melani."),
      b("bullet", "Gentle / recovery night"),
      b("bullet", "Active night"),
      b("bullet", "Retinol night"),
      b("bullet", "Mask night"),
      b("todo", "Log tonight’s PM type"),
    ]),

    // ── Data (one page only: cycle + labs inside the app UI) ──
    // No separate Profile / Period tracker / Labs / Wearables sidebar pages
    page(DATA, "My Data", "data", null, [
      b("paragraph", ""),
    ]),

    // ── Grocery ──
    page(GROCERY, "Grocery / Shop", "🛒", null, [
      b("heading1", "Grocery / Shop"),
      b("heading2", "Heart-smart staples (for lipid flags)"),
      b("todo", "Extra virgin olive oil"),
      b("todo", "Oats (plain)"),
      b("todo", "Salmon"),
      b("todo", "Walnuts / almonds"),
      b("todo", "Spinach / greens"),
      b("todo", "Berries"),
      b("todo", "Beans"),
      b("todo", "Fage 0% yogurt + kefir"),
    ]),

    // ══════════════════════════════════════════
    // Life — leisure hub (Books lives under here)
    // ══════════════════════════════════════════

    page(LIFE, "Life", "life", null, [
      b("paragraph", "Life hub — open Books for the real library."),
    ]),

    // Real library app (rich page) — shelves, quotes, notes database
    page(WARDROBE, "Wardrobe", "fashion", AGENTS, [
      b("paragraph", "Your clothes, extracted and organized."),
    ]),

    // Agents hub (hidden from sidebar list — only children show under Agents)
    page(AGENTS, "Agents", "🤖", null, [
      b("heading1", "Agents"),
      b(
        "paragraph",
        "Build your own agents here. Use + New agent in the sidebar."
      ),
    ]),

    page("pg-library", "Bookshelf", "books", null, [
      b("heading1", "Bookshelf"),
      b("paragraph", "Books, notes, and saved references."),
    ]),

    page("pg-my-tasks", "My Tasks", "✅", null, [
      b("heading1", "My Tasks"),
      b("todo", ""),
    ]),

    page("pg-help", "Help", "❓", null, [
      b("heading1", "Help"),
      b(
        "paragraph",
        "Tips: ⌘K search · ⌘N new page · / for blocks · sidebar + New page anytime."
      ),
    ]),
  ];

  return {
    name: "Wonder",
    pages,
    activePageId: FITNESS,
    sidebarOpen: true,
    exportVersion: 8,
  } as Workspace & { exportVersion?: number };
}

export const DR_MELANI_EXPORT_VERSION = 15;
