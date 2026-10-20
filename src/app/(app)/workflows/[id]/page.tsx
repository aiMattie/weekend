import { WorkflowEditorPage } from "@/modules/automations/workflows/workflow-editor";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkflowEditorPage id={id} />;
}
