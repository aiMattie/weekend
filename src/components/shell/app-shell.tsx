"use client";

import { Icon } from "@vibe/core";
import { NavigationChevronRight } from "@vibe/icons";
import { useEffect, type ReactNode } from "react";
import type { PublicUser } from "@/lib/auth";
import type { NavData } from "@/lib/board-types";
import { I18nProvider, useT } from "@/lib/i18n/client";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { Locale } from "@/lib/i18n";
import frame from "./frame.module.css";
import { Rail } from "./rail";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";
import { UserProvider } from "./user-context";
import { SidekickHost } from "@/modules/ai/chat/sidekick-host";

const COLLAPSE_KEY = "weekend.sidebar.collapsed";

/** Dispatch this window event (from the sidebar header) to collapse/expand the sidebar. */
export const TOGGLE_SIDEBAR_EVENT = "weekend:toggle-sidebar";

function Frame({ nav, children }: { nav: NavData; children: ReactNode }) {
  const t = useT();
  const [stored, setStored] = usePersistentState(COLLAPSE_KEY, "0");
  const collapsed = stored === "1";
  useEffect(() => {
    const on = () => setStored(collapsed ? "0" : "1");
    window.addEventListener(TOGGLE_SIDEBAR_EVENT, on);
    return () => window.removeEventListener(TOGGLE_SIDEBAR_EVENT, on);
  }, [collapsed, setStored]);
  return (
    <div className={frame.app}>
      <TopBar nav={nav} onToggleSidebar={() => setStored(collapsed ? "0" : "1")} />
      <div className={frame.body}>
        <Rail nav={nav} />
        <Sidebar nav={nav} collapsed={collapsed} />
        <main className={frame.main} data-testid="main">
          {collapsed ? (
            <button type="button" className={frame.expand} onClick={() => setStored("0")} aria-label={t("frame.expandSidebar")} data-testid="expand-sidebar">
              <Icon icon={NavigationChevronRight} size={14} ignoreFocusStyle />
            </button>
          ) : null}
          {children}
        </main>
        <SidekickHost />
      </div>
    </div>
  );
}

/** frame: grey top bar, labelled rail, workspace sidebar, full-bleed content. */
export function AppShell({ user, nav, locale, children }: { user: PublicUser; nav: NavData; locale: Locale; children: ReactNode }) {
  return (
    <UserProvider user={user}>
      <I18nProvider locale={locale}>
        <Frame nav={nav}>{children}</Frame>
      </I18nProvider>
    </UserProvider>
  );
}
