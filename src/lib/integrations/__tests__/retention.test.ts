import { describe, it, expect } from "vitest";
import { retentionDeadline } from "@/lib/integrations/retention.server";

describe("retention", () => {
  it("gives a deadline for a tool with a window", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const deadline = retentionDeadline("shodan", from);
    expect(deadline).toBe("2026-04-01T00:00:00.000Z");
  });

  it("gives no deadline for an unknown tool", () => {
    expect(retentionDeadline("not-a-tool")).toBeNull();
  });

  it("gives the orchestration tool its own window", () => {
    // Quantum-CLI moved from quarantined to report-import in v10, so it
    // now has a retention deadline like every other tool.
    const from = new Date("2026-01-01T00:00:00.000Z");
    expect(retentionDeadline("quantum-cli", from)).toBe("2026-06-30T00:00:00.000Z");
  });

  it("the deadline is always in the future", () => {
    const deadline = retentionDeadline("metasploit", new Date("2026-01-01T00:00:00.000Z"));
    expect(new Date(deadline!).getTime()).toBeGreaterThan(new Date("2026-01-01T00:00:00.000Z").getTime());
  });
});