"use client";

import { Icon } from "@vibe/core";
import { Doc as DocIcon } from "@vibe/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { DocValue } from "@/server/columns/doc";
import type { ColumnUi } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

/** Doc column: shows the linked WorkDoc(s); clicking opens (and on first use creates) the doc at /docs/<id>. */
export const docUi: ColumnUi<DocValue> = {
  align: "left",
  defaultWidth: 170,
  Cell: function DocCell({ value, item, column, readOnly }) {
    const t = useT();
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const files = value?.files ?? [];
    const open = async (e: React.MouseEvent, docId?: string) => {
      e.stopPropagation();
      if (docId) return router.push(`/docs/${docId}`);
      setBusy(true);
      try {
        const r = await api.post<{ docId: string }>(`/api/v1/items/${item.id}/values/${column.id}/action`, { action: "open_doc" });
        router.push(`/docs/${r.docId}`);
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className={styles.cell}>
        {files.length ? (
          <div className={pack.chips}>
            {files.map((f) => (
              <button key={f.objectId} type="button" className={`${pack.chip} ${pack.chipLink}`} data-testid="doc-chip" onClick={(e) => void open(e, f.objectId)}>
                <Icon icon={DocIcon} size={14} ignoreFocusStyle />&nbsp;{f.name ?? f.objectId}
              </button>
            ))}
          </div>
        ) : readOnly ? null : (
          <button type="button" className={pack.iconBtn} disabled={busy} data-testid="doc-create" onClick={(e) => void open(e)}>
            <Icon icon={DocIcon} size={16} ignoreFocusStyle />&nbsp;{t("col.doc.create")}
          </button>
        )}
      </div>
    );
  },
};
