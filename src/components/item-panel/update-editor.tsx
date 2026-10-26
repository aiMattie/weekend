"use client";

import { Icon } from "@vibe/core";
import { Attach, Close } from "@vibe/icons";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { TeamLite, UserLite } from "@/lib/board-types";
import { filesFrom, formatSize } from "./assets";
import { buildMention } from "./mention-suggestion";
import styles from "./item-panel.module.css";

interface Props {
  users: UserLite[];
  teams?: TeamLite[];
  placeholder?: string;
  /** html of the editor and the files picked for upload */
  onSubmit: (html: string, files: File[]) => Promise<void> | void;
  compact?: boolean;
  autoFocus?: boolean;
  /** edit mode: start with this html, no file picking */
  initialHtml?: string;
  submitLabel?: string;
  onCancel?: () => void;
  allowFiles?: boolean;
  testPrefix?: string;
}

/** Tiptap composer: bold/italic/underline/strike, lists, quote, link, @mentions of users and teams, file attachments. */
export function UpdateEditor({ users, teams = [], placeholder, onSubmit, compact, autoFocus, initialHtml, submitLabel, onCancel, allowFiles = true, testPrefix = "update" }: Props) {
  const t = useT();
  const [empty, setEmpty] = useState(!initialHtml);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const addFiles = (list: File[]) => { if (allowFiles && list.length) setFiles((cur) => [...cur, ...list]); };
  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles; // eslint-disable-line react-hooks/refs

  const mention = useMemo(() => buildMention(users, teams, t("panel.team")), [users, teams, t]);
  const extensions = useMemo(() => [StarterKit.configure({ heading: false, codeBlock: false, link: { openOnClick: false, autolink: true } }), mention], [mention]);

  const editor = useEditor({
    extensions,
    content: initialHtml,
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: { "data-testid": `${testPrefix}-editor`, class: styles.editorContent, "aria-label": placeholder ?? t("panel.writeUpdate") },
      handlePaste: (_v, e) => {
        const cd = e.clipboardData;
        const imgs = filesFrom(cd?.files).filter((f) => f.type.startsWith("image/"));
        const hasText = !!cd?.types.some((ty) => ty === "text/html" || ty === "text/plain");
        // Word and Excel put a preview image next to plain text: ignore that image and paste the text.
        // Teams and browsers put a real <img> in the html: attach the image and paste the text too.
        const htmlHasImg = /<img\b/i.test(cd?.getData("text/html") ?? "");
        if (!imgs.length) return false;
        if (hasText && !htmlHasImg) return false;
        addFilesRef.current(imgs);
        return !hasText;
      },
    },
    onUpdate: ({ editor: ed }) => setEmpty(ed.isEmpty),
  });

  const canSubmit = !busy && (!empty || files.length > 0);
  const submit = async () => {
    if (!editor || !canSubmit) return;
    setBusy(true);
    try {
      await onSubmit(editor.isEmpty ? "" : editor.getHTML(), files);
      if (!editor.isDestroyed && !initialHtml) editor.commands.clearContent(true);
      setEmpty(!initialHtml);
      setFiles([]);
    } finally {
      setBusy(false);
    }
  };

  const tb = (label: string, active: boolean, run: () => void, testId: string, title: string) => (
    <button type="button" className={`${styles.tbBtn} ${active ? styles.tbActive : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={run} data-testid={testId} aria-label={title} title={title}>{label}</button>
  );

  return (
    <div
      className={`${styles.composer} ${compact ? styles.composerCompact : ""} ${dragOver ? styles.composerDrag : ""}`}
      data-testid={`${testPrefix}-composer`}
      onDragOver={(e) => { if (allowFiles && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { setDragOver(false); const f = filesFrom(e.dataTransfer.files); if (allowFiles && f.length) { e.preventDefault(); addFiles(f); } }}
      onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); } if (e.key === "Escape" && onCancel) { e.stopPropagation(); onCancel(); } }}
    >
      {editor ? (
        <div className={styles.toolbar}>
          {tb("B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "tb-bold", t("panel.tb.bold"))}
          {tb("I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "tb-italic", t("panel.tb.italic"))}
          {tb("U", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), "tb-underline", t("panel.tb.underline"))}
          {tb("S", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), "tb-strike", t("panel.tb.strike"))}
          <span className={styles.tbSep} />
          {tb("•", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "tb-bullets", t("panel.tb.bullets"))}
          {tb("1.", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "tb-numbers", t("panel.tb.numbers"))}
          {tb("“", editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), "tb-quote", t("panel.tb.quote"))}
          <span className={styles.tbSep} />
          {tb("@", false, () => editor.chain().focus().insertContent("@").run(), "tb-mention", t("panel.tb.mention"))}
          {tb(t("panel.tb.link"), editor.isActive("link"), () => {
            const prev = editor.getAttributes("link").href as string | undefined;
            const url = window.prompt("URL", prev ?? "https://");
            if (url === null) return;
            if (url === "") editor.chain().focus().unsetLink().run();
            else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }, "tb-link", t("panel.tb.link"))}
          {allowFiles ? (
            <button type="button" className={styles.tbBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => fileInput.current?.click()} data-testid={`${testPrefix}-attach`} aria-label={t("panel.attachFile")} title={t("panel.attachFile")}>
              <Icon icon={Attach} size={16} ignoreFocusStyle />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={styles.editorWrap}>
        {empty ? <span className={styles.editorPlaceholder}>{placeholder ?? t("panel.writeUpdate")}</span> : null}
        <EditorContent editor={editor} />
      </div>
      {files.length ? (
        <div className={styles.pending} data-testid={`${testPrefix}-pending-files`}>
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className={styles.chip} data-testid="pending-file">
              <span className={styles.chipName}>{f.name}</span>
              <span className={styles.chipSize}>{formatSize(f.size)}</span>
              <button type="button" className={styles.chipX} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={t("common.cancel")}><Icon icon={Close} size={12} ignoreFocusStyle /></button>
            </span>
          ))}
        </div>
      ) : null}
      {allowFiles ? <input ref={fileInput} type="file" multiple hidden data-testid={`${testPrefix}-file-input`} onChange={(e) => { addFiles(filesFrom(e.target.files)); e.target.value = ""; }} /> : null}
      <div className={styles.composerFooter}>
        {onCancel ? <button type="button" className={styles.cancelBtn} onClick={onCancel} data-testid={`${testPrefix}-cancel`}>{t("common.cancel")}</button> : null}
        <button type="button" className={styles.submit} disabled={!canSubmit} onClick={() => void submit()} data-testid={`${testPrefix}-submit`}>{submitLabel ?? t("panel.update")}</button>
      </div>
    </div>
  );
}
