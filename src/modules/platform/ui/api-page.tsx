"use client";

import { Tab, TabList } from "@vibe/core";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useIsClient } from "@/lib/use-persistent-state";
import { WebhooksSection } from "@/modules/automations/integrations/webhooks-section";
import { PageHead } from "@/modules/admin/ui/ui";
import styles from "@/modules/admin/ui/admin.module.css";
import { CallsPanel } from "./calls-panel";
import { ExplorerPanel } from "./explorer-panel";
import { McpPanel } from "./mcp-panel";
import { ConnectedApps } from "@/modules/oauth/connected-apps";
import { TokensPanel } from "./tokens-panel";
import type { PlatformProps } from "./types";
import local from "./platform.module.css";

const TABS = ["tokens", "explorer", "mcp", "webhooks", "calls"] as const;

export function ApiPage(props: PlatformProps) {
  const t = useT();
  const tabs = TABS.filter((x) => x !== "webhooks" || props.isAdmin);
  const [active, setActive] = useState(0);
  const isClient = useIsClient();
  const current = tabs[active] ?? "tokens";
  return (
    <>
      <PageHead title={t("platform.title")} sub={t("platform.sub")} />
      <div className={local.tabs} data-testid="platform-tabs">
        {isClient ? (
          <TabList activeTabId={active} onTabChange={setActive}>
            {tabs.map((id) => <Tab key={id} data-testid={`platform-tab-${id}`}>{t(`platform.tab.${id}`)}</Tab>)}
          </TabList>
        ) : <div style={{ height: 40 }} />}
      </div>
      {current === "tokens" && (
        <>
          <TokensPanel tokens={props.tokens} workspaces={props.workspaces} defaultBudget={props.defaultBudget} isAdmin={props.isAdmin} />
          <section className={styles.card} data-testid="endpoints-card">
            <div className={styles.cardHead}><h2 className={styles.cardTitle}>{t("platform.endpoint.title")}</h2></div>
            <div className={styles.cardBody}>
              <div className={local.endpointRow}>
                <span>{t("platform.endpoint.graphql")}</span><code className={styles.mono} data-testid="endpoint-graphql">{props.baseUrl}/api/graphql</code>
                <span>{t("platform.endpoint.mcp")}</span><code className={styles.mono} data-testid="endpoint-mcp">{props.baseUrl}/api/mcp</code>
              </div>
              <p className={styles.hint}>{t("platform.endpoint.swap")}</p>
            </div>
          </section>
        </>
      )}
      {current === "explorer" && <ExplorerPanel baseUrl={props.baseUrl} firstBoardId={props.firstBoardId} />}
      {current === "mcp" && <><ConnectedApps baseUrl={props.baseUrl} apps={props.connectedApps} workspaces={props.workspaces} /><McpPanel baseUrl={props.baseUrl} tools={props.tools} /></>}
      {current === "webhooks" && props.isAdmin && <div data-testid="platform-webhooks"><WebhooksSection boards={props.boards} /></div>}
      {current === "calls" && <CallsPanel />}
    </>
  );
}
