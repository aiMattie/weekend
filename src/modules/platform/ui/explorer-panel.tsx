"use client";

import { Button } from "@vibe/core";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Card } from "@/modules/admin/ui/ui";
import styles from "@/modules/admin/ui/admin.module.css";
import local from "./platform.module.css";

interface Example { id: string; labelKey: string; query: string; variables?: string }

const examples = (boardId: string | null): Example[] => [
  { id: "me", labelKey: "platform.explorer.ex.me", query: "query {\n  me { id name email }\n}" },
  { id: "boards", labelKey: "platform.explorer.ex.boards", query: "query {\n  boards(limit: 5) {\n    id\n    name\n    columns { id title type }\n    groups { id title }\n  }\n}" },
  { id: "items", labelKey: "platform.explorer.ex.items", query: "query ($boardId: ID!) {\n  boards(ids: [$boardId]) {\n    items_page(limit: 5) {\n      cursor\n      items {\n        id\n        name\n        column_values { id type text value }\n      }\n    }\n  }\n}", variables: JSON.stringify({ boardId: boardId ?? "1" }, null, 2) },
  { id: "create", labelKey: "platform.explorer.ex.createItem", query: "mutation ($boardId: ID!, $values: JSON) {\n  create_item(board_id: $boardId, item_name: \"Nieuw item via API\", column_values: $values) {\n    id\n    name\n  }\n}", variables: JSON.stringify({ boardId: boardId ?? "1", values: JSON.stringify({ status: { label: "Done" } }) }, null, 2) },
  { id: "change", labelKey: "platform.explorer.ex.changeValue", query: "mutation ($boardId: ID!, $itemId: ID!) {\n  change_column_value(board_id: $boardId, item_id: $itemId, column_id: \"status\", value: \"{\\\"label\\\":\\\"Working on it\\\"}\") {\n    id\n  }\n}", variables: JSON.stringify({ boardId: boardId ?? "1", itemId: "1" }, null, 2) },
  { id: "complexity", labelKey: "platform.explorer.ex.complexity", query: "query {\n  complexity { query before after reset_in_x_seconds }\n  boards(limit: 3) { id name }\n}" },
];

const SCHEMA_QUERY = "{ __schema { queryType { fields { name } } mutationType { fields { name } } } }";

export function ExplorerPanel({ baseUrl, firstBoardId }: { baseUrl: string; firstBoardId: string | null }) {
  const t = useT();
  const exs = examples(firstBoardId);
  const [query, setQuery] = useState(exs[0].query);
  const [vars, setVars] = useState("{}");
  const [out, setOut] = useState("");
  const [meta, setMeta] = useState<{ status: number; complexity: string; remaining: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [schema, setSchema] = useState<{ q: string[]; m: string[] } | null>(null);

  useEffect(() => {
    fetch("/api/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: SCHEMA_QUERY }) })
      .then((r) => r.json())
      .then((j) => setSchema({ q: j.data.__schema.queryType.fields.map((f: { name: string }) => f.name), m: j.data.__schema.mutationType.fields.map((f: { name: string }) => f.name) }))
      .catch(() => undefined);
  }, []);

  async function run() {
    setErr("");
    let variables: unknown = undefined;
    if (vars.trim()) {
      try { variables = JSON.parse(vars); } catch { setErr(t("platform.explorer.invalidVars")); return; }
    }
    setBusy(true);
    try {
      const res = await fetch("/api/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not json */ }
      setOut(pretty);
      setMeta({ status: res.status, complexity: res.headers.get("x-complexity-query") ?? "-", remaining: res.headers.get("x-daily-budget-remaining") ?? "-" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fout");
    } finally { setBusy(false); }
  }

  const pick = (id: string) => {
    const ex = exs.find((x) => x.id === id);
    if (ex) { setQuery(ex.query); setVars(ex.variables ?? "{}"); }
  };

  return (
    <Card title={t("platform.explorer.title")} testId="explorer-card">
      <p className={styles.hint}>{t("platform.explorer.hint")}</p>
      <div className={local.endpointRow}>
        <span>{t("platform.endpoint.graphql")}</span><code className={styles.mono}>{baseUrl}/api/graphql</code>
        <span>{t("platform.endpoint.schema")}</span><a href="/api/graphql/get_schema" target="_blank" rel="noreferrer" className={styles.mono}>{baseUrl}/api/graphql/get_schema</a>
      </div>
      <div className={styles.toolbar}>
        <select className={styles.select} onChange={(e) => pick(e.target.value)} aria-label={t("platform.explorer.example")} data-testid="explorer-example" defaultValue="me">
          {exs.map((e) => <option key={e.id} value={e.id}>{t(e.labelKey)}</option>)}
        </select>
        <Button onClick={() => void run()} loading={busy} data-testid="explorer-run">{busy ? t("platform.explorer.running") : t("platform.explorer.run")}</Button>
        <span className={styles.error} role="alert" data-testid="explorer-error">{err}</span>
      </div>
      <div className={local.explorer}>
        <div>
          <div className={styles.fieldLabel}>{t("platform.explorer.query")}</div>
          <textarea className={local.editor} value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} data-testid="explorer-query" aria-label={t("platform.explorer.query")} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void run(); }} />
          <div className={styles.fieldLabel} style={{ marginTop: 10 }}>{t("platform.explorer.variables")}</div>
          <textarea className={`${local.editor} ${local.editorSmall}`} value={vars} onChange={(e) => setVars(e.target.value)} spellCheck={false} data-testid="explorer-variables" aria-label={t("platform.explorer.variables")} />
        </div>
        <div>
          <div className={styles.fieldLabel}>{t("platform.explorer.response")}</div>
          <pre className={local.result} data-testid="explorer-result">{out || " "}</pre>
          {meta && (
            <div className={local.meta} data-testid="explorer-meta">
              <span>{t("platform.explorer.status")}: <strong>{meta.status}</strong></span>
              <span>{t("platform.explorer.complexity")}: <strong>{meta.complexity}</strong></span>
              <span>{t("platform.explorer.remaining")}: <strong>{meta.remaining}</strong></span>
            </div>
          )}
        </div>
      </div>
      {schema && (
        <div style={{ marginTop: 16 }} data-testid="explorer-schema">
          <div className={styles.fieldLabel}>{t("platform.explorer.schema")}: {t("platform.explorer.queries")} ({schema.q.length}) / {t("platform.explorer.mutations")} ({schema.m.length})</div>
          <div className={local.schemaList}>
            {schema.q.map((n) => <div key={`q-${n}`} onClick={() => setQuery(`query {\n  ${n}\n}`)}>{n}</div>)}
            {schema.m.map((n) => <div key={`m-${n}`} onClick={() => setQuery(`mutation {\n  ${n}\n}`)}>mutation {n}</div>)}
          </div>
        </div>
      )}
    </Card>
  );
}
