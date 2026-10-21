import type { BeaconStyle } from "./beacons";

/**
 * Beacon sprites, generated rather than shipped.
 *
 * A marker that can be drawn is a marker that can be re-coloured, resized
 * and added to without an image file ever entering the repository. The
 * sprite is a data URL the map registers as an image at start-up.
 */

const PATHS: Record<BeaconStyle["shape"], (size: number) => string> = {
  pin: (s) => {
    const h = s / 2;
    return `M${h} 0 L${s} ${s * 0.7} L${h} ${s} L0 ${s * 0.7} Z`;
  },
  circle: (s) => {
    const h = s / 2;
    return `M${h} 0 A${h} ${h} 0 1 1 ${h - 0.01} 0 Z`;
  },
  diamond: (s) => {
    const h = s / 2;
    return `M${h} 0 L${s} ${h} L${h} ${s} L0 ${h} Z`;
  },
  hex: (s) => {
    const h = s / 2;
    return `M${h * 0.5} 0 L${h * 1.5} 0 L${s} ${h} L${h * 1.5} ${s} L${h * 0.5} ${s} L0 ${h} Z`;
  },
  triangle: (s) => `M${s / 2} 0 L${s} ${s} L0 ${s} Z`,
  square: (s) => `M0 0 H${s} V${s} H0 Z`,
};

/** The SVG for one beacon style. */
export function beaconSvg(style: BeaconStyle): string {
  const { shape, color, glow, size } = style;
  const d = PATHS[shape](size);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<path d="${d}" fill="${color}" stroke="${glow ?? color}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

/** The sprite id the map knows a beacon kind by. */
export function beaconSpriteId(kind: string): string {
  return `beacon-${kind}`;
}

/** The data URL for a beacon sprite. */
export function beaconDataUrl(style: BeaconStyle): string {
  const svg = beaconSvg(style);
  // btoa wants latin1; the SVG is ASCII, but encodeURIComponent is the
  // safe way to get UTF-8 bytes into the base64 payload.
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** The minimal surface of a MapLibre map that sprite registration needs. */
export interface BeaconMap {
  hasImage(id: string): boolean;
  addImage(id: string, image: { width: number; height: number }, options?: { pixelRatio?: number }): void;
  on(type: "load", listener: () => void): void;
}

/**
 * Register every beacon sprite on the map.
 *
 * The images are added when the map has loaded, and a kind already present
 * is left alone — a map that re-registers after a style change must not
 * throw on a duplicate.
 */
export function registerBeaconSprites(
  map: BeaconMap,
  beacons: Record<string, BeaconStyle>,
  onReady?: () => void,
): void {
  const add = () => {
    for (const [kind, style] of Object.entries(beacons)) {
      const id = beaconSpriteId(kind);
      if (map.hasImage(id)) continue;
      const image = new Image(style.size * 2, style.size * 2);
      image.onload = () => {
        try {
          map.addImage(id, image, { pixelRatio: 2 });
        } catch {
          /* a duplicate add is not worth failing the map over */
        }
      };
      image.src = beaconDataUrl(style);
    }
    onReady?.();
  };

  if (typeof (globalThis as { Image?: unknown }).Image === "undefined") {
    // No DOM: the caller is server-side or in a test, and there is nothing
    // to register against.
    return;
  }
  map.on("load", add);
}
