"use client";

import { Modal, ModalContent, ModalFooter, ModalHeader } from "@vibe/core";
import { useEffect, useMemo, useState } from "react";
import type { UserLite } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import styles from "./docs.module.css";

/* ------------------------------------------------------------------ embed picker (board / item) */

interface BoardOpt { id: string; name: string }
interface ItemOpt { id: string; name: string; boardId: string }

export interface EmbedChoice { kind: "board" | "item"; id: string; boardId: string | null; label: string }

export function EmbedPicker({ kind, onPick, onClose }: { kind: "board" | "item"; onPick: (c: EmbedChoice) => void; onClose: () => void }) {
  const t = useT();
  const [boards, setBoards] = useState<BoardOpt[]>([]);
  const [board, setBoard] = useState<BoardOpt | null>(null);
  const [itemList, setItemList] = useState<ItemOpt[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    void fetch("/api/v1/boards").then((r) => (r.ok ? r.json() : [])).then((b: BoardOpt[]) => setBoards(b));
  }, []);
  useEffect(() => {
    if (kind !== "item" || !board) return;
    void fetch(`/api/v1/items?boardId=${board.id}`).then((r) => (r.ok ? r.json() : [])).then((i: ItemOpt[]) => setItemList(i));
  }, [kind, board]);

  const needle = q.trim().toLowerCase();
  const shownBoards = useMemo(() => boards.filter((b) => b.name.toLowerCase().includes(needle)), [boards, needle]);
  const shownItems = useMemo(() => itemList.filter((i) => i.name.toLowerCase().includes(needle)), [itemList, needle]);
  const pickingItem = kind === "item" && board;

  return (
    <Modal id="doc-embed-picker" show size="small" onClose={onClose}>
      <ModalHeader title={pickingItem ? t("docs.pickItem", { board: board.name }) : kind === "item" ? t("docs.pickBoardForItem") : t("docs.pickBoard")} />
      <ModalContent>
        <input className={styles.input} style={{ width: "100%", boxSizing: "border-box" }} placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} autoFocus data-testid="embed-search" />
        <div className={styles.modalList} data-testid="embed-list">
          {!pickingItem && shownBoards.map((b) => (
            <button key={b.id} type="button" className={styles.modalOpt} data-testid="embed-option" onClick={() => {
              if (kind === "board") onPick({ kind: "board", id: b.id, boardId: null, label: b.name });
              else { setBoard(b); setQ(""); }
            }}>{b.name}</button>
          ))}
          {pickingItem && shownItems.map((i) => (
            <button key={i.id} type="button" className={styles.modalOpt} data-testid="embed-option" onClick={() => onPick({ kind: "item", id: i.id, boardId: board.id, label: i.name })}>{i.name}</button>
          ))}
          {pickingItem && !shownItems.length && <div className={styles.muted}>{t("docs.noResults")}</div>}
        </div>
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("common.close"), onClick: onClose }} />
    </Modal>
  );
}

/* ------------------------------------------------------------------ share */

export interface ShareState { visibility: "main" | "private"; members: { userId: string; role: "editor" | "viewer"; name: string }[] }

export function ShareDialog({ docId, initial, users, ownerId, canShare, onSaved, onClose }: {
  docId: string; initial: ShareState; users: UserLite[]; ownerId: string | null; canShare: boolean; onSaved: (s: ShareState) => void; onClose: () => void;
}) {
  const t = useT();
  const [visibility, setVisibility] = useState(initial.visibility);
  const [members, setMembers] = useState(initial.members);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const candidates = users.filter((u) => !u.isAiAgent && u.id !== ownerId && !members.some((m) => m.userId === u.id));

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const r1 = await fetch(`/api/v1/docs/${docId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visibility }) });
      if (!r1.ok) throw new Error((await r1.json()).error?.message ?? "error");
      const r2 = await fetch(`/api/v1/docs/${docId}/members`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ members: members.map((m) => ({ userId: m.userId, role: m.role })) }) });
      if (!r2.ok) throw new Error((await r2.json()).error?.message ?? "error");
      onSaved({ visibility, members });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal id="doc-share" show size="medium" onClose={onClose}>
      <ModalHeader title={t("docs.share")} />
      <ModalContent>
        <label className={styles.radioRow}><input type="radio" name="vis" checked={visibility === "main"} disabled={!canShare} onChange={() => setVisibility("main")} data-testid="share-main" /> {t("docs.shareMain")}</label>
        <label className={styles.radioRow}><input type="radio" name="vis" checked={visibility === "private"} disabled={!canShare} onChange={() => setVisibility("private")} data-testid="share-private" /> {t("docs.sharePrivate")}</label>
        {visibility === "private" && (
          <div style={{ marginTop: 12 }}>
            <div className={styles.muted}>{t("docs.members")}</div>
            {members.map((m) => (
              <div key={m.userId} className={styles.memberRow} data-testid="share-member">
                <span style={{ flex: 1 }}>{m.name}</span>
                <select className={styles.wsSelect} value={m.role} disabled={!canShare} onChange={(e) => setMembers(members.map((x) => (x.userId === m.userId ? { ...x, role: e.target.value as "editor" | "viewer" } : x)))}>
                  <option value="editor">{t("docs.roleEditor")}</option>
                  <option value="viewer">{t("docs.roleViewer")}</option>
                </select>
                <button type="button" className={styles.smallBtn} disabled={!canShare} onClick={() => setMembers(members.filter((x) => x.userId !== m.userId))}>{t("common.delete")}</button>
              </div>
            ))}
            {canShare && (
              <select className={styles.wsSelect} style={{ marginTop: 8 }} value="" onChange={(e) => {
                const u = users.find((x) => x.id === e.target.value);
                if (u) setMembers([...members, { userId: u.id, role: "editor", name: u.name }]);
              }} data-testid="share-add">
                <option value="">{t("docs.addMember")}</option>
                {candidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
          </div>
        )}
        {!canShare && <div className={styles.muted} style={{ marginTop: 8 }}>{t("docs.onlyOwnerShares")}</div>}
        {error && <div className={styles.saveError} role="alert">{error}</div>}
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("common.save"), onClick: () => void save(), disabled: !canShare || busy }} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
    </Modal>
  );
}

/* ------------------------------------------------------------------ cover */

export const COVER_COLORS = ["#0073ea", "#00c875", "#fdab3d", "#df2f4a", "#a25ddc", "#579bfc", "#7f5347", "#323338"];

export function CoverPicker({ onPick, onClose }: { onPick: (cover: string | null) => void; onClose: () => void }) {
  const t = useT();
  const [url, setUrl] = useState("");
  const upload = async (file: File) => onPick(await readImage(file, 1600));
  return (
    <div className={styles.picker} data-testid="cover-picker">
      <div className={styles.swatches}>
        {COVER_COLORS.map((c) => <button key={c} type="button" className={styles.swatch} style={{ background: c }} aria-label={c} data-testid="cover-color" onClick={() => onPick(c)} />)}
      </div>
      <div className={styles.fieldRow}>
        <input className={styles.input} placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="button" className={styles.tbBtn} disabled={!/^https?:\/\//.test(url)} onClick={() => onPick(url)}>{t("docs.useUrl")}</button>
      </div>
      <div className={styles.fieldRow}>
        <label className={styles.ghostBtn} style={{ cursor: "pointer" }}>
          {t("docs.uploadImage")}
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} data-testid="cover-file" />
        </label>
        <span className={styles.spacer} />
        <button type="button" className={styles.ghostBtn} onClick={() => onPick(null)}>{t("docs.removeCover")}</button>
        <button type="button" className={styles.ghostBtn} onClick={onClose}>{t("common.close")}</button>
      </div>
    </div>
  );
}

/** Read an image file as a (downscaled) data URL. */
export function readImage(file: File, maxWidth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      const src = String(fr.result);
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return resolve(src);
      const img = new Image();
      img.onerror = () => resolve(src);
      img.onload = () => {
        if (img.width <= maxWidth && file.size < 600_000) return resolve(src);
        const scale = Math.min(1, maxWidth / img.width);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.src = src;
    };
    fr.readAsDataURL(file);
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}
