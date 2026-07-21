# Codex handoff — Dr. Melani / Wonder

**Repo:** https://github.com/melanikshrestha-boop/dr.melani  
**Branch:** `grok/latest-dr-melani-july-21-2026`  
**Stack:** Vite + React + TypeScript (not Next.js)  
**Local URL:** http://127.0.0.1:5173/  
**Date stamp:** 2026-07-21  

This file is the single source of truth for agents (Codex / GPT / Claude) cloning the app without chat context.

---

## App summary

Wonder is a **Notion-style personal OS** with deep **Dr. Melani health surfaces** baked in:

- Pages, blocks, slash commands, databases, sidebar
- Fitness: Sleep · Meals · Gym
- Cycle tracker, labs, hygiene restock (Amazon product pages)
- Mel: local life OS agent with real app tools (no API required)
- Optional bridges: Gmail IMAP (:8790), Grok AI (:8791)
- Nightly **body brief**: one report of the day from live localStorage data
- Mel **Digital Twin**: today scores, early radar, one lever, seven-day forecast, and clinic pack
- **Wardrobe**: upstream gallery/editor plus local garment perception, event-sourced closet state, explainable decision engine, and Mel actions under Agents

Data lives in the **browser** (`localStorage`). No backend DB required for core use.

---

## Exact startup commands

```bash
git clone https://github.com/melanikshrestha-boop/dr.melani.git
cd dr.melani
git checkout grok/latest-dr-melani-july-21-2026
npm install
npm run dev
```

Open: **http://127.0.0.1:5173/**

Optional bridges (not required for the UI):

```bash
# Mel AI bridge (reads XAI key from env or ~/.melani_assistant/xai_api_key)
npm run ai
# → http://127.0.0.1:8791

# Gmail IMAP bridge
npm run gmail
# → http://127.0.0.1:8790
```

Build check:

```bash
npm run build
```

---

## Key features added (Grok / Wonder work)

| Feature | Where it lives | What it does |
|--------|----------------|--------------|
| Nightly body brief | `src/melani/bodyBrief.ts`, `NightlyBodyBrief.tsx` | Sleep/meals/water/cycle/gym/mood → one report + “one move tomorrow” |
| Mel Digital Twin | `src/melani/twin/*` | Offline live-state fusion, transparent scores, early radar, one lever, seven-day forecast, 14-day doctor pack |
| Mel life OS agent | `src/melani/melAgent.ts`, `melTools.ts`, `MelaniAI.tsx` | Parses natural language, executes real app actions, and returns receipts |
| Food OS | `src/melani/foodOs.ts` | Daily beef/salmon rotation, lock, eaten state, and remaining macro context |
| Sleep store + graph | `src/melani/sleepStore.ts`, `FitnessExact.tsx` | Bed/wake, overnight math, weekly hours |
| Meals / macros | `FitnessExact.tsx`, `data.ts` | Usual meals, protein/cal goals |
| Gym native UI | `GymExact.tsx`, `public/gym-plans/*` | Week plan, sets, warm-up last, rest timer |
| Cycle phases | `cycleEngine.ts`, `CycleTracker.tsx` | Follicular/ovulatory/luteal colors + math |
| Labs + blurbs | `labData.ts`, `labEngine.ts`, `MelaniViews.tsx` | Status, expandable 3-line blurbs |
| Hygiene restock | `HygieneExact.tsx`, `productLinks.ts` | AM/PM routines, real Amazon `/dp/ASIN` links |
| Books library | `BooksLibrary.tsx`, `booksStore.ts` | Life → Books |
| Wardrobe | `src/melani/wardrobe/*`, `scripts/wardrobe/*` | Agents → Wardrobe; upstream visual surface, local garment segmentation, durable closet operations, and explainable recommendations |
| Live Mel context | `melContext.ts` | Snapshot for coach: goals, red flags, doctor Qs |
| Gmail connector | `GmailConnector.tsx`, `server/gmail_api.py` | Optional IMAP UI |
| Mel AI bridge | `server/melani_ai.py` | Optional Grok backend |
| Workspace export | `drMelaniExport.ts`, `storage.ts` | Default page tree; purge stub databases |

### Wardrobe file map

| File | Role |
|------|------|
| `src/melani/wardrobe/App.jsx` | Upstream gallery, filters, viewer/editor, and canonical API-backed metadata saves |
| `src/melani/wardrobe/import-flow.jsx` | Choose/drop/paste, staged review, and duplicate-import receipts |
| `src/melani/wardrobe/styles.css` | Upstream product visual language |
| `src/melani/wardrobe/wardrobeAgent.ts` | Plain-language Mel commands and truthful action receipts |
| `scripts/wardrobe/import-job-api.mjs` | Local SegFormer import path, visual fingerprints, dedupe, optional legacy provider path, and library assets |
| `scripts/wardrobe/local-fashion-segmentation.mjs` | On-device clothes/subject masks, cutouts, category, palette, and color extraction |
| `scripts/wardrobe/wardrobe-intelligence.mjs` | Deterministic outfit, packing, rotation, graph, laundry, resale, and purchase reasoning |
| `scripts/wardrobe/wardrobe-store.mjs` | Atomic state snapshot, sequenced write-ahead events with crash replay, idempotency, grouped outfit actions, feedback, and undo |
| `scripts/wardrobe/wardrobe-intelligence-api.mjs` | Local operational and decision API under `/api/wardrobe` |
| `scripts/wardrobe/responsive-image-api.mjs` | Original IPX responsive-image middleware |
| `src/melani/wardrobe/WardrobeFrame.tsx` | Thin Wonder isolation adapter only |

Open it at `/?page=pg-fashion-os` or through **Agents → Wardrobe**. Upstream is
`https://github.com/melanikshrestha-boop/wardrobe` at commit
`f44006cce7e4779e595a35b25fbbc8dabc68d7e4`. Runtime records, images, local model,
operational state, and event ledger are in gitignored `data/`. The normal import
path is fully local and requires no key. `OPENAI_API_KEY` and
`data/model-reference.png` are only for the retained optional modeled-image path.

### Health analysis

- **Labs:** `src/melani/labEngine.ts` + `labData.ts` (import/status/sections/blurbs)
- **Red flags / weekly rollup / doctor questions:** `src/melani/melContext.ts`
- **Nightly summary:** `src/melani/bodyBrief.ts` (write via Fitness card or Mel `brief`)

### Mel life OS agent

Mel runs locally first. Every command is parsed by `src/melani/melAgent.ts`, and
all state changes go through `src/melani/melTools.ts`. Grok is optional and may
improve the final wording, but it never owns the mutation. The tool result is the
source of truth.

Core tools:

- Live snapshot and status from the same stores used by Fitness, Meals, Sleep,
  Cycle, goals, pins, and life logs
- Write or refresh the nightly body brief
- Food plan, beef/salmon lock, and eaten state
- Log or undo the usual breakfast using `dr-melani-meals-usuals:YYYY-MM-DD`
- Log or undo water using the existing water total and history keys
- Log sleep hours, brain fog, and all supplements
- Set goals, pin/unpin facts, search logs, add life logs, and open pages
- Existing My Tasks/focus and Shopping actions remain reachable through Mel
- Create, open, list, rename, duplicate, move, favorite, clear, trash, and restore workspace pages
- Append or replace page text, with the last 20 Mel workspace changes available through `undo that`
- Use the private Ollama `llama3:latest` model for natural conversation and fuzzy workspace intent when it is installed

Quick checks in the Mel panel:

```text
hi
what meat
beef
brief
log breakfast
drank 1L and ate breakfast
status
goal protein 130
open wardrobe
what should I wear for streaming
wear outfit 1
I liked outfit 1
plan my outfits for 7 days
should I buy an olive dress for $120
create a page called Neurotech Ideas under Work
rename this page to Research
add prototype notes to this page
move Research under Work
undo that
```

Without an xAI key, all local tools above still work. If Ollama and
`llama3:latest` are available, Mel also uses that private on-device model for
open-ended replies and fuzzy workspace commands. For live web research and meal
image analysis, save an xAI key in `~/.melani_assistant/xai_api_key`, run
`npm run ai`, and keep the `npm run dev` process running. The local bridge
exposes `/api/melani-ai/chat`, `/api/melani-ai/research`, and
`/api/melani-ai/meal` through the Vite proxy.

Mel does not use OpenAI or an OpenAI key. Wardrobe's standard perception and
decision path is also local. A legacy provider path remains isolated for optional
modeled editorials, but no deterministic closet action depends on it.

### Nutrition tracking

- **Meals panel + usuals:** `src/melani/FitnessExact.tsx` (Meals tab)
- **Presets / macros / supplements:** `src/melani/data.ts`
- **localStorage keys:** `dr-melani-meals-usuals:YYYY-MM-DD`, `dr-melani-water-ml:YYYY-MM-DD`, `dr-melani-supplements-done:YYYY-MM-DD`

### Fridge safety

**Not a separate module in this branch.** Closest surfaces:

- Hygiene product restock + Amazon product links (`HygieneExact.tsx`, `productLinks.ts`)
- Meal logging (not inventory / expiry / fridge camera)

If Codex is looking for a dedicated “fridge safety” feature, it is **not in this tree** yet — do not invent files for it.

---

## Important files

### App shell

| Path | Role |
|------|------|
| `package.json` | Scripts: `dev`, `build`, `ai`, `gmail`, `test:mel` |
| `vite.config.ts` | Vite on 5173; proxies `/api/gmail`, `/api/melani-ai`, `/api/ollama`, `/melani` |
| `index.html` | Entry HTML |
| `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` | TypeScript |
| `src/main.tsx` | React mount |
| `src/App.tsx` | Shell: sidebar, page editor, Melani rich pages, Mel bubble |
| `src/storage.ts` | Workspace localStorage, life pages, purge junk DBs |
| `src/drMelaniExport.ts` | Default Wonder page tree |
| `src/components/*` | PageEditor, Sidebar, BlockRow, DatabaseView, Search |
| `src/notion.css` | Layout (sidebar reflow so content is not clipped) |

### Health / Melani

| Path | Role |
|------|------|
| `src/melani/MelaniViews.tsx` | Routes Fitness / Data / Hygiene / Books / Gmail / etc. |
| `src/melani/FitnessExact.tsx` | Sleep · Meals · Gym + body brief card |
| `src/melani/bodyBrief.ts` | Nightly brief engine |
| `src/melani/NightlyBodyBrief.tsx` | Brief UI card |
| `src/melani/twin/index.ts` | Twin orchestration and text formatters |
| `src/melani/twin/gather.ts` / `score.ts` | Existing-store reader and transparent score engine |
| `src/melani/twin/forecast.ts` / `radar.ts` / `lever.ts` | Forward model, rising signals, one action |
| `src/melani/twin/doctorPack.ts` / `store.ts` | 14-day clinic summary and 30-day Twin persistence |
| `src/melani/twin/TwinDashboard.tsx` | Fitness Twin dashboard |
| `src/melani/melLocal.ts` | Local Mel replies (incl. `brief`) |
| `src/melani/MelaniAI.tsx` | Mel chat UI + Brief button |
| `src/melani/melContext.ts` | Live snapshot for Mel |
| `src/melani/sleepStore.ts` | Sleep persistence |
| `src/melani/GymExact.tsx` | Gym UI |
| `src/melani/cycleEngine.ts` | Cycle math |
| `src/melani/labEngine.ts` / `labData.ts` | Labs |
| `src/melani/HygieneExact.tsx` / `productLinks.ts` | Hygiene + Amazon |
| `public/gym-plans/*` | Gym JSON plans |

### Optional servers

| Path | Role |
|------|------|
| `server/melani_ai.py` | Grok bridge :8791 |
| `server/start_melani_ai.sh` | Starts AI bridge; loads `XAI_API_KEY` |
| `server/gmail_api.py` | Gmail IMAP :8790 |
| `server/start_gmail.sh` | Starts Gmail bridge |

---

## Env vars

| Var | Required? | Used by |
|-----|-----------|---------|
| none | for core UI | Vite app only needs `npm run dev` |
| `XAI_API_KEY` | optional | `server/melani_ai.py` / `npm run ai` (or file `~/.melani_assistant/xai_api_key`) |
| Gmail email + App Password | optional | entered in UI → stored under bridge data dir, **not** in repo |

**Never commit API keys.** None ship in this repository.

---

## Known bugs / caveats

1. **GitHub repo `size` may show 0** on newly filled repos even when files exist — use `git clone` + branch, or API trees, not only the size field.
2. **Dot in repo name** (`dr.melani`) confuses some agents; always clone with the full URL and checkout this branch explicitly.
3. **TypeScript project has pre-existing unused-var warnings** in older files; `npm run build` may surface them — core app still runs under Vite dev.
4. **Amazon:** only real product URLs (`/dp/ASIN`) and full login; broken cart-add deep links were intentionally removed.
5. **Mel “AI” chat defaults to local rules** (`melLocal.ts`); cloud Grok needs `npm run ai` + key.
6. **No fridge-safety feature** in this branch (see above).
7. **Browser data is local** — cloning the repo does not copy the user’s sleep/meals history from another machine.

---

## Digital Twin

Twin is the forward-looking layer; Body Brief remains the nightly narrative of today.
It reads the existing sleep, nutrition, water, supplements, cycle, gym, lab, goals,
pins, and life-log stores. It does not create a parallel health database. Core Twin
logic is offline TypeScript and needs no environment variables.

- Fitness renders `TwinDashboard` above Body Brief.
- `writeTwin()` refreshes Body Brief and saves a rolling 30-day Twin history.
- Mel commands: `twin`, `digital twin`, `forecast`, `radar`, `lever`, `doctor pack`, `clinic`.
- Persistence: `dr-melani-twin-v1` and `dr-melani-twin-day:YYYY-MM-DD`.
- Forecasts are directional rules, not diagnoses or trained medical models.

---

## How agents should verify the branch

```bash
git ls-remote https://github.com/melanikshrestha-boop/dr.melani.git 'refs/heads/grok/*'
git clone https://github.com/melanikshrestha-boop/dr.melani.git
cd dr.melani && git checkout grok/latest-dr-melani-july-21-2026
ls src/melani/bodyBrief.ts src/melani/NightlyBodyBrief.tsx package.json server/
npm install && npm run dev
```

Confirm files:

- `src/melani/bodyBrief.ts` exists  
- `CODEX_HANDOFF.md` exists  
- `README.md` has section **Codex handoff**

---

## Mirrors (same commit family)

- https://github.com/melanikshrestha-boop/notion-like  
- https://github.com/melanikshrestha-boop/dr-melani-health-app  

Prefer **`dr.melani` + this branch** for Codex handoff.
