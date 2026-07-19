import type { BlockType } from "./types";

export type SlashCommand = {
  id: string;
  type: BlockType;
  name: string;
  description: string;
  icon: string;
  keywords: string[];
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "text",
    type: "paragraph",
    name: "Text",
    description: "Just start writing with plain text.",
    icon: "T",
    keywords: ["text", "paragraph", "plain"],
  },
  {
    id: "h1",
    type: "heading1",
    name: "Heading 1",
    description: "Big section heading.",
    icon: "H1",
    keywords: ["h1", "heading1", "title", "heading"],
  },
  {
    id: "h2",
    type: "heading2",
    name: "Heading 2",
    description: "Medium section heading.",
    icon: "H2",
    keywords: ["h2", "heading2", "heading"],
  },
  {
    id: "h3",
    type: "heading3",
    name: "Heading 3",
    description: "Small section heading.",
    icon: "H3",
    keywords: ["h3", "heading3", "heading"],
  },
  {
    id: "bullet",
    type: "bullet",
    name: "Bulleted list",
    description: "Create a simple bulleted list.",
    icon: "•",
    keywords: ["bullet", "list", "ul"],
  },
  {
    id: "numbered",
    type: "numbered",
    name: "Numbered list",
    description: "Create a list with numbering.",
    icon: "1.",
    keywords: ["numbered", "ol", "list", "number"],
  },
  {
    id: "todo",
    type: "todo",
    name: "To-do list",
    description: "Track tasks with a to-do list.",
    icon: "☑",
    keywords: ["todo", "task", "check", "checkbox"],
  },
  {
    id: "toggle",
    type: "toggle",
    name: "Toggle list",
    description: "Toggles can hide and show content inside.",
    icon: "▸",
    keywords: ["toggle", "collapse", "dropdown"],
  },
  {
    id: "quote",
    type: "quote",
    name: "Quote",
    description: "Capture a quote.",
    icon: "“",
    keywords: ["quote", "citation"],
  },
  {
    id: "divider",
    type: "divider",
    name: "Divider",
    description: "Visually divide blocks.",
    icon: "—",
    keywords: ["divider", "line", "hr", "separator"],
  },
  {
    id: "callout",
    type: "callout",
    name: "Callout",
    description: "Make writing stand out.",
    icon: "💡",
    keywords: ["callout", "note", "info"],
  },
  {
    id: "code",
    type: "code",
    name: "Code",
    description: "Capture a code snippet.",
    icon: "</>",
    keywords: ["code", "snippet", "pre"],
  },
];

export function filterSlash(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase().replace(/^\//, "");
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.keywords.some((k) => k.includes(q) || q.includes(k))
  );
}
