// Block types — the building pieces of a Notion page
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
  | "code";

export type Block = {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean; // for todo
  open?: boolean; // for toggle
  children?: Block[]; // nested under toggle
};

export type Page = {
  id: string;
  title: string;
  icon: string;
  parentId: string | null; // null = top-level in sidebar
  createdAt: number;
  updatedAt: number;
  blocks: Block[];
};

export type Workspace = {
  name: string;
  pages: Page[];
  activePageId: string;
  sidebarOpen: boolean;
};
