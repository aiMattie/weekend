import { AgentBuilder } from "@/modules/ai/agents/agent-builder";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentBuilder agentId={id} />;
}
