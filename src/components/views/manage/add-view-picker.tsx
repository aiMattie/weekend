"use client";

import { Popover } from "@/components/board/ui/popover";
import { useT } from "@/lib/i18n/client";
import { listViewTypes } from "@/server/views/registry";
import { ViewTypeIcon } from "./view-icons";
import styles from "./manage.module.css";

interface Props {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onPick: (type: string, name: string) => void;
  devBoard?: boolean;
}

/** "Add view" picker: a grid of view types with icon, name and description. */
const ORDER = ["table", "gantt", "chart", "calendar", "kanban", "timeline", "workload", "cards", "map", "files", "form"];
const rank = (t: string) => (ORDER.includes(t) ? ORDER.indexOf(t) : 99);

export function AddViewPicker({ anchorEl, onClose, onPick, devBoard }: Props) {
  const t = useT();
  const label = (type: string, fb: string) => { const v = t(`view.type.${type}`); return v === `view.type.${type}` ? fb : v; };
  const desc = (type: string, fb: string) => { const v = t(`vw.desc.${type}`); return v === `vw.desc.${type}` ? fb : v; };
  return (
    <Popover anchorEl={anchorEl} onClose={onClose} className={styles.picker}>
      <div className={styles.pickerHead}>{t("vw.boardViews")}</div>
      <div className={styles.pickerGrid} data-testid="add-view-picker">
        {listViewTypes().filter((vt) => devBoard || !vt.type.startsWith("dev_")).sort((a, b) => rank(a.type) - rank(b.type)).map((vt) => (
          <button key={vt.type} type="button" className={styles.pickerItem} data-testid={`add-view-${vt.type}`} title={desc(vt.type, vt.description)} onClick={() => { onClose(); onPick(vt.type, label(vt.type, vt.label)); }}>
            <span className={styles.pickerIcon}><ViewTypeIcon type={vt.type} size={18} /></span>
            <span className={styles.pickerText}>
              <span className={styles.pickerName}>{label(vt.type, vt.label)}</span>
              <span className={styles.pickerDesc}>{desc(vt.type, vt.description)}</span>
            </span>
          </button>
        ))}
      </div>
    </Popover>
  );
}
