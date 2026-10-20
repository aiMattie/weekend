import { translate } from "@/lib/i18n";
import styles from "./admin.module.css";

/** Shown when the user lacks the permission for a screen (server component). */
export function NoAccess({ locale = "nl" }: { locale?: "nl" | "en" }) {
  return (
    <div className={styles.page} style={{ padding: 40 }} data-testid="no-access">
      <h1 className={styles.pageTitle}>{translate(locale, "admin.noAccess.title")}</h1>
      <p className={styles.pageSub}>{translate(locale, "admin.noAccess.text")}</p>
    </div>
  );
}
