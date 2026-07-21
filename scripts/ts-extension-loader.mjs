import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith(".") || /\.[a-z0-9]+$/i.test(specifier)) throw error;
    const url = new URL(`${specifier}.ts`, context.parentURL);
    try {
      await access(fileURLToPath(url));
      return { url: url.href, shortCircuit: true };
    } catch {
      throw error;
    }
  }
}
