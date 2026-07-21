import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { appleBooksApi } from "./scripts/apple-books-api.mjs";
import { wardrobeImportApi } from "./scripts/wardrobe/import-job-api.mjs";
import { responsiveImageApi } from "./scripts/wardrobe/responsive-image-api.mjs";
import { wardrobeIntelligenceApi } from "./scripts/wardrobe/wardrobe-intelligence-api.mjs";
import { localTasksApi } from "./scripts/local-tasks-api.mjs";
import { bookDiscoveryApi } from "./scripts/book-discovery-api.mjs";
import { instacartShoppingApi } from "./scripts/instacart-shopping-api.mjs";

// Workspace runs on its own. Gym is native React (no Melani iframe / no PIN).
// Optional: proxy only /melani/* if you open live Melani in a new tab later.
const MELANI_TARGET = "http://127.0.0.1:8781";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    optimizeDeps: {
      include: ["react", "react-dom/client"],
    },
    plugins: [
      react(),
      responsiveImageApi(),
      wardrobeImportApi({ env }),
      wardrobeIntelligenceApi(),
      localTasksApi(),
      appleBooksApi(),
      bookDiscoveryApi(),
      instacartShoppingApi({ env }),
    ],
    build: {
      rollupOptions: {
        input: {
          main: resolve(process.cwd(), "index.html"),
          wardrobe: resolve(process.cwd(), "wardrobe/index.html"),
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        // Do NOT proxy /static or /gym — that broke Notion workspace assets
        // and made Gym look like the Notion part was deleted.
        "/melani": {
          target: MELANI_TARGET,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/melani/, "") || "/",
        },
        // Real Gmail IMAP bridge (server/gmail_api.py on :8790)
        "/api/gmail": {
          target: "http://127.0.0.1:8790",
          changeOrigin: true,
        },
        // Melani AI (Grok) bridge (server/melani_ai.py on :8791)
        "/api/melani-ai": {
          target: "http://127.0.0.1:8791",
          changeOrigin: true,
        },
        // Private local language model. Ollama is installed on this Mac and
        // never receives workspace data outside the machine.
        "/api/ollama": {
          target: "http://127.0.0.1:11434",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/ollama/, "") || "/",
        },
      },
    },
  };
});
