# Dr. Melani — Wonder personal OS

Notion-style workspace **plus** Dr. Melani health pages. Add pages, databases, and notes anytime. Fitness / Labs / Hygiene / Mel are special surfaces — they do **not** remove normal page creation.

## Run

```bash
git clone https://github.com/melanikshrestha-boop/dr.melani.git
cd dr.melani
git checkout grok/latest-dr-melani-july-21-2026
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**

## What’s inside

### Health pages (built-in UI)
- **Fitness** — Sleep · Meals · Gym · **Nightly body brief**
- **My Data** — Labs, cycle tracker, profile
- **Hygiene** — AM/PM routines, restock list, real Amazon product links
- **Mel** — local coach (type `brief` for tonight’s report)

### Life pages
- Books, Real Life, Document Hub, Meetings, Goals, To Do, Journal
- Classes, Content, Finance, Startups, Neurotech, Work
- **+ New page** anytime in the sidebar

## Write like Notion
- Click title → type  
- **Enter** = new block · **/** = slash menu · **Tab** = indent  
- **⌘K** = search · everything auto-saves in this browser  

## Optional bridges
```bash
npm run ai      # Mel Grok bridge :8791 (needs XAI_API_KEY)
npm run gmail   # Gmail IMAP bridge :8790
```

## Restore
Sidebar → **Restore full workspace** reloads the full page tree.

---

## Codex handoff

Use this section when an agent (Codex / GPT / Claude) must pull the app **without chat context**.

| Item | Value |
|------|--------|
| **Repo** | https://github.com/melanikshrestha-boop/dr.melani |
| **Exact branch** | `grok/latest-dr-melani-july-21-2026` |
| **Stack** | **Vite + React + TypeScript** (not Next.js) |
| **Expected local URL** | http://127.0.0.1:5173/ |
| **Full handoff doc** | [`CODEX_HANDOFF.md`](./CODEX_HANDOFF.md) |

### Exact run steps (copy-paste)

```bash
git clone https://github.com/melanikshrestha-boop/dr.melani.git
cd dr.melani
git checkout grok/latest-dr-melani-july-21-2026
npm install
npm run dev
```

### Where major features live

| Topic | Location in repo |
|-------|------------------|
| **Health analysis** | Labs: `src/melani/labEngine.ts`, `labData.ts`. Red flags / weekly rollup / doctor Q pack: `src/melani/melContext.ts`. Nightly report: `src/melani/bodyBrief.ts` |
| **Nutrition tracking** | Meals UI: `src/melani/FitnessExact.tsx`. Presets/macros: `src/melani/data.ts`. Keys: `dr-melani-meals-usuals:*`, water/supplements same pattern |
| **Fridge safety** | **Not implemented as a module.** Closest: hygiene restock + Amazon links (`src/melani/HygieneExact.tsx`, `productLinks.ts`) and meal logging — no fridge inventory/expiry system |
| **Grok-added (2026-07-21)** | Nightly body brief (`bodyBrief.ts`, `NightlyBodyBrief.tsx`), Mel `brief` command, Fitness brief card, Mel Brief button |
| **Sleep** | `src/melani/sleepStore.ts` + Fitness sleep panel |
| **Cycle** | `src/melani/cycleEngine.ts`, `CycleTracker.tsx` |
| **Gym** | `src/melani/GymExact.tsx`, `public/gym-plans/*` |
| **Mel coach** | `src/melani/melLocal.ts`, `MelaniAI.tsx` |
| **Optional servers** | `server/melani_ai.py`, `server/gmail_api.py` |

### Agent verification

```bash
git ls-remote https://github.com/melanikshrestha-boop/dr.melani.git refs/heads/grok/latest-dr-melani-july-21-2026
# then clone, checkout, confirm:
ls src/melani/bodyBrief.ts CODEX_HANDOFF.md package.json
```

If GitHub shows `size: 0` on the repo metadata, **ignore that field** — fetch the branch and list files. The tree is not empty.
