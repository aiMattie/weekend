"use client";

import { Modal, ModalContent, ModalFooter, ModalHeader } from "@vibe/core";
import { useState } from "react";
import type { BoardFull, ColumnDto } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import { DialogRoot } from "./dialog-root";
import { ColumnSettingsForm } from "./settings-forms";
import css from "./menu.module.css";

/** Column settings: name, description and the settings form of the column's type. */
export function ColumnSettingsDialog({ column, board, onSave, onClose }: {
  column: ColumnDto;
  board: BoardFull;
  onSave: (patch: { title: string; description: string | null; settings: Record<string, unknown> }) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(column.title);
  const [description, setDescription] = useState(column.description ?? "");
  const [settings, setSettings] = useState<Record<string, unknown>>(column.settings);
  const save = () => {
    onSave({ title: title.trim() || column.title, description: description.trim() || null, settings });
    onClose();
  };
  return (
    <DialogRoot>
      <Modal id="column-settings" show size="medium" onClose={onClose}>
        <ModalHeader title={t("col.settings.title", { name: column.title })} />
        <ModalContent>
          <div className={css.form} data-testid="column-settings">
            <label className={css.field}>{t("col.settings.name")}<input type="text" value={title} data-testid="column-name-input" onChange={(e) => setTitle(e.target.value)} /></label>
            <label className={css.field}>{t("col.settings.description")}<input type="text" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            <ColumnSettingsForm type={column.type} settings={settings} board={board} column={column} mode="edit" onChange={(p) => setSettings((s) => ({ ...s, ...p }))} />
          </div>
        </ModalContent>
        <ModalFooter primaryButton={{ text: t("common.save"), onClick: save }} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
      </Modal>
    </DialogRoot>
  );
}
