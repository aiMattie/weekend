"use client";

import { Button, Modal, ModalContent, ModalFooter, ModalHeader, TextField } from "@vibe/core";
import { Add } from "@vibe/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import shell from "@/components/shell/shell.module.css";
import { BoardPicker, type PickBoard } from "./board-picker";
import styles from "./dashboards.module.css";

export interface DashboardListItem { id: string; name: string; workspaceName: string; boardCount: number; widgetCount: number; locked: boolean; visibility: string }

function CreateModal({ boards, workspaces, onClose }: { boards: PickBoard[] & { workspaceId?: string }[]; workspaces: { id: string; name: string }[]; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [ws, setWs] = useState(workspaces[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const d = await api.post<{ id: string }>("/api/v1/dashboards", { name: name.trim(), boardIds: picked, workspaceId: picked.length ? undefined : ws });
      router.push(`/dashboards/${d.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); setBusy(false); }
  };
  return (
    <Modal id="create-dashboard" show size="medium" onClose={onClose}>
      <ModalHeader title={t("dashboards.new")} />
      <ModalContent>
        <div className={styles.pickers}>
          <TextField value={name} onChange={setName} placeholder={t("dashboards.namePlaceholder")} autoFocus size="medium" data-testid="dashboard-name-input" />
          <div className={styles.fieldLabel}>{t("dashboards.pickBoards")}</div>
          <BoardPicker boards={boards} value={picked} onChange={setPicked} />
          {!picked.length && (
            <select className={styles.select} value={ws} onChange={(e) => setWs(e.target.value)} aria-label="Workspace">{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
          )}
          {error && <div className={styles.widgetError}>{error}</div>}
        </div>
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("dashboards.create"), onClick: create, disabled: busy || !name.trim() }} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
    </Modal>
  );
}

export function DashboardsList({ dashboards, boards, workspaces }: { dashboards: DashboardListItem[]; boards: PickBoard[]; workspaces: { id: string; name: string }[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className={shell.page} data-testid="dashboards-page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 className={shell.pageTitle}>{t("extra.nav.dashboards")}</h1>
          <p className={shell.pageSub}>{t("dashboards.sub")}</p>
        </div>
        <Button leftIcon={Add} onClick={() => setOpen(true)} data-testid="new-dashboard">{t("dashboards.new")}</Button>
      </div>
      {dashboards.length === 0 ? <div className={styles.empty}><div>{t("dashboards.emptyList")}</div></div> : (
        <div className={shell.cardGrid}>
          {dashboards.map((d) => (
            <Link key={d.id} href={`/dashboards/${d.id}`} className={styles.listCard} data-testid="dashboard-card" data-dashboard-name={d.name}>
              <span className={shell.cardTitle}>{d.name}</span>
              <span className={shell.cardMeta}>{d.workspaceName} · {t("dashboards.cardMeta", { boards: d.boardCount, widgets: d.widgetCount })}</span>
            </Link>
          ))}
        </div>
      )}
      {open && <CreateModal boards={boards} workspaces={workspaces} onClose={() => setOpen(false)} />}
    </div>
  );
}
