import type { SVGProps } from "react";

/** A radio mast with signal arcs. */
export function ScannerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <path d="M12 10v11" />
      <path d="M8 21h8" />
      <path d="M9.5 6.5a4 4 0 0 1 5 0" />
      <path d="M7 4a7 7 0 0 1 10 0" />
      <circle cx="12" cy="8" r="1.5" />
    </svg>
  );
}

/** A cell tower with a signal. */
export function CellTowerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <path d="M12 9v11" />
      <path d="M9 20h6" />
      <path d="M12 6.5 8.5 3" />
      <path d="M12 6.5 15.5 3" />
      <path d="M5 20a10 10 0 0 1 14 0" />
      <circle cx="12" cy="8" r="1.2" />
    </svg>
  );
}

/** A shield with a report. */
export function PoliceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         width="22" height="22" {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z" />
      <path d="M9 12h6M12 9v6" />
    </svg>
  );
}
