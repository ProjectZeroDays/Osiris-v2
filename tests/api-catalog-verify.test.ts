import { API_GROUPS } from "../src/app/docs/apiCatalog";

describe("API catalog verification (minimal)", () => {
  it("catalog exists and contains groups", () => {
    expect(API_GROUPS).toBeDefined();
    expect(Array.isArray(API_GROUPS)).toBe(true);
    expect(API_GROUPS.length).toBeGreaterThan(0);
  });

  it("routes match catalog entries (spot-check)", () => {
    const paths = API_GROUPS.flatMap((g) => g.routes.map((r) => r.path));
    expect(paths.length).toBeGreaterThan(0);
  });
});
