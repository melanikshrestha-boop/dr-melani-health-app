import type { Plugin } from "vite";

export function appleBooksApi(options?: {
  catalogPath?: string;
  coverRoot?: string;
  libraryDb?: string;
  cloudDb?: string;
  annotationDb?: string;
}): Plugin;
