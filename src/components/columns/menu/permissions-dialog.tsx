"use client";

import { Modal, ModalContent, ModalFooter, ModalHeader } from "@vibe/core";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { BoardFull, ColumnDto } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import { DialogRoot } from "./dialog-root";
import css from "./menu.module.css";

type Mode = "everyone" | "owners" | "specific" | "assigned";
type Access = { mode: Mode; userIds: string[]; teamIds: string[] };
type Row = { columnId: string; edit: Access; view: Access };
const EVERYONE: Access = { mode: "everyone", userIds: [], teamIds: [] };

function AccessEditor({ title, value, onChange, board, allowAssigned, testId }: { title: string; value: Access; onChange: (a: Access) => void; board: BoardFull; allowAssigned: boolean; testId: string }) {
  const t = useT();
  const toggle = (id: string) => onChange({ ...value, userIds: value.userIds.includes(id) ? value.userIds.filter((x) => x !== id) : [...value.userIds, id] });
  return (
    <div className={css.permBlock}>
      <label className={css.field}>{title}
        <select value={value.mode} data-testid={`${testId}-mode`} onChange={(e) => onChange({ ...value, mode: e.target.value as Mode })}>
          <option value="everyone">{t("col.perm.everyone")}</option>
          <option value="owners">{t("col.perm.owners")}</option>
          <option value="specific">{t("col.perm.specific")}</option>
          {allowAssigned ? <option value="assigned">{t("col.perm.assigned")}</option> : null}
        </select>
      </label>
      {value.mode === "specific" ? (
        <div className={css.boardPick}>
          {board.users.map((u) => <label key={u.id} className={css.check}><input type="checkbox" checked={value.userIds.includes(u.id)} onChange={() => toggle(u.id)} />{u.name}</label>)}
        </div>
      ) : null}
    </div>
  );
}

/** Column permissions (who may view / edit the column), stored by the admin permissions service. */
export function ColumnPermissionsDialog({ column, board, onClose }: { column: ColumnDto; board: BoardFull; onClose: () => void }) {
  const t = useT();
  const [row, setRow] = useState<Row>({ columnId: column.id, edit: EVERYONE, view: EVERYONE });
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api.get<Row>(`/api/v1/columns/${column.id}/permissions`).then((r) => { setRow(r); setLoaded(true); }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [column.id]);
  const save = async () => {
    try {
      await api.put(`/api/v1/columns/${column.id}/permissions`, { edit: row.edit, view: row.view });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <DialogRoot>
      <Modal id="column-permissions" show size="medium" onClose={onClose}>
        <ModalHeader title={t("col.perm.title", { name: column.title })} />
        <ModalContent>
          <div className={css.form} data-testid="column-permissions">
            <span className={css.hint}>{t("col.perm.hint")}</span>
            {loaded || error ? (
              <>
                <AccessEditor title={t("col.perm.view")} value={row.view} onChange={(view) => setRow({ ...row, view })} board={board} allowAssigned={false} testId="perm-view" />
                <AccessEditor title={t("col.perm.edit")} value={row.edit} onChange={(edit) => setRow({ ...row, edit })} board={board} allowAssigned testId="perm-edit" />
              </>
            ) : null}
            {error ? <span className={css.hintErr} data-testid="perm-error">{error}</span> : null}
          </div>
        </ModalContent>
        <ModalFooter primaryButton={{ text: t("common.save"), onClick: () => void save() }} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
      </Modal>
    </DialogRoot>
  );
}
