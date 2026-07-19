# Notion-like

A browser workspace that looks and feels like **Notion** — light gray sidebar, white page canvas, big title, hover block handles, and `/` slash commands.

Built for Melani as a clean Notion-style notes / pages app.

## Features

- **Sidebar** — workspace name, page list, New page, delete page  
- **Pages** — emoji icon, large Untitled title, cover/comment chips  
- **Blocks** — text, H1–H3, bullets, numbered, to-do, toggle, quote, divider, callout, code  
- **Slash menu** — type `/` on an empty line (arrow keys + Enter)  
- **Markdown shortcuts** — `# ` `## ` `### ` `- ` `* ` `> ` `[] ` at start of line  
- **Keyboard** — Enter = new block, Backspace on empty = delete block  
- **Auto-save** — everything stores in `localStorage` in your browser  

## Run locally

```bash
cd notion-like
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Build for production

```bash
npm run build
npm run preview
```

## Stack

- Vite + React + TypeScript  
- Pure CSS matched to Notion’s default light theme (no UI kit)

## Not a full Notion clone

This is a **visual + interaction** clone for pages and blocks. It does not include multiplayer, databases, or cloud sync yet — perfect base to grow.
