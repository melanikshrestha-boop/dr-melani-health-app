import { runLocalMelAgent } from "./melAgent";

/** Compatibility entry point for any local-only Mel caller. */
export function melLocalReply(userText: string, pageId?: string, pageTitle?: string): string {
  return runLocalMelAgent(userText, pageId, pageTitle).reply;
}
