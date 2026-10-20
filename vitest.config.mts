import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    env: { DATABASE_URL: ":memory:", SESSION_SECRET: "test-secret-test-secret-test-secret-12345", SEED_PASSWORD: "test-password" },
    testTimeout: 20_000,
    // graphql ships dual ESM/CJS builds; inlining keeps a single instance (platform module)
    server: { deps: { inline: [/graphql/, /@graphql-tools/, /@whatwg-node/] } },
  },
});
