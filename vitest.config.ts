import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Workers-runtime test harness: tests in test/**/*.test.ts run inside
// workerd (via Miniflare) with the real bindings declared in
// wrangler.jsonc (D1, KV, R2, Queues). See @cloudflare/vitest-plugin docs:
// https://developers.cloudflare.com/workers/testing/vitest-integration/
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // wrangler.jsonc `vars` only carries FAKE_SMS, and the plugin never
      // reads .dev.vars — encryptSecret needs ENCRYPTION_KEY in every test.
      miniflare: { bindings: { ENCRYPTION_KEY: "test-encryption-key" } },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
