import { TrashView } from "@/components/board/chrome/trash-view";

export const dynamic = "force-dynamic";

export default function TrashPage() {
  return <TrashView state="deleted" />;
}
