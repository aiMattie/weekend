import { Suspense } from "react";
import { MeetingsPage } from "@/modules/wispr/meetings-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Suspense><MeetingsPage /></Suspense>;
}
