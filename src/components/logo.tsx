import { useId } from "react";
import { LOCKUP_VIEWBOX, LOGO_COLOURS, LOGO_DECOR, LOGO_FACE, LOGO_FEATURES, LOGO_RING, LOGO_TAGLINE, LOGO_WORD, MARK_VIEWBOX, type LogoVariant } from "@/lib/logo";

/** Follows the page: blue wordmark in the light look and on paper, white in dark mode (see globals.css). */
const AUTO = { ...LOGO_COLOURS.color, word: "var(--logo-word)", tagline: "var(--logo-tagline)" };

function Logo({ variant, lockup, className }: { variant: LogoVariant | "auto"; lockup: boolean; className: string }) {
  const c = variant === "auto" ? AUTO : LOGO_COLOURS[variant];
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox={lockup ? LOCKUP_VIEWBOX : MARK_VIEWBOX} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}o`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={c.ring[0]} />
          <stop offset="1" stopColor={c.ring[1]} />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={c.face[0]} />
          <stop offset="1" stopColor={c.face[1]} />
        </linearGradient>
      </defs>
      <path fill={`url(#${id}b)`} fillRule="evenodd" d={LOGO_FACE} />
      <path fill={c.decor} fillOpacity={0.55} fillRule="evenodd" d={LOGO_DECOR} />
      <path fill={c.features} fillRule="evenodd" d={LOGO_FEATURES} />
      <path fill={`url(#${id}o)`} fillRule="evenodd" d={LOGO_RING} />
      {lockup && (
        <>
          <path style={{ fill: c.word }} fillRule="evenodd" d={LOGO_WORD} />
          <path style={{ fill: c.tagline }} fillRule="evenodd" d={LOGO_TAGLINE} />
        </>
      )}
    </svg>
  );
}

/** The Edubotics robot head. It reads on white and on the navy menu alike, so one version serves both. */
export function LogoMark({ variant = "auto", className = "h-auto w-full" }: { variant?: LogoVariant | "auto"; className?: string }) {
  return <Logo variant={variant} lockup={false} className={className} />;
}

/** Head, EDUBOTICS and the tagline. "auto" on page backgrounds, "reverse" (white wordmark) on the navy panels. */
export function LogoLockup({ variant = "auto", className = "h-auto w-full" }: { variant?: LogoVariant | "auto"; className?: string }) {
  return <Logo variant={variant} lockup className={className} />;
}
