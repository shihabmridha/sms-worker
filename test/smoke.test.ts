import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Workers runtime smoke test", () => {
  it("writes and reads a KV key on env.CACHE", async () => {
    await env.CACHE.put("smoke-test-key", "smoke-test-value");
    const value = await env.CACHE.get("smoke-test-key");
    expect(value).toBe("smoke-test-value");
  });
});
