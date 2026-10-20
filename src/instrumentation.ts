/** Next.js instrumentation hook: runs once when the server starts. Keep it thin, see src/server/startup.ts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./server/startup");
}
