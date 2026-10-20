"use client";

import { useEffect } from "react";

/** Loads Poppins/Roboto (Vibe headings; Figtree is bundled through @fontsource) without blocking first paint or tests when offline. */
export function WebFonts() {
  useEffect(() => {
    if (document.getElementById("vibe-fonts")) return;
    const link = document.createElement("link");
    link.id = "vibe-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Roboto:wght@400;500;700&display=swap";
    document.head.appendChild(link);
  }, []);
  return null;
}
