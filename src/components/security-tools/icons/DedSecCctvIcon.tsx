import type { SVGProps } from "react";

export function DedSecCctvIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <rect x="3" y="5" width="13" height="9" rx="2" />
      <path d="M16 9l5-2v8l-5-2" />
      <circle cx="9.5" cy="9.5" r="2.25" />
      <path d="M6 18h6" />
    </svg>
  );
}