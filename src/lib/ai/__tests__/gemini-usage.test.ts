import { describe, it, expect } from "vitest";
import { readGeminiUsage } from "@/lib/ai-engine";

/**
 * What a Gemini call cost.
 *
 * The provider counts the tokens it billed for and puts the count on the
 * response. This reader is the only place that count is turned into
 * something the platform can record, so what it does with a missing or
 * odd field is the whole question.
 *
 * A missing count is `null`, never zero. A zero is a claim that the
 * provider counted no tokens; "the provider did not say" is a different
 * claim, and the difference is what tells a free fallback apart from a
 * metered call that did not report.
 */

describe("reading a Gemini reply's usage", () => {
  it("reads the total the provider counted", () => {
    const u = readGeminiUsage({
      usageMetadata: {
        totalTokenCount: 345,
        promptTokenCount: 6,
        candidatesTokenCount: 339,
      },
    });
    expect(u).not.toBeNull();
    expect(u!.totalTokens).toBe(345);
    expect(u!.promptTokens).toBe(6);
    expect(u!.candidateTokens).toBe(339);
  });

  it("has no usage when the provider reported none", () => {
    expect(readGeminiUsage({})).toBeNull();
    expect(readGeminiUsage({ usageMetadata: undefined })).toBeNull();
  });

  it("sums the parts when the provider gave no total", () => {
    const u = readGeminiUsage({
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    });
    expect(u!.totalTokens).toBe(15);
  });

  it("reports an absence as null rather than zero", () => {
    // A total of zero would say the provider counted nothing, which is
    // not what a response without the field means.
    const u = readGeminiUsage({ usageMetadata: { promptTokenCount: 0 } });
    expect(u).not.toBeNull();
    expect(u!.totalTokens).toBe(0);
    expect(u!.promptTokens).toBe(0);
  });

  it("ignores a count that is not a number", () => {
    const u = readGeminiUsage({
      usageMetadata: {
        totalTokenCount: "345" as unknown as number,
        promptTokenCount: 6,
      },
    });
    // The total was not a number, so it is not believed; the parts are.
    expect(u!.totalTokens).toBe(6);
  });

  it("has no usage when every field is unusable", () => {
    expect(
      readGeminiUsage({
        usageMetadata: {
          totalTokenCount: Number.NaN,
          promptTokenCount: -1,
          candidatesTokenCount: "x" as unknown as number,
        },
      }),
    ).toBeNull();
  });
});
