import type { AddProtocolAction } from 'maplibre-gl';

let installed = false;

/** Registers the pmtiles:// URL protocol so MapLibre can load tiles
 *  directly from the PMTiles archive served by /api/pmtiles. */
export function installPmtilesProtocol(addProtocol: (name: string, handler: AddProtocolAction) => void) {
  if (installed) return;
  installed = true;

  addProtocol('pmtiles', async (request, controller) => {
    // The identifier is like pmtiles://filename.pmtiles or pmtiles://filename
    const urlStr = request.url;
    // Extract filename and any z/x/y tile parameters from the URL
    const match = /^pmtiles:\/\/([^\/]+)(?:\/(\d+)(?:\/(\d+)(?:\/(\d+))?)?)?$/.exec(urlStr);
    if (!match) {
      throw new Error(`Invalid pmtiles URL: ${urlStr}`);
    }
    const filename = match[1];
    const z = match[2] ? parseInt(match[2], 10) : null;
    const x = match[3] ? parseInt(match[3], 10) : null;
    const y = match[4] ? parseInt(match[4], 10) : null;

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    let apiUrl: string;
    if (z !== null && x !== null && y !== null) {
      apiUrl = `${baseUrl}/api/pmtiles/${encodeURIComponent(filename)}?z=${z}&x=${x}&y=${y}`;
    } else {
      apiUrl = `${baseUrl}/api/pmtiles/${encodeURIComponent(filename)}`;
    }

    const res = await fetch(apiUrl, { signal: controller.signal, cache: 'force-cache', credentials: 'omit' });
    if (!res.ok && res.status !== 204) {
      throw new Error(`PMTiles tile fetch failed: ${res.status}`);
    }

    // For tile requests, return the binary data
    if (z !== null && x !== null && y !== null) {
      if (res.status === 204) {
        return { data: null, cacheControl: 'max-age=3600, immutable' };
      }
      const data = await res.arrayBuffer();
      return { data, cacheControl: 'max-age=3600, immutable' };
    }

    // For metadata/non-tile requests, return empty data
    return { data: null, cacheControl: 'max-age=3600' };
  });
}
