# Wardrobe upstream

- Repository: `https://github.com/melanikshrestha-boop/wardrobe`
- Commit: `f44006cce7e4779e595a35b25fbbc8dabc68d7e4`
- License: MIT (copied to `LICENSE`)

The integration began from `App.jsx`, `OptimizedImage.jsx`, `import-flow.jsx`,
`styles.css`, `import-flow.css`, and the server scripts at that commit. They are
no longer byte-for-byte copies: Wonder preserves the upstream visual language
while adding canonical metadata persistence, duplicate-aware imports, on-device
clothes segmentation, and operational wardrobe intelligence.

Wonder also adds the `/wardrobe/` HTML entry, a namespaced service worker,
`WardrobeFrame.tsx`, `wardrobeAgent.ts`, and the intelligence/store/API modules
under `scripts/wardrobe/`.

The upstream repository intentionally excludes private runtime data. Wardrobe
uses the gitignored root `data/` directory for `library.json`, generated images,
jobs, local model weights, `wardrobe-state.json`, `wardrobe-events.ndjson`, and
the optional `model-reference.png`.
