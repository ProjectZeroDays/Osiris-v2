import type { SVGProps } from "react";

/** A camera on a pole with signal arcs and a scatter of nearby dots. */
export function FlockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <rect x="3" y="3" width="9" height="6" rx="1.5" />
      <circle cx="7.5" cy="6" r="1.5" />
      <path d="M6 9v5M6 18h5" />
      <path d="M12 4.5a3 3 0 0 1 3 3" />
      <path d="M12 2a6 6 0 0 1 6 6" />
      <circle cx="16" cy="14" r="1" />
      <circle cx="19" cy="16" r="1" />
      <circle cx="16" cy="19" r="1" />
    </svg>
  );
}

/** A globe with a magnifier — cross-referencing one record against another. */
export function HibfIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c2 2 2 12 0 14M10 3c-2 2-2 12 0 14" />
      <circle cx="17" cy="17" r="3.5" />
      <path d="M19.5 19.5l2.5 2.5" />
    </svg>
  );
}
