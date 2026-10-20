"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./ui.module.css";

interface Props {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  multiline?: boolean;
  testId?: string;
  /** start in edit mode (controlled externally) */
  editing?: boolean;
  onEditingChange?: (e: boolean) => void;
}

/** Click-to-edit text: Enter commits, Escape cancels, blur commits. */
export function InlineText({ value, onCommit, disabled, className, style, placeholder, multiline, testId, editing: editingProp, onEditingChange }: Props) {
  const [editingState, setEditingState] = useState(false);
  const editing = editingProp ?? editingState;
  const setEditing = (v: boolean) => (onEditingChange ? onEditingChange(v) : setEditingState(v));
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    if (editing) {
      done.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(value);
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing, value]);

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    const v = draft.trim();
    if (commit && v !== value && (v || placeholder !== undefined)) onCommit(v);
  };

  if (editing && !disabled) {
    const common = {
      ref,
      value: draft,
      autoFocus: true,
      className: `${styles.inlineInput} ${className ?? ""}`,
      style,
      "data-testid": testId ? `${testId}-input` : undefined,
      onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: () => finish(true),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && (!multiline || !e.shiftKey)) {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.stopPropagation();
          finish(false);
        }
      },
    };
    return multiline ? <textarea rows={2} {...common} /> : <input type="text" {...common} />;
  }
  return (
    <span
      className={`${styles.inlineText} ${disabled ? "" : styles.inlineEditable} ${className ?? ""}`}
      style={style}
      data-testid={testId}
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {value || <span className={styles.placeholder}>{placeholder}</span>}
    </span>
  );
}
