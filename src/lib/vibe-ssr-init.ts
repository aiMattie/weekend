/**
 * @vibe/core injects its CSS from JS at runtime (so server-rendered HTML is unstyled until hydration:
 * a flash of unstyled content). Its injector falls back to `globalThis.injectedStyles[id] = css` on the
 * server; this module (imported first by the root layout) provides that map, and <VibeSsrStyles/> prints it.
 */
const g = globalThis as unknown as { injectedStyles?: Record<string, string> };
g.injectedStyles ??= {};
export {};
