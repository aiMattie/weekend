"use client";

import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef } from "react";
import type { UserLite } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import { BlockId, Embed, FileAttachment, SlashCommand, type SlashItem } from "./extensions";
import { popupRenderer } from "./popup";
import type { PMDoc } from "./types";

export interface EditorActions {
  image: () => void;
  file: () => void;
  embed: (kind: "board" | "item") => void;
}

interface Opts {
  initial: PMDoc;
  users: UserLite[];
  editable: boolean;
  onChange: () => void;
  /** stable holder whose methods the page keeps up to date */
  actions: EditorActions;
  commented: { current: Set<string> };
}

/** Builds the Tiptap editor with every WorkDocs extension (slash menu, mentions, tables, embeds...). */
export function useDocEditor({ initial, users, editable, onChange, actions, commented }: Opts): Editor | null {
  const t = useT();
  const changeRef = useRef(onChange);
  useEffect(() => { changeRef.current = onChange; });

  const extensions = useMemo(() => {
    const slash = (query: string): SlashItem[] => {
      const nodeItem = (id: string, label: string, hint: string, run: SlashItem["run"]): SlashItem => ({ id, label, hint, run });
      const all: SlashItem[] = [
        nodeItem("h1", t("docs.heading1"), "#", (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 1 }).run()),
        nodeItem("h2", t("docs.heading2"), "##", (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run()),
        nodeItem("h3", t("docs.heading3"), "###", (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 3 }).run()),
        nodeItem("bullets", t("docs.bulletList"), "-", (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run()),
        nodeItem("numbers", t("docs.numberedList"), "1.", (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run()),
        nodeItem("tasks", t("docs.checklist"), "[ ]", (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run()),
        nodeItem("table", t("docs.table"), "", (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
        nodeItem("code", t("docs.codeBlock"), "```", (e, r) => e.chain().focus().deleteRange(r).setCodeBlock().run()),
        nodeItem("quote", t("docs.quote"), ">", (e, r) => e.chain().focus().deleteRange(r).setBlockquote().run()),
        nodeItem("divider", t("docs.divider"), "---", (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run()),
        nodeItem("image", t("docs.image"), "", (e, r) => { e.chain().focus().deleteRange(r).run(); actions.image(); }),
        nodeItem("file", t("docs.file"), "", (e, r) => { e.chain().focus().deleteRange(r).run(); actions.file(); }),
        nodeItem("embed-board", t("docs.embedBoard"), "", (e, r) => { e.chain().focus().deleteRange(r).run(); actions.embed("board"); }),
        nodeItem("embed-item", t("docs.embedItem"), "", (e, r) => { e.chain().focus().deleteRange(r).run(); actions.embed("item"); }),
      ];
      const q = query.trim().toLowerCase();
      return q ? all.filter((i) => i.label.toLowerCase().includes(q) || i.id.includes(q)) : all;
    };
    return [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder: t("docs.placeholder") }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: {
          char: "@",
          items: ({ query }: { query: string }) =>
            users.filter((u) => !u.isAiAgent && u.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8).map((u) => ({ id: u.id, label: u.name })),
          render: popupRenderer("mention") as never,
        },
      }),
      BlockId.configure({ commented }),
      Embed,
      FileAttachment,
      SlashCommand.configure({ items: slash }),
    ];
  }, [t, users, actions, commented]);

  return useEditor({
    extensions,
    content: initial,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: { "data-testid": "doc-editor", "aria-label": t("docs.editorLabel") },
      handleClick: (_view, _pos, event) => {
        const a = (event.target as HTMLElement | null)?.closest?.("a[data-embed-link], .doc-file a");
        if (a && a.getAttribute("href")) { window.open(a.getAttribute("href")!, "_blank", "noopener"); return true; }
        return false;
      },
    },
    onUpdate: () => changeRef.current(),
  });
}
