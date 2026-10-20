"use client";

import { Button, Search } from "@vibe/core";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { cleanConfig } from "./describe";
import { defaultValue, FieldInput, tx, type Values } from "./field-input";
import type { AutomationDto, Catalog, FieldSpec, RecipeMeta } from "./types";
import type { UiCtx } from "./use-auto-context";
import styles from "./automations.module.css";

function RecipeCard({ recipe, ctx, onAdded }: { recipe: RecipeMeta; ctx: UiCtx; onAdded: (a: AutomationDto) => void }) {
  const t = useT();
  const [picked, setPicked] = useState<Values>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // user choices win; everything else is derived from the board (so late loading boards/integrations fill in)
  const values = useMemo(() => {
    const v: Values = {};
    for (const tk of recipe.tokens) v[tk.key] = picked[tk.key] !== undefined ? picked[tk.key] : defaultValue(tk as FieldSpec, ctx, v);
    return v;
  }, [picked, recipe, ctx]);
  const set = (key: string, val: unknown) => setPicked((cur) => {
    const next = { ...cur, [key]: val };
    for (const tk of recipe.tokens) if (tk.of === key) delete next[tk.key];
    return next;
  });

  const parts = tx(recipe.sentence, ctx.locale).split(/(\[\w+\])/g);
  const add = async () => {
    setBusy(true); setError("");
    try {
      const body: Values = {};
      for (const [k, v] of Object.entries(cleanConfig(values))) body[k] = v;
      onAdded(await api.post<AutomationDto>("/api/v1/automations/recipe", { boardId: ctx.boardId, recipeId: recipe.id, values: body }));
    } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); } finally { setBusy(false); }
  };
  return (
    <div className={styles.card} data-testid={`recipe-card-${recipe.id}`}>
      <div className={styles.sentence}>
        {parts.map((p, i) => {
          const m = /^\[(\w+)\]$/.exec(p);
          const tk = m ? recipe.tokens.find((x) => x.key === m[1]) : undefined;
          return tk ? <FieldInput key={i} field={tk as FieldSpec} values={values} set={set} ctx={ctx} testId={`token-${recipe.id}-${tk.key}`} /> : <span key={i}>{p}</span>;
        })}
      </div>
      {error ? <div className={styles.errText} role="alert">{error}</div> : null}
      <div className={styles.cardFoot}>
        <Button size="small" kind="primary" onClick={() => void add()} loading={busy} disabled={busy} data-testid={`recipe-add-${recipe.id}`}>{t("auto.useTemplate")}</Button>
      </div>
    </div>
  );
}

export function RecipesTab({ catalog, ctx, onAdded, onScratch }: { catalog: Catalog; ctx: UiCtx; onAdded: (a: AutomationDto) => void; onScratch: () => void }) {
  const t = useT();
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const L = ctx.locale;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of catalog.recipes) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return m;
  }, [catalog.recipes]);
  const shown = catalog.recipes.filter((r) => (cat === "all" || r.category === cat) && (!q.trim() || tx(r.sentence, L).toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className={styles.body}>
      <nav className={styles.side} aria-label="categories">
        <button type="button" className={`${styles.cat} ${cat === "all" ? styles.catActive : ""}`} onClick={() => setCat("all")} data-testid="auto-cat-all">{t("auto.cat.all")}<span className={styles.catCount}>{catalog.recipes.length}</span></button>
        {catalog.categories.filter((c) => counts.has(c.id)).map((c) => (
          <button key={c.id} type="button" className={`${styles.cat} ${cat === c.id ? styles.catActive : ""}`} onClick={() => setCat(c.id)} data-testid={`auto-cat-${c.id}`}>{tx(c.label, L)}<span className={styles.catCount}>{counts.get(c.id)}</span></button>
        ))}
        <span className={styles.sideSpacer} />
        <Link href="/integrations" className={styles.sideLink} data-testid="auto-integrations-link">{t("auto.int.nav")}</Link>
      </nav>
      <div className={styles.main}>
        <div className={styles.searchRow}>
          <div className={styles.searchBox} data-testid="auto-search"><Search value={q} onChange={setQ} placeholder={t("auto.search")} size="small" /></div>
          {catalog.usage ? <span className={styles.usage}>{t("auto.usage", { n: catalog.usage.boardLastHour, limit: catalog.usage.limits.boardPerHour })}</span> : null}
        </div>
        <h3 className={styles.sectionTitle}>{cat === "all" && !q.trim() ? t("auto.basics") : cat === "all" ? t("auto.results") : tx(catalog.categories.find((c) => c.id === cat)?.label, L)}<span className={styles.sectionCount}> · {t("auto.templates", { n: shown.length })}</span></h3>
        <div className={styles.grid}>
          <button type="button" className={`${styles.card} ${styles.scratch}`} onClick={onScratch} data-testid="auto-tab-builder">
            <span className={styles.scratchPlus}>+</span>
            <span className={styles.scratchTitle}>{t("auto.scratch")}</span>
            <span className={styles.muted}>{t("auto.scratchHint")}</span>
          </button>
          {shown.map((r) => <RecipeCard key={r.id} recipe={r} ctx={ctx} onAdded={onAdded} />)}
        </div>
        {!shown.length ? <div className={styles.empty}>{t("auto.noResults")}</div> : null}
      </div>
    </div>
  );
}
