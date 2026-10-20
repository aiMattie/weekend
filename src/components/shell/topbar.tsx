"use client";

import { Avatar, Icon } from "@vibe/core";
import { Apps, Help, Inbox, Invite, LogOut, Person, Settings } from "@vibe/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionMenu } from "@/components/board/ui/menu";
import type { NavData } from "@/lib/board-types";
import { avatarColor, initials } from "@/lib/colors";
import { useT } from "@/lib/i18n/client";
import { NotificationBell } from "@/modules/boards-extra/inbox/notification-bell";
import frame from "./frame.module.css";
import styles from "./shell.module.css";
import { navFor } from "./nav-registry";
import { useCurrentUser } from "./user-context";
import { GlobalSearch } from "@/modules/admin/ui/global-search";

/** Full logo with text (login pages). */
export function Logo() {
  return (
    <Link href="/" className={styles.brand} aria-label="Weekend">
      <Glyph />
      <span className={styles.brandText}>
        <span>Weekend</span>
        <span className={styles.brandSub}>work management</span>
      </span>
    </Link>
  );
}

/** The Weekend mark: a "W" on a blue tile. */
export function Glyph({ width = 34, height = 22 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 34 22" aria-hidden="true">
      <rect x="6" y="0" width="22" height="22" rx="6" fill="#0073ea" />
      <path d="M10.5 7 L13.5 15.5 L17 9.5 L20.5 15.5 L23.5 7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 3x3 dot grid: "products" switcher. */
function Waffle() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="currentColor">
      {[5, 11, 17].flatMap((cx) => [5, 11, 17].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.8" />))}
    </svg>
  );
}

/** Light grey top bar: logo, centered search pill, bell / inbox / invite / apps / help / grid / avatar. */
export function TopBar(_props: { nav: NavData; onToggleSidebar: () => void }) { // eslint-disable-line @typescript-eslint/no-unused-vars
  const t = useT();
  const router = useRouter();
  const user = useCurrentUser();
  const [gridEl, setGridEl] = useState<HTMLElement | null>(null);
  const [userEl, setUserEl] = useState<HTMLElement | null>(null);
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard navigation on purpose
    window.location.assign("/login"); // hard navigation: drops the client router cache of the signed-out session
  };
  return (
    <header className={frame.topbar} data-testid="topbar">
      <div className={frame.topLeft}>
        <Link href="/" className={frame.glyph} aria-label="Weekend" data-testid="topbar-logo"><Glyph /></Link>
      </div>
      <div className={frame.topCenter}><GlobalSearch /></div>
      <div className={frame.topRight}>
        <NotificationBell />
        <Link href="/inbox" className={frame.iconLink} aria-label={t("frame.inbox")} data-testid="topbar-inbox"><Icon icon={Inbox} size={20} ignoreFocusStyle /></Link>
        <Link href="/admin/users" className={frame.iconLink} aria-label={t("shell.invite")} data-testid="topbar-invite"><Icon icon={Invite} size={20} ignoreFocusStyle /></Link>
        <Link href="/integrations" className={frame.iconLink} aria-label={t("frame.integrations")} data-testid="topbar-integrations"><Icon icon={Apps} size={20} ignoreFocusStyle /></Link>
        <Link href="/help" className={frame.iconLink} aria-label={t("shell.help")} data-testid="topbar-help"><Icon icon={Help} size={20} ignoreFocusStyle /></Link>
        <span className={frame.vsep} style={{ margin: "0 8px" }} />
        <button type="button" className={frame.iconLink} onClick={(e) => setGridEl(gridEl ? null : e.currentTarget)} aria-label={t("frame.gridMenu")} data-testid="topbar-apps"><Waffle /></button>
        {gridEl ? (
          <ActionMenu anchorEl={gridEl} align="end" onClose={() => setGridEl(null)} items={navFor("rail", user.role).map((n) => ({ key: n.id, label: n.id === "home-rail" ? t("frame.workspaceRail") : t(n.labelKey), icon: <n.icon size={18} />, testId: `apps-${n.id}`, onClick: () => router.push(n.href) }))} />
        ) : null}
        <button type="button" className={frame.avatarBtn} onClick={(e) => setUserEl(userEl ? null : e.currentTarget)} aria-label={user.name} aria-haspopup="menu" data-testid="avatar-menu">
          <Avatar type="text" text={initials(user.name)} size="small" customBackgroundColor={avatarColor(user.id)} withoutTooltip />
        </button>
        {userEl ? (
          <ActionMenu
            anchorEl={userEl}
            align="end"
            onClose={() => setUserEl(null)}
            items={[
              { title: user.name },
              { title: user.email },
              { divider: true },
              { key: "profile", label: t("shell.profile"), icon: <Person size={16} />, testId: "menu-profile", onClick: () => router.push("/profile") },
              ...(user.role === "admin" ? [{ key: "admin", label: t("admin.nav.title"), icon: <Settings size={16} />, testId: "menu-admin", onClick: () => router.push("/admin") }] : []),
              { divider: true },
              { key: "logout", label: t("auth.logout"), icon: <LogOut size={16} />, testId: "logout", onClick: () => void logout() },
            ]}
          />
        ) : null}
      </div>
    </header>
  );
}
