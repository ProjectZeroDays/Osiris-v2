import { describe, it, expect } from "vitest";
import {
  alertFamily,
  classifyCategory,
  parseXmlCap,
  centroidOf,
  capFindings,
  CAP_SOURCE_IDS,
  type CapAlert,
} from "@/lib/integrations/adapters/alerts/cap.server";
import {
  classifyService,
  isAllowedStreamHost,
} from "@/lib/integrations/adapters/scanner-feeds.server";
import {
  classifySeverity,
} from "@/lib/integrations/adapters/police-reports.server";
import { ingestCellScan } from "@/lib/integrations/adapters/imsi-catcher.server";
import { BEACONS } from "@/lib/map/beacons";
import { POPUP_SCHEMAS } from "@/lib/map/popup-schemas";

const ctx = { tenantId: "t", actorId: "a", signal: AbortSignal.timeout(5000) };

describe("CAP alerts", () => {
  it("knows its sources", () => {
    expect(CAP_SOURCE_IDS).toEqual(["nws", "ipaws", "state"]);
  });

  it("separates the alert families by event name", () => {
    expect(alertFamily("Child Abduction Emergency")).toBe("amber");
    expect(alertFamily("Missing Vulnerable Adult")).toBe("silver");
    expect(alertFamily("Blue Alert")).toBe("blue");
    expect(alertFamily("Severe Thunderstorm Warning")).toBe("cap");
  });

  it("classifies a category it does not know as Other", () => {
    expect(classifyCategory("Geo")).toBe("Geo");
    expect(classifyCategory("Nonsense")).toBe("Other");
    expect(classifyCategory("")).toBe("Other");
  });

  it("reads a CAP 1.2 document", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>urn:uuid:abc-123</identifier>
  <sender>w-nws.webmaster@noaa.gov</sender>
  <sent>2026-01-02T03:04:05-06:00</sent>
  <status>Actual</status>
  <msgType>Alert</msgType>
  <info>
    <category>Safety</category>
    <event>Child Abduction Emergency</event>
    <urgency>Immediate</urgency>
    <severity>Extreme</severity>
    <certainty>Observed</certainty>
    <headline>Child Abduction Emergency</headline>
    <description>An Amber Alert has been issued.</description>
    <instruction>Call 911.</instruction>
    <areaDesc>Travis County</areaDesc>
    <onset>2026-01-02T03:00:00-06:00</onset>
    <expires>2026-01-02T06:00:00-06:00</expires>
    <point><lat>30.2672</lat><lon>-97.7431</lon></point>
  </info>
</alert>`;

    const alerts = parseXmlCap(xml, {
      label: "NWS", url: "https://api.weather.gov/alerts/active",
      format: "geojson", license: "Public domain", attribution: "NOAA / National Weather Service",
    }, "nws");

    expect(alerts).toHaveLength(1);
    expect(alerts[0].event).toBe("Child Abduction Emergency");
    expect(alerts[0].severity).toBe("Extreme");
    expect(alerts[0].areaDesc).toBe("Travis County");
    expect(alerts[0].lat).toBeCloseTo(30.2672);
    expect(alerts[0].lon).toBeCloseTo(-97.7431);
    expect(alertFamily(alerts[0].event)).toBe("amber");
  });

  it("does not mistake a document without a point for a position", () => {
    const xml = `<alert><info><event>Alert</event><headline>x</headline></info></alert>`;
    const alerts = parseXmlCap(xml, {
      label: "NWS", url: "x", format: "cap",
      license: "Public domain", attribution: "NOAA / National Weather Service",
    }, "nws");
    expect(alerts[0].lat).toBe(0);
    expect(alerts[0].lon).toBe(0);
  });

  it("takes the centroid of a polygon", () => {
    const c = centroidOf({
      type: "Polygon",
      coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]],
    });
    // The ring is five points, so the mean is four rather than five.
    expect(c![0]).toBeCloseTo(4);
    expect(c![1]).toBeCloseTo(4);
  });

  it("returns null for a geometry it cannot place", () => {
    expect(centroidOf({ type: "LineString", coordinates: [] })).toBeNull();
    expect(centroidOf(null)).toBeNull();
  });
});

describe("CAP alerts as findings", () => {
  /** One alert, as the parser would have produced it. */
  const alert = (over: Partial<CapAlert> = {}): CapAlert => ({
    id: "urn:uuid:alert-1",
    source: "nws",
    identifier: "alert-1",
    sender: "NWS",
    sent: "2026-01-02T09:00:00Z",
    status: "Actual",
    msgType: "Alert",
    event: "Child Abduction Emergency",
    category: "Geo",
    urgency: "Immediate",
    severity: "Extreme",
    certainty: "Observed",
    headline: "Child Abduction Emergency",
    description: "Police are searching for a missing child.",
    instruction: "Call 911 if you see them.",
    areaDesc: "Travis County",
    lat: 30.2672,
    lon: -97.7431,
    onset: null,
    expires: null,
    sourceUrl: null,
    sourceAttribution: "NOAA / National Weather Service",
    license: "Public domain",
    ...over,
  });

  it("turns an alert into a finding, so it can be kept and drawn", () => {
    // The gap this covers: the alert families and their cards existed,
    // but nothing produced a finding, so nothing ever reached the map
    // and nothing was ever kept. An alert that is only in the response
    // is an alert that is only in the response.
    const findings = capFindings([alert()], "nws");
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe("cap:nws:alert-1");
    expect(findings[0].toolId).toBe("scanner-feeds");
    expect(findings[0].status).toBe("observed");
    expect(findings[0].severity).toBe("critical");
  });

  it("does not double the prefix on the id", () => {
    // The parser already prefixes the alert's id with the source, and
    // the finding's id is built from the identifier rather than the
    // alert's id, so it is prefixed exactly once.
    const findings = capFindings([alert({ id: "cap:nws:urn:oid:1" })], "nws");
    expect(findings[0].id).toBe("cap:nws:alert-1");
    expect(findings[0].id.match(/cap:nws:/g)).toHaveLength(1);
  });

  it("gives the alert the beacon kind its family calls for", () => {
    const kind = capFindings([alert()], "nws")[0].properties.kind;
    expect(kind).toBe("amber-alert");
    expect(capFindings([alert({ event: "Severe Thunderstorm Warning" })], "nws")[0]
      .properties.kind).toBe("cap-alert");
    expect(capFindings([alert({ event: "Missing Vulnerable Adult" })], "nws")[0]
      .properties.kind).toBe("silver-alert");
    expect(capFindings([alert({ event: "Blue Alert" })], "nws")[0]
      .properties.kind).toBe("blue-alert");
  });

  it("gives every alert it produces a beacon and a card that exist", () => {
    // A kind with no registered beacon is a marker that means nothing,
    // and a kind with no card is a marker nobody can read.
    for (const event of [
      "Child Abduction Emergency",
      "Missing Vulnerable Adult",
      "Blue Alert",
      "Severe Thunderstorm Warning",
    ]) {
      const finding = capFindings([alert({ event })], "nws")[0];
      const kind = finding.properties.kind as string;
      expect(BEACONS[kind], kind).toBeDefined();
      expect(POPUP_SCHEMAS[kind], kind).toBeDefined();
    }
  });

  it("records the source and its terms on the finding", () => {
    const p = capFindings([alert()], "nws")[0].properties;
    expect(p.source).toBe("nws");
    expect(p.license).toBe("Public domain");
    expect(p.sourceAttribution).toBe("NOAA / National Weather Service");
    expect(p.shareAlike).toBe(false);
  });

  it("gives the marker a title a reader can use", () => {
    // The map's marker says the title. Without one it would say the
    // tool's id, which tells a reader nothing about the alert.
    const p = capFindings([alert()], "nws")[0].properties;
    expect(p.title).toBe("Child Abduction Emergency");
  });

  it("leaves out an alert with nowhere to put it", () => {
    // An alert with no place on the map is not a beacon. A finding
    // without coordinates would be a row the map tries to draw at the
    // origin, which is in the Gulf of Guinea.
    const findings = capFindings([alert({ lat: 0, lon: 0 })], "nws");
    expect(findings).toHaveLength(0);
  });
});

describe("scanner feeds", () => {
  it("classifies the service from what the directory says", () => {
    expect(classifyService("County Police")).toBe("police");
    expect(classifyService("Fire Dispatch")).toBe("fire");
    expect(classifyService("EMS")).toBe("ems");
    expect(classifyService("Railway")).toBe("rail");
    expect(classifyService(undefined)).toBe("other");
  });

  it("allows only the known radio hosts", () => {
    expect(isAllowedStreamHost("https://api.openmhz.com/123/stream")).toBe(true);
    expect(isAllowedStreamHost("https://evil.example.com/stream")).toBe(false);
    expect(isAllowedStreamHost("not a url")).toBe(false);
  });
});

describe("police incidents", () => {
  it("reads the severity from the report's own label", () => {
    expect(classifySeverity("HOMICIDE")).toBe("critical");
    expect(classifySeverity("BURGLARY")).toBe("high");
    expect(classifySeverity("THEFT")).toBe("medium");
    expect(classifySeverity("NOISE COMPLAINT")).toBe("low");
  });
});

describe("cell anomalies", () => {
  it("flags a 2G serving cell as a heuristic, not a detection", async () => {
    const { anomalies, findings } = await ingestCellScan(
      {
        observations: [
          { mcc: 310, mnc: 260, lac: 1234, cid: 5678, lat: 30.2, lon: -97.7, radio: "GSM", observedAt: "2026-01-01T00:00:00Z" },
        ],
      },
      ctx,
    );
    expect(anomalies.some((a) => a.kind === "2g-downgrade")).toBe(true);
    expect(findings[0].status).toBe("inferred");
    expect(findings[0].confidence).toBeLessThanOrEqual(0.6);
  });

  it("flags an unusually strong signal", async () => {
    const { anomalies } = await ingestCellScan(
      {
        observations: [
          { mcc: 310, mnc: 260, lac: 1, cid: 2, lat: 30.2, lon: -97.7, radio: "LTE", signal: -40, observedAt: "2026-01-01T00:00:00Z" },
        ],
      },
      ctx,
    );
    expect(anomalies.some((a) => a.kind === "power-anomaly")).toBe(true);
  });

  it("leaves an ordinary observation alone", async () => {
    const { anomalies } = await ingestCellScan(
      {
        observations: [
          { mcc: 310, mnc: 260, lac: 1, cid: 2, lat: 30.2, lon: -97.7, radio: "LTE", signal: -95, observedAt: "2026-01-01T00:00:00Z" },
        ],
      },
      ctx,
    );
    expect(anomalies).toHaveLength(0);
  });

  it("rejects an observation with no position", async () => {
    const { findings } = await ingestCellScan(
      {
        observations: [
          { mcc: 310, mnc: 260, lac: 1, cid: 2, lat: Number.NaN, lon: 0, radio: "GSM", observedAt: "2026-01-01T00:00:00Z" },
        ],
      },
      ctx,
    );
    expect(findings).toHaveLength(0);
  });
});
