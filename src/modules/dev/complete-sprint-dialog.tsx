"use client";

import { Modal, ModalContent, ModalHeader } from "@vibe/core";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { SprintDto } from "@/server/services/sprint-read";
import type { Task } from "@/server/services/dev-config";
import styles from "./dev.module.css";

interface Props {
  sprint: SprintDto & { tasks: Task[] };
  planned: SprintDto[];
  onClose: () => void;
  onDone: () => void;
}

/** "Complete sprint": unfinished work moves to the next sprint or back to the backlog with one button (like Jira). */
export function CompleteSprintDialog({ sprint, planned, onClose, onDone }: Props) {
  const t = useT();
  const open = sprint.tasks.filter((x) => !x.isDone);
  const done = sprint.tasks.length - open.length;
  const [mode, setMode] = useState<"next" | "backlog">("next");
  const [next, setNext] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/api/v1/dev/sprints/${sprint.id}/complete`, { carryOver: mode, nextSprintId: mode === "next" && next ? next : undefined });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal id="complete-sprint" show size="small" onClose={onClose}>
      <ModalHeader title={t("dev.complete.title", { name: sprint.name })} />
      <ModalContent>
        <div className={styles.dlg} data-testid="complete-sprint-dialog">
          <div data-testid="complete-summary">{t("dev.complete.summary", { done, total: sprint.tasks.length, open: open.length })}</div>
          {open.length ? (
            <>
              <label className={`${styles.opt} ${mode === "next" ? styles.optOn : ""}`}>
                <input type="radio" name="carry" checked={mode === "next"} onChange={() => setMode("next")} data-testid="carry-next" />
                <span>
                  <strong>{t("dev.complete.toNext")}</strong>
                  <br />
                  <select className={styles.select} value={next} onChange={(e) => { setNext(e.target.value); setMode("next"); }} data-testid="carry-next-select" aria-label={t("dev.complete.toNext")}>
                    <option value="">{planned.length ? t("dev.complete.firstPlanned") : t("dev.complete.newSprint")}</option>
                    {planned.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </span>
              </label>
              <label className={`${styles.opt} ${mode === "backlog" ? styles.optOn : ""}`}>
                <input type="radio" name="carry" checked={mode === "backlog"} onChange={() => setMode("backlog")} data-testid="carry-backlog" />
                <span><strong>{t("dev.complete.toBacklog")}</strong></span>
              </label>
            </>
          ) : <div className={styles.muted}>{t("dev.complete.allDone")}</div>}
          {error ? <div className={styles.error} role="alert">{error}</div> : null}
        </div>
        <div className={styles.dlgFooter}>
          <button type="button" className={styles.btn} onClick={onClose} data-testid="complete-sprint-cancel">{t("common.cancel")}</button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void submit()} disabled={busy} data-testid="complete-sprint-confirm">{t("dev.completeSprint")}</button>
        </div>
      </ModalContent>
    </Modal>
  );
}
