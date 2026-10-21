import type { SVGProps } from "react";

/** A stack of tools behind a gate — a collection, reached through a check. */
export function ToolCollectionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <rect x="3" y="16" width="18" height="4" rx="1" />
      <path d="M12 2v2M12 20v2" />
      <path d="M10 12h4" />
    </svg>
  );
}
