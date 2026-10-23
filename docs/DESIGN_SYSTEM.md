# Design system

Orbit should feel calm and flat: one purple accent on a pale lavender page with white cards, so the numbers and the next action stand out. This look was the owner's choice (October 2026, PRs #36 and #38). PR #45 changed the purple to the logo's #7C3AED.

Tokens live at the top of `src/app/globals.css`, dark mode in `src/app/theme-dark.css`. Use the tokens and shared classes; don't put hex values in components.

## Brand

The company is Edubotics Global; the app is **Orbit** (a name for internal use only; ORBIT is a registered trade mark of another company in software, so don't use it on anything sold or published).

The logo is a two-piece "E" with a four-point spark, from the owner's brand sheet. Tagline: Learn. Build. Innovate.

| In the code | What it is |
| --- | --- |
| `src/lib/logo.ts` | The mark as one SVG path (`LOGO_PATH`, `LOGO_VIEWBOX`) |
| `src/components/logo.tsx` | `<LogoMark />`, drawn in `currentColor`. Used on sign-in, the menu and careers |
| `src/app/icon.svg`, `favicon.ico`, `apple-icon.png` | Navy app icon with the near-white mark |
| `src/app/opengraph-image.tsx` | Link preview: navy background, mark, "Orbit", tagline in lavender |
| `src/lib/pdf/layout.tsx` | `BRAND = #7c3aed`, the accent on every PDF |

The original files (navy, white and gradient marks, app icons, wordmark lockups) are in the owner's brand folder, not in the repo. The wordmark is only a PNG crop and is soft in print; get vector files from the designer before printing.

## Colour

Brand palette from the brand sheet:

| Name | Hex | Where it is used |
| --- | --- | --- |
| Deep navy | `#0B1020` | App icon and link preview backgrounds only |
| Electric purple | `#7C3AED` | `brand-700`: icon rail (`--color-navy`), primary buttons, active tabs, links, PDF accent |
| Lavender | `#A78BFA` | `brand-400`: support colour, link preview text |
| Cyan | `#06B6D4` | Not used in the app. Keep it for marketing material unless the owner asks |
| Near-white | `#F8FAFC` | The mark on navy |

App tokens (light):

| Token | Value | Use |
| --- | --- | --- |
| `brand-50` … `brand-900` | `#f5f3ff` … `#5b21b6` (700 = `#7c3aed`) | Purple scale: hovers, selected rows, badges, chart bars |
| `--color-navy` | `#7c3aed` | The menu rail, hero banners, sign-in panel (the name is historical; it is purple) |
| `--color-mint` | `#ede9fe` | Selected menu item background |
| `--color-ink` | `#4c1d95` | Headings on tinted cards |
| `slate-900` | `#1e1b3a` | Main text |
| `slate-500` / `slate-400` | `#545a72` / `#646a85` | Secondary and helper text (both pass 4.5:1 on the page) |
| `--page-bg` | `#f5f4fb` | Page background |
| `--color-surface` | `#fff` | Cards, menus, inputs |
| `--line` / `slate-200` | `#e6e4f2` | Borders |

Status colours come from `<Badge color>`: gray, blue (purple tint), green, amber, red, purple. **Amber** means waiting on someone, **red** means overdue or blocked, **green** means done or paid. Don't use colour alone; the badge always has a word.

Dark mode (Light / Dark / System per person, `User.theme`) swaps the scales underneath: greys flip, tints darken, the button purple stays strong. Pages need no `dark:` classes. Printed pages and PDFs are always light.

Known leftovers of the older violet: the first number card's gradient (`#6a5cf5` → `#4a3be0`) and the `--depth-2` shadow tint in `globals.css`. Move them to the brand scale when you next touch those lines.

## Type

Plus Jakarta Sans everywhere (`next/font` in `src/app/layout.tsx`, `--font-sans` and `--font-display`). Page titles `text-2xl font-bold`; section headings `text-base`/`text-lg font-semibold`; body `text-sm`; helper text `text-xs text-slate-500`. Money uses `formatINR` (₹ with Indian grouping, 1,25,000).

## Shape, space and motion

- Radii: cards 20 px (`.card`), banners 24 px, inputs 12 px, buttons and chips fully round.
- Spacing: Tailwind's 4 px scale. Card padding `p-5`; gaps between cards `gap-4`; page header `mb-6`.
- Depth: one soft shadow on cards. Frosted glass only on things that float (top bar, dropdowns, dialogs).
- Motion: short (150 ms) with one easing, `cubic-bezier(0.22, 1, 0.36, 1)`. Everything stops under `prefers-reduced-motion`.

## Components

Use these before writing new markup:

| Need | Use |
| --- | --- |
| Page title, subtitle, buttons on the right | `<PageHeader>` (`src/components/ui.tsx`) |
| Number card (clickable if it has `href`) | `<Stat>` inside a `.grid`; the first one becomes the filled purple tile |
| Status word | `<Badge color>` |
| Label + input | `<Field label>` wrapping an `.input` |
| Nothing to show | `<Empty>` with one line saying what to do next |
| Form bound to a server action | `<ActionForm>`, `<SubmitButton>` (`src/components/action-form.tsx`) |
| Delete or other risky action | `<ConfirmButton>`; deleting a project asks for its name |
| Page tabs under the title | `src/components/section-tabs.tsx` (driven by `src/lib/nav.ts`) |
| Toast after saving | returned `{ ok: "..." }` from the action; `ActionForm` shows it |
| Icons | `<Icon name>` from `src/components/icons.tsx` (24 px line icons; add a path there, no icon library) |

CSS classes: `.card`, `.input`, `.label`, `.btn-primary` (solid purple), `.btn-secondary` (soft grey, no border), `.btn-danger`, `.btn-sm`, `.table`, `.link`, `.hero-card`.

## Layout

- Shell: purple icon rail on the left that expands to a grouped menu (choice saved per person); frosted top bar with the page title, Find anything, waiting-on-you chips, messages, bell and user menu. Below 768 px the menu is a drawer.
- Every page works at 375 px with no sideways page scroll. Wide tables scroll inside their card.
- Breakpoints are Tailwind's defaults (640, 768, 1024, 1280).

## Rules

- One accent colour. No new hues, rainbow charts or decorative gradients.
- No emoji or illustrations in the interface.
- Every interactive element has a visible focus ring; the active menu item has `aria-current`; form errors use `role="alert"`.
- Words are for office staff in Kerala: short, plain English, Indian formats (DD MMM YYYY, ₹, lakh grouping, financial year April to March).
