"use client";

/** Prints the CSS Vibe collected during server rendering (see src/lib/vibe-ssr-init.ts). Placed at the end of <body>. */
export function VibeSsrStyles() {
  const css = typeof document === "undefined" ? Object.values((globalThis as unknown as { injectedStyles?: Record<string, string> }).injectedStyles ?? {}).join("\n") : "";
  return <style data-vibe-ssr="" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: css }} />;
}
