import type { SVGProps } from "react";

/** A vehicle plate with the characters on it. */
export function PlateOcrIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M5.5 10v4M8.5 10v4M11.5 10v4M14.5 10v4M17.5 10v4" />
      <circle cx="12" cy="12" r="8.5" strokeDasharray="2 2" />
    </svg>
  );
}

/** A camera with a signal — a feed rather than a still. */
export function CameraFeedIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M15 10l6-3v10l-6-3" />
      <path d="M6.5 12.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4" />
      <path d="M6.5 12.5v2" />
    </svg>
  );
}

/** Wifi arcs with a deauth bolt. */
export function WifiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <path d="M2 8.5a15 15 0 0 1 20 0" />
      <path d="M5 12a10 10 0 0 1 14 0" />
      <path d="M8 15.5a5 5 0 0 1 8 0" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
      <path d="M18 3l-3 5h3l-2 4" />
    </svg>
  );
}
