import type { SVGProps } from "react";

/** A brain with a circuit — a model, and the wires to reach it. */
export function AiProvidersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <path d="M12 4.5a3 3 0 0 0-5.8 1.2A2.7 2.7 0 0 0 3.5 8a3 3 0 0 0 .7 5.3A2.8 2.8 0 0 0 9 18.5a3 3 0 0 0 3 1 3 3 0 0 0 3-1 2.8 2.8 0 0 0 4.8-5.2A3 3 0 0 0 20.5 8a2.7 2.7 0 0 0-2.7-2.3A3 3 0 0 0 12 4.5z" />
      <path d="M12 4.5v15" />
      <circle cx="12" cy="10" r="1" fill="currentColor" />
      <path d="M9 7.5h1.5M13.5 13h1.5" />
    </svg>
  );
}
