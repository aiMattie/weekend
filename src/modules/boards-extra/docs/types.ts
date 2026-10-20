/** ProseMirror / Tiptap JSON shapes shared by server and client. No imports. */
export interface PMMark { type: string; attrs?: Record<string, unknown> }
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}
export interface PMDoc { type: "doc"; content?: PMNode[] }

export const emptyDoc = (): PMDoc => ({ type: "doc", content: [{ type: "paragraph" }] });
