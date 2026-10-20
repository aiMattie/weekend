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

export const metadata: Metadata = {
  title: "Weekend",
  description: "Work OS voor Example",
};

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
