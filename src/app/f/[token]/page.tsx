import { getCurrentUser, userToActor } from "@/lib/auth";
import { ServiceError } from "@/lib/errors";
import { translate } from "@/lib/i18n";
import { PublicFormView } from "@/modules/boards-extra/forms/public-form";
import type { PublicForm } from "@/modules/boards-extra/forms/types";
import styles from "@/modules/boards-extra/forms/forms.module.css";
import { forms } from "@/server/services";

export const dynamic = "force-dynamic";

async function load(token: string): Promise<{ form: PublicForm | null; viewerName: string | null }> {
  const user = await getCurrentUser();
  try {
    return { form: await forms.getPublic(token, { viewer: user ? userToActor(user) : null }), viewerName: user?.name ?? null };
  } catch (e) {
    if (e instanceof ServiceError) return { form: null, viewerName: null };
    throw e;
  }
}

/** Public form page: no login needed (proxy allows /f/*). */
export default async function PublicFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { form, viewerName } = await load(token);
  if (!form) return <div className={styles.notFound} data-testid="form-not-found">{translate("nl", "forms.public.notFound")}</div>;
  return <PublicFormView form={form} viewerName={viewerName} />;
}
