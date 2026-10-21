import type { SVGProps } from "react";

export function PagasusProIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 5h2" />
      <circle cx="12" cy="17.5" r="1" />
      <path d="M9.5 9.5l1.5 1.5 3-3" />
    </svg>
  );
}