import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      'maplibre-gl.mjs': {
        loaders: [`${__dirname}/tools/maplibre-url-loader.cjs`],
        as: '*.js',
      },
    },
  },
  /* Standalone output exists for the Docker image — the Dockerfile copies
     .next/standalone. Vercel builds its own artifacts and does not want it:
     since the 16.2.6 -> 16.3.4 bump its adapter fails packaging with
     `ENOENT .next/next-server.js.nft.json` in onBuildComplete when a
     Turbopack build also emits standalone. The build itself compiles fine,
     which is why this only ever shows up on a deploy. Keep standalone
     everywhere except Vercel, so Docker and the platform both get what they
     expect. */
  output: process.env.VERCEL ? undefined : 'standalone',
  /* onnxruntime-web runs the camera detector for forecasts, and loads its
     WebAssembly engine from its own folder at run time: bundling it would
     move the code away from the engine, so it stays a package, and the
     standalone build is told to bring the two engine files along. */
  serverExternalPackages: ['ws', 'onnxruntime-web'],
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', './node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'],
  },
  transpilePackages: ['react-map-gl', 'mapbox-gl', 'maplibre-gl'],
  // Type errors block the build again. They were suppressed while 17 stood
  // unfixed; those are cleared, so the gate can do its job — the AstraPanel
  // crash (createPortal used without an import) shipped precisely because
  // nothing stopped it.
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  /* Three things the file tracer would otherwise copy into the standalone
     output, none of which the server ever reads:

       * the models directory is created and filled at runtime, by the
         download manager, and its path is computed from the environment;
       * the native app trees are build outputs, and the APK and the
         Windows binaries inside them are large;
       * the releases folder is the packaged artefacts themselves.

     Tracing them cost over a gigabyte of the standalone build and
     nothing in the server reads any of it. */
  outputFileTracingExcludes: {
    '*': [
      './models/**',
      './releases/**',
      './android-app/**',
      './electron-app/**',
      './runs/**',
      './scratch/**',
      './.next/cache/**',
    ],
  },
  async headers() {
    return [
      /* The worker path carries the MapLibre version, so a given URL never
         changes contents — a version bump moves it. Next serves public/ with
         max-age=0, which made every page load refetch half a megabyte before
         the map could start. Immutable is safe here precisely because the
         version is in the path. */
      {
        source: '/vendor/maplibre/:version/:file*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // The camera detector's model: versioned in its path like the map worker, so the same URL never changes.
      {
        source: '/vendor/yolox/:version/:file*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          /* The policy is written per-directive rather than as one wide
             `default-src`, because the wide form is what it was: every
             scheme and every origin was permitted to supply a script, a
             frame, or a connection. The app does reach many public APIs
             from the browser, so `connect-src` stays broad — that is the
             nature of an aggregator — but scripts, styles, objects and
             base URIs are now restricted to the platform itself.

             `frame-ancestors` and `object-src 'none'` mean a hostile page
             cannot frame the dashboard and no plugin content can be
             injected into it. */
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next injects inline bootstrap scripts, and the map's worker
              // is built at runtime, so both are permitted here.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https:",
              "media-src 'self' blob: data: https:",
              // The read-only OSINT feeds and the live map tiles.
              "connect-src 'self' https: wss:",
              // MapLibre's worker is fetched from /vendor/maplibre/ and the
              // basemap style from the platform's own origin.
              "worker-src 'self' blob:",
              // Live camera and news previews are framed from their sources,
              // which are many and not all on one host.
              "frame-src 'self' https: blob: data:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
            ].join('; '),
          },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The dashboard asks for the location once; it does not need the
          // camera, the microphone, or anything else the browser can hand it.
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
