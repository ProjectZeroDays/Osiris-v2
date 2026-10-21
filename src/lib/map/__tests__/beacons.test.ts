import { describe, it, expect } from "vitest";
import { BEACONS, beaconStyle, LIVE_BEACON_KINDS, ATTRIBUTION_LABEL } from "@/lib/map/beacons";
import { beaconSvg, beaconDataUrl, beaconSpriteId } from "@/lib/map/beacon-sprites";
import {
  POPUP_SCHEMAS,
  popupSchema,
  formatPopupValue,
} from "@/lib/map/popup-schemas";

describe("beacons", () => {
  it("registers the documented kinds", () => {
    for (const kind of [
      "flock-camera", "drone", "drone-operator", "surveillance",
      "wifi-ap", "plate-hit", "camera-feed",
    ]) {
      expect(BEACONS[kind]).toBeDefined();
    }
  });

  it("gives every kind a shape, a colour and a label", () => {
    for (const [kind, style] of Object.entries(BEACONS)) {
      expect(style.shape, kind).toBeTruthy();
      expect(style.color, kind).toMatch(/^#[0-9a-f]{6}$/i);
      expect(style.label, kind).toBeTruthy();
      expect(style.size, kind).toBeGreaterThan(0);
    }
  });

  it("marks the live kinds as pulsing", () => {
    expect(LIVE_BEACON_KINDS).toContain("drone");
    expect(BEACONS.drone.pulse).toBe(true);
  });

  it("returns null for an unregistered kind", () => {
    expect(beaconStyle("not-a-kind")).toBeNull();
  });

  it("labels every attribution tier", () => {
    expect(ATTRIBUTION_LABEL.heuristic).toBe("Heuristic");
    expect(ATTRIBUTION_LABEL.confirmed).toBe("Confirmed");
  });
});

describe("beacon sprites", () => {
  it("draws every shape as a path", () => {
    for (const [kind, style] of Object.entries(BEACONS)) {
      const svg = beaconSvg(style);
      expect(svg, kind).toContain("<path");
      expect(svg, kind).toContain(style.color);
      expect(svg, kind).toContain(`viewBox="0 0 ${style.size} ${style.size}"`);
    }
  });

  it("produces a base64 data url", () => {
    const url = beaconDataUrl(BEACONS.drone);
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(url.length).toBeGreaterThan(50);
  });

  it("names the sprite after its kind", () => {
    expect(beaconSpriteId("drone")).toBe("beacon-drone");
  });
});

describe("popup schemas", () => {
  it("has a schema for each documented kind", () => {
    for (const kind of [
      "flock-camera", "drone", "wifi-ap", "plate-hit", "surveillance",
    ]) {
      expect(POPUP_SCHEMAS[kind], kind).toBeDefined();
    }
  });

  it("returns null for a kind with no card", () => {
    expect(popupSchema("not-a-kind")).toBeNull();
  });

  it("titles a flock camera by its vendor", () => {
    const s = POPUP_SCHEMAS["flock-camera"];
    expect(s.title({ vendor: "Flock" })).toBe("Flock");
    expect(s.title({})).toBe("Unknown camera");
  });

  it("shows a missing value as a dash", () => {
    expect(formatPopupValue(undefined)).toBe("—");
    expect(formatPopupValue(null)).toBe("—");
    expect(formatPopupValue("")).toBe("—");
  });

  it("formats a confidence as a percentage", () => {
    expect(formatPopupValue(0.8, "pct")).toBe("80%");
    expect(formatPopupValue(80, "pct")).toBe("80%");
  });

  it("formats a coordinate pair", () => {
    expect(formatPopupValue({ lat: 51.5, lon: -0.12 }, "coord")).toBe("51.50000, -0.12000");
    expect(formatPopupValue({ lat: "x", lon: 0 }, "coord")).toBe("—");
  });

  it("formats a date as UTC", () => {
    const out = formatPopupValue("2026-01-02T03:04:05.000Z", "date");
    expect(out.startsWith("2026-01-02 03:04:05")).toBe(true);
  });

  it("leaves a bad date as it was given", () => {
    expect(formatPopupValue("not a date", "date")).toBe("not a date");
  });
});
