"use client";

import { Icon } from "@vibe/core";
import { Favorite, Menu as DotsIcon, Workspace } from "@vibe/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ActionMenu } from "@/components/board/ui/menu";
import type { NavData } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import { usePersistentState } from "@/lib/use-persistent-state";
import frame from "./frame.module.css";
import { isNavActive, navFor, type NavItem } from "./nav-registry";
import { useCurrentUser } from "./user-context";

/** rail: Workspace, Sidekick, Agents | Workflows, Notetaker | Favorites, More. Every other registered entry lives under "More". */
const PRIMARY = ["home-rail", "sidekick-rail", "agents-rail"];
const SECONDARY = ["workflows-rail", "notetaker-rail"];

/** Narrow labelled rail (Workspace, ..., Favorites, More). Entries come from nav-registry (section "rail"). */
export function Rail({ nav }: { nav: NavData }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();
  // the rail's "Workspace" opens the page of the workspace selected in the sidebar
  const [storedWs] = usePersistentState("weekend.sidebar.workspace", "");
  const wsId = nav.workspaces.find((w) => w.id === storedWs)?.id ?? nav.workspaces.find((w) => w.name === "Delivery")?.id ?? nav.workspaces[0]?.id;
  const [favEl, setFavEl] = useState<HTMLElement | null>(null);
  const [moreEl, setMoreEl] = useState<HTMLElement | null>(null);
  const items = navFor("rail", user.role);
  const shown = PRIMARY.map((id) => items.find((n) => n.id === id)).filter(Boolean) as NavItem[];
  const second = SECONDARY.map((id) => items.find((n) => n.id === id)).filter(Boolean) as NavItem[];
  const rest = items.filter((n) => !PRIMARY.includes(n.id) && !SECONDARY.includes(n.id));
  const label = (n: NavItem) => (n.id === "home-rail" ? t("frame.workspaceRail") : t(n.labelKey));
  const favorites = nav.favorites.map((id) => nav.boards.find((b) => b.id === id)).filter(Boolean) as NavData["boards"];

  const renderItems = (list: NavItem[]) => list.map((n) => n.action ? (
    <button key={n.id} type="button" className={`${frame.railItem} ${isNavActive(n, pathname) ? frame.railActive : ""}`} aria-label={label(n)} data-testid={`rail-${n.id}`} onClick={() => window.dispatchEvent(new CustomEvent(n.action!))}>
      <span className={frame.railIcon}><n.icon size={22} /></span>
      <span className={frame.railLabel}>{label(n)}</span>
    </button>
  ) : (
    <Link key={n.id} href={n.id === "home-rail" && wsId ? `/workspaces/${wsId}` : n.href} className={`${frame.railItem} ${isNavActive(n, pathname) ? frame.railActive : ""}`} aria-label={label(n)} data-testid={`rail-${n.id}`}>
      <span className={frame.railIcon}>{n.id === "home-rail" ? <Workspace size={22} /> : <n.icon size={22} />}</span>
      <span className={frame.railLabel}>{label(n)}</span>
    </Link>
  ));

  return (
    <nav className={frame.rail} aria-label="Apps" data-testid="rail">
      <div className={frame.railGroup}>{renderItems(shown)}</div>
      <div className={frame.railSep} />
      <div className={frame.railGroup}>{renderItems(second)}</div>
      <div className={frame.railSep} />
      <div className={frame.railGroup}>
        <button type="button" className={frame.railItem} onClick={(e) => setFavEl(favEl ? null : e.currentTarget)} aria-label={t("frame.favoritesRail")} data-testid="rail-favorites">
          <span className={frame.railIcon}><Icon icon={Favorite} size={22} ignoreFocusStyle /></span>
          <span className={frame.railLabel}>{t("frame.favoritesRail")}</span>
        </button>
        {favEl ? (
          <ActionMenu
            anchorEl={favEl}
            onClose={() => setFavEl(null)}
            items={favorites.length ? favorites.map((b) => ({ key: b.id, label: b.name, testId: `rail-fav-${b.id}`, onClick: () => { router.push(`/boards/${b.id}`); } })) : [{ title: t("frame.noFavorites") }]}
          />
        ) : null}
      </div>
      <div className={frame.railSep} />
      <div className={frame.railGroup}>
        <button type="button" className={frame.railItem} onClick={(e) => setMoreEl(moreEl ? null : e.currentTarget)} aria-label={t("frame.moreRail")} data-testid="rail-more">
          <span className={frame.railIcon}><Icon icon={DotsIcon} size={22} ignoreFocusStyle /></span>
          <span className={frame.railLabel}>{t("frame.moreRail")}</span>
        </button>
        {moreEl ? (
          <ActionMenu
            anchorEl={moreEl}
            onClose={() => setMoreEl(null)}
            items={rest.length ? rest.map((n) => ({ key: n.id, label: label(n), testId: `rail-${n.id}`, icon: <n.icon size={18} />, onClick: () => { if (n.action) window.dispatchEvent(new CustomEvent(n.action)); else router.push(n.href); } })) : [{ title: t("frame.noMore") }]}
          />
        ) : null}
      </div>
    </nav>
  );
}
