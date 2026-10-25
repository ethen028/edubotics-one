/** The Edubotics mark (two swooshes with an orange spark), from the owner's vector brand files of 24 Oct 2026. */
export const LOGO_VIEWBOX = "40 40 150 192";
export const LOGO_TOP =
  "M40 90Q40 86 42.76 83.11L77.09 47.23Q84 40 94 40L178.41 40Q190 40 188.1 51.43L187.9 52.57Q186 64 175.9 69.67L42.62 144.53Q40 146 40 143Z";
export const LOGO_BOTTOM =
  "M40 171Q40 168 42.5 166.34L49.68 161.55Q58 156 67.5 159.12L178.76 195.62Q186 198 186 205.62L186 206.38Q186 214 180.61 219.39L176.49 223.51Q168 232 156 232L90 232Q80 232 71.06 227.53L43.58 213.79Q40 212 40 208Z";
export const LOGO_SPARK =
  "M146 111C152.94 127.58 159.87 133.29 180 139C159.87 144.71 152.94 150.42 146 167C138.8 150.42 131.6 144.71 72 139C131.6 133.29 138.8 127.58 146 111Z";

/** Brand colours of the mark. Colour: on white. Reverse: on the deep teal-navy. */
export const LOGO_COLOURS = {
  color: { top: "#0a3d47", bottom: ["#0a3d47", "#14a3a8"], spark: "#ff7a30" },
  reverse: { top: "#f4f8f8", bottom: ["#8fe0df", "#8fe0df"], spark: "#ff8a3d" },
} as const;

/** The whole mark as a standalone SVG file (app icon, link preview). */
export function logoSvg(variant: keyof typeof LOGO_COLOURS, attrs = "") {
  const c = LOGO_COLOURS[variant];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}" ${attrs}><defs><linearGradient id="g" x1="40" y1="0" x2="200" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c.bottom[0]}"/><stop offset="1" stop-color="${c.bottom[1]}"/></linearGradient></defs><path fill="${c.top}" d="${LOGO_TOP}"/><path fill="url(#g)" d="${LOGO_BOTTOM}"/><path fill="${c.spark}" d="${LOGO_SPARK}"/></svg>`;
}
