import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("CORS middleware", () => {
  it("handles OPTIONS preflight requests and allows all origins, methods, and headers", async () => {
    const res = await app.request(
      "/health",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://example.com",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-methods")).toContain("OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("*");
    expect(res.headers.get("access-control-max-age")).toBe("86400");
  });

  it("adds CORS allow-origin header to standard GET responses", async () => {
    const res = await app.request(
      "/health",
      {
        method: "GET",
        headers: {
          Origin: "https://example.com",
        },
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-expose-headers")).toBe("*");
  });

  it("handles preflight on /v1/sms/send without hitting auth middleware", async () => {
    const res = await app.request(
      "/v1/sms/send",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://some-client-app.com",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
