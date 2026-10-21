import type { SVGProps } from "react";

export function SpyTvIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M8 3l4 3 4-3" />
      <path d="M9 18v2h6v-2" />
    </svg>
  );
}