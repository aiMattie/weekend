import { HelpShell } from "@/modules/help/help-shell";
import { loadIndex, loadReadme } from "@/modules/help/content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Handleiding" };

/** /help: table of contents (docs/handleiding/README.md). */
export default function HelpIndexPage() {
  const readme = loadReadme();
  return (
    <HelpShell index={loadIndex()} active={null}>
      <div data-testid="help-readme" dangerouslySetInnerHTML={{ __html: readme.html }} />
    </HelpShell>
  );
}
