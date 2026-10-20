"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import styles from "./admin.module.css";

export interface AdminNavEntry { id: string; href: string; labelKey: string; group: "people" | "settings" | "data" }

const GROUPS: { id: AdminNavEntry["group"]; key: string }[] = [
  { id: "people", key: "admin.group.people" }, { id: "settings", key: "admin.group.settings" }, { id: "data", key: "admin.group.data" },
];

export function AdminNav({ entries }: { entries: AdminNavEntry[] }) {
  const t = useT();
  const pathname = usePathname();
  return (
    <nav className={styles.side} aria-label={t("admin.title")} data-testid="admin-nav">
      <div className={styles.sideTitle}>{t("admin.title")}</div>
      {GROUPS.map((g) => {
        const list = entries.filter((e) => e.group === g.id);
        if (!list.length) return null;
        return (
          <div key={g.id}>
            <div className={styles.sideGroup}>{t(g.key)}</div>
            {list.map((e) => (
              <Link key={e.id} href={e.href} className={`${styles.sideLink} ${pathname === e.href || pathname.startsWith(e.href + "/") ? styles.sideLinkActive : ""}`} data-testid={`admin-nav-${e.id}`}>
                {t(e.labelKey)}
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
