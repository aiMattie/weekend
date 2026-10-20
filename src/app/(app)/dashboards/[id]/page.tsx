import { DashboardPage } from "@/modules/boards-extra/dashboards/dashboard-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DashboardPage id={id} />;
}
