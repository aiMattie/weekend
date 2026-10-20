"use client";

import { Icon } from "@vibe/core";
import { ThumbsUp } from "@vibe/icons";
import { useCurrentUser } from "@/components/shell/user-context";
import type { ColumnUi } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

type V = { votersIds: string[] };

export const voteUi: ColumnUi<V> = {
  align: "center",
  defaultWidth: 110,
  Cell: function VoteCell({ value, onChange, readOnly, board }) {
    const me = useCurrentUser();
    const ids = value?.votersIds ?? [];
    const voted = ids.includes(me.id);
    const names = ids.map((i) => board.users.find((u) => u.id === i)?.name ?? i).join(", ");
    return (
      <div className={`${styles.cell} ${styles.center}`}>
        <button type="button" disabled={readOnly} className={`${pack.vote} ${voted ? pack.voted : ""}`} title={names} data-testid="vote-button" aria-pressed={voted}
          onClick={(e) => { e.stopPropagation(); onChange({ votersIds: voted ? ids.filter((i) => i !== me.id) : [...ids, me.id] }); }}>
          <Icon icon={ThumbsUp} size={18} ignoreFocusStyle />
          <span data-testid="vote-count">{ids.length}</span>
        </button>
      </div>
    );
  },
};
