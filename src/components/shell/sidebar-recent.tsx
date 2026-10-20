"use client";

import { DropdownChevronDown, DropdownChevronRight, Time } from "@vibe/icons";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { NavData } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import styles from "./sidebar.module.css";
import type { SidebarActions } from "./sidebar-actions";
import { BoardRow } from "./sidebar-tree";

interface Recent { id: string; name: string; workspaceId: string; kind: NavData["boards"][number]["kind"] }

/** "Recent" section under Favorites (boards you opened lately, per user). */
export function RecentSection({ nav, activeBoardId, actions }: { nav: NavData; activeBoardId: string | null; actions: SidebarActions }) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<Recent[]>([]);
  useEffect(() => {
    let alive = true;
    // small delay so the visit of the board we just opened is already recorded
    const id = setTimeout(() => api.get<Recent[]>("/api/v1/recent?limit=6").then((r) => alive && setItems(r)).catch(() => undefined), 600);
    return () => { alive = false; clearTimeout(id); };
  }, [pathname]);
  const rows = items.map((r) => nav.boards.find((b) => b.id === r.id)).filter(Boolean) as NavData["boards"];
  return (
    <>
      <button className={styles.sectionHeader} onClick={() => setOpen(!open)} data-testid="recent-toggle">
        {open ? <DropdownChevronDown size={16} /> : <DropdownChevronRight size={16} />}
        <Time size={18} /> {t("chrome.recent")}
      </button>
      {open && (
        <div style={{ padding: "0 8px 4px" }} data-testid="recent-list">
          {rows.length ? rows.map((b) => <BoardRow key={b.id} board={b} active={b.id === activeBoardId} favorite={nav.favorites.includes(b.id)} actions={actions} />) : <div className={styles.emptyHint}>{t("chrome.noRecent")}</div>}
        </div>
      )}
    </>
  );
}
