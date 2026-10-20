"use client";

import { Button } from "@vibe/core";
import Link from "next/link";
import { EditorContent } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UserLite } from "@/lib/board-types";
import { useIsClient } from "@/lib/use-persistent-state";
import { useT } from "@/lib/i18n/client";
import type { DocCommentDto, DocDto } from "@/server/services/docs";
import { CoverPicker, EmbedPicker, ShareDialog, readFileAsDataUrl, readImage, type EmbedChoice } from "./doc-dialogs";
import { CommentsPanel, VersionsPanel } from "./doc-panels";
import { DocToolbar } from "./doc-toolbar";
import styles from "./docs.module.css";
import { useDocEditor, type EditorActions } from "./use-doc-editor";
import type { PMDoc } from "./types";

export interface DocPageProps {
  initial: DocDto;
  users: UserLite[];
  currentUserId: string;
  isAdmin: boolean;
  crumbs: { workspaceName: string; workspaceHref: string; itemName: string | null; itemHref: string | null };
}

type SaveState = "saved" | "dirty" | "saving" | "error";
const SAVE_DELAY = 700;
const MAX_FILE = 2_000_000;

const isImageSrc = (c: string | null) => !!c && !c.startsWith("#");

export function DocPage({ initial, users, currentUserId, isAdmin, crumbs }: DocPageProps) {
  const t = useT();
  const hydrated = useIsClient();
  const canEdit = initial.access === "edit";
  const [title, setTitle] = useState(initial.title);
  const [cover, setCover] = useState<string | null>(initial.cover);
  const [coverPicker, setCoverPicker] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [panel, setPanel] = useState<"comments" | "versions" | null>(null);
  const [comments, setComments] = useState<DocCommentDto[]>([]);
  const [composeBlock, setComposeBlock] = useState<string | null>(null);
  const [embedKind, setEmbedKind] = useState<"board" | "item" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [share, setShare] = useState({ visibility: initial.visibility, members: initial.members });
  const [hover, setHover] = useState<{ id: string; top: number } | null>(null);

  const [commented] = useState(() => ({ current: new Set<string>() }));

  const [reloadTick, setReloadTick] = useState(0);
  const pending = useRef<{ blocks: boolean; title?: string }>({ blocks: false });
  const inflight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [actions] = useState<EditorActions>(() => ({ image: () => imageInput.current?.click(), file: () => fileInput.current?.click(), embed: (k) => setEmbedKind(k) }));
  const wrapRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReturnType<typeof useDocEditor>>(null);

  const flush = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed || inflight.current) return;
    if (!pending.current.blocks && pending.current.title === undefined) return;
    const body: Record<string, unknown> = {};
    if (pending.current.blocks) body.blocks = ed.getJSON();
    if (pending.current.title !== undefined) body.title = pending.current.title.trim() || "Naamloos document";
    const sent = pending.current;
    pending.current = { blocks: false };
    inflight.current = true;
    setSaveState("saving");
    try {
      const r = await fetch(`/api/v1/docs/${initial.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
      if (!r.ok) throw new Error(String(r.status));
      setSaveState(pending.current.blocks || pending.current.title !== undefined ? "dirty" : "saved");
    } catch {
      pending.current = { blocks: pending.current.blocks || sent.blocks, title: pending.current.title ?? sent.title };
      setSaveState("error");
    } finally {
      inflight.current = false;
      if (pending.current.blocks || pending.current.title !== undefined) schedule();
    }
  }, [initial.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  }, [flush]);

  const onChange = useCallback(() => {
    pending.current.blocks = true;
    setSaveState("dirty");
    schedule();
  }, [schedule]);

  const editor = useDocEditor({ initial: initial.blocks as PMDoc, users, editable: canEdit, onChange, actions, commented });
  useEffect(() => { editorRef.current = editor; });

  // flush on tab hide / unmount so a reload right after typing keeps the text
  useEffect(() => {
    const onHide = () => { if (timer.current) clearTimeout(timer.current); void flush(); };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => { window.removeEventListener("pagehide", onHide); window.removeEventListener("beforeunload", onHide); onHide(); };
  }, [flush]);

  /* ---------------------------------------------------------------- comments */
  useEffect(() => {
    let alive = true;
    void fetch(`/api/v1/docs/${initial.id}/comments`).then((r) => (r.ok ? r.json() : null)).then((rows: DocCommentDto[] | null) => {
      if (!alive || !rows) return;
      setComments(rows);
      // mutate in place: Tiptap clones the extension options, so the Set itself is what the plugin sees
      commented.current.clear();
      for (const c of rows) if (!c.parentId && !c.resolved && c.blockId) commented.current.add(c.blockId);
      const ed = editorRef.current;
      if (ed && !ed.isDestroyed) ed.view.dispatch(ed.state.tr.setMeta("commentsChanged", true));
    });
    return () => { alive = false; };
  }, [initial.id, reloadTick, editor, commented]);

  const blockText = useCallback((id: string) => {
    let out = "";
    editorRef.current?.state.doc.forEach((n) => { if (n.attrs.blockId === id) out = n.textContent; });
    return out.slice(0, 120);
  }, []);

  const commentCount = (id: string) => comments.filter((c) => c.blockId === id && !c.parentId && !c.resolved).length;

  const onMove = (e: React.MouseEvent) => {
    const ed = editorRef.current;
    const wrap = wrapRef.current;
    if (!ed || !wrap || ed.isDestroyed) return;
    const pos = ed.view.posAtCoords({ left: Math.max(e.clientX, wrap.getBoundingClientRect().left + 8), top: e.clientY });
    if (!pos) return;
    const $p = ed.state.doc.resolve(Math.min(pos.pos, ed.state.doc.content.size));
    if ($p.depth < 1 && !$p.nodeAfter) return;
    const offset = $p.depth >= 1 ? $p.before(1) : pos.pos;
    const node = ed.state.doc.nodeAt(offset);
    const id = node?.attrs.blockId as string | undefined;
    const dom = ed.view.nodeDOM(offset) as HTMLElement | null;
    if (!id || !dom) return;
    const top = dom.getBoundingClientRect().top - wrap.getBoundingClientRect().top + 2;
    setHover((h) => (h && h.id === id && h.top === top ? h : { id, top }));
  };

  /* ---------------------------------------------------------------- inserts */
  const insertImage = async (f: File) => {
    const src = await readImage(f, 1400);
    editor?.chain().focus().setImage({ src, alt: f.name }).run();
  };
  const insertFile = async (f: File) => {
    if (f.size > MAX_FILE) { window.alert(t("docs.fileTooBig")); return; }
    const url = await readFileAsDataUrl(f);
    editor?.chain().focus().insertContent({ type: "fileAttachment", attrs: { name: f.name, url, size: f.size } }).run();
  };
  const insertEmbed = (c: EmbedChoice) => {
    editor?.chain().focus().insertContent({ type: "embed", attrs: { kind: c.kind, id: c.id, boardId: c.boardId, label: c.label } }).run();
    setEmbedKind(null);
  };

  const saveCover = async (c: string | null) => {
    setCover(c);
    setCoverPicker(false);
    await fetch(`/api/v1/docs/${initial.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cover: c }) });
  };

  const canShare = canEdit && (isAdmin || initial.ownerId === currentUserId);
  const stateLabel = useMemo(() => ({ saved: t("docs.saved"), dirty: t("docs.unsaved"), saving: t("docs.saving"), error: t("docs.saveError") })[saveState], [saveState, t]);

  return (
    <div className={styles.root} data-testid="doc-page" data-doc-id={initial.id} data-hydrated={String(hydrated && !!editor)}>
      <div className={styles.mainCol}>
        <div className={styles.header}>
          <nav className={styles.crumbs} aria-label="breadcrumb">
            <Link href="/docs">{t("extra.nav.docs")}</Link>
            <span>/</span>
            <Link href={crumbs.workspaceHref}>{crumbs.workspaceName}</Link>
            {crumbs.itemName && <><span>/</span><Link href={crumbs.itemHref ?? "#"}>{crumbs.itemName}</Link></>}
            <span>/</span>
            <span className={styles.crumbCurrent}>{title || t("docs.untitled")}</span>
          </nav>
          <span className={styles.spacer} />
          <span className={`${styles.saveState} ${saveState === "error" ? styles.saveError : ""}`} data-testid="doc-save-state" data-state={saveState}>{canEdit ? stateLabel : t("docs.readOnly")}</span>
          <Button kind={panel === "comments" ? "primary" : "tertiary"} size="small" onClick={() => setPanel(panel === "comments" ? null : "comments")} data-testid="doc-open-comments">{t("docs.comments")}{comments.filter((c) => !c.parentId && !c.resolved).length ? ` (${comments.filter((c) => !c.parentId && !c.resolved).length})` : ""}</Button>
          <Button kind={panel === "versions" ? "primary" : "tertiary"} size="small" onClick={() => setPanel(panel === "versions" ? null : "versions")} data-testid="doc-open-versions">{t("docs.versions")}</Button>
          <a href={`/api/v1/docs/${initial.id}/markdown`} download data-testid="doc-export"><Button kind="tertiary" size="small">{t("docs.exportMarkdown")}</Button></a>
          <Button kind="secondary" size="small" onClick={() => setShareOpen(true)} data-testid="doc-share">{t("docs.share")}</Button>
        </div>

        {canEdit && editor && (
          <DocToolbar editor={editor} actions={actions} />
        )}

        <div className={styles.scroll}>
          {cover && (
            <div className={styles.cover} style={isImageSrc(cover) ? { backgroundImage: `url("${cover}")` } : { background: cover }} data-testid="doc-cover">
              {canEdit && (
                <div className={styles.coverActions}>
                  <button type="button" className={styles.coverBtn} onClick={() => setCoverPicker(true)}>{t("docs.changeCover")}</button>
                  <button type="button" className={styles.coverBtn} onClick={() => void saveCover(null)}>{t("docs.removeCover")}</button>
                </div>
              )}
            </div>
          )}
          <div className={styles.page}>
            <div className={styles.pageTools}>
              {canEdit && !cover && <button type="button" className={styles.ghostBtn} onClick={() => setCoverPicker(true)} data-testid="doc-add-cover">{t("docs.addCover")}</button>}
            </div>
            {coverPicker && <CoverPicker onPick={(c) => void saveCover(c)} onClose={() => setCoverPicker(false)} />}
            <input
              className={styles.title} value={title} readOnly={!canEdit} placeholder={t("docs.untitled")} data-testid="doc-title" aria-label={t("docs.titleLabel")}
              onChange={(e) => { setTitle(e.target.value); pending.current.title = e.target.value; setSaveState("dirty"); schedule(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); editor?.commands.focus("start"); } }}
            />
            <div ref={wrapRef} className={styles.editorWrap} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
              {hover && (
                <button
                  type="button" className={`${styles.commentBtn} ${commentCount(hover.id) ? styles.commentBtnOn : ""}`} style={{ top: hover.top }}
                  title={t("docs.commentBlock")} aria-label={t("docs.commentBlock")} data-testid="block-comment-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setComposeBlock(hover.id); setPanel("comments"); }}
                >{commentCount(hover.id) || "+"}</button>
              )}
              <EditorContent editor={editor} className={styles.editor} />
            </div>
          </div>
        </div>
      </div>

      {panel === "comments" && (
        <CommentsPanel
          docId={initial.id} users={users} comments={comments} blockId={composeBlock} onBlockChange={setComposeBlock} blockText={blockText}
          canComment={initial.access !== "none"} currentUserId={currentUserId} reload={() => setReloadTick((n) => n + 1)} onClose={() => setPanel(null)}
        />
      )}
      {panel === "versions" && (
        <VersionsPanel docId={initial.id} canEdit={canEdit} onRestored={() => window.location.reload()} onClose={() => setPanel(null)} />
      )}

      <input ref={imageInput} type="file" accept="image/*" hidden data-testid="doc-image-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void insertImage(f); e.target.value = ""; }} />
      <input ref={fileInput} type="file" hidden data-testid="doc-file-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void insertFile(f); e.target.value = ""; }} />
      {embedKind && <EmbedPicker kind={embedKind} onPick={insertEmbed} onClose={() => setEmbedKind(null)} />}
      {shareOpen && <ShareDialog docId={initial.id} initial={share} users={users} ownerId={initial.ownerId} canShare={canShare} onSaved={setShare} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
