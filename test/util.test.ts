import { describe, expect, it } from "vitest";

import { smsSegments } from "../src/ui/util";

describe("smsSegments", () => {
  it("counts a single GSM-7 segment", () => {
    expect(smsSegments("a".repeat(160)).segments).toBe(1);
  });

  it("160 basic-charset chars is 1 GSM-7 segment", () => {
    const result = smsSegments("a".repeat(160));
    expect(result.segments).toBe(1);
    expect(result.encoding).toBe("GSM-7");
  });

  it("161 basic-charset chars is 2 GSM-7 segments", () => {
    const result = smsSegments("a".repeat(161));
    expect(result.segments).toBe(2);
    expect(result.encoding).toBe("GSM-7");
  });

  it("80 extension-table chars (2 septets each) is 1 GSM-7 segment", () => {
    const result = smsSegments("€".repeat(80));
    expect(result.segments).toBe(1);
    expect(result.encoding).toBe("GSM-7");
  });

  it("81 extension-table chars (2 septets each) is 2 GSM-7 segments", () => {
    const result = smsSegments("€".repeat(81));
    expect(result.segments).toBe(2);
    expect(result.encoding).toBe("GSM-7");
  });

  it("70 basic-charset accented chars is 1 GSM-7 segment", () => {
    const result = smsSegments("é".repeat(70));
    expect(result.segments).toBe(1);
    expect(result.encoding).toBe("GSM-7");
  });

  it("35 astral emoji is 1 UCS-2 segment", () => {
    const result = smsSegments("😀".repeat(35));
    expect(result.segments).toBe(1);
    expect(result.encoding).toBe("UCS-2");
  });

  it("36 astral emoji is 2 UCS-2 segments", () => {
    const result = smsSegments("😀".repeat(36));
    expect(result.segments).toBe(2);
    expect(result.encoding).toBe("UCS-2");
  });

  it("70 astral emoji is 3 UCS-2 segments, counted in UTF-16 units not code points", () => {
    const result = smsSegments("😀".repeat(70));
    expect(result.segments).toBe(3);
    expect(result.units).toBe(140);
    expect(result.chars).toBe(70);
    expect(result.encoding).toBe("UCS-2");
  });

  it("empty body is 0 segments", () => {
    expect(smsSegments("").segments).toBe(0);
  });

  it("a ZWJ family emoji counts code points as chars and UTF-16 units as units", () => {
    const result = smsSegments("👨‍👩‍👧");
    expect(result.encoding).toBe("UCS-2");
    expect(result.units).toBe(8);
    expect(result.chars).toBe(5);
    expect(result.segments).toBe(1);
  });
});
