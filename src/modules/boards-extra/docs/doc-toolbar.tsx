"use client";

import type { Editor } from "@tiptap/react";
import { useEffect, useReducer } from "react";
import { useT } from "@/lib/i18n/client";
import styles from "./docs.module.css";

export interface ToolbarActions {
  image: () => void;
  file: () => void;
  embed: (kind: "board" | "item") => void;
}

/** Formatting + insert toolbar. Re-renders on every editor transaction so the active states stay correct. */
export function DocToolbar({ editor, actions }: { editor: Editor; actions: ToolbarActions }) {
  const t = useT();
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    editor.on("transaction", tick);
    return () => { editor.off("transaction", tick); };
  }, [editor]);

  const btn = (id: string, label: string, run: () => void, active = false, title?: string) => (
    <button key={id} type="button" className={`${styles.tbBtn} ${active ? styles.tbActive : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={run} data-testid={`doc-tb-${id}`} aria-label={title ?? label} title={title ?? label}>{label}</button>
  );
  const c = () => editor.chain().focus();
  const sep = (k: string) => <span key={k} className={styles.tbSep} />;

  return (
    <div className={styles.toolbar} data-testid="doc-toolbar" role="toolbar">
      {btn("h1", "H1", () => c().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }), t("docs.heading1"))}
      {btn("h2", "H2", () => c().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }), t("docs.heading2"))}
      {btn("h3", "H3", () => c().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }), t("docs.heading3"))}
      {sep("1")}
      {btn("bold", "B", () => c().toggleBold().run(), editor.isActive("bold"), t("docs.bold"))}
      {btn("italic", "I", () => c().toggleItalic().run(), editor.isActive("italic"), t("docs.italic"))}
      {btn("underline", "U", () => c().toggleUnderline().run(), editor.isActive("underline"), t("docs.underline"))}
      {btn("strike", "S", () => c().toggleStrike().run(), editor.isActive("strike"), t("docs.strike"))}
      {btn("code", "</>", () => c().toggleCode().run(), editor.isActive("code"), t("docs.inlineCode"))}
      {btn("link", t("docs.link"), () => {
        const prev = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt("URL", prev ?? "https://");
        if (url === null) return;
        if (url === "") c().unsetLink().run();
        else c().setLink({ href: url }).run();
      }, editor.isActive("link"))}
      {sep("2")}
      {btn("bullets", "•", () => c().toggleBulletList().run(), editor.isActive("bulletList"), t("docs.bulletList"))}
      {btn("numbers", "1.", () => c().toggleOrderedList().run(), editor.isActive("orderedList"), t("docs.numberedList"))}
      {btn("tasks", "[ ]", () => c().toggleTaskList().run(), editor.isActive("taskList"), t("docs.checklist"))}
      {btn("quote", "“", () => c().toggleBlockquote().run(), editor.isActive("blockquote"), t("docs.quote"))}
      {btn("codeblock", "{ }", () => c().toggleCodeBlock().run(), editor.isActive("codeBlock"), t("docs.codeBlock"))}
      {btn("divider", "—", () => c().setHorizontalRule().run(), false, t("docs.divider"))}
      {btn("table", t("docs.table"), () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      {editor.isActive("table") && <>
        {btn("row-add", t("docs.addRow"), () => c().addRowAfter().run())}
        {btn("col-add", t("docs.addColumn"), () => c().addColumnAfter().run())}
        {btn("row-del", t("docs.deleteRow"), () => c().deleteRow().run())}
        {btn("col-del", t("docs.deleteColumn"), () => c().deleteColumn().run())}
        {btn("table-del", t("docs.deleteTable"), () => c().deleteTable().run())}
      </>}
      {sep("3")}
      {btn("image", t("docs.image"), actions.image)}
      {btn("file", t("docs.file"), actions.file)}
      {btn("mention", "@", () => c().insertContent("@").run(), false, t("docs.mention"))}
      {btn("embed-board", t("docs.embedBoard"), () => actions.embed("board"))}
      {btn("embed-item", t("docs.embedItem"), () => actions.embed("item"))}
    </div>
  );
}
