# Design system

Orbit should feel calm and flat: one teal accent on a pale teal-grey page with white cards and a deep teal-navy menu, so the numbers and the next action stand out. The layout (icon rail, flat number cards, pill buttons, frosted top bar) was the owner's choice in October 2026 (PRs #36 and #38). The colours follow the Edubotics brand files the owner sent on 24 Oct 2026, which replaced the purple of PR #45.

Tokens live at the top of `src/app/globals.css`, dark mode in `src/app/theme-dark.css`. Use the tokens and shared classes; don't put hex values in components.

## Brand

The company is Edubotics Global; the app is **Orbit** (a name for internal use only; ORBIT is a registered trade mark of another company in software, so don't use it on anything sold or published).

The logo is a two-swoosh "E" with a four-point orange spark. Tagline: Learn. Build. Innovate. The owner's vector files (mark, horizontal and stacked wordmarks in colour, one-colour and reverse, and the sub-brand lockups) are in the project's brand folder, `brand/2026-10-24-teal-brand/`, with a preview sheet.

| In the code | What it is |
| --- | --- |
| `src/lib/logo.ts` | The mark as three SVG paths (`LOGO_TOP`, `LOGO_BOTTOM`, `LOGO_SPARK`), its colours and `logoSvg()` |
| `src/components/logo.tsx` | `<LogoMark variant>`: `auto` (colour mark, reverse in dark mode) on pages and documents, `reverse` on the teal-navy menu |
| `public/brand/` | Horizontal wordmark, colour and reverse. The reverse one is on the sign-in panel |
| `src/app/icon.svg`, `favicon.ico`, `apple-icon.png` | Teal-navy app icon with the reverse mark |
| `src/app/opengraph-image.tsx` | Link preview: teal-navy background, reverse mark, "Orbit", tagline in light teal, short orange bar |
| `src/lib/pdf/layout.tsx` | `BRAND = #0a3d47` and `<PdfLogo />`, the colour mark at the top of every PDF |
| `src/lib/mail.ts` | Emails: teal-navy header with an orange rule |

The mark is on the sign-in page, the menu, careers, every PDF (invoice, quote, credit note, receipt, payslip, certificate, relieving letter) and the printable pages (invoice, quote, purchase order, payslip, offer letter, programme report).

Sub-brand lockups exist but are not used in the app: Edubotics Kids, Edubotics Future, Edubotics Career Accelerator, Edubotics for Schools, and the parent-group lockup ("A division of Hindusthan Group"). Ask the owner before putting one on a document or page.

## Colour

Brand palette from the 24 Oct 2026 files:

| Name | Hex | Where it is used |
| --- | --- | --- |
| Deep teal-navy | `#0A3D47` | `--color-navy` and `brand-900`: menu rail, banners, sign-in panel, first number card, app icon, PDF headings, text on pale teal |
| Dark teal | `#0F5B66` | `brand-800`: button hover, menu flyout, start of the first card's gradient |
| Mid teal | `#0F7C86` | The logo's mid teal. The app uses `#0E7480` (`brand-700`), a touch darker, so white text on buttons (5.5:1) and teal links on the page (5.1:1) pass |
| Teal | `#14A3A8` | `brand-500`: focus borders, the mark's gradient. Too light for white text (3.1:1); never use it behind text |
| Light teal | `#8FE0DF` | `brand-300`: the reverse mark, link preview text |
| Orange spark | `#FF7A30` | `--color-spark`: the short bar on number cards, today's dot in the mini calendar, the email rule. Small marks only: it is 2.6:1 on white, so never text or a button |
| Grey text | `#4F6A70` | `slate-500`: secondary text (5.4:1 on the page) |
| Near-white | `#F4F8F8` | `--page-bg`, the reverse mark |

App tokens (light):

| Token | Value | Use |
| --- | --- | --- |
| `brand-50` … `brand-900` | `#f0fafa` … `#0a3d47` (700 = `#0e7480`) | Teal scale: hovers, selected rows, badges, chart bars |
| `--color-navy` | `#0a3d47` | The menu rail, hero banners, sign-in panel |
| `--color-spark` | `#ff7a30` | Small orange marks (see above) |
| `--color-mint` | `#e0f5f4` | Selected menu item and chip background |
| `--color-ink` | `#0a3d47` | Text on pale teal (10:1) |
| `slate-900` | `#132a30` | Main text |
| `slate-500` / `slate-400` | `#4f6a70` / `#587176` | Secondary and helper text (both pass 4.5:1 on the page) |
| `--page-bg` | `#f4f8f8` | Page background |
| `--color-surface` | `#fff` | Cards, menus, inputs |
| `--line` / `slate-200` | `#dde8e9` | Borders |

Status colours come from `<Badge color>`: gray, blue (teal tint), green, amber, red, purple. **Amber** means waiting on someone, **red** means overdue or blocked, **green** means done or paid; purple is kept for "in review". Don't use colour alone; the badge always has a word.

Dark mode (Light / Dark / System per person, `User.theme`) swaps the scales underneath: greys flip (with a slight teal tint), tints darken, link teal lightens to `#6fd6d4` (9.6:1 on cards), the button teal stays `#0e7480` with white text, and the logo switches to the reverse colours. Pages need no `dark:` classes. Printed pages and PDFs are always light.

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
| Number card (clickable if it has `href`) | `<Stat>` inside a `.grid`; the first one becomes the filled teal-navy tile |
| Status word | `<Badge color>` |
| Label + input | `<Field label>` wrapping an `.input` |
| Nothing to show | `<Empty>` with one line saying what to do next |
| Form bound to a server action | `<ActionForm>`, `<SubmitButton>` (`src/components/action-form.tsx`) |
| Delete or other risky action | `<ConfirmButton>`; deleting a project asks for its name |
| Page tabs under the title | `src/components/section-tabs.tsx` (driven by `src/lib/nav.ts`) |
| Toast after saving | returned `{ ok: "..." }` from the action; `ActionForm` shows it |
| Icons | `<Icon name>` from `src/components/icons.tsx` (24 px line icons; add a path there, no icon library) |

CSS classes: `.card`, `.input`, `.label`, `.btn-primary` (solid teal), `.btn-secondary` (soft grey, no border), `.btn-danger`, `.btn-sm`, `.table`, `.link`, `.hero-card`.

## Layout

- Shell: teal-navy icon rail on the left that expands to a grouped menu (choice saved per person); frosted top bar with the page title, Find anything, waiting-on-you chips, messages, bell and user menu. Below 768 px the menu is a drawer.
- Every page works at 375 px with no sideways page scroll. Wide tables scroll inside their card.
- Breakpoints are Tailwind's defaults (640, 768, 1024, 1280).

## Rules

- One accent colour. No new hues, rainbow charts or decorative gradients.
- No emoji or illustrations in the interface.
- Every interactive element has a visible focus ring; the active menu item has `aria-current`; form errors use `role="alert"`.
- Words are for office staff in Kerala: short, plain English, Indian formats (DD MMM YYYY, ₹, lakh grouping, financial year April to March).
