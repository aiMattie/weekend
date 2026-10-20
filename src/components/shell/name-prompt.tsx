"use client";

import { Modal, ModalContent, ModalFooter, ModalHeader, TextField } from "@vibe/core";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";

export interface NamePromptProps {
  open: boolean;
  title: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

/** Small "type a name" dialog (Vibe Modal) used for new/rename board/folder/workspace. */
export function NamePrompt(props: NamePromptProps) {
  // Vibe Modal touches `document` while rendering, so it must never render during SSR.
  // The inner component mounts fresh on every open, which also resets the input value.
  return props.open ? <NamePromptInner {...props} /> : null;
}

function NamePromptInner({ open, title, initialValue = "", confirmLabel, onConfirm, onClose }: NamePromptProps) {
  const t = useT();
  const [value, setValue] = useState(initialValue);
  const submit = () => {
    const v = value.trim();
    if (v) onConfirm(v);
  };
  return (
    <Modal id="name-prompt" show={open} size="small" onClose={onClose}>
      <ModalHeader title={title} />
      <ModalContent>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <TextField value={value} onChange={setValue} autoFocus size="medium" placeholder={title} data-testid="name-prompt-input" />
        </form>
      </ModalContent>
      <ModalFooter primaryButton={{ text: confirmLabel ?? t("common.save"), onClick: submit }} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
    </Modal>
  );
}
