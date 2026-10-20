import { AgentsHub, type HubView } from "@/modules/ai/agents/agents-page";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const v: HubView = view === "mine" || view === "directory" ? view : "new";
  return <AgentsHub view={v} />;
}
