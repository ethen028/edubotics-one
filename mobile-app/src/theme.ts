/**
 * Orbit's colours on the phone: the same values as src/lib/brand.ts in the web app (tests/mobile-app.test.ts
 * keeps them in step). One blue accent, deep navy for banners, the robot's orange only for small marks.
 */
export const C = {
  blue: '#2563ae',
  navy: '#0f2d57',
  orange: '#ee6c23',
  page: '#f4f7fb',
  line: '#dce4ee',
  ink: '#14233a',
  muted: '#4a5b71',
  tint: '#e2edf9',
  onNavyMuted: '#c7d8ee',
  card: '#ffffff',
  green: '#17865d',
  greenSoft: '#e5f6ee',
  red: '#b42318',
  redSoft: '#fff4f3',
  grey: '#eef2f7',
} as const;

/** Status pills, the web app's Badge colours (src/components/ui.tsx, Tailwind's 100 and 700/800 shades). */
export const badge = {
  gray: { bg: '#f1f5f9', fg: '#334155' },
  blue: { bg: '#e2edf9', fg: '#2563ae' },
  green: { bg: '#d1fae5', fg: '#065f46' },
  amber: { bg: '#fef3c7', fg: '#92400e' },
  red: { bg: '#fee2e2', fg: '#b91c1c' },
} as const;

export const radius = { card: 14, button: 10, pill: 999 } as const;
