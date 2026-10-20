"use client";

import { Button } from "@vibe/core";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Card, Chip } from "@/modules/admin/ui/ui";
import styles from "@/modules/admin/ui/admin.module.css";
import type { ToolInfo } from "./types";
import local from "./platform.module.css";

function Copy({ text, testId }: { text: string; testId: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return <Button size="xs" kind="tertiary" data-testid={testId} onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>{done ? t("platform.tokens.copied") : t("platform.mcp.copy")}</Button>;
}

export function McpPanel({ baseUrl, tools }: { baseUrl: string; tools: ToolInfo[] }) {
  const t = useT();
  const url = `${baseUrl}/api/mcp`;
  const cli = `claude mcp add --transport http weekend ${url} --header "Authorization: Bearer <JOUW_TOKEN>"`;
  const json = JSON.stringify({ mcpServers: { weekend: { type: "http", url, headers: { Authorization: "Bearer ${WEEKEND_TOKEN}" } } } }, null, 2);
  return (
    <>
      <Card title={t("platform.mcp.title")} testId="mcp-card">
        <p className={styles.hint}>{t("platform.mcp.hint")}</p>
        <div className={local.endpointRow}>
          <span>{t("platform.endpoint.mcp")}</span><code className={styles.mono} data-testid="mcp-url">{url}</code>
        </div>
        <h3 style={{ margin: "16px 0 6px", fontSize: 14 }}>{t("platform.mcp.steps")}</h3>
        <ol className={local.steps}>
          <li>{t("platform.mcp.step1")}</li>
          <li>{t("platform.mcp.step2")}</li>
          <li>{t("platform.mcp.step3")}</li>
        </ol>
        <div className={styles.fieldLabel}>{t("platform.mcp.cli")} <Copy text={cli} testId="mcp-copy-cli" /></div>
        <pre className={local.code} data-testid="mcp-cli">{cli}</pre>
        <div className={styles.fieldLabel}>{t("platform.mcp.json")} <Copy text={json} testId="mcp-copy-json" /></div>
        <pre className={local.code} data-testid="mcp-json">{json}</pre>
        <p className={styles.hint}>{t("platform.mcp.extras")}</p>
      </Card>
      <Card title={`${t("platform.mcp.tools")} (${t("platform.mcp.toolsCount", { n: tools.length })})`} testId="mcp-tools-card">
        <div className={local.tableWrap}>
          <table className={styles.table} data-testid="mcp-tools">
            <thead><tr><th>{t("platform.mcp.col.name")}</th><th>{t("platform.mcp.col.kind")}</th><th>{t("platform.mcp.col.description")}</th></tr></thead>
            <tbody>
              {tools.map((tool) => (
                <tr key={tool.name} data-testid="mcp-tool-row">
                  <td className={styles.mono}>{tool.name}</td>
                  <td><Chip tone={tool.readOnly ? "blue" : "orange"}>{tool.readOnly ? t("platform.mcp.read") : t("platform.mcp.write")}</Chip></td>
                  <td>{tool.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
