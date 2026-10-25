import { LOGO_BOTTOM, LOGO_COLOURS, LOGO_SPARK, LOGO_TOP, LOGO_VIEWBOX } from "@/lib/logo";

/** Follows the page: the colour mark in the light look and on paper, the reverse mark in dark mode (see globals.css). */
const AUTO = { top: "var(--logo-top)", bottom: ["var(--logo-bottom-from)", "var(--logo-bottom-to)"], spark: "var(--logo-spark)" } as const;

/** The Edubotics mark. "auto" on page backgrounds, "reverse" on the teal-navy menu and panels. */
export function LogoMark({ variant = "auto", className = "h-full w-auto" }: { variant?: keyof typeof LOGO_COLOURS | "auto"; className?: string }) {
  const c = variant === "auto" ? AUTO : LOGO_COLOURS[variant];
  const gradient = `edubotics-mark-${variant}`;
  return (
    <svg viewBox={LOGO_VIEWBOX} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="40" y1="0" x2="200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: c.bottom[0] }} />
          <stop offset="1" style={{ stopColor: c.bottom[1] }} />
        </linearGradient>
      </defs>
      <path style={{ fill: c.top }} d={LOGO_TOP} />
      <path fill={`url(#${gradient})`} d={LOGO_BOTTOM} />
      <path style={{ fill: c.spark }} d={LOGO_SPARK} />
    </svg>
  );
}
