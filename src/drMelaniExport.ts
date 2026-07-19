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
  const HOME = "pg-home";
  const FITNESS = "pg-fitness";
  const SLEEP = "pg-sleep";
  const MEALS = "pg-meals";
  const GYM = "pg-gym";
  const BODY = "pg-body";
  const WORK = "pg-work";
  const HYGIENE = "pg-hygiene";
  const SHOWER_DAILY = "pg-shower-daily";
  const SHOWER_EVERY = "pg-shower-everything";
  const HAIR = "pg-hair";
  const AM_SKIN = "pg-am-skin";
  const PM_SKIN = "pg-pm-skin";
  const MY_DATA = "pg-my-data";
  const PROFILE = "pg-profile";
  const CYCLE = "pg-cycle";
  const LABS = "pg-labs";
  const TESTS = "pg-tests";
  const WEARABLES = "pg-wearables";
  const ANALYTICS = "pg-analytics";
  const HARD75 = "pg-75hard";
  const SUPPS = "pg-supplements";
  const GROCERY = "pg-grocery";
  const DOCTOR = "pg-doctor";
  const GOALS = "pg-goals";
  const TODO = "pg-todo";
  const JOURNAL = "pg-journal";
  const NEURO = "pg-neurotech";
  // Personal pages (migrated from your old Notion — Live Longer workspace)
  const BOOKS = "pg-books";
  const BOOK_INNOVATORS = "pg-book-innovators";
  const BOOK_PHOTO = "pg-book-photo";
  const REAL_LIFE = "pg-real-life";
  const OPENNEURO = "pg-openneuro";
  const DOC_HUB = "pg-doc-hub";
  const MEETINGS = "pg-meetings";
  const AGENTS = "pg-agents";
  const CLASSES = "pg-classes";
  const CONTENT = "pg-content";
  const FINANCE = "pg-finance";
  const STARTUPS = "pg-startups";
  const READING = "pg-reading-list";

  const pages: Page[] = [
    // ── Home ──
    page(HOME, "Home", "⌂", null, [
      b("heading1", "Home"),
      b(
        "paragraph",
        "This is your full workspace now — health + life + work. No more Notion."
      ),
      b("heading2", "Health"),
      b("bullet", "Fitness — Sleep · Meals · Gym · Body"),
      b("bullet", "My Data — labs, period, profile"),
      b("bullet", "75 Hard · Supplements · Grocery"),
      b("heading2", "Life (from your old Notion)"),
      b("bullet", "Books · Real Life · Document Hub"),
      b("bullet", "Goals Tracker · To Do · Journal"),
      b("bullet", "Meetings · Classes · Content · Finance"),
      b("heading2", "Build"),
      b("bullet", "Neurotech · Work · OpenNeuro notes"),
      b("divider"),
      b("heading2", "How to write here"),
      b("paragraph", "Click any page → type. Press Enter for a new line."),
      b("paragraph", "Type / for headings, lists, todos, pages, databases."),
      b("paragraph", "Tab indents · drag ⋮⋮ to reorder · everything auto-saves."),
      b("divider"),
      b("heading2", "Today"),
      b("todo", "Log sleep + brain fog"),
      b("todo", "Meals + water"),
      b("todo", "One deep work block"),
      b("todo", "Read 10 pages (75 Hard)"),
    ]),

    // ── Fitness hub ──
    page(FITNESS, "Fitness", "💪", null, [
      b("heading1", "Fitness"),
      b("paragraph", "Same four slides as the Dr. Melani app."),
      b("heading2", "Pages"),
      b("bullet", "Sleep — bedtime, wake, brain fog, weekly chart"),
      b("bullet", "Meals — macros, usuals, water, bowel"),
      b("bullet", "Gym — week plan, warm-up, day checklists"),
      b("bullet", "Body — weight, progress photos"),
      b("divider"),
      b("callout", "Open a child page from the sidebar under Fitness."),
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
      b("bullet", "0% added sugar · organic when possible"),
      b("bullet", "Shop: Trader Joe’s + Target only"),
      b("divider"),
      b("heading2", "Usual breakfast (exported)"),
      b("paragraph", "Melani’s usual breakfast — ~715 cal · 49g protein · 58g C · 28g F · 14g fiber"),
      b("bullet", "Fage 0% Greek yogurt (plain, organic)"),
      b("bullet", "Fage 0% kefir (no added sugar)"),
      b("bullet", "2 tsp chia seeds"),
      b("bullet", "2 tsp flaxseeds"),
      b("bullet", "Small handful pumpkin seeds"),
      b("bullet", "Trader Joe’s raw honey (minimal)"),
      b("divider"),
      b("heading2", "Common / usuals"),
      b("bullet", "Chipotle burrito bowl — ~585 cal · 27g protein"),
      b("bullet", "Lunch usual — edit in app Meals"),
      b("bullet", "Dinner usual — edit in app Meals"),
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
      b("callout", "Open Gym in Dr. Melani for day checklist + set logging."),
    ]),

    page(BODY, "Body", "📏", FITNESS, [
      b("heading1", "Body"),
      b("heading2", "Weight"),
      b("paragraph", "Log weekly weight in Fitness → Body / vitals."),
      b("heading2", "Progress photos"),
      b("bullet", "Front"),
      b("bullet", "Side"),
      b("bullet", "Back"),
      b("todo", "Add progress photo (also 75 Hard daily photo)"),
      b("divider"),
      b("heading2", "Measurements (optional)"),
      b("bullet", "Waist —"),
      b("bullet", "Hips —"),
      b("bullet", "Notes —"),
    ]),

    // ── Work ──
    page(WORK, "Work", "💼", null, [
      b("heading1", "Work"),
      b("paragraph", "From Dr. Melani Work tab — med school, startups, building."),
      b("heading2", "Focus"),
      b("todo", "Neurotech device — early disease catch"),
      b("todo", "Clinic plan: SF · NY · LA"),
      b("todo", "Silicon Valley / biotech updates"),
      b("heading2", "Learning"),
      b("bullet", "Electrical engineering"),
      b("bullet", "Computer engineering"),
      b("bullet", "Personal finance + business"),
      b("divider"),
      b("heading2", "Content"),
      b("todo", "Post ideas / LinkedIn"),
      b("todo", "Video / photography project"),
    ]),

    // ── Hygiene hub ──
    page(HYGIENE, "Hygiene", "✨", null, [
      b("heading1", "Hygiene"),
      b("paragraph", "Shower + skincare system from Dr. Melani."),
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
      b("callout", "Open Everything shower guide in Dr. Melani Hygiene."),
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

    // ── My Data hub ──
    page(MY_DATA, "My Data", "📊", null, [
      b("heading1", "My Data"),
      b("paragraph", "Labs, period, profile, wearables — neon status lives in the app; numbers exported here."),
      b("heading2", "Sections"),
      b("bullet", "Profile"),
      b("bullet", "Period tracker"),
      b("bullet", "Labs (results)"),
      b("bullet", "Upcoming tests"),
      b("bullet", "Wearables (WHOOP + Apple Health)"),
      b("bullet", "Health Analytics"),
    ]),

    page(PROFILE, "Profile", "👤", MY_DATA, [
      b("heading1", "Profile"),
      b("bullet", "Name: Melani Shrestha"),
      b("bullet", "DOB: 2007-08-24"),
      b("bullet", "Sex: F"),
      b("bullet", "Height: 5 ft 0 in"),
      b("bullet", "Provider: Ververis, Megan"),
      b("bullet", "Patient ID: 2581279882"),
      b("bullet", "Conditions: migraine/chronic pain; cardio/metabolic monitoring"),
      b("bullet", "Water goal: 4000 ml"),
      b("bullet", "Meals per day: 3"),
    ]),

    page(CYCLE, "Period tracker", "🩸", MY_DATA, [
      b("heading1", "Period tracker"),
      b("paragraph", "Flow levels, phase chips, ovulation window — full UI in My Data."),
      b("heading2", "Log"),
      b("bullet", "Today’s flow: spotting / light / medium / heavy"),
      b("todo", "Tap Period started today when needed"),
      b("heading2", "Phases to learn"),
      b("bullet", "Menstrual"),
      b("bullet", "Follicular"),
      b("bullet", "Ovulation"),
      b("bullet", "Luteal / pre-period"),
      b("callout", "Pink = flow · gold = ovulation · blue = today (app calendar)."),
    ]),

    page(LABS, "Labs", "🧪", MY_DATA, [
      b("heading1", "Labs"),
      b("paragraph", "Exported from Dr. Melani lab draws. Discuss with Dr. Ververis."),
      b("heading2", "Quest · 2026-03-26 · Lipids + A1C"),
      b("bullet", "Total Cholesterol: 207 mg/dL · HIGH"),
      b("bullet", "HDL: 64 mg/dL · OK"),
      b("bullet", "Triglycerides: 119 mg/dL · HIGH"),
      b("bullet", "LDL: 120 mg/dL · HIGH"),
      b("bullet", "Chol/HDL ratio: 3.2"),
      b("bullet", "Non-HDL: 143 mg/dL · HIGH"),
      b("bullet", "Hemoglobin A1c: 5.3%"),
      b("divider"),
      b("heading2", "Quest · 2026-04-07 · Thyroid"),
      b("bullet", "TSH: 1.06 mIU/L"),
      b("divider"),
      b("heading2", "USC · 2026-03-25 · CBC + CMP"),
      b("bullet", "WBC 9.3 · RBC 4.94 · HGB 13.6 · HCT 40.2 · PLT 223"),
      b("bullet", "Albumin 4.8 · ALT 14 · ALP 66 · AST 22"),
      b("divider"),
      b("heading2", "USC · 2026-04-06 · CBC + BMP"),
      b("bullet", "WBC 7.5 · RBC 4.63 (see app for full panel)"),
      b("divider"),
      b("heading2", "What this means for food"),
      b("bullet", "Prioritize soluble fiber, omega-3 fish, EVOO, nuts"),
      b("bullet", "Limit sat fat, refined carbs, added sugar"),
      b("bullet", "Upload new PDF in app → Lab PDF section"),
      b("callout", "Neon HIGH/OK chips live on My Data in the app (not this text page)."),
    ]),

    page(TESTS, "Upcoming tests", "📅", MY_DATA, [
      b("heading1", "Upcoming tests"),
      b("paragraph", "Screening schedule from Dr. Melani."),
      b("bullet", "Open My Data → Upcoming tests for due dates + fasting notes"),
      b("todo", "Check overdue / due soon badges in app"),
    ]),

    page(WEARABLES, "Wearables", "⌚", MY_DATA, [
      b("heading1", "Wearables"),
      b("paragraph", "Raw WHOOP + Apple Health only — no Recovery/Strain scores."),
      b("heading2", "WHOOP"),
      b("bullet", "Connect / sync last 7 days in app"),
      b("bullet", "HRV 7-day avg · Resting HR 7-day avg"),
      b("heading2", "Apple Health"),
      b("bullet", "Export CSV → import in app"),
      b("bullet", "Steps week total when available"),
    ]),

    // ── Analytics ──
    page(ANALYTICS, "Health Analytics", "📈", null, [
      b("heading1", "Health Analytics"),
      b("paragraph", "Your private dashboard of flags + habits. Numbers from chart export."),
      b("heading2", "Lipid flags (latest Quest)"),
      b("bullet", "LDL 120 HIGH"),
      b("bullet", "Total chol 207 HIGH"),
      b("bullet", "TG 119 HIGH"),
      b("bullet", "Non-HDL 143 HIGH"),
      b("bullet", "HDL 64 OK · A1c 5.3 OK · TSH 1.06 OK"),
      b("divider"),
      b("heading2", "Habit scoreboard (fill daily)"),
      b("todo", "Sleep logged"),
      b("todo", "Brain fog logged"),
      b("todo", "Water ≥ goal"),
      b("todo", "Protein on track"),
      b("todo", "Training done"),
      b("todo", "No cheat / no alcohol (75 Hard)"),
      b("todo", "10 pages read"),
      b("todo", "Progress photo"),
      b("divider"),
      b("heading2", "Brain fog week"),
      b("paragraph", "Track Yes-days / 7 in Fitness → Sleep (doctor-visible)."),
      b("heading2", "What to improve first"),
      b("numbered", "Fiber + omega-3 for lipids"),
      b("numbered", "Sleep consistency for migraines + fog"),
      b("numbered", "Gallon water + two workouts on 75 Hard days"),
      b("callout", "Later: live charts pulled from the Dr. Melani API. For now this is your exported scorecard."),
    ]),

    // ── 75 Hard ──
    page(HARD75, "75 Hard", "🔥", null, [
      b("heading1", "75 Hard"),
      b("callout", "Locked in with Dr. Melani chat — miss one day = restart."),
      b("heading2", "The 5 rules"),
      b("numbered", "Two 45-min workouts — one outdoors"),
      b("numbered", "One gallon of water"),
      b("numbered", "Diet — no cheat meals, no alcohol"),
      b("numbered", "Read 10 pages (nonfiction / self-improvement)"),
      b("numbered", "Progress photo"),
      b("divider"),
      b("heading2", "Today checklist"),
      b("todo", "Workout 1"),
      b("todo", "Workout 2 (outdoor)"),
      b("todo", "Gallon water"),
      b("todo", "Diet locked"),
      b("todo", "10 pages"),
      b("todo", "Progress photo"),
      b("divider"),
      b("paragraph", "Day number: ___ / 75"),
      b("paragraph", "Start date: ___"),
    ]),

    // ── Supplements ──
    page(SUPPS, "Supplements", "💊", null, [
      b("heading1", "Supplements"),
      b("paragraph", "Stack critique lives in Dr. Melani chat (dropdown + label photo)."),
      b("bullet", "Vitamin D"),
      b("bullet", "Creatine monohydrate (hydrate)"),
      b("bullet", "Patanjali / Ayurvedic — brand-check carefully"),
      b("todo", "Review stack with Dr. Ververis if new"),
    ]),

    // ── Grocery ──
    page(GROCERY, "Grocery / Shop", "🛒", null, [
      b("heading1", "Grocery / Shop"),
      b("paragraph", "Only Trader Joe’s + Target."),
      b("heading2", "Heart-smart staples (for lipid flags)"),
      b("todo", "Extra virgin olive oil"),
      b("todo", "Oats (plain)"),
      b("todo", "Salmon"),
      b("todo", "Walnuts / almonds"),
      b("todo", "Spinach / greens"),
      b("todo", "Berries"),
      b("todo", "Beans"),
      b("todo", "Fage 0% yogurt + kefir"),
      b("callout", "Hygiene Buy-next can push to Shop in the app."),
    ]),

    // ── Doctor chat notes ──
    page(DOCTOR, "My doctor", "💬", null, [
      b("heading1", "My doctor"),
      b("paragraph", "Dr. Melani AI — private health coach. Lives bottom-right in the app."),
      b("heading2", "How to talk to her"),
      b("bullet", "Log meals by text or photo"),
      b("bullet", "Ask about labs / brain fog / sleep"),
      b("bullet", "75 Hard accountability"),
      b("bullet", "Supplement critique"),
      b("divider"),
      b("heading2", "Session notes (type here)"),
      b("paragraph", "Hi Melani, let's get to work."),
      b("paragraph", ""),
    ]),

    // ── Goals / Todo / Journal / Neurotech (like her real Notion) ──
    page(GOALS, "Goals Tracker", "🎯", null, [
      b("heading1", "Goals Tracker"),
      b("heading2", "Health"),
      b("todo", "Improve lipids with food + training"),
      b("todo", "Finish 75 Hard streak"),
      b("todo", "Sleep 7.5–8.5h most nights"),
      b("heading2", "Build"),
      b("todo", "Neurotech wearable — early disease detection"),
      b("todo", "Ship Dr. Melani product quality"),
      b("heading2", "Career"),
      b("todo", "Med school path + inventor path"),
      b("todo", "Clinics vision: SF · NY · LA"),
    ]),

    page(TODO, "To Do List", "✅", null, [
      b("heading1", "To Do List"),
      b("heading2", "Today"),
      b("todo", "Dr. Melani daily logs"),
      b("todo", "75 Hard scorecard"),
      b("todo", "One deep work block"),
      b("heading2", "This week"),
      b("todo", "Review lab plan with provider if due"),
      b("todo", "Grocery restock (TJ / Target)"),
    ]),

    page(JOURNAL, "Journal", "📓", null, [
      b("heading1", "Journal"),
      b("paragraph", "Free write. Private notes also live in app journal / bowel private notes."),
      b("paragraph", ""),
    ]),

    page(NEURO, "Neurotech", "🧠", null, [
      b("heading1", "Neurotech"),
      b(
        "paragraph",
        "Device goal: catch disease early — wear daily like Oura, but nervous-system focused."
      ),
      b("heading2", "Research lanes"),
      b("bullet", "Closed-loop neuromodulation"),
      b("bullet", "Vagal / thermal signals"),
      b("bullet", "Early detection biomarkers"),
      b("heading2", "Product principles"),
      b("bullet", "Simple to use every day"),
      b("bullet", "Doctor-ready data"),
      b("bullet", "Save lives at scale"),
    ]),

    // ══════════════════════════════════════════
    // From your Notion (Live Longer) — full pages
    // ══════════════════════════════════════════

    page(BOOKS, "Books", "📚", null, [
      b("heading1", "Books"),
      b("paragraph", "Reading log and notes — brought over from Notion."),
      b("heading2", "Now reading / library"),
      b("bullet", "Innovators by Walter Isaacson"),
      b("bullet", "History of Photography"),
      b("divider"),
      b("paragraph", "Type notes below or open a sub-page."),
      b("paragraph", ""),
    ]),

    page(BOOK_INNOVATORS, "Innovators by Walter Isaacson", "📖", BOOKS, [
      b("heading1", "Innovators"),
      b("paragraph", "Walter Isaacson — notes & quotes"),
      b("heading2", "Why this book"),
      b("paragraph", "How collaboration built the digital age."),
      b("heading2", "Notes"),
      b("paragraph", ""),
      b("heading2", "Quotes"),
      b("quote", ""),
      b("heading2", "Action ideas"),
      b("todo", ""),
    ]),

    page(BOOK_PHOTO, "History of Photography", "📷", BOOKS, [
      b("heading1", "History of Photography"),
      b("paragraph", "Course / book notes"),
      b("heading2", "Key periods"),
      b("bullet", ""),
      b("heading2", "Notes"),
      b("paragraph", ""),
    ]),

    page(REAL_LIFE, "Real Life", "🧠", null, [
      b("heading1", "Real Life"),
      b("paragraph", "People, places, feelings, decisions — your life outside the system."),
      b("heading2", "This week"),
      b("paragraph", ""),
      b("heading2", "Relationships"),
      b("paragraph", ""),
      b("heading2", "Decisions"),
      b("todo", ""),
    ]),

    page(OPENNEURO, "Downloading OpenNeuro data", "📄", null, [
      b("heading1", "Downloading OpenNeuro data"),
      b("paragraph", "Research notes for OpenNeuro datasets."),
      b("heading2", "Goal"),
      b("paragraph", "Pull neuroimaging data for analysis / neurotech work."),
      b("heading2", "Steps"),
      b("numbered", "Create OpenNeuro account / CLI"),
      b("numbered", "Pick dataset accession"),
      b("numbered", "Download subset first"),
      b("numbered", "Document paths + license"),
      b("heading2", "Links & commands"),
      b("code", "# example\n# openneuro download --dataset ds00xxxx"),
      b("heading2", "Notes"),
      b("paragraph", ""),
    ]),

    page(DOC_HUB, "Document Hub", "📁", null, [
      b("heading1", "Document Hub"),
      b("paragraph", "Central place for docs, PDFs, school files, prototypes."),
      b("heading2", "School"),
      b("bullet", ""),
      b("heading2", "Research papers"),
      b("bullet", ""),
      b("heading2", "Personal / admin"),
      b("bullet", ""),
      b("heading2", "Inbox (drop notes here)"),
      b("paragraph", ""),
    ]),

    page(MEETINGS, "Meetings", "📅", null, [
      b("heading1", "Meetings"),
      b("paragraph", "Notes from calls, clinics, founders, school."),
      b("heading2", "Template"),
      b("bullet", "Date:"),
      b("bullet", "Who:"),
      b("bullet", "Goal:"),
      b("bullet", "Notes:"),
      b("bullet", "Next actions:"),
      b("divider"),
      b("heading2", "Log"),
      b("paragraph", ""),
    ]),

    page(AGENTS, "Agents", "🤖", null, [
      b("heading1", "Agents"),
      b("paragraph", "AI agents / automations you run (coding, research, ops)."),
      b("heading2", "Active"),
      b("bullet", "Dr. Melani health coach (in-app chat)"),
      b("bullet", "Grok / build agents"),
      b("heading2", "Ideas"),
      b("todo", "Weekly lab + sleep summary agent"),
      b("todo", "Content draft agent for LinkedIn"),
    ]),

    page(CLASSES, "Classes", "🎓", null, [
      b("heading1", "Classes"),
      b("paragraph", "Med school / undergrad course notes."),
      b("heading2", "This term"),
      b("bullet", ""),
      b("heading2", "Exam prep"),
      b("todo", ""),
      b("heading2", "Free notes"),
      b("paragraph", ""),
    ]),

    page(CONTENT, "Content", "🎬", null, [
      b("heading1", "Content"),
      b("paragraph", "LinkedIn, video, photography — ideas and drafts."),
      b("heading2", "Ideas queue"),
      b("bullet", ""),
      b("heading2", "This week’s posts"),
      b("todo", ""),
      b("heading2", "Drafts"),
      b("paragraph", ""),
    ]),

    page(FINANCE, "Finance", "💰", null, [
      b("heading1", "Finance"),
      b("paragraph", "Personal finance learning + tracking."),
      b("heading2", "Goals"),
      b("todo", ""),
      b("heading2", "Notes"),
      b("paragraph", ""),
    ]),

    page(STARTUPS, "Startups / Silicon Valley", "🚀", null, [
      b("heading1", "Startups / Silicon Valley"),
      b("paragraph", "What you’re watching: biotech, neurotech, founders."),
      b("heading2", "This week"),
      b("bullet", ""),
      b("heading2", "People / companies"),
      b("bullet", ""),
      b("heading2", "Ideas for clinics + device"),
      b("paragraph", ""),
    ]),

    page(READING, "Reading list", "🔖", null, [
      b("heading1", "Reading list"),
      b("paragraph", "Queue beyond the Books page."),
      b("todo", "Innovation / neurotech titles"),
      b("todo", "Healthcare breakthroughs"),
      b("todo", "Building products that change the world"),
      b("heading2", "Finished"),
      b("bullet", ""),
    ]),
  ];

  return {
    name: "Dr. Melani",
    pages,
    activePageId: HOME,
    sidebarOpen: true,
    exportVersion: 4,
  } as Workspace & { exportVersion?: number };
}

export const DR_MELANI_EXPORT_VERSION = 4;
