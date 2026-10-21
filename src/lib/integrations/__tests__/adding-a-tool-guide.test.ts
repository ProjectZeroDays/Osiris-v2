import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guide for adding a tool.
 *
 * A guide that names files that have been moved, or steps that have
 * been renamed, is worse than no guide: it is followed, and it does not
 * work. So the guide is held to the code — every path it names has to
 * exist, and every part of the platform it says a tool needs has to be
 * named.
 */

const GUIDE = join(process.cwd(), "docs", "ADDING-A-TOOL.md");
const guide = readFileSync(GUIDE, "utf8");

/**
 * The paths the guide names, as they appear in the text.
 *
 * The guide's own example tool is called `my-tool`, and the paths built
 * from it are examples rather than references. They are left out: the
 * check is that the guide points at files that are there, and a
 * placeholder is not a pointer.
 */
function pathsMentioned(): string[] {
  const found = new Set<string>();
  const pattern = /`((?:src|docs|intel|electron-app|android-app)\/[A-Za-z0-9_./[\]-]+\.(?:ts|tsx|py|kt|md|sql|js))`/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(guide)) !== null) {
    if (m[1].includes("my-tool")) continue;
    found.add(m[1]);
  }
  return [...found];
}

describe("the guide for adding a tool", () => {
  it("names only files that exist", () => {
    const missing = pathsMentioned().filter((p) => !existsSync(join(process.cwd(), p)));
    expect(missing, `the guide names files that do not exist: ${missing.join(", ")}`).toEqual([]);
  });

  it("names the manifest", () => {
    expect(guide).toContain("src/config/security-tools.ts");
    expect(guide).toContain("SECURITY_TOOL_CARDS");
  });

  it("names the capability allowlist, and says it is the boundary", () => {
    expect(guide).toContain("src/lib/integrations/capabilities.server.ts");
    expect(guide).toContain("SAFE_CAPABILITIES");
    expect(guide).toMatch(/deny by default/i);
  });

  it("names the dispatcher and the order of its checks", () => {
    expect(guide).toContain("src/app/api/integrations/[tool]/[action]/route.ts");
    // The order is the security property, so the guide states it.
    expect(guide).toMatch(/allowlist/i);
    expect(guide).toMatch(/consent/i);
    expect(guide).toMatch(/quota/i);
    expect(guide).toMatch(/audit/i);
  });

  it("names the window registry and the beacon and popup registries", () => {
    expect(guide).toContain("src/components/tools/registry.tsx");
    expect(guide).toContain("TOOL_WINDOWS");
    expect(guide).toContain("src/lib/map/beacons.ts");
    expect(guide).toContain("src/lib/map/popup-schemas.ts");
  });

  it("names the tests a new tool has to pass", () => {
    expect(guide).toContain("src/lib/integrations/__tests__/manifest.test.ts");
    expect(guide).toContain("src/lib/integrations/__tests__/capabilities.test.ts");
    expect(guide).toContain("src/lib/integrations/__tests__/adapters.test.ts");
  });

  it("says the finding must name its source and carry its licence", () => {
    expect(guide).toContain("src/lib/integrations/licenses.ts");
    expect(guide).toContain("sourceAttribution");
    expect(guide).toContain("shareAlike");
  });

  it("carries the checklist the plan asks for", () => {
    expect(guide).toMatch(/## The checklist/i);
    for (const item of [
      "renders with the correct state",
      "icon exists",
      "window opens and works",
      "beacon kind has a style and a popup schema",
      "capabilities are allowlisted",
      "tests pass",
    ]) {
      expect(guide.toLowerCase(), item).toContain(item.toLowerCase());
    }
  });

  it("says what is not negotiable", () => {
    expect(guide).toMatch(/## What is not negotiable/i);
    expect(guide).toMatch(/no generic runner/i);
    expect(guide).toMatch(/no in-process execution/i);
  });
});
