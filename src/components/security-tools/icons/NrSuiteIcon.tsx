import type { SVGProps } from "react";

/** Stacked packet layers with a capture arrow. */
export function NrSuiteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <rect x="3" y="16" width="18" height="4" rx="1" />
      <path d="M7 6h.01M7 12h.01M7 18h.01" />
      <path d="M17 6l2 2-2 2" />
    </svg>
  );
}

/** A mutation helix — two strands with rungs between them. */
export function StrykerAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <path d="M7 3c0 4 10 6 10 10s-10 6-10 10" />
      <path d="M17 3c0 4-10 6-10 10s10 6 10 10" />
      <path d="M8.5 7h7M8.5 17h7M8 12h8" />
    </svg>
  );
}
