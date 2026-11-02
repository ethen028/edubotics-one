/**
 * The Edubotics brand colours, sampled from the logo the owner sent on 2 Nov 2026 (orange robot head,
 * blue face and blue EDUBOTICS wordmark). This is the one list for code that can't read CSS: PDFs,
 * emails, the link preview and the logo. The page itself uses the matching tokens at the top of
 * src/app/globals.css; tests/brand-colours.test.ts keeps the two in step and checks text contrast.
 */
export const BRAND = {
  /** The wordmark blue. Buttons, links, PDF headings. White on it is 6.0:1. */
  blue: "#2563ae",
  /** The lighter blue at the top of the face. Focus rings and accents, never behind text (4.4:1). */
  blueLight: "#1d7ec2",
  /** Deep blue-navy for the menu rail, banners, sign-in panel and email header. White on it is 13.7:1. */
  navy: "#0f2d57",
  /** The robot's orange, for small marks only (bars, dots, rules). 3.2:1 on white, so never text. */
  orange: "#ee6c23",
  /** Page background, a pale blue-grey. */
  page: "#f4f7fb",
  /** Borders and rules. */
  line: "#dce4ee",
  /** Main text. */
  ink: "#14233a",
  /** Secondary text. 6.5:1 on the page. */
  muted: "#4a5b71",
  /** Pale blue for selected rows and soft table heads. */
  tint: "#e2edf9",
  /** Muted text on the navy. */
  onNavyMuted: "#c7d8ee",
  /** The logo's own gradients and greys, used only to draw the logo. */
  logoOrange: ["#e96324", "#f07922"],
  logoBlue: ["#2058a6", "#1d7ec2"],
  logoDecor: "#2e9ed1",
  logoGrey: "#3e3e3f",
} as const;
