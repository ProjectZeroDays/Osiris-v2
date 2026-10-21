import type { SVGProps } from "react";

/** A quadcopter with broadcast arcs. */
export function DroneRidIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 8l8 8M16 8l-8 8" />
      <path d="M12 10v4" />
      <path d="M9.5 4.5a4 4 0 0 1 5 0" />
      <path d="M8 2.5a7 7 0 0 1 8 0" />
    </svg>
  );
}

/** A camera on a pole — the shape of a mounted ALPR unit. */
export function CopCamIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <rect x="3" y="4" width="10" height="7" rx="1.5" />
      <circle cx="8" cy="7.5" r="2" />
      <path d="M13 6.5l3 1.5v3l-3 1.5" />
      <path d="M8 11v7" />
      <path d="M5 21h6" />
      <path d="M16 4.5a3 3 0 0 1 3 3" />
      <path d="M16 2a6 6 0 0 1 6 6" />
    </svg>
  );
}
