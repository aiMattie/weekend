"use client";

import { Avatar } from "@vibe/core";
import { useT } from "@/lib/i18n/client";
import type { ItemsData } from "../../widgets/defs/items";
import styles from "../dashboards.module.css";
import { Empty, nf, type RendererProps } from "./shared";

export function TableWidget({ data, openItem, compact }: RendererProps<ItemsData> & { compact?: boolean }) {
  const t = useT();
  if (!data.rows.length) return <Empty />;
  return (
    <div className={styles.tableWrap} data-testid={compact ? "list-widget" : "table-widget"}>
      <table className={styles.table}>
        {!compact && <thead><tr><th>{t("dashboards.item")}</th><th>Board</th>{data.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>}
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.id} onClick={() => openItem(r.boardId, r.id)} data-testid="widget-row">
              <td className={styles.nameCell}>{r.name}</td>
              {!compact && <td className={styles.muted}>{r.boardName}</td>}
              {r.cells.map((c, i) => <td key={i}>{c.color ? <span className={styles.statusPill} style={{ background: c.color }}>{c.text}</span> : c.text}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {data.total > data.rows.length && <div className={styles.more}>+ {data.total - data.rows.length}</div>}
    </div>
  );
}

export function ListWidget(p: RendererProps<ItemsData>) { return <TableWidget {...p} compact />; }

interface FilesData { total: number; files: { id: string; name: string; mimeType: string | null; size: number; boardId: string; boardName: string; itemId: string | null; itemName: string }[] }
export function FilesWidget({ data, openItem }: RendererProps<FilesData>) {
  if (!data.files.length) return <Empty />;
  const kb = (n: number) => (n > 1048576 ? `${nf.format(n / 1048576)} MB` : `${nf.format(Math.max(1, n / 1024))} KB`);
  return (
    <div className={styles.fileGrid} data-testid="files-widget">
      {data.files.map((f) => (
        <button key={f.id} className={styles.fileCard} onClick={() => f.itemId && openItem(f.boardId, f.itemId)}>
          <span className={styles.fileIcon}>{(f.name.split(".").pop() ?? "file").slice(0, 4).toUpperCase()}</span>
          <span className={styles.fileName}>{f.name}</span>
          <span className={styles.muted}>{kb(f.size)} · {f.itemName}</span>
        </button>
      ))}
    </div>
  );
}

interface ActivityData { events: { id: string; event: string; user: string; boardName: string; name: string; columnTitle: string; to: string; at: string; itemId: string | null; boardId: string }[] }
export function ActivityWidget({ data, openItem }: RendererProps<ActivityData>) {
  const t = useT();
  if (!data.events.length) return <Empty />;
  return (
    <div className={styles.activity} data-testid="activity-widget">
      {data.events.map((e) => (
        <div key={e.id} className={styles.activityRow} onClick={() => e.itemId && openItem(e.boardId, e.itemId)}>
          <Avatar type="text" text={(e.user || "?").slice(0, 2)} size="xs" withoutTooltip />
          <div>
            <div><b>{e.user || t("dashboards.system")}</b> {t(`dashboards.event.${e.event}`) === `dashboards.event.${e.event}` ? e.event : t(`dashboards.event.${e.event}`)} <b>{e.name}</b>{e.columnTitle ? ` (${e.columnTitle}${e.to ? ` → ${e.to}` : ""})` : ""}</div>
            <div className={styles.muted}>{e.boardName} · {new Date(e.at).toLocaleString("nl-NL")}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
