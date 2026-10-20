"use client";

import { Button, Modal, ModalContent, ModalFooter, ModalHeader, TextField } from "@vibe/core";
import { Form } from "@vibe/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import shell from "@/components/shell/shell.module.css";
import styles from "./forms.module.css";
import type { FormDto } from "./types";

export interface FormsListProps {
  forms: (FormDto & { boardName: string; workspaceName: string })[];
  workspaces: { id: string; name: string }[];
  boards: { id: string; name: string; workspaceId: string }[];
  canCreate: boolean;
}

function CreateDialog({ workspaces, boards, onClose }: Pick<FormsListProps, "workspaces" | "boards"> & { onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const wsBoards = boards.filter((b) => b.workspaceId === workspaceId);
  const [boardId, setBoardId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const effectiveBoard = wsBoards.some((b) => b.id === boardId) ? boardId : (wsBoards[0]?.id ?? "");

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{ form: FormDto }>("/api/v1/forms", mode === "existing" && effectiveBoard ? { name: name.trim(), boardId: effectiveBoard } : { name: name.trim(), workspaceId });
      router.push(`/forms/${res.form.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
      setBusy(false);
    }
  };
  return (
    <Modal id="create-form" show size="small" onClose={onClose}>
      <ModalHeader title={t("forms.new")} />
      <ModalContent>
        <form className={styles.dialogBody} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <label className={styles.fieldLabel}>{t("forms.name")}
            <TextField value={name} onChange={setName} autoFocus placeholder={t("forms.name")} data-testid="form-name-input" />
          </label>
          <label className={styles.fieldLabel}>{t("forms.workspace")}
            <select className={styles.nativeInput} value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} data-testid="form-workspace-select">
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <div className={styles.fieldLabel}>{t("forms.backing")}
            <div className={styles.radioRow}>
              <label><input type="radio" name="mode" checked={mode === "new"} onChange={() => setMode("new")} data-testid="form-board-new" /> {t("forms.backingNew")}</label>
              <label><input type="radio" name="mode" checked={mode === "existing"} onChange={() => setMode("existing")} data-testid="form-board-existing" /> {t("forms.backingExisting")}</label>
            </div>
          </div>
          {mode === "existing" && (
            <label className={styles.fieldLabel}>{t("forms.board")}
              <select className={styles.nativeInput} value={effectiveBoard} onChange={(e) => setBoardId(e.target.value)} data-testid="form-board-select">
                {wsBoards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          )}
          {error ? <div className={styles.error} role="alert">{error}</div> : null}
        </form>
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("forms.create"), onClick: submit, loading: busy, disabled: !name.trim(), "data-testid": "form-create-submit" } as never} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
    </Modal>
  );
}

export function FormsListPage({ forms, workspaces, boards, canCreate }: FormsListProps) {
  const t = useT();
  const [creating, setCreating] = useState(false);
  return (
    <div className={shell.page} data-testid="forms-page">
      <div className={styles.listHead}>
        <div>
          <h1 className={shell.pageTitle}>{t("forms.title")}</h1>
          <p className={shell.pageSub} style={{ margin: 0 }}>{t("forms.subtitle")}</p>
        </div>
        {canCreate && <Button onClick={() => setCreating(true)} data-testid="new-form">{t("forms.new")}</Button>}
      </div>
      {forms.length === 0 ? (
        <div className={styles.emptyBox} data-testid="forms-empty"><Form size={40} /><h3>{t("forms.empty")}</h3><p>{t("forms.emptyHint")}</p></div>
      ) : (
        <div className={shell.cardGrid}>
          {forms.map((f) => (
            <Link key={f.id} href={`/forms/${f.id}`} className={styles.formCardItem} data-testid={`form-card-${f.id}`} data-form-name={f.name}>
              <div className={styles.formCardTop}>
                <span className={styles.formCardName}><Form size={16} /> {f.name}</span>
                <span className={f.isPublished ? styles.badgeOn : styles.badgeOff}>{f.isPublished ? t("forms.published") : t("forms.draft")}</span>
              </div>
              <span className={styles.formMeta}>{f.workspaceName} &gt; {f.boardName}</span>
            </Link>
          ))}
        </div>
      )}
      {creating && <CreateDialog workspaces={workspaces} boards={boards} onClose={() => setCreating(false)} />}
    </div>
  );
}
