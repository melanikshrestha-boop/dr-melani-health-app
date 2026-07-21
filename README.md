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
- **Fitness** — Digital Twin · Nightly body brief · Sleep · Meals · Gym
- **My Data** — Labs, cycle tracker, profile
- **Hygiene** — AM/PM routines, restock list, real Amazon product links
- **Mel** — local coach (type `twin` for the forecast or `brief` for tonight)

### Agents
- **Wardrobe** — local garment perception, duplicate-proof imports, operational closet memory, explainable outfit/packing decisions, and the original gallery/editor
- **Weather** — device location, live conditions, seven-day forecast, exact Wardrobe look selection, and weather-aware scent and grooming guidance

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
| **Digital Twin** | Offline engine: `src/melani/twin/*`. Dashboard: `TwinDashboard.tsx`. Reads existing sleep, nutrition, cycle, gym, labs, goals, and life logs; writes only namespaced Twin history |
| **Nutrition tracking** | Meals UI: `src/melani/FitnessExact.tsx`. Presets/macros: `src/melani/data.ts`. Keys: `dr-melani-meals-usuals:*`, water/supplements same pattern |
| **Fridge safety** | **Not implemented as a module.** Closest: hygiene restock + Amazon links (`src/melani/HygieneExact.tsx`, `productLinks.ts`) and meal logging — no fridge inventory/expiry system |
| **Grok-added (2026-07-21)** | Nightly body brief (`bodyBrief.ts`, `NightlyBodyBrief.tsx`), Mel `brief` command, Fitness brief card, Mel Brief button |
| **Wardrobe** | Product UI in `src/melani/wardrobe/*`; local perception and intelligence services in `scripts/wardrobe/*`; Wonder adapter in `WardrobeFrame.tsx`. Private runtime data stays in gitignored `data/` |
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

## Digital Twin

Mel Digital Twin is the forward-looking layer above Body Brief. Body Brief writes
today back clearly. Twin scores today, detects rising signals, selects one action,
and forecasts the next seven days. The core works offline with transparent TypeScript
rules and existing browser data.

| File | Role |
|------|------|
| `src/melani/twin/types.ts` | Shared Twin, forecast, radar, lever, and doctor-pack contracts |
| `src/melani/twin/gather.ts` | Reads existing localStorage modules without creating parallel health stores |
| `src/melani/twin/score.ts` | Documented 0–100 scoring constants and weighted overall score |
| `src/melani/twin/forecast.ts` | Seven-day cycle, sleep-debt, and fuel projection |
| `src/melani/twin/radar.ts` | Maximum three rising signals with plain-English reasons |
| `src/melani/twin/lever.ts` | Exactly one highest-return action |
| `src/melani/twin/doctorPack.ts` | Copyable 14-day clinic summary for Dr. Ververis |
| `src/melani/twin/store.ts` | Current-day state and rolling 30-day Twin history |
| `src/melani/twin/TwinDashboard.tsx` | Fitness dashboard and actions |

Mel commands: `twin`, `digital twin`, `forecast`, `radar`, `lever`, `doctor pack`,
and `clinic`. Twin storage keys are `dr-melani-twin-v1` and
`dr-melani-twin-day:YYYY-MM-DD`.

## Wardrobe

Open **Agents → Wardrobe** in the Wonder sidebar. The embedded product is the
MIT-licensed upstream Wardrobe app at commit `f44006cce7e4779e595a35b25fbbc8dabc68d7e4`,
extended inside Wonder. The original gallery, category filters, item editor,
color sampler, delete flow, drag/drop/paste importer, staged review, and
responsive image service remain the visual surface.

Under that surface, imports use the on-device SegFormer clothes model in
`data/models/` to isolate garments, preserve a transparent subject cutout,
identify category and color, and reject visual duplicates. No API key is needed
for this local path. Records and generated images live in gitignored `data/`.

The operational layer stores an atomic snapshot in `data/wardrobe-state.json`
and a sequenced write-ahead audit log in `data/wardrobe-events.ndjson`; an
interrupted snapshot write is replayed from the ledger. It tracks cleanliness,
repair/donation/sold availability, location, favorites, wear count, acquisition
cost, cost per wear, last wear, recommendations, and explicit outfit feedback.
Mel can recommend only owned and available pieces, explain every score, remember
the proposal, atomically log “wear outfit 1,” learn from likes/dislikes, undo the
whole transaction, plan trips and rotations, audit resale evidence, prioritize
laundry, map high-leverage pieces, and simulate whether a purchase adds useful
combinations or duplicates the closet.

Useful commands include `what should I wear for streaming`, `wear outfit 1`,
`I liked outfit 1`, `put the olive dress in laundry`, `plan my outfits for 7
days`, `pack me for 3 days`, `what should I wash`, `show my wardrobe graph`, and
`should I buy an olive dress for $120`. `wardrobe health` runs the integrity
checks directly from Mel.
