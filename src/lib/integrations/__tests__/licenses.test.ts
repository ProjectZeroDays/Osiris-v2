import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SOURCE_LICENSES,
  SHARE_ALIKE_SOURCES,
  licenseFor,
  sourceProperties,
  type SourceId,
} from "@/lib/integrations/licenses";

/**
 * The licence record.
 *
 * The licences are recorded in two places: the registry the code reads,
 * and the table a reader consults. A record of a source's terms that
 * exists in only one of them is worse than no record at all — the code
 * would answer questions the document does not, and the document would
 * promise things the code does not do.
 *
 * So the two are held together here. A source added to the code without
 * a row in the document, or a row in the document without an entry in
 * the code, fails the build.
 */

const DOC = join(process.cwd(), "docs", "LICENSES.md");
const document = readFileSync(DOC, "utf8");

describe("the licence registry", () => {
  it("knows the sources the platform reads", () => {
    expect(Object.keys(SOURCE_LICENSES).length).toBeGreaterThan(10);
  });

  it("gives every source a licence and an attribution", () => {
    for (const [id, entry] of Object.entries(SOURCE_LICENSES)) {
      expect(entry.license, id).toBeTruthy();
      expect(entry.attribution, id).toBeTruthy();
      expect(["none", "attribution", "share-alike"], id).toContain(entry.obligation);
    }
  });

  it("gives every source a place where its terms are stated", () => {
    // A source with no URL is one whose terms are not published in a
    // place a reader can be sent. There is one such source, and it says
    // so in the licence itself.
    for (const [id, entry] of Object.entries(SOURCE_LICENSES)) {
      if (entry.url) {
        expect(entry.url, id).toMatch(/^https:\/\//);
        continue;
      }
      expect(entry.license, id).toMatch(/no redistribution|Varies/i);
    }
  });

  it("flags the share-alike sources", () => {
    // These are the ones the plan warns about: a derived database may
    // inherit the licence.
    expect(SHARE_ALIKE_SOURCES).toContain("opencellid");
    expect(SHARE_ALIKE_SOURCES).toContain("osm");
    expect(SHARE_ALIKE_SOURCES).toContain("carto");
  });

  it("answers for a registered source and refuses an unknown one", () => {
    expect(licenseFor("opencellid")?.license).toBe("CC-BY-SA-4.0");
    expect(licenseFor("not-a-source")).toBeNull();
  });

  it("produces the properties a finding carries", () => {
    const props = sourceProperties("beacondb");
    expect(props.source).toBe("beacondb");
    expect(props.license).toBe("CC0-1.0");
    expect(props.shareAlike).toBe(false);
    expect(sourceProperties("opencellid").shareAlike).toBe(true);
  });

  it("refuses a source that is not registered, rather than answering with nothing", () => {
    // The type says this cannot be reached, so the test reaches it the
    // way the type system would not allow, and checks that the failure
    // is loud rather than a record with no licence on it.
    expect(() =>
      sourceProperties("not-a-source" as unknown as SourceId),
    ).toThrow(/LICENSE_UNKNOWN_SOURCE/);
  });
});

describe("the document and the registry", () => {
  it("has a row for every source in the registry", () => {
    for (const id of Object.keys(SOURCE_LICENSES)) {
      // The row is a Markdown table row whose first cell is the
      // source's id, in backticks.
      const row = document.split("\n").find((l) => l.startsWith(`| \`${id}\` |`));
      expect(row, `docs/LICENSES.md has no row for "${id}"`).toBeDefined();
    }
  });

  it("has no row for a source the registry does not know", () => {
    const rows = document
      .split("\n")
      .filter((l) => /^\| `[a-z0-9-]+` \|/.test(l))
      .map((l) => l.split("|")[1].trim().replace(/`/g, ""));
    for (const id of rows) {
      expect(
        (SOURCE_LICENSES as Record<string, unknown>)[id],
        `docs/LICENSES.md has a row for "${id}", which the registry does not know`,
      ).toBeDefined();
    }
  });

  it("states the same licence in the document as in the registry", () => {
    for (const [id, entry] of Object.entries(SOURCE_LICENSES)) {
      const row = document
        .split("\n")
        .find((l) => l.startsWith(`| \`${id}\` |`))!;
      expect(row, id).toContain(entry.license);
    }
  });

  it("marks the share-alike sources as such in the document", () => {
    for (const id of SHARE_ALIKE_SOURCES) {
      const row = document
        .split("\n")
        .find((l) => l.startsWith(`| \`${id}\` |`))!;
      expect(row, id).toMatch(/share-alike/i);
    }
  });

  it("carries the share-alike warning the plan asks for", () => {
    // The plan's warning, in the plan's terms: a derived database may
    // inherit the licence.
    expect(document).toMatch(/share-alike/i);
    expect(document).toMatch(/derived database/i);
    expect(document).toMatch(/OpenCellID/i);
    expect(document).toMatch(/OpenStreetMap|ODbL/i);
  });

  it("says how to add a source", () => {
    expect(document).toMatch(/## Adding a source/i);
    expect(document).toMatch(/SOURCE_LICENSES/);
  });
});
