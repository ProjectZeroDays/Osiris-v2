import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The wiki's index.
 *
 * An index that names a page that has been renamed, or a file that has
 * been moved, is the one page a reader is guaranteed to read — and the
 * one they are most likely to be sent away by.
 *
 * So the index is held to the pages it names, the same way the
 * adding-a-tool guide is held to the code.
 */

const ROOT = process.cwd();
const INDEX = join(ROOT, "docs", "README.md");
const index = readFileSync(INDEX, "utf8");

/** The local links the index makes, as `{ path, anchor }`. */
function localLinks(): { path: string; anchor: string | null }[] {
  const found = new Map<string, string | null>();
  const pattern = /\]\(([^)#][^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(index)) !== null) {
    const link = m[1];
    if (link.startsWith("http")) continue;
    const hash = link.indexOf("#");
    const target = hash >= 0 ? link.slice(0, hash) : link;
    const anchor = hash >= 0 ? link.slice(hash + 1) : null;
    const path = target.startsWith("/")
      ? target.slice(1)
      : join("docs", target).replace(/\\/g, "/");
    found.set(path, anchor);
  }
  return [...found].map(([path, anchor]) => ({ path, anchor }));
}

/** The heading a GitHub anchor names, from a Markdown heading. */
function anchorOf(heading: string): string {
  return heading
    .replace(/^#+\s*/, "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

describe("the wiki index", () => {
  it("names only pages that exist", () => {
    const missing = localLinks()
      .filter((l) => !existsSync(join(ROOT, l.path)))
      .map((l) => l.path);
    expect(
      missing,
      `the index names pages that do not exist: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("points at headings that exist", () => {
    // An anchor that goes nowhere is a link that lands the reader on the
    // top of a page, looking for a heading that is not there.
    const broken: string[] = [];
    for (const { path, anchor } of localLinks()) {
      if (!anchor) continue;
      const file = join(ROOT, path);
      if (!existsSync(file)) continue;
      const headings = readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => /^#{1,6}\s/.test(l))
        .map(anchorOf);
      if (!headings.includes(anchor)) broken.push(`${path}#${anchor}`);
    }
    expect(
      broken,
      `the index points at headings that do not exist: ${broken.join(", ")}`,
    ).toEqual([]);
  });

  it("points at every page in the wiki", () => {
    // A page that exists and is not in the index is a page nobody
    // finds. The index is the way in, so a page not in it is a page
    // that is not really there.
    const pages = [
      "docs/ADDING-A-TOOL.md",
      "docs/LICENSES.md",
      "docs/ROADMAP.md",
      "docs/TROUBLESHOOTING.md",
      "docs/GAP-ANALYSIS.md",
      "docs/RELEASE-DOCS.md",
    ];
    const linked = new Set(localLinks().map((l) => l.path));
    for (const page of pages) {
      expect(linked.has(page), `the index does not point at ${page}`).toBe(true);
    }
  });

  it("says what each page is for", () => {
    // An index of links is a list. An index that says when you would
    // want each page is a way in.
    for (const heading of [
      "If you are deploying it",
      "If you are operating it",
      "If you are changing it",
      "If you are deciding what to build next",
    ]) {
      expect(index, heading).toContain(heading);
    }
  });

  it("points at the project's own documents too", () => {
    // The wiki is part of the repository, not a separate site, and the
    // top-level documents are part of it.
    for (const page of ["BUILD.md", "DOCKER.md", "CI_CD_SETUP.md", "SECURITY.md", "GOAL.md", "PROGRESS.md"]) {
      expect(index, page).toContain(page);
    }
  });

  it("states the rules the pages keep coming back to", () => {
    expect(index).toMatch(/deny by default/i);
    expect(index).toMatch(/never trust the client/i);
    expect(index).toMatch(/validate at every boundary/i);
  });
});
