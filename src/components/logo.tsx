import { LOGO_PATH, LOGO_VIEWBOX } from "@/lib/logo";

/** The Edubotics mark, drawn in the current text colour. */
export function LogoMark({ className = "h-[62%] w-auto" }: { className?: string }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} className={className} fill="currentColor" aria-hidden="true">
      <path d={LOGO_PATH} />
    </svg>
  );
}
