"use client";

import { Button, Modal, ModalContent, ModalFooter, ModalHeader } from "@vibe/core";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { BoardPicker, type PickBoard } from "./board-picker";
import { CheckList } from "./filter-editor";
import styles from "./dashboards.module.css";
import type { ColumnsPayload, DashboardDto } from "./types";

/** Change the boards a dashboard looks at. */
export function BoardsDialog({ value, onSave, onClose }: { value: string[]; onSave: (ids: string[]) => Promise<void>; onClose: () => void }) {
  const t = useT();
  const [boards, setBoards] = useState<PickBoard[]>([]);
  const [picked, setPicked] = useState(value);
  useEffect(() => {
    Promise.all([api.get<{ id: string; name: string; workspaceId: string }[]>("/api/v1/boards"), api.get<{ id: string; name: string }[]>("/api/v1/workspaces")]).then(([bs, ws]) => {
      const names = new Map(ws.map((w) => [w.id, w.name]));
      setBoards(bs.map((b) => ({ id: b.id, name: b.name, workspaceName: names.get(b.workspaceId) ?? "" })));
    }).catch(() => undefined);
  }, []);
  return (
    <Modal id="dashboard-boards" show size="medium" onClose={onClose}>
      <ModalHeader title={t("dashboards.editBoards")} />
      <ModalContent><BoardPicker boards={boards} value={picked} onChange={setPicked} /></ModalContent>
      <ModalFooter primaryButton={{ text: t("common.save"), onClick: () => onSave(picked) }} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
    </Modal>
  );
}

/** Share: who can see the dashboard (everyone in the workspace, or only selected people) + link. */
export function ShareDialog({ dashboard, users, onSave, onClose }: { dashboard: DashboardDto; users: ColumnsPayload["users"]; onSave: (patch: Partial<DashboardDto>) => Promise<void>; onClose: () => void }) {
  const t = useT();
  const [visibility, setVisibility] = useState(dashboard.visibility);
  const [members, setMembers] = useState(dashboard.memberIds);
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/dashboards/${dashboard.id}`;
  return (
    <Modal id="dashboard-share" show size="medium" onClose={onClose}>
      <ModalHeader title={t("dashboards.share")} />
      <ModalContent>
        <div className={styles.pickers} data-testid="share-dialog">
          <label className={styles.checkRow}><input type="radio" name="vis" checked={visibility === "main"} onChange={() => setVisibility("main")} data-testid="share-main" />{t("dashboards.visMain")}</label>
          <label className={styles.checkRow}><input type="radio" name="vis" checked={visibility === "private"} onChange={() => setVisibility("private")} data-testid="share-private" />{t("dashboards.visPrivate")}</label>
          {visibility === "private" && <CheckList testId="share-members" options={users.map((u) => ({ value: u.id, label: u.name }))} value={members} onChange={setMembers} />}
          <div className={styles.fieldLabel}>{t("dashboards.link")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className={styles.input} readOnly value={link} data-testid="share-link" />
            <Button kind="secondary" onClick={async () => { await navigator.clipboard?.writeText(link).catch(() => undefined); setCopied(true); }}>{copied ? t("dashboards.copied") : t("dashboards.copy")}</Button>
          </div>
        </div>
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("common.save"), onClick: () => onSave({ visibility, memberIds: members }) }} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
    </Modal>
  );
}
