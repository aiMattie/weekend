import { and, eq } from "drizzle-orm";
import { requireUser, userToActor } from "@/lib/auth";
import { ServiceError } from "@/lib/errors";
import { t, type Locale } from "@/lib/i18n";
import { can } from "@/lib/permissions";
import { db } from "@/db/client";
import { users as usersTable } from "@/db/schema/core";
import { FormBuilder } from "@/modules/boards-extra/forms/builder";
import styles from "@/modules/boards-extra/forms/forms.module.css";
import type { FormWithQuestions } from "@/modules/boards-extra/forms/types";
import { boards, columns, forms } from "@/server/services";

export const dynamic = "force-dynamic";


export default async function FormBuilderRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const actor = userToActor(user);
  const locale = (user.locale as Locale) ?? "nl";
  const data = { formId: id };
  let result: { initial: FormWithQuestions; boardName: string; cols: ReturnType<typeof columns.list>; available: ReturnType<typeof forms.availableColumns>; count: number } | null = null;
  try {
    const initial = forms.get(actor, data.formId);
    result = {
      initial,
      boardName: boards.get(actor, initial.form.boardId).name,
      cols: columns.list(actor, initial.form.boardId, "item"),
      available: forms.availableColumns(actor, data.formId),
      count: forms.listSubmissions(actor, data.formId, 1000).length,
    };
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
  }
  if (!result) return <div className={styles.notFound} data-testid="form-not-found">{t(locale, "forms.notFound")}</div>;
  const accountUsers = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(and(eq(usersTable.accountId, user.accountId), eq(usersTable.isActive, true))).all();
  return (
    <FormBuilder
      initial={result.initial}
      boardName={result.boardName}
      columns={result.cols.map((c) => ({ id: c.id, key: c.key, title: c.title, type: c.type, settings: c.settings }))}
      users={accountUsers}
      availableColumns={result.available}
      submissionsCount={result.count}
      canEdit={can(actor, "board:edit_structure", { boardId: result.initial.form.boardId })}
    />
  );
}
