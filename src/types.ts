// Block types — building pieces of a Notion page
export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "numbered"
  | "todo"
  | "toggle"
  | "quote"
  | "divider"
  | "callout"
  | "code"
  | "page_link";

export type Block = {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
  open?: boolean;
  children?: Block[];
  /** Indent level 0–4 (lists / nested feel) */
  indent?: number;
  /** Linked subpage id when type is page_link */
  pageId?: string;
};

export type DbColumnType = "title" | "text" | "number" | "select" | "checkbox" | "date";

export type DbColumn = {
  id: string;
  name: string;
  type: DbColumnType;
  options?: string[]; // for select
};

export type DbRow = {
  id: string;
  cells: Record<string, string | number | boolean | null>;
};

export type Database = {
  columns: DbColumn[];
  rows: DbRow[];
};

export type PageKind = "page" | "database";

export type Page = {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  blocks: Block[];
  kind?: PageKind;
  /** When kind === "database" */
  database?: Database;
  /** Cover: solid color token */
  cover?: string | null;
  favorite?: boolean;
  /** Soft-delete timestamp; null/undefined = active */
  trashedAt?: number | null;
};

export type Workspace = {
  name: string;
  pages: Page[];
  activePageId: string;
  sidebarOpen: boolean;
  /** Most recently opened page ids (newest first) */
  recents?: string[];
};
