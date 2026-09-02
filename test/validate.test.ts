import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";

import { normalizeRecipients } from "../src/api/validate";
import { MAX_VARS_KEYS, MAX_VAR_VALUE_LENGTH } from "../src/shared/constants";

/** normalizeRecipients throws (via fail()) instead of returning on invalid
 *  input; assert on the thrown HTTPException's status + message rather than
 *  a return value. */
function expectFail(fn: () => unknown, status: number, messageMatch: RegExp | string) {
  try {
    fn();
    throw new Error("expected normalizeRecipients to throw, it did not");
  } catch (err) {
    expect(err).toBeInstanceOf(HTTPException);
    const httpErr = err as HTTPException;
    expect(httpErr.status).toBe(status);
    if (typeof messageMatch === "string") {
      expect(httpErr.message).toBe(messageMatch);
    } else {
      expect(httpErr.message).toMatch(messageMatch);
    }
  }
}

describe("normalizeRecipients: vars rules", () => {
  it("accepts a well-formed vars object", () => {
    const result = normalizeRecipients([{ to: "01712345678", vars: { NAME: "Rahim" } }]);
    expect(result).toEqual([{ to: "01712345678", vars: { NAME: "Rahim" }, message: undefined }]);
  });

  it("rejects a non-string vars value", () => {
    expectFail(
      () => normalizeRecipients([{ to: "01712345678", vars: { NAME: 123 } }]),
      400,
      `recipients[0]: "vars.NAME" must be a string`,
    );
  });

  it("rejects a vars value that is an object, not a string", () => {
    expectFail(
      () => normalizeRecipients([{ to: "01712345678", vars: { NAME: { nested: true } } }]),
      400,
      `recipients[0]: "vars.NAME" must be a string`,
    );
  });

  it("rejects a vars value that is null", () => {
    expectFail(
      () => normalizeRecipients([{ to: "01712345678", vars: { NAME: null } }]),
      400,
      `recipients[0]: "vars.NAME" must be a string`,
    );
  });

  it(`accepts exactly ${MAX_VARS_KEYS} vars keys`, () => {
    const vars: Record<string, string> = {};
    for (let i = 0; i < MAX_VARS_KEYS; i++) vars[`K${i}`] = "v";
    const result = normalizeRecipients([{ to: "01712345678", vars }]);
    expect(result[0]?.vars).toEqual(vars);
  });

  it(`rejects more than ${MAX_VARS_KEYS} vars keys`, () => {
    const vars: Record<string, string> = {};
    for (let i = 0; i < MAX_VARS_KEYS + 1; i++) vars[`K${i}`] = "v";
    expectFail(
      () => normalizeRecipients([{ to: "01712345678", vars }]),
      400,
      `recipients[0]: "vars" must contain at most ${MAX_VARS_KEYS} keys`,
    );
  });

  it(`accepts a vars value exactly ${MAX_VAR_VALUE_LENGTH} characters long`, () => {
    const value = "x".repeat(MAX_VAR_VALUE_LENGTH);
    const result = normalizeRecipients([{ to: "01712345678", vars: { NAME: value } }]);
    expect(result[0]?.vars?.NAME).toHaveLength(MAX_VAR_VALUE_LENGTH);
  });

  it(`rejects a vars value longer than ${MAX_VAR_VALUE_LENGTH} characters`, () => {
    const value = "x".repeat(MAX_VAR_VALUE_LENGTH + 1);
    expectFail(
      () => normalizeRecipients([{ to: "01712345678", vars: { NAME: value } }]),
      400,
      `recipients[0]: "vars.NAME" exceeds ${MAX_VAR_VALUE_LENGTH} characters`,
    );
  });

  it("reports the offending recipient index, not just index 0", () => {
    expectFail(
      () =>
        normalizeRecipients([
          { to: "01712345678", vars: { NAME: "ok" } },
          { to: "01712345679", vars: { NAME: 42 } },
        ]),
      400,
      `recipients[1]: "vars.NAME" must be a string`,
    );
  });

  it("still rejects a non-object vars (array)", () => {
    expectFail(
      () => normalizeRecipients([{ to: "01712345678", vars: ["not", "an", "object"] }]),
      400,
      `recipients[0]: "vars" must be an object`,
    );
  });
});

describe("normalizeRecipients: shape rules unaffected by the vars/message limits", () => {
  it("still accepts a bare phone-string recipient with no vars/message", () => {
    const result = normalizeRecipients(["01712345678"]);
    expect(result).toEqual([{ to: "01712345678" }]);
  });

  it("still rejects a non-string message field", () => {
    expectFail(
      () => normalizeRecipients([{ to: "01712345678", message: 123 }]),
      400,
      `recipients[0]: "message" must be a string`,
    );
  });
});
