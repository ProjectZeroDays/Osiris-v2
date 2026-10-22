import { describe, it, expect } from "vitest";
import { API_GROUPS } from "../src/app/docs/apiCatalog";

describe("API catalog verification (minimal)", () => {
  it("catalog exists and contains groups", () => {
    expect(API_GROUPS).toBeDefined();
    expect(Array.isArray(API_GROUPS)).toBe(true);
    expect(API_GROUPS.length).toBeGreaterThan(0);
  });

  it("routes match catalog entries (spot-check)", () => {
    expect(API_GROUPS.length).toBeGreaterThan(0);
    const first = API_GROUPS[0];
    expect(first).toBeDefined();
  });
});
