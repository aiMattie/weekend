import { eq } from "drizzle-orm";
import { requireUser, userToActor } from "@/lib/auth";
import { db } from "@/db/client";
import { teamMembers, teams, users } from "@/db/schema/core";
import { translate } from "@/lib/i18n";
import { Person } from "@/modules/admin/ui/ui";
import { Chip } from "@/modules/admin/ui/ui";
import styles from "@/modules/admin/ui/admin.module.css";
import { redirect } from "next/navigation";
import { users as usersSvc } from "@/server/services";

export const dynamic = "force-dynamic";

/** Read-only profile card of a colleague (search results, mentions). */
export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const user = await requireUser();
  const actor = userToActor(user);
  if (userId === actor.id) redirect("/profile");
  let target;
  try { target = usersSvc.get(actor, userId); } catch { return <div style={{ padding: 40 }} data-testid="profile-missing">{translate("nl", "admin.profile.notFound")}</div>; }
  if (actor.role === "guest") return <div style={{ padding: 40 }}>{translate("nl", "admin.noAccess.text")}</div>;
  const myTeams = db.select({ name: teams.name }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId)).where(eq(teamMembers.userId, userId)).all();
  void users;
  return (
    <div style={{ padding: "32px 40px", overflow: "auto" }} data-testid="user-profile">
      <div className={styles.page}>
        <Person id={target.id} name={target.name} sub={target.title ?? undefined} photoUrl={target.photoUrl} />
        <table className={styles.table} style={{ marginTop: 20, maxWidth: 520 }}>
          <tbody>
            <tr><td className={styles.muted}>E-mail</td><td><a href={`mailto:${target.email}`}>{target.email}</a></td></tr>
            {target.phone && <tr><td className={styles.muted}>{translate("nl", "admin.profile.phone")}</td><td>{target.phone}</td></tr>}
            <tr><td className={styles.muted}>Teams</td><td>{myTeams.length ? myTeams.map((t) => <Chip key={t.name}>{t.name}</Chip>) : "-"}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
