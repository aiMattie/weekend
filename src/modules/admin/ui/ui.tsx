"use client";

/** Small building blocks shared by the admin center and profile screens. */
import { Avatar, Button } from "@vibe/core";
import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { useIsClient } from "@/lib/use-persistent-state";
import { ApiError } from "@/lib/api-client";
import { avatarColor, initials } from "@/lib/colors";
import styles from "./admin.module.css";

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  const ready = useIsClient(); // e2e: the page is interactive once this marker exists
  return (
    <div className={styles.pageHead}>
      {ready && <span hidden data-testid="admin-ready" />}
      <div className={styles.grow}>
        <h1 className={styles.pageTitle} data-testid="admin-title">{title}</h1>
        {sub && <p className={styles.pageSub}>{sub}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, testId }: { title?: string; actions?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className={styles.card} data-testid={testId}>
      {title && (
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{title}</h2>
          {actions}
        </div>
      )}
      <div className={styles.cardBody}>{children}</div>
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {hint && <span className={styles.muted} style={{ fontSize: 12 }}>{hint}</span>}
    </label>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: "green" | "red" | "blue" | "orange" }) {
  const cls = tone ? { green: styles.chipGreen, red: styles.chipRed, blue: styles.chipBlue, orange: styles.chipOrange }[tone] : "";
  return <span className={`${styles.chip} ${cls}`}>{children}</span>;
}

export function Person({ id, name, sub, photoUrl }: { id: string; name: string; sub?: string; photoUrl?: string | null }) {
  return (
    <div className={styles.person}>
      {photoUrl
        ? <Avatar type="img" src={photoUrl} size="small" withoutTooltip />
        : <Avatar type="text" text={initials(name)} size="small" customBackgroundColor={avatarColor(id)} withoutTooltip />}
      <div>
        <div className={styles.personName}>{name}</div>
        {sub && <div className={styles.personSub}>{sub}</div>}
      </div>
    </div>
  );
}

/** Run an async action with busy/error state; refresh server data afterwards. */
export function useAction(opts: { refresh?: boolean } = { refresh: true }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      if (opts.refresh !== false) router.refresh();
      return (r ?? true) as T; // 204 responses resolve to undefined: callers test truthiness for success
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Er ging iets mis");
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [router, opts.refresh]);
  return { run, error, busy, setError };
}

export const fmtDate = (iso: string | null | undefined, withTime = true): string => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("nl-NL", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "medium" });
};

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "Nooit";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return "Zojuist";
  if (s < 3600) return `${Math.round(s / 60)} min geleden`;
  if (s < 86400) return `${Math.round(s / 3600)} uur geleden`;
  if (s < 86400 * 14) return `${Math.round(s / 86400)} dagen geleden`;
  return fmtDate(iso, false);
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button size="small" kind="secondary" onClick={async () => { try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ } setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? "Gekopieerd" : label}
    </Button>
  );
}

export { styles as adminStyles };
