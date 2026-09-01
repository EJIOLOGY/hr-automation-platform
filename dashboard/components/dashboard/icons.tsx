/**
 * Bespoke icon set for the HR Operations dashboard.
 *
 * Hand-drawn outline icons (24x24, 1.75 stroke, rounded joins) so the
 * dashboard isn't dependent on a third-party icon library's visual
 * language. Every icon accepts a `className` for sizing/coloring via
 * Tailwind (`size-4 text-muted-foreground`, etc.) and renders with
 * `currentColor`, so it inherits text color the same way lucide icons did.
 */

import type { ReactNode } from "react";

export type IconProps = {
  className?: string;
};

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconCalendar({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3.4" />
      <path d="M16 3v3.4" />
    </Svg>
  );
}

export function IconChevronDown({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14.5 5 8 12l6.5 7" />
    </Svg>
  );
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9.5 5 16 12l-6.5 7" />
    </Svg>
  );
}

export function IconDownload({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.5v11.3" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 17.5v2.2a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8v-2.2" />
    </Svg>
  );
}

export function IconGrid({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.6" />
    </Svg>
  );
}

export function IconMessage({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4.2 3.2a.6.6 0 0 1-.96-.48V16.5H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5Z" />
    </Svg>
  );
}

export function IconRefresh({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.5L19 8" />
      <path d="M19 4v4h-4" />
      <path d="M19.5 12a7.5 7.5 0 0 1-12.6 5.5L5 16" />
      <path d="M5 20v-4h4" />
    </Svg>
  );
}

export function IconTimer({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2" />
      <path d="M9 2h6" />
      <path d="M12 2v2" />
    </Svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c.7-3.2 3-5 5.5-5s4.8 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M15.2 12.3c2.1.3 3.7 1.9 4.3 4.5" />
    </Svg>
  );
}

export function IconAlertTriangle({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.5 21 19H3L12 3.5Z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="16.7" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconBot({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 4v4" />
      <circle cx="12" cy="3" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="13.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13.5" r="1.3" fill="currentColor" stroke="none" />
      <path d="M8 17.5h8" />
    </Svg>
  );
}

export function IconMoreVertical({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="5.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconWorkflow({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="6" cy="6" r="2.1" />
      <circle cx="6" cy="18" r="2.1" />
      <circle cx="17" cy="12" r="2.1" />
      <path d="M8.1 6.9 15 11.2" />
      <path d="M8.1 17.1 15 12.8" />
    </Svg>
  );
}

export function IconDocument({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8.5 8h7" />
      <path d="M8.5 12h7" />
      <path d="M8.5 16h4" />
    </Svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 12.5 9.5 17 19 7" />
    </Svg>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 12h14" />
      <path d="M13 6l6 6-6 6" />
    </Svg>
  );
}

export function IconTrendUp({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 15 15 5" />
      <path d="M7 5h8v8" />
    </Svg>
  );
}

export function IconTrendDown({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 5l10 10" />
      <path d="M15 7v8H7" />
    </Svg>
  );
}
