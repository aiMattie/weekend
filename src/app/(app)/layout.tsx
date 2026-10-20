import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { requireUser, toPublicUser, userToActor } from "@/lib/auth";
import type { Locale } from "@/lib/i18n";
import { getNavData } from "@/server/services";

// Everything behind the login is per-user and per-request.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.isActive) redirect("/login");
  const nav = getNavData(userToActor(user));
  return (
    <AppShell user={toPublicUser(user)} nav={nav} locale={(user.locale as Locale) ?? "nl"}>
      {children}
    </AppShell>
  );
}
