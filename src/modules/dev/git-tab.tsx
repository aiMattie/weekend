"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { Chip } from "./ui";
import type { GitLink } from "@/server/services/dev-git";
import type { PanelTabProps } from "@/components/item-panel/tabs";
import styles from "./dev.module.css";

const KIND_COLOR: Record<string, string> = { commit: "#579bfc", pull_request: "#a25ddc", branch: "#00c875" };
const STATE_COLOR: Record<string, string> = { open: "#00c875", merged: "#a25ddc", closed: "#df2f4a" };

/** Item panel tab "Git": commits, pull requests and branches linked through the GitHub/Bitbucket webhook. */
export function GitTab({ item, refreshKey }: PanelTabProps) {
  const t = useT();
  const [links, setLinks] = useState<GitLink[] | null>(null);
  useEffect(() => {
    let live = true;
    api.get<GitLink[]>(`/api/v1/dev/items/${item.id}/git`).then((l) => { if (live) setLinks(l); }).catch(() => { if (live) setLinks([]); });
    return () => { live = false; };
  }, [item.id, refreshKey]);

  return (
    <div className={styles.tab} data-testid="git-tab">
      {links === null ? <div className={styles.muted}>{t("common.loading")}</div> : null}
      {links?.length === 0 ? <div className={styles.muted} data-testid="git-empty">{t("dev.git.empty", { id: item.id })}</div> : null}
      {links?.map((l) => (
        <div key={l.id} className={styles.linkRow} data-testid="git-link" data-kind={l.kind}>
          <Chip text={t(`dev.git.${l.kind}`)} color={KIND_COLOR[l.kind] ?? "#c4c4c4"} />
          <div className={styles.linkMain}>
            <div className={styles.linkTitle}>{l.url ? <a href={l.url} target="_blank" rel="noreferrer" className={styles.link}>{l.title || l.externalId}</a> : (l.title || l.externalId)}</div>
            <div className={styles.linkMeta}>{l.repo} · {l.kind === "commit" ? l.externalId.slice(0, 7) : l.kind === "pull_request" ? `#${l.externalId}` : l.provider}{l.author ? ` · ${l.author}` : ""}</div>
          </div>
          {l.state ? <Chip text={l.state} color={STATE_COLOR[l.state] ?? "#c4c4c4"} /> : null}
        </div>
      ))}
    </div>
  );
}
