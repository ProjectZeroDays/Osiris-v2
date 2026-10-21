/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — API Catalog
 *  Machine-readable description of every public route under /api.
 *  Kept in sync by hand with src/app/api/ * /route.ts
 * ═══════════════════════════════════════════════════════════════
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface ApiParam {
  name: string;
  required?: boolean;
  desc: string;
  example?: string;
}

export interface ApiEndpoint {
  /** Path relative to the deployment origin, e.g. `/api/flights` */
  path: string;
  method: HttpMethod | HttpMethod[];
  summary: string;
  /** Query-string parameters (GET) */
  params?: ApiParam[];
  /** Top-level keys present on a 2xx response */
  returns: string[];
  /** Free-form notes: caching, auth, upstream source, failure modes */
  notes?: string;
  /** Environment variables the route reads */
  env?: string[];
  /** Pretty-printed JSON request body, for POST routes */
  bodyExample?: string;
  /** True when the route needs a credential the docs cannot supply */
  requiresAuth?: boolean;
  /** Request headers the route reads, shown in the snippets with placeholder values */
  headers?: Record<string, string>;
}

/** Stable DOM id / deep-link anchor for an endpoint. */
export function endpointId(ep: ApiEndpoint): string {
  const method = Array.isArray(ep.method) ? ep.method[0] : ep.method;
  return `ep-${method}-${ep.path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`.toLowerCase();
}

/** Example request URL with required params filled from their documented examples. */
export function sampleUrl(ep: ApiEndpoint, origin = ''): string {
  const qs = (ep.params || [])
    .filter(p => p.required || p.example)
    .map(p => `${p.name}=${encodeURIComponent((p.example || '').split(' | ')[0] || 'value')}`)
    .join('&');
  return `${origin}${ep.path}${qs ? `?${qs}` : ''}`;
}

export interface ApiGroup {
  id: string;
  title: string;
  blurb: string;
  endpoints: ApiEndpoint[];
}

export const API_GROUPS: ApiGroup[] = [
  {
    id: 'system',
    title: 'System',
    blurb: 'Liveness and aggregate counters. Safe to poll from monitoring.',
    endpoints: [
      {
        path: '/api/health',
        method: 'GET',
        summary: 'Liveness probe. Never touches an upstream feed, so it stays fast under load.',
        returns: [
          'status',
          'scope',
          'checks_performed',
          'detail',
          'platform',
          'version',
          'uptime_seconds',
          'surface',
          'nominatim',
          'timestamp',
        ],
        notes:
          '`status` is the literal string `serving`, and `scope` is `process`: the endpoint reports that the process is up and that it checked nothing else, so a monitor cannot read it as "the data is flowing". `surface` says what a client will meet — whether the tool registry is open or closed behind a session, and whether the platform has accounts to sign in as at all.',
      },
      {
        path: '/api/ready',
        method: 'GET',
        summary: 'Readiness probe. Says whether this instance can take traffic, and why not.',
        returns: ['ok', 'ready', 'service', 'scope', 'checks', 'blockers', 'detail', 'at'],
        notes:
          'The other half of `/api/health`, and the reason they are separate: liveness says the process is up, readiness says whether it can serve. A database that is unreachable, migrations that were never applied, or a platform with no account anybody can sign in as is up and useless - a load balancer that only knows liveness sends it traffic anyway, and the error then arrives in front of a user rather than an operator. Answers without a session, because a probe cannot sign in. 503 while not ready: a load balancer reads the status code, and a body it has to parse is a body it might not read.',
      },
      {
        path: '/api/stats',
        method: 'GET',
        summary:
          'Fans out to the heavy feeds in parallel and returns only the counts — roughly 100 bytes instead of 10 MB of GeoJSON.',
        returns: ['stats', 'timestamp'],
        notes:
          '`stats` contains `flights`, `sats`, `cctv`, `weather`, `nuclear`, `incidents`. Cached `s-maxage=30, stale-while-revalidate=60`, so 10k concurrent dashboard boots collapse into one upstream fetch per minute.',
      },
    ],
  },
  {
    id: 'aviation-space',
    title: 'Aviation & Space',
    blurb: 'Aircraft, orbital objects, and heliophysics.',
    endpoints: [
      {
        path: '/api/flights',
        method: 'GET',
        summary: 'Live ADS-B aircraft, bucketed by class.',
        returns: ['commercial_flights', 'private_flights', 'private_jets', 'military_flights', 'source'],
        notes:
          'Keyless via adsb.lol. Each bucket is an array; sum them for a total. `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` are reserved for higher rate limits and are not required. OpenSky is metered in credits, and each call it answers for is recorded as an `opensky-credit` in /api/integrations/costs under `flights`, so an operator can see what the refresh has spent.',
      },
      {
        path: '/api/satellites',
        method: 'GET',
        summary: 'Tracked orbital objects with TLE-derived positions.',
        returns: ['satellites', 'total', 'category_counts', 'raw_count', 'timestamp'],
        notes: 'Sourced from celestrak.org. `category_counts` breaks the set down by mission type.',
      },
      {
        path: '/api/satellites/orbit',
        method: 'GET',
        summary: "One satellite's full orbit track, sampled from the same TLE as its map position.",
        params: [{ name: 'id', required: true, desc: 'Norad catalog id of the satellite.' }],
        returns: ['track', 'total', 'timestamp'],
        notes:
          'Served on demand rather than bundled into /api/satellites, so the track passes through the satellite rather than near it.',
      },
      {
        path: '/api/aircraft',
        method: 'GET',
        summary: 'Aircraft identity and the track it actually flew, not a straight line between two airports.',
        params: [{ name: 'icao24', required: true, desc: 'ICAO 24-bit address of the aircraft.' }],
        returns: ['aircraft', 'track', 'source', 'timestamp'],
        notes:
          'The live feed only carries what the transponder broadcasts, so `model` arrives as "Unknown" or a bare ICAO type code for most airliners.',
      },
      {
        path: '/api/flight-route',
        method: 'GET',
        summary: 'Resolves a callsign or ICAO24 to its origin and destination airports.',
        params: [{ name: 'callsign', desc: 'Flight callsign, e.g. `UAL123`.' }, { name: 'icao24', desc: 'ICAO 24-bit address. Use instead of or with `callsign`.' }],
        returns: ['origin', 'destination', 'source', 'timestamp'],
        notes: 'Several sources are raced and the first valid answer wins.',
      },
      {
        path: '/api/space-weather',
        method: 'GET',
        summary: 'Geomagnetic conditions and solar flare activity from NOAA SWPC.',
        returns: [
          'kp_index',
          'kp_available',
          'kp_timestamp',
          'storm_level',
          'storm_color',
          'solar_flares',
          'alerts',
          'timestamp',
        ],
        notes:
          '`storm_color` is a hex string the HUD renders directly, so clients need no severity lookup table. `kp_index` is null and `storm_level` is "Unknown" when NOAA did not answer — absence of a reading is never reported as "Quiet".',
      },
    ],
  },
  {
    id: 'earth',
    title: 'Earth & Environment',
    blurb: 'Seismic, fire, atmospheric, and orbital-imagery feeds.',
    endpoints: [
      {
        path: '/api/earthquakes',
        method: 'GET',
        summary: 'Recent seismic events from the USGS feed.',
        returns: ['earthquakes', 'total', 'timestamp'],
        notes: 'M2.5+ over the trailing day. Each event carries `magnitude`, `place`, `depth`, `time`, `tsunami`, `alert`.',
      },
      {
        path: '/api/fires',
        method: 'GET',
        summary: 'Active wildfire hotspots from NASA FIRMS.',
        returns: ['fires', 'total', 'source', 'timestamp'],
        env: ['FIRMS_API_KEY'],
        notes: 'Uses the keyless FIRMS CSV by default; the key only matters if you switch to the per-area API.',
      },
      {
        path: '/api/weather',
        method: 'GET',
        summary: 'Severe weather and natural events from NASA EONET.',
        returns: ['events', 'total', 'timestamp'],
      },
      {
        path: '/api/air-quality',
        method: 'GET',
        summary: 'Ground station air quality readings.',
        returns: ['stations', 'total', 'timestamp'],
      },
      {
        path: '/api/radar',
        method: 'GET',
        summary: 'GPS interference and navigation outage reporting.',
        returns: ['outages', 'total', 'source', 'timestamp'],
      },
      {
        path: '/api/sentinel',
        method: 'GET',
        summary: 'Sentinel satellite imagery scenes covering a point.',
        params: [
          { name: 'lat', required: true, desc: 'Latitude of the point of interest.', example: '51.5072' },
          { name: 'lng', required: true, desc: 'Longitude of the point of interest.', example: '-0.1276' },
          { name: 'radius', desc: 'Search radius in kilometres.', example: '50' },
          { name: 'days', desc: 'How far back to search, in days.', example: '30' },
        ],
        returns: ['scenes', 'timestamp'],
      },
    ],
  },
  {
    id: 'geopolitical',
    title: 'Geopolitical',
    blurb: 'Conflict zones, frontlines, event streams, and country-level risk.',
    endpoints: [
      {
        path: '/api/conflicts',
        method: 'GET',
        summary: 'Active conflict zones joined with live incident reporting.',
        returns: [
          'zones',
          'activeWarzones',
          'liveEvents',
          'totalZones',
          'totalLiveEvents',
          'sources',
          'refreshInterval',
          'timestamp',
        ],
        notes: '`refreshInterval` is the server’s recommended client poll interval in milliseconds — honour it rather than hard-coding your own.',
      },
      {
        path: '/api/frontlines',
        method: 'GET',
        summary: 'Frontline geometry for active theatres.',
        returns: ['frontlines', 'timestamp'],
      },
      {
        path: '/api/gdelt',
        method: 'GET',
        summary: 'Disaster alerts from GDACS — earthquakes, storms, floods and wildfires, geocoded.',
        returns: ['events', 'total', 'source', 'timestamp'],
        notes:
          'Despite the name, this route reads GDACS. The GDELT event records live at `/api/gdelt-events`.',
      },
      {
        path: '/api/gdelt-events',
        method: 'GET',
        summary: 'GDELT 2.0 event records with ActionGeo coordinates, refreshed on a 15-minute export.',
        params: [
          { name: 'query', desc: 'Keyword filter applied to the event records.' },
          { name: 'limit', desc: 'Maximum results to return.', example: '50' },
        ],
        returns: ['events', 'total', 'source', 'timestamp'],
        notes: 'Free, no auth required. This is the route that actually reads GDELT.',
      },
      {
        path: '/api/country-risk',
        method: 'GET',
        summary: 'Per-country risk scoring alongside market session state.',
        returns: ['countries', 'methodology', 'exchanges', 'open_exchanges', 'total_exchanges', 'timestamp'],
        notes:
          '`base_risk` is a hand-assigned editorial ordering, not a calibrated or back-tested figure — `methodology.basis` says so on every response. `quake_magnitude` is the observed USGS component, reported separately so the two are not conflated.',
      },
      {
        path: '/api/region-dossier',
        method: 'GET',
        summary: 'Composite intelligence summary for a map location — the panel behind a map double right-click.',
        params: [
          { name: 'lat', required: true, desc: 'Latitude of the region.', example: '48.3794' },
          { name: 'lng', required: true, desc: 'Longitude of the region.', example: '31.1656' },
        ],
        returns: ['coordinates', '…dossier sections'],
      },
    ],
  },
  {
    id: 'media-markets',
    title: 'Media & Markets',
    blurb: 'News aggregation, live broadcast streams, and financial instruments.',
    endpoints: [
      {
        path: '/api/news',
        method: 'GET',
        summary: 'Telegram OSINT posts with the declared lean of each channel, media, cross-posts and a per-source health report. risk_score is a keyword count, not a model output, and coords are preset country anchors.',
        returns: ['news', 'total', 'sources', 'timestamp'],
      },
      {
        path: '/api/live-news',
        method: 'GET',
        summary: '24/7 broadcast streams grouped by category.',
        returns: ['feeds', 'categories', 'total', 'timestamp'],
      },
      {
        path: '/api/markets',
        method: 'GET',
        summary: 'Defence-sector equities and commodities.',
        returns: ['stocks', 'timestamp'],
      },
      {
        path: '/api/markets/history',
        method: 'GET',
        summary: 'OHLC candles for one instrument, at a resolution worth drawing.',
        params: [
          { name: 'symbol', required: true, desc: 'Instrument symbol, e.g. `RTX`.' },
          { name: 'range', desc: 'Window to fetch.', example: '1d | 1w | 1m | 3m | 1y' },
        ],
        returns: ['candles', 'symbol', 'range', 'timestamp'],
        notes: 'Each range carries its own interval — five-minute bars for a day, weekly for a year.',
      },
      {
        path: '/api/chain/daily',
        method: 'GET',
        summary: 'Daily on-chain threat brief: exploits, CVEs and newly designated wallets.',
        returns: ['exploits', 'cves', 'designations', 'degraded', 'date'],
        notes: 'Fully keyless. Sections degrade independently and say why in `degraded`.',
      },
      {
        path: '/api/crypto',
        method: 'GET',
        summary: 'Spot prices for the assets shown in the status ticker.',
        returns: ['…price series'],
      },
      {
        path: '/api/scm-suppliers',
        method: 'GET',
        summary: 'Supply-chain suppliers with criticality flags.',
        returns: ['suppliers', 'total', 'critical_count', 'timestamp'],
      },
    ],
  },
  {
    id: 'surveillance',
    title: 'Surveillance & Infrastructure',
    blurb: 'Camera networks, fixed infrastructure, maritime traffic, and tile/stream proxies.',
    endpoints: [
      {
        path: '/api/cctv',
        method: 'GET',
        summary: 'Public camera networks, optionally filtered by region or radius.',
        params: [
          { name: 'region', desc: 'Restrict to a named provider region.', example: 'london' },
          { name: 'lat', desc: 'Latitude for a radius search.', example: '51.5072' },
          { name: 'lng', desc: 'Longitude for a radius search.', example: '-0.1276' },
          { name: 'radius', desc: 'Radius in kilometres. Requires `lat` and `lng`.', example: '25' },
        ],
        returns: ['cameras', 'regions', 'total', 'timestamp'],
      },
      {
        path: '/api/cctv/stream-status',
        method: 'GET',
        summary: 'Probes whether a camera stream is reachable before the player commits to it.',
        params: [{ name: 'url', required: true, desc: 'Stream URL to probe.' }],
        returns: ['available', 'blocked', 'provider', 'reason'],
        notes: '`blocked` distinguishes an upstream refusing our origin from a stream that is simply offline.',
      },
      {
        path: '/api/cctv/resolve',
        method: 'GET',
        summary: "Resolves a camera's external page to a URL the viewer can actually embed.",
        params: [{ name: 'url', required: true, desc: 'External camera page URL.' }],
        returns: ['embedUrl', 'kind', 'provider'],
        notes: 'Only the providers that need a lookup are resolved; HLS-backed feeds are passed through untouched.',
      },
      {
        path: '/api/cctv/texas/snapshot',
        method: 'GET',
        summary: 'TxDOT camera snapshot, decoded to an image the viewer can show directly.',
        params: [{ name: 'id', required: true, desc: 'TxDOT camera identifier.' }],
        returns: ['…binary image'],
        notes: 'TxDOT serves base64 JPEGs inside JSON rather than image URLs; this route decodes that one fixed upstream.',
      },
      {
        path: '/api/cctv/proxy',
        method: 'GET',
        summary: 'Same-origin proxy for camera streams that set restrictive CORS headers.',
        params: [{ name: 'url', required: true, desc: 'Upstream stream URL.' }],
        returns: ['domain', 'failed', 'error'],
        notes: 'Allow-listed by domain. Not a general-purpose open proxy.',
      },
      {
        path: '/api/cctv/frame',
        method: 'GET',
        summary: "A still camera's current frame, for the built-in detector (AI Analyze, OI Assist, forecasts).",
        params: [{ name: 'id', required: true, desc: 'Camera id from /api/cctv.' }],
        returns: ['image/jpeg | image/png | image/webp | image/gif', 'X-Frame-At header'],
        notes: 'Takes a camera id, never a URL: only cameras in the OSIRIS catalogue. Frames are held for 4 s; 90 requests a minute per client.',
      },
      {
        path: '/api/infrastructure',
        method: 'GET',
        summary: 'Fixed strategic infrastructure — nuclear sites, plants, and facilities.',
        returns: ['infrastructure', 'total', 'timestamp'],
      },
      {
        path: '/api/maritime',
        method: 'GET',
        summary: 'Ports, chokepoints, and vessel positions.',
        returns: ['ports', 'chokepoints', 'ships', 'total_ports', 'total_chokepoints', 'total_ships', 'timestamp'],
        env: ['AIS_API_KEY'],
      },
      {
        path: '/api/arcgis',
        method: 'GET',
        summary: 'Queries a configured ArcGIS feature service.',
        params: [
          { name: 'service', desc: 'Service identifier to query.' },
          { name: 'q', desc: 'Attribute query string.' },
          { name: 'bbox', desc: 'Bounding box filter, `minLng,minLat,maxLng,maxLat`.' },
        ],
        returns: ['…feature collection'],
      },
      {
        path: '/api/proxy-tiles',
        method: 'GET',
        summary: 'Same-origin raster tile proxy for basemaps that block cross-origin reads.',
        params: [{ name: 'url', required: true, desc: 'Upstream tile URL.' }],
        returns: ['…binary tile'],
      },
      {
        path: '/api/geo',
        method: 'GET',
        summary: 'Geolocates the calling client by IP.',
        returns: ['status', 'query', 'city', 'regionName', 'country', 'lat', 'lon', 'isp', 'org'],
      },
      {
        path: '/api/geo/reverse',
        method: 'GET',
        summary: 'The place name for a coordinate.',
        params: [
          { name: 'lat', required: true, desc: 'Latitude.', example: '51.5072' },
          { name: 'lon', required: true, desc: 'Longitude.', example: '-0.1276' },
        ],
        returns: ['display_name', 'locality', 'region', 'country'],
        notes:
          'The coordinate is rounded to a tenth of a degree before it is asked about — about 11 km, far finer than "city, region, country" and fine enough that the result is cacheable and shared.',
      },
      {
        path: '/api/geosearch',
        method: 'GET',
        summary: 'Type-ahead location search for the route planner and spotlight.',
        params: [
          { name: 'q', required: true, desc: 'Partial place name.', example: 'eiffel tow' },
          { name: 'limit', desc: 'Maximum results to return.', example: '6' },
        ],
        returns: ['results', 'total'],
        notes:
          'Nominatim is a geocoder, not a type-ahead index, so it needs near-complete input; this is Photon first and Nominatim after, which is what makes a typo or a half-typed name return the right place.',
      },
      {
        path: '/api/directions',
        method: 'GET',
        summary: 'Turn-by-turn directions between two points.',
        params: [
          { name: 'from', required: true, desc: '`lat,lon` of the start.', example: '52.52,13.405' },
          { name: 'to', required: true, desc: '`lat,lon` of the end.', example: '48.858,2.294' },
          { name: 'mode', desc: 'Costing profile.', example: 'auto | bicycle | pedestrian' },
        ],
        returns: ['legs', 'distance_m', 'duration_s', 'source'],
        notes: 'Valhalla first with narrative instructions; the OSRM demo server as a driving-only fallback.',
      },
    ],
  },
  {
    id: 'cyber',
    title: 'Cyber Threat',
    blurb: 'Vulnerability, attack, and malware telemetry.',
    endpoints: [
      {
        path: '/api/cyber-threats',
        method: 'GET',
        summary: 'Recent CVE disclosures with rollup statistics.',
        returns: ['threats', 'stats'],
      },
      {
        path: '/api/cyber-attacks',
        method: 'GET',
        summary: 'Listed botnet C2 servers from abuse.ch Feodo Tracker — blocklist entries, not observed attacks.',
        returns: ['indicators', 'total', 'online', 'fetched_at', 'source', 'source_url'],
      },
      {
        path: '/api/cloudflare-radar',
        method: 'GET',
        summary: 'Internet disruption and attack-origin telemetry from Cloudflare Radar.',
        returns: ['configured', 'outages', 'attack_origins', 'total_outages', 'total_attack_origins', 'source', 'timestamp'],
        env: ['CLOUDFLARE_API_TOKEN'],
        notes:
          'Fails closed: with no token the route reports itself unconfigured and the map layer stays hidden. The token is read server-side and never appears in a response.',
      },
      {
        path: '/api/malware',
        method: 'GET',
        summary: 'Live malware hosts from abuse.ch URLhaus, geolocated per address.',
        returns: ['threats', 'total', 'cursor', 'last_poll', 'stream', 'source', 'timestamp'],
      },
      {
        path: '/api/malware/stream',
        method: 'GET',
        summary:
          'Server-sent events for the malware layer: a snapshot on connect, then new detections as URLhaus reports them.',
        returns: ['snapshot', 'detections', 'status', 'heartbeat'],
      },
    ],
  },
  {
    id: 'osint',
    title: 'OSINT Toolkit',
    blurb:
      'The lookup tools behind the RECON panel. Every route takes a single subject and returns a normalised result, so they compose well in scripts.',
    endpoints: [
      {
        path: '/api/osint/dns',
        method: 'GET',
        summary: 'Resolves A, AAAA, MX, NS, TXT, and SOA records.',
        params: [{ name: 'domain', required: true, desc: 'Domain to resolve.', example: 'example.com' }],
        returns: ['…record sets'],
      },
      {
        path: '/api/osint/whois',
        method: 'GET',
        summary: 'Registration and registrar detail for a domain.',
        params: [{ name: 'domain', required: true, desc: 'Domain to look up.', example: 'example.com' }],
        returns: ['…registration record'],
      },
      {
        path: '/api/osint/certs',
        method: 'GET',
        summary: 'Certificate transparency search — an effective passive subdomain enumerator.',
        params: [{ name: 'domain', required: true, desc: 'Apex domain to search.', example: 'example.com' }],
        returns: ['certificates', 'subdomains', 'total_certs', 'unique_subdomains', 'timestamp'],
      },
      {
        path: '/api/osint/ip',
        method: 'GET',
        summary: 'Geolocation, ASN, and network ownership for an address.',
        params: [{ name: 'ip', required: true, desc: 'IPv4 or IPv6 address.', example: '8.8.8.8' }],
        returns: ['…address record'],
      },
      {
        path: '/api/osint/shodan',
        method: 'GET',
        summary: 'Exposed services, banners, and known vulnerabilities for a host.',
        params: [{ name: 'ip', required: true, desc: 'Address to query.', example: '8.8.8.8' }],
        returns: ['status', 'ports', 'hostnames', 'cpes', 'vulns', 'tags', 'detail'],
      },
      {
        path: '/api/osint/bgp',
        method: 'GET',
        summary: 'ASN, prefix, and peering relationships.',
        params: [{ name: 'query', required: true, desc: 'ASN, prefix, or IP.', example: 'AS15169' }],
        returns: ['…routing record'],
      },
      {
        path: '/api/osint/mac',
        method: 'GET',
        summary: 'Resolves a MAC address or OUI prefix to its hardware vendor.',
        params: [{ name: 'mac', required: true, desc: 'MAC address or OUI prefix.', example: '00:1A:2B:3C:4D:5E' }],
        returns: ['mac', 'prefix', 'vendor', 'address', 'detail'],
      },
      {
        path: '/api/osint/phone',
        method: 'GET',
        summary: 'Validates and classifies a phone number in E.164 form.',
        params: [{ name: 'number', required: true, desc: 'Number in international format.', example: '+442071234567' }],
        returns: [
          'valid',
          'number',
          'country_code',
          'region',
          'line_type',
          'national',
          'international',
          'lat',
          'query',
        ],
      },
      {
        path: '/api/osint/github',
        method: 'GET',
        summary: 'Public profile metadata for a GitHub account.',
        params: [{ name: 'user', required: true, desc: 'GitHub username.', example: 'torvalds' }],
        returns: ['username', 'name', 'bio', 'company', 'location', 'blog', 'email', 'twitter', 'public_repos'],
      },
      {
        path: '/api/osint/leaks',
        method: 'GET',
        summary: 'Checks an address against known breach corpora.',
        params: [{ name: 'email', required: true, desc: 'Email address to check.' }],
        returns: ['breached', 'breaches', 'data_exposed', 'detail'],
      },
      {
        path: '/api/osint/hudsonrock',
        method: 'GET',
        summary: 'Reports whether an asset appears in Hudson Rock\'s infostealer corpus — machines compromised by credential-stealing malware.',
        params: [
          { name: 'query', required: true, desc: 'Email, domain, username or phone number.', example: 'tesla.com' },
          { name: 'type', required: false, desc: 'Pins the asset type instead of inferring it: email, domain, username or phone.', example: 'domain' },
        ],
        returns: ['query', 'type', 'compromised', 'stealers', 'total_corporate_services', 'total_user_services', 'totalStealers', 'employees', 'users'],
      },
      {
        path: '/api/osint/cve',
        method: 'GET',
        summary: 'Full NVD record for a single CVE identifier.',
        params: [{ name: 'cve', required: true, desc: 'CVE ID.', example: 'CVE-2021-44228' }],
        returns: ['id', 'description', 'cvss', 'cvss_vector', 'severity', 'published', 'references', 'source'],
      },
      {
        path: '/api/osint/sanctions',
        method: 'GET',
        summary: 'Searches the OpenSanctions mirror of the US OFAC SDN list.',
        params: [
          { name: 'query', required: true, desc: 'Name of a person, organisation, or vessel.' },
          { name: 'schema', desc: 'Entity type filter.', example: 'Person | Organization | Vessel' },
          { name: 'limit', desc: 'Maximum results to return.', example: '10' },
        ],
        returns: ['schema', 'total', 'source', 'timestamp'],
      },
      {
        path: '/api/osint/threats',
        method: 'GET',
        summary: 'Reputation and threat-intel enrichment for an indicator.',
        params: [{ name: 'query', required: true, desc: 'IP, domain, or file hash.' }],
        returns: ['…enrichment record'],
      },
      {
        path: '/api/osint/sweep',
        method: 'GET',
        summary: 'Sweeps a single address or a CIDR range for reachable hosts.',
        params: [
          { name: 'ip', desc: 'Single address to sweep.' },
          { name: 'cidr', desc: 'CIDR range to sweep. Use instead of `ip`.', example: '192.0.2.0/24' },
        ],
        returns: ['target_ip', '…sweep results'],
        notes: 'Only sweep ranges you are authorised to test.',
      },
      {
        path: '/api/osint/username',
        method: 'GET',
        summary: 'Username enumeration across social platforms, on the Sherlock priority tier.',
        params: [{ name: 'username', required: true, desc: 'Target handle.' }],
        returns: ['accounts', 'total', 'checked'],
        notes: "Sherlock Project's detection rules against its site database (MIT). Keyless.",
      },
      {
        path: '/api/osint/fingerprint',
        method: 'GET',
        summary: 'Username search across the whole site database, streamed as verdicts arrive.',
        params: [{ name: 'username', required: true, desc: 'Target handle.' }],
        returns: ['…streamed verdict events'],
        notes:
          'The same detection rules as /api/osint/username over the full database rather than the priority tier. A sweep takes tens of seconds, so results are streamed rather than held back.',
      },
      {
        path: '/api/osint/crypto',
        method: 'GET',
        summary: 'On-chain wallet intelligence: balance, activity, counterparties and OFAC screening.',
        params: [{ name: 'address', required: true, desc: 'BTC, ETH or SOL address.' }],
        returns: ['balance', 'activity', 'counterparties', 'ofac', 'risk_score', 'source'],
        env: ['ETHERSCAN_API_KEY', 'HELIUS_API_KEY'],
        notes:
          'Baseline sources are keyless; the optional keys deepen the result. The risk score is transparent — it is computed from the fields returned, not asserted by a model.',
      },
    ],
  },
  {
    id: 'recon',
    title: 'Recon Scanner',
    blurb: 'Active scanning, delegated to a separate backend so the web tier never runs scans itself.',
    endpoints: [
      {
        path: '/api/scanner',
        method: 'GET',
        summary: 'Runs a scan against a target via the OSIRIS scanner backend.',
        params: [
          {
            name: 'type',
            required: true,
            desc: 'Scan type.',
            example: 'quick | ssl | headers | rdns | subdomains | tech | whois | geoloc | vuln',
          },
          { name: 'target', required: true, desc: 'Host, domain, or address to scan.' },
        ],
        returns: ['detail', 'hint', 'failed', 'error'],
        env: ['SCANNER_URL', 'SCANNER_KEY'],
        notes:
          'Returns 503 when `SCANNER_URL` / `SCANNER_KEY` are unset — that is the supported way to disable RECON. `SCANNER_KEY` must equal the backend’s `OSIRIS_KEY`.',
      },
      {
        path: '/api/scanner/stream/{feedId}',
        method: 'GET',
        summary: 'Same-origin proxy for a public-safety radio feed.',
        params: [{ name: 'feedId', required: true, desc: 'Feed identifier from /api/scanner.' }],
        returns: ['…binary audio stream'],
        notes:
          'Only allowlisted hosts are proxied; a feed pointing anywhere else is refused with 403 rather than streamed through.',
      },
    ],
  },
  {
    id: 'integrations',
    title: 'Security Tool Integrations',
    blurb:
      'The registry, state and findings behind the security-tool windows. Deny-by-default: a capability that is not on a tool’s allowlist is refused before anything runs.',
    endpoints: [
      {
        path: '/api/integrations/tools',
        method: 'GET',
        summary: 'The tool registry, for a client that is not this platform.',
        returns: ['tools', 'total'],
        notes:
          'The Android and Windows apps read the registry from here rather than keeping their own copy, so one manifest is the only place a tool’s name, capabilities and risk class change. Open by default; a deployment sets OSIRIS_REGISTRY_REQUIRE_AUTH to close it behind a session, and a caller without one is refused 401.',
      },
      {
        path: '/api/integrations/state',
        method: 'GET',
        summary: 'The server-derived integration state for every registered tool.',
        returns: ['states'],
        notes: 'The dashboard is a client component, so the state is decided on the server and the client only renders the answer.',
      },
      {
        path: '/api/integrations/health',
        method: 'GET',
        summary: 'The health of every integration source, and the platform’s own readiness.',
        returns: ['ok', 'sources', 'down', 'degraded', 'database', 'timestamp'],
        notes:
          'Answers without a session, because a load balancer’s probe cannot sign in and a health check it cannot reach never fires. So it reports process-level facts only: each source carries its health, its failure count and its timings, but not `lastError`. That text is whatever an upstream client put in the error, and the dispatcher serves a stripped form of it only to a caller it has already authenticated — see the audit trail for the full message. `ok` is false when any source is down, so a load balancer can act on it without parsing the body.',
      },
      {
        path: '/api/integrations/devices',
        method: ['GET', 'POST', 'PUT'],
        summary:
          "The devices that may push into the platform, and the making and rotating of their secrets.",
        returns: ['ok', 'devices', 'count'],
        notes:
          "A sensor is not a user: it has no session and no way to sign in. It proves itself with a shared secret, and the platform keeps only the secret's hash — so a secret is shown **once**, and a caller that loses it rotates rather than asks. `POST` creates a device and returns its secret; `PUT` rotates it, and the new secret takes effect at once while the previous one keeps working for a grace window, so a box on a rooftop is not silenced while it is being told. Creating and rotating a device are administrative acts, so the caller has to be an administrator, and the tenant is the caller's own. `GET` lists the tenant's devices and never their secrets.",
      },
      {
        path: '/api/integrations/costs',
        method: 'GET',
        summary: "What the day's calls have cost, per tool.",
        params: [
          { name: 'day', desc: 'The day to report, as `YYYY-MM-DD`. Defaults to today.', example: '2026-10-21' },
        ],
        returns: ['ok', 'day', 'tenantId', 'lines', 'priced', 'summary', 'detail'],
        notes:
          "A quota says how many calls a tenant may make; a cost says what those calls cost. Most of the platform is the operator's own machine reading their own files, and a few capabilities reach a service that meters - a Shodan query is a credit, a request to a paid model provider is a request. The unit is the provider's, not money: the platform knows how many have been spent, and what one is worth is between the operator and their bill. `priced` lists the capabilities that cost anything; `lines` reports every tool used today, including the free ones, because a tool that was used and cost nothing is a different fact from a tool that was not used. There is no `total`: the units are not comparable, and a number that reads like one would be believed. `summary` carries, per tool, calls, units, unit, reportedCalls and unreportedCalls, so a zero-token row says whether it was a free model or a metered reply that ended before its usage frame. In `priced`, a capability marked `measured` is one whose cost is not knowable in advance - a model provider reports its token usage after the reply - so its declared units are zero and the figure that was actually recorded is in `lines`.",
      },
      {
        path: '/api/integrations/entities',
        method: 'GET',
        summary: 'The drones and surveillance devices the sensors have seen, as things rather than sightings.',
        params: [
          { name: 'kind', desc: '`drones`, `devices`, or `all` (the default).', example: 'devices' },
          { name: 'limit', desc: 'How many of each to return, at most 1000.', example: '500' },
        ],
        returns: ['ok', 'kind', 'drones', 'devices', 'counts'],
        notes:
          "A finding is a moment — this camera, at this place, now. This is the camera: one row, however many times it has been seen, carrying the observation count and the first and last sighting. A camera seen four hundred times is one camera seen four hundred times, and a card that says so is a different card from one that says 'seen once'. The attribution tier is never raised by repetition: a sighting confirms that the device was there, and nothing more. The tenant is the caller's own — these are the positions of real cameras and real people.",
      },
      {
        path: '/api/integrations/findings',
        method: 'GET',
        summary: 'Persisted findings as map records, with their provenance.',
        params: [
          { name: 'geospatial', desc: 'Set to `0` to return every finding, not only the ones with coordinates.', example: '0' },
        ],
        returns: ['findings', 'total', 'source', 'timestamp'],
        notes:
          'A finding becomes a beacon only if it says where it is; one without coordinates is a row in a table, not a place on the map.',
      },
      {
        path: '/api/integrations/ingest',
        method: 'POST',
        summary: 'Sensor push endpoint for devices that prove themselves with a shared secret.',
        returns: ['accepted', 'recorded', 'duplicates'],
        headers: { 'X-Device-Key': '$DEVICE_SHARED_SECRET' },
        requiresAuth: true,
        notes:
          'The secret is compared in constant time against a stored hash, the device is checked against the tools it may push, and the payload is validated before a row is written. 401 without a device credential.',
      },
    ],
  },
  {
    id: 'graph',
    title: 'Entity Graph',
    blurb: 'Link analysis over entities surfaced elsewhere in the platform.',
    endpoints: [
      {
        path: '/api/entity/expand',
        method: 'GET',
        summary: 'Expands one graph node into its neighbours.',
        params: [
          { name: 'id', required: true, desc: 'Entity identifier to expand.' },
          { name: 'type', required: true, desc: 'Entity type, which selects the expansion strategy.' },
        ],
        returns: ['…nodes and edges'],
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI Analysis',
    blurb:
      'Gemini-backed correlation over feed data you supply, plus the platform\'s own provider registry and chat proxy. The three analysis routes are POST and rate limited to 5 requests per minute per IP.',
    endpoints: [
      {
        path: '/api/ai/analyze',
        method: 'POST',
        summary: 'Cross-feed correlation and threat assessment over an intelligence context.',
        returns: ['…analysis'],
        notes:
          'Body is an `IntelligenceContext`. Exceeding the limit returns 429. Feed it straight from the read endpoints - the shape matches what they return. The call reaches Gemini on the server\'s key, and what it spent is recorded as `ai-token` against the tenant, in /api/integrations/costs under `ai-analyst`.',
        bodyExample: `{
  "earthquakes": [],
  "news": [],
  "threats": [],
  "cyberAlerts": [],
  "timestamp": "2026-07-29T12:00:00Z"
}`,
      },
      {
        path: '/api/ai/briefing',
        method: 'POST',
        summary: 'Structured threat briefing in the style of a daily intelligence product.',
        returns: ['…briefing'],
        notes: 'Same `IntelligenceContext` body and same rate limit as `/api/ai/analyze`, and the same recording of what the call spent.',
        bodyExample: `{
  "earthquakes": [],
  "news": [],
  "threats": [],
  "cyberAlerts": [],
  "timestamp": "2026-07-29T12:00:00Z"
}`,
      },
      {
        path: '/api/ai/overview',
        method: 'POST',
        summary: 'One-click read-out for the Alerts or Markets panel. Alerts also return a structured brief: threads by theatre, perspective and seismic summary.',
        returns: ['mode', 'overview', 'highlights', 'generatedBy', 'generatedAt', 'brief'],
        notes:
          'Rate limited to 20 requests a minute per address. When Gemini is configured the read-out comes from it and what the call spent is recorded as `ai-token` against the tenant; the built-in fallback analyst runs on the operator\'s own machine and costs nothing, so it records nothing.',
        bodyExample: `{
  "mode": "alerts",
  "payload": {
    "news": [{ "id": "a1", "title": "Drone attack on Kharkiv", "source": "t.me/liveuamap", "bloc": "western", "published": "2026-09-17T11:00:00Z" }],
    "earthquakes": [{ "magnitude": 5.4, "place": "80 km S of Kuril", "time": 1789646400000 }]
  }
}`,
      },
      {
        path: '/api/ai/providers',
        method: 'GET',
        summary: 'The AI providers this deployment has, without their keys.',
        returns: ['providers', 'configured', 'default'],
        notes:
          'A provider is listed with whether it is configured, never with how to reach it — the key stays in the environment and is not part of this response.',
      },
      {
        path: '/api/ai/downloads',
        method: ['GET', 'POST'],
        summary: "The model download manager: what's installed, what's running, and how to start one.",
        params: [{ name: 'action', required: true, desc: 'list | start | cancel', example: 'list' }],
        returns: ['models', 'running', 'installed', 'ok', 'error'],
        notes:
          'The download host is checked against an allowlist in the manager, and a finished file is moved into place atomically — a half-written model is never visible as an installed one.',
      },
      {
        path: '/api/ai/chat',
        method: 'POST',
        summary: 'Chat against any provider the deployment has configured.',
        returns: ['…reply'],
        notes:
          'The provider is chosen from the registry, so a request can only reach an origin the operator configured, and the model id is validated before it is used. An unconfigured provider returns 503; a bad model id returns 400. A provider that needs a key spends the operator\'s money, so on a deployment with accounts such a call requires a session: an unsigned caller is refused with 401 before the provider is called. A local provider needs no key and runs on the operator\'s own machine, so it is served without one. A caller is limited to 20 chats a minute by address, refused with 429. What the call cost is recorded as well as made: a provider reports its token usage in the final frame of a streamed reply, so the reply is counted on its way through and is never held up to be read. The figure lands in /api/integrations/costs under `ai-token`.',
        bodyExample: `{
  "provider": "openrouter",
  "model": "…validated model id",
  "messages": [{ "role": "user", "content": "…" }],
  "stream": true
}`,
      },
    ],
  },
  {
    id: 'oi',
    title: 'OI (Assist & Prediction)',
    blurb:
      'OI Assist, a model on your own key that works the map in conversation, and a prediction engine on live OSIRIS intelligence: it casts the actors who decide a question, plays them against each other over dated periods in several parallel worlds, and a report agent writes the predicted path with a calibrated figure. Your model key is sent in headers and never stored. Also served as an MCP server at /api/mcp; see OI guide.',
    endpoints: [
      {
        path: '/api/oi',
        method: 'GET',
        summary: 'What the service offers: providers and their default models, run depths and their model-call counts, limits and endpoints.',
        returns: ['name', 'version', 'credit', 'providers', 'depths', 'limits', 'auth', 'endpoints'],
      },
      {
        path: '/api/oi/models',
        method: 'POST',
        summary: 'The models your key can use, straight from the provider. Doubles as a key check: a rejected key fails here, before a run spends anything.',
        returns: ['provider', 'ok', 'listed', 'models', 'default'],
        headers: { 'X-OI-Key': '$YOUR_MODEL_KEY' },
        requiresAuth: true,
        notes: 'Providers: `openai`, `anthropic`, `google`, `openrouter`, `groq`, `deepseek`, `xai`, `mistral`, `qwen`. 401 when the provider rejects the key, 402 when the account is out of credit. 20 checks per minute per address.',
        bodyExample: `{
  "provider": "openai"
}`,
      },
      {
        path: '/api/oi/runs',
        method: 'POST',
        summary: 'Start a prediction. Answers 202 at once with the run id, a link to watch it on the globe, and a run token for steering it.',
        returns: ['id', 'status', 'phase', 'watch_url', 'events_url', 'run_token', 'progress'],
        headers: { 'X-OI-Provider': 'openai', 'X-OI-Key': '$YOUR_MODEL_KEY', 'X-OI-Model': 'gpt-5-mini' },
        requiresAuth: true,
        notes: '`depth` is `quick` (4 actors × 3 periods × 2 worlds, about 34 model calls), `standard` (6 × 4 × 3, about 88) or `deep` (7 × 4 × 4, about 132). A world that settles early stops spending calls. `seed` takes up to 100,000 characters of your own data (about 25,000 input tokens), read once by the world model; with `seed_scope: "panel"` every actor’s move and the report agent also read its first 8,000 characters, at about 2,000 more input tokens a call. `use_feeds` (default true) has the run research the question first (recent news with its links, from GDELT and Wikipedia’s Current events, and Wikipedia background) and read OSIRIS news, quakes and markets; the actors quote these sources by id: articles (`w`), market data (`q`), prediction markets (`m`), background (`b`), the live feeds (`c`). Keep `run_token`: it is not shown again. Two runs at once and eight per ten minutes per address.',
        bodyExample: `{
  "question": "Will Brent crude settle above $90 on 31 December 2026?",
  "depth": "standard",
  "use_feeds": true
}`,
      },
      {
        path: '/api/oi/runs/{id}',
        method: 'GET',
        summary: 'A run summary: phase and progress, the simulated periods, the worlds pooled period by period, each world with its events, the cast with their personas, and once written, the report: the predicted path, what each actor does, how each world ended, drivers, scenarios, signposts and dissent, with the sources they quote.',
        params: [
          { name: 'wait', desc: 'Seconds (up to 55) to wait for the run to finish before answering.', example: '30' },
          { name: 'view', desc: '`full` returns every event so far, to rebuild the whole run.', example: 'full' },
        ],
        returns: ['id', 'status', 'phase', 'kind', 'answer', 'probability_pct', 'outcomes', 'unit', 'proposition', 'measure', 'baseline', 'market', 'progress', 'periods', 'pooled', 'report', 'actors', 'worlds', 'sources', 'injected', 'usage', 'watch_url'],
        notes: '`kind` is `binary` (a probability of YES), `choice` (a share for each of `outcomes`) or `number` (an `estimate` with an 80% `low`–`high` range, in `unit`); `answer` says it in words either way. On a question about a price, `measure` names it (ticker, level, side, touch or close), and `baseline` gives the statistical baseline from its own history (`probability_pct` or a `p10`–`p90` range) and, once the run is done, `simulated`: the worlds’ events priced across the market’s own paths. `market` is the id of the source (an `odds` source, with `odds.probability_pct`) that is a prediction market on this same question. Anyone with the id can read a run: that is how a prediction is shared. Runs are kept for three hours after they finish.',
      },
      {
        path: '/api/oi/runs/{id}/events',
        method: 'GET',
        summary: 'The run as it happens, over Server-Sent Events: phases, actors and relations, the cast and the simulated clock, every move, event and world standing, the worlds pooled after each period, injected events and the report.',
        returns: ['…SSE event stream'],
        notes: 'Each event is `id: <seq>` and `data: <json>`, with a `t` field naming its type. The stream replays from the start, follows live, and closes after `end`. Reconnect with `Last-Event-ID` (or `?after=<seq>`) to resume.',
      },
      {
        path: '/api/oi/trending',
        method: 'GET',
        summary: 'What the world is betting on: the busiest open questions on Polymarket that can be predicted (not games, at least two weeks out), each with the crowd’s price of YES. No key; kept ten minutes.',
        returns: ['items[].question', 'items[].probability', 'items[].event', 'items[].url', 'items[].closes'],
      },
      {
        path: '/api/oi/assist',
        method: 'POST',
        summary: "One step of an OI Assist conversation: send the conversation and what is on the map; get back what OI says and the actions it wants taken (go_to, layers, find, highlight, show, markets, open, map_view, forecast, clear).",
        returns: ['step.say', 'step.actions', 'step.done', 'usage'],
        headers: { 'X-OI-Provider': 'openai', 'X-OI-Key': '$YOUR_MODEL_KEY' },
        requiresAuth: true,
        notes: 'Stateless: the conversation lives with the caller. Carry out the actions, and while `done` is false send their results back as a `tool` message for the next step. 40 steps per minute per address.',
        bodyExample: `{
  "messages": [{ "role": "user", "text": "Military aircraft near Frankfurt", "mode": "research" }],
  "context": { "view": { "lat": 50.1, "lng": 8.7, "zoom": 6 }, "layersOn": ["military"], "loaded": { "military_flights": 104 } }
}`,
      },
      {
        path: '/api/oi/runs/{id}/ask',
        method: 'POST',
        summary: 'Question the report agent, or any actor that played (by id), about a run. Uses your key again.',
        returns: ['id', 'target', 'reply'],
        headers: { 'X-OI-Key': '$YOUR_MODEL_KEY' },
        requiresAuth: true,
        notes: "Provider and model default to the run's own; send `X-OI-Provider` and `X-OI-Model` to ask on another. 20 questions per minute per address.",
        bodyExample: `{
  "target": "report",
  "message": "What would change this prediction most?"
}`,
      },
      {
        path: '/api/oi/identify',
        method: 'POST',
        summary: "Name the vehicles in a camera frame, on the reader's own key.",
        returns: ['vehicles', 'usage'],
        headers: { 'X-OI-Provider': '$YOUR_PROVIDER', 'X-OI-Key': '$YOUR_MODEL_KEY' },
        requiresAuth: true,
        notes: "The crops are cut by the page from the frame it analysed, so the answer is about exactly the vehicles the reader is looking at. Only a model that reads pictures is asked: a text-only one would have nothing to go on but guesses. Number plates are never read, and nothing is kept. At most six crops, 160 KB of base64 each, and twelve identifications a minute.",
        bodyExample: `{
  "camera": "taipei-104",
  "crops": [{ "n": 1, "image": "<base64 JPEG>" }]
}`,
      },
      {
        path: '/api/oi/runs/{id}/inject',
        method: 'POST',
        summary: "God's-eye view: drop an event into a running simulation. It happens in every world in the next period of simulated time.",
        returns: ['id', 'queued', 'lands_in_period'],
        headers: { 'X-OI-Run-Token': '$RUN_TOKEN' },
        requiresAuth: true,
        notes: 'Needs the run token from the start response. Up to eight events per run; refused once the report is being written.',
        bodyExample: `{
  "text": "OPEC+ calls an emergency meeting for Friday"
}`,
      },
      {
        path: '/api/oi/runs/{id}',
        method: 'DELETE',
        summary: 'Cancel a running prediction.',
        returns: ['id', 'cancelled', 'status'],
        headers: { 'X-OI-Run-Token': '$RUN_TOKEN' },
        requiresAuth: true,
      },
      {
        path: '/api/mcp',
        method: 'POST',
        summary: 'OI and live OSIRIS intelligence as an MCP server (Streamable HTTP, stateless) for agents such as Hermes, Claude and Cursor.',
        returns: ['jsonrpc', 'id', 'result'],
        headers: { Accept: 'application/json, text/event-stream', 'X-OI-Provider': 'openai', 'X-OI-Key': '$YOUR_MODEL_KEY' },
        notes: 'Tools: `oi_predict`, `oi_get_run`, `oi_ask`, `oi_inject`, `oi_cancel`, `oi_info`, and the free `osiris_world_brief`, `osiris_markets` and `osiris_trending`, which need no key. A call that waits on a forecast streams progress notifications when the client accepts SSE. Protocol versions 2025-06-18, 2025-03-26 and 2024-11-05.',
        bodyExample: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}`,
      },
    ],
  },
  {
    id: 'sdk',
    title: 'Polybolos SDK',
    blurb:
      'Push entities from an external platform into the Common Operating Picture, and stream the merged picture back out.',
    endpoints: [
      {
        path: '/api/sdk/ingest',
        method: 'POST',
        summary: 'Accepts Polybolos-format entities from an external system and merges them into the map.',
        returns: ['accepted', 'rejected', 'errors', 'timestamp'],
        env: ['SDK_INGEST_KEY'],
        requiresAuth: true,
        notes:
          'Each entity needs `id`, `position.lat`, and `position.lng`; everything else is defaulted. Stored ids are namespaced to `ext-{source}-{id}`, so two platforms can push the same id safely. Fails closed: 503 when `SDK_INGEST_KEY` is unset, 401 on key mismatch, 400 on a malformed payload.',
        bodyExample: `{
  "source": "lattice",
  "apiKey": "$SDK_INGEST_KEY",
  "entities": [
    {
      "id": "TRK-4471",
      "name": "UNKNOWN SURFACE CONTACT",
      "domain": "SEA",
      "entityType": "TRACK",
      "position": { "lat": 36.14, "lng": -5.35, "heading": 271, "speed": 14.2 },
      "threat": "UNKNOWN",
      "classification": "UNCLASSIFIED",
      "confidence": 0.86
    }
  ]
}`,
      },
      {
        path: '/api/sdk/ingest',
        method: 'GET',
        summary: 'Reports how many external entities are currently held, plus recent ingest history.',
        returns: ['sdk', 'version', 'entityCount', 'recentIngestions', 'timestamp'],
      },
      {
        path: '/api/sdk/stream',
        method: 'GET',
        summary: 'Server-Sent Events stream of normalised entities as they arrive.',
        returns: ['…SSE event stream'],
        notes:
          'Opens with a `status` event carrying `connected`, `entityCount`, `feedCount`, `latticeStatus`, and `lastUpdate`. Consume with `EventSource`, not `fetch`.',
      },
    ],
  },
  {
    id: 'webhooks',
    title: 'Webhooks',
    blurb: 'Inbound hooks from external services.',
    endpoints: [
      {
        path: '/api/github-webhook',
        method: 'POST',
        summary: 'Receives GitHub repository events.',
        returns: ['success', 'message', 'error'],
        requiresAuth: true,
        notes: 'Signature-verified. Unsigned or mismatched deliveries are rejected with 401.',
      },
    ],
  },
];

/** Total endpoint count, derived rather than hard-coded so it cannot drift. */
export const ENDPOINT_COUNT = API_GROUPS.reduce((n, g) => n + g.endpoints.length, 0);
