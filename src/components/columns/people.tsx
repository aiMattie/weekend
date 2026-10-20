"use client";

import { Icon } from "@vibe/core";
import { Person } from "@vibe/icons";
import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useT } from "@/lib/i18n/client";
import type { ColumnUi, EditorProps } from "./types";
import { UserAvatar, userById } from "./shared";
import styles from "./cells.module.css";

type Ref = { id: string; kind: "person" | "team" };
type V = { personsAndTeams: Ref[] };

function PeopleEditor({ board, value, onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const [q, setQ] = useState("");
  const selected = new Set((value?.personsAndTeams ?? []).filter((p) => p.kind === "person").map((p) => p.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const keepTeams = (value?.personsAndTeams ?? []).filter((p) => p.kind === "team");
    onCommit({ personsAndTeams: [...[...next].map((i) => ({ id: i, kind: "person" })), ...keepTeams] }, { keepOpen: true });
  };
  const users = board.users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <input className={styles.searchInput} autoFocus placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className={styles.optionList} data-testid="people-editor">
        {users.map((u) => (
          <button key={u.id} type="button" className={`${styles.option} ${selected.has(u.id) ? styles.optionSelected : ""}`} onClick={() => toggle(u.id)} data-testid={`person-option-${u.name}`}>
            <UserAvatar user={u} size="xs" />
            <span>{u.name}</span>
          </button>
        ))}
      </div>
    </Popover>
  );
}

export const peopleUi: ColumnUi<V> = {
  align: "center",
  defaultWidth: 130,
  Cell: ({ value, board }) => {
    const refs = value?.personsAndTeams ?? [];
    const people = refs.filter((r) => r.kind === "person").map((r) => userById(board, r.id)).filter(Boolean) as NonNullable<ReturnType<typeof userById>>[];
    const teams = refs.filter((r) => r.kind === "team").map((r) => board.teams.find((t) => t.id === r.id)).filter(Boolean);
    if (!people.length && !teams.length) return <div className={`${styles.cell} ${styles.center}`}><span className={styles.emptyPerson}><Icon icon={Person} size={22} ignoreFocusStyle /></span></div>;
    const shown = people.slice(0, 2);
    return (
      <div className={`${styles.cell} ${styles.center}`}>
        <div className={styles.avatars}>{shown.map((u) => <UserAvatar key={u.id} user={u} />)}</div>
        {people.length > 2 ? <span className={styles.more}>+{people.length - 2}</span> : null}
        {teams.length ? <span className={styles.more}>{teams.map((t) => t!.name).join(", ")}</span> : null}
      </div>
    );
  },
  Editor: PeopleEditor,
};
