"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@vibe/core";
import { Drag, Hide } from "@vibe/icons";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import styles from "./forms.module.css";
import type { QuestionDto } from "./types";

function Row({ q, selected, onSelect, kindLabel }: { q: QuestionDto; selected: boolean; onSelect: () => void; kindLabel: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: q.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`${styles.qRow} ${selected ? styles.qRowSelected : ""}`}
      onClick={onSelect} data-testid={`q-row-${q.id}`} data-question-title={q.title}>
      <span className={styles.dragHandle} {...attributes} {...listeners} aria-label="drag" data-testid={`q-drag-${q.id}`}><Drag size={16} /></span>
      <span className={styles.qRowTitle}>{q.title}{q.required ? " *" : ""}</span>
      {q.hidden ? <span className={styles.mutedIcon}><Hide size={14} /></span> : null}
      <span className={styles.qRowKind}>{kindLabel}</span>
    </div>
  );
}

interface Props {
  questions: QuestionDto[];
  selectedId: string | null;
  availableColumns: { id: string; title: string; type: string }[];
  canEdit: boolean;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onAddColumn: (columnId: string) => void;
  onAddSection: () => void;
}

export function QuestionList({ questions, selectedId, availableColumns, canEdit, onSelect, onReorder, onAddColumn, onAddSection }: Props) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const kindLabel = (q: QuestionDto) => (q.kind === "name" || q.kind === "section" ? t(`forms.kind.${q.kind}`) : t(`column.type.${q.kind}`) === `column.type.${q.kind}` ? q.kind : t(`column.type.${q.kind}`));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = questions.map((q) => q.id);
    onReorder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };
  return (
    <div data-testid="question-list">
      <h3 className={styles.paneTitle}>{t("forms.questions")}</h3>
      <DndContext id="form-questions" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          {questions.map((q) => <Row key={q.id} q={q} selected={q.id === selectedId} onSelect={() => onSelect(q.id)} kindLabel={kindLabel(q)} />)}
        </SortableContext>
      </DndContext>
      {canEdit && (
        <div className={styles.addRow}>
          <Button kind="secondary" size="small" onClick={() => setAdding(!adding)} data-testid="add-question">{t("forms.addQuestion")}</Button>
          {adding && (
            <div className={styles.addRow} data-testid="add-question-menu">
              {availableColumns.length === 0 && <span className={styles.helpText}>{t("forms.noMoreColumns")}</span>}
              {availableColumns.map((c) => (
                <Button key={c.id} kind="tertiary" size="small" onClick={() => { onAddColumn(c.id); setAdding(false); }} data-testid={`add-col-${c.id}`}>{c.title}</Button>
              ))}
              <Button kind="tertiary" size="small" onClick={() => { onAddSection(); setAdding(false); }} data-testid="add-section">{t("forms.addSection")}</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
