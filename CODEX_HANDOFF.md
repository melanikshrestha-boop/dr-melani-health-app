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
- Mel: local coach (no API required)
- Optional bridges: Gmail IMAP (:8790), Grok AI (:8791)
- Nightly **body brief**: one report of the day from live localStorage data

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
| Mel local coach | `src/melani/melLocal.ts`, `MelaniAI.tsx` | Chat coach; type `brief` or tap **Brief** |
| Sleep store + graph | `src/melani/sleepStore.ts`, `FitnessExact.tsx` | Bed/wake, overnight math, weekly hours |
| Meals / macros | `FitnessExact.tsx`, `data.ts` | Usual meals, protein/cal goals |
| Gym native UI | `GymExact.tsx`, `public/gym-plans/*` | Week plan, sets, warm-up last, rest timer |
| Cycle phases | `cycleEngine.ts`, `CycleTracker.tsx` | Follicular/ovulatory/luteal colors + math |
| Labs + blurbs | `labData.ts`, `labEngine.ts`, `MelaniViews.tsx` | Status, expandable 3-line blurbs |
| Hygiene restock | `HygieneExact.tsx`, `productLinks.ts` | AM/PM routines, real Amazon `/dp/ASIN` links |
| Books library | `BooksLibrary.tsx`, `booksStore.ts` | Life → Books |
| Live Mel context | `melContext.ts` | Snapshot for coach: goals, red flags, doctor Qs |
| Gmail connector | `GmailConnector.tsx`, `server/gmail_api.py` | Optional IMAP UI |
| Mel AI bridge | `server/melani_ai.py` | Optional Grok backend |
| Workspace export | `drMelaniExport.ts`, `storage.ts` | Default page tree; purge stub databases |

### Health analysis

- **Labs:** `src/melani/labEngine.ts` + `labData.ts` (import/status/sections/blurbs)
- **Red flags / weekly rollup / doctor questions:** `src/melani/melContext.ts`
- **Nightly summary:** `src/melani/bodyBrief.ts` (write via Fitness card or Mel `brief`)

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
| `package.json` | Scripts: `dev`, `build`, `ai`, `gmail` |
| `vite.config.ts` | Vite on 5173; proxies `/api/gmail`, `/api/melani-ai`, `/melani` |
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
