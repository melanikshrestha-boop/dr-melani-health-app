import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy the real Dr. Melani app so Gym (and other embeds) are 100% original UI/UX.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // e.g. /melani/gym → http://127.0.0.1:8781/gym
      "/melani": {
        target: "http://127.0.0.1:8781",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/melani/, "") || "/",
        // Keep cookies on this host so PIN login works inside the iframe
        cookieDomainRewrite: "",
      },
    },
  },
});
