import type { Metadata } from "next";
import "@/lib/vibe-ssr-init";
import "@vibe/core/tokens";
import "@fontsource/figtree/300.css";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import "./globals.css";
import { VibeSsrStyles } from "@/components/shell/vibe-ssr-styles";
import { WebFonts } from "@/components/shell/web-fonts";
import { account } from "@/server/services";

/** Title, description and Open Graph from Admin > Account (name + logo). Falls back to "Weekend". */
export async function generateMetadata(): Promise<Metadata> {
  let brand: ReturnType<typeof account.publicBranding> = null;
  try { brand = account.publicBranding(); } catch { /* no DB yet (build, first run) */ }
  const name = brand?.name || "Weekend";
  const description = `Work OS voor ${name}`;
  const logo = brand?.hasLogo ? `/api/public/logo?v=${brand.logoVersion ?? ""}` : null;
  const images = logo ? [{ url: logo, alt: name }] : undefined;
  return {
    metadataBase: new URL(process.env.APP_URL || "http://localhost:3058"),
    title: { default: name, template: `%s · ${name}` },
    description,
    applicationName: name,
    openGraph: { type: "website", siteName: name, title: name, description, images },
    twitter: { card: "summary", title: name, description, images: logo ? [logo] : undefined },
    ...(logo ? { icons: { icon: logo, apple: logo } } : {}),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <WebFonts />
        {children}
        <VibeSsrStyles />
      </body>
    </html>
  );
}
