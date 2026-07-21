import type { Plugin } from "vite";

export function wardrobeImportApi(options?: {
  env?: Record<string, string>;
  garmentPrompt?: string;
  modeledPrompt?: string;
}): Plugin;
