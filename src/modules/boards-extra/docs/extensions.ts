/** Custom Tiptap extensions for WorkDocs: stable block ids, board/item embed, file attachment, slash menu. */
import { Extension, Node, mergeAttributes, type Editor, type Range } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import Suggestion from "@tiptap/suggestion";
import { newBlockId } from "./serialize";
import { popupRenderer } from "./popup";

export const BLOCK_TYPES = ["paragraph", "heading", "bulletList", "orderedList", "taskList", "blockquote", "codeBlock", "horizontalRule", "table", "image", "embed", "fileAttachment"];

export interface BlockIdOptions {
  /** block ids that have open comments (mutable, read by the decoration plugin) */
  commented: { current: Set<string> };
}

const blockKey = new PluginKey("blockId");

/** Every top-level block carries a unique `blockId` attribute (used to attach comments). */
export const BlockId = Extension.create<BlockIdOptions>({
  name: "blockId",
  addOptions: () => ({ commented: { current: new Set<string>() } }),
  addGlobalAttributes() {
    return [{
      types: BLOCK_TYPES,
      attributes: {
        blockId: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute("data-block-id"),
          renderHTML: (attrs: Record<string, unknown>) => (attrs.blockId ? { "data-block-id": String(attrs.blockId) } : {}),
        },
      },
    }];
  },
  addProseMirrorPlugins() {
    const commented = this.options.commented;
    return [new Plugin({
      key: blockKey,
      appendTransaction(trs, _old, state) {
        if (!trs.some((t) => t.docChanged)) return null;
        const seen = new Set<string>();
        let tr = state.tr;
        let changed = false;
        state.doc.forEach((node, offset) => {
          const cur = node.attrs.blockId as string | null | undefined;
          if (cur && !seen.has(cur)) { seen.add(cur); return; }
          if (!node.type.spec.attrs || !("blockId" in node.type.spec.attrs)) return;
          const id = newBlockId();
          seen.add(id);
          tr = tr.setNodeAttribute(offset, "blockId", id);
          changed = true;
        });
        return changed ? tr : null;
      },
      props: {
        decorations(state) {
          const decos: Decoration[] = [];
          state.doc.forEach((node, offset) => {
            const id = node.attrs.blockId as string | undefined;
            if (id && commented.current.has(id)) decos.push(Decoration.node(offset, offset + node.nodeSize, { class: "has-comments" }));
          });
          return DecorationSet.create(state.doc, decos);
        },
      },
    })];
  },
});

const embedHref = (a: Record<string, unknown>) => (a.kind === "item" ? `/boards/${a.boardId}?item=${a.id}` : `/boards/${a.id}`);

/** Block that links to a board or an item. */
export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    const attr = (name: string, def: unknown) => ({ default: def, parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`), renderHTML: () => ({}) });
    return { kind: attr("kind", "board"), id: attr("id", ""), boardId: attr("board-id", null), label: attr("label", "") };
  },
  parseHTML: () => [{ tag: 'div[data-type="embed"]' }],
  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs;
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "embed", "data-kind": a.kind, "data-id": a.id, "data-board-id": a.boardId ?? "", "data-label": a.label, class: "doc-embed" }),
      ["span", { class: "doc-embed-kind" }, a.kind === "item" ? "Item" : "Board"],
      ["a", { href: embedHref(a), "data-embed-link": "1", target: "_blank", rel: "noopener noreferrer" }, String(a.label || a.id)],
    ];
  },
});

/** Attached file (data URL or uploaded path). */
export const FileAttachment = Node.create({
  name: "fileAttachment",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    const attr = (name: string) => ({ default: "", parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`), renderHTML: () => ({}) });
    return { name: attr("name"), url: attr("url"), size: { default: 0, parseHTML: (el: HTMLElement) => Number(el.getAttribute("data-size") ?? 0), renderHTML: () => ({}) } };
  },
  parseHTML: () => [{ tag: 'div[data-type="file"]' }],
  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs;
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "file", "data-name": a.name, "data-url": a.url, "data-size": String(a.size ?? 0), class: "doc-embed doc-file" }),
      ["span", { class: "doc-embed-kind" }, "Bestand"],
      ["a", { href: a.url, download: a.name, target: "_blank", rel: "noopener noreferrer" }, String(a.name || "bestand")],
    ];
  },
});

export interface SlashItem { id: string; label: string; hint?: string; run: (editor: Editor, range: Range) => void }

/** "/" opens a command list. `items` is provided by the editor component (i18n labels, pickers). */
export const SlashCommand = Extension.create<{ items: (query: string) => SlashItem[] }>({
  name: "slashCommand",
  addOptions: () => ({ items: () => [] }),
  addProseMirrorPlugins() {
    return [Suggestion<SlashItem, SlashItem>({
      editor: this.editor,
      pluginKey: new PluginKey("slashCommand"),
      char: "/",
      startOfLine: false,
      allowSpaces: true,
      items: ({ query }) => this.options.items(query),
      command: ({ editor, range, props }) => props.run(editor, range),
      render: popupRenderer<SlashItem>("slash") as never,
    })];
  },
});
