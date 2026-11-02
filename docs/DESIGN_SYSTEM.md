# Design system

Orbit should feel calm and flat: one blue accent on a pale blue-grey page with white cards and a deep blue-navy menu, so the numbers and the next action stand out. The layout (icon rail, flat number cards, pill buttons, frosted top bar) was the owner's choice in October 2026 (PRs #36 and #38). The colours follow the Edubotics robot logo the owner sent on 2 Nov 2026, which replaced the teal brand of PR #50.

**Palette in one place.** `src/lib/brand.ts` (`BRAND`) holds the brand colours for code that can't read CSS: PDFs, emails, the link preview, the logo and the app icon. The page uses the matching tokens at the top of `src/app/globals.css`, dark mode in `src/app/theme-dark.css`. `tests/brand-colours.test.ts` fails if the two lists drift apart or if text on a brand colour drops below WCAG AA (4.5:1). Use the tokens and shared classes; don't put hex values in components.

## Brand

The company is Edubotics Global; the app is **Orbit** (a name for internal use only; ORBIT is a registered trade mark of another company in software, so don't use it on anything sold or published).

The logo is a smiling robot head: an orange outline with ears and an antenna, a blue face with white eyes, an eye band and a smile, and faint maths and science marks on the face. Below it, the EDUBOTICS wordmark in blue and the tagline "Leading way to the future." in dark grey. The owner's files (PNG, 2 Nov 2026) are in the project's brand folder, `brand/2026-11-02-robot-brand/`. Only this main logo is used in the app; no sub-brand lockups.

| In the code | What it is |
| --- | --- |
| `src/lib/brand.ts` | `BRAND`: every brand colour with where it goes |
| `src/lib/logo.ts` | The logo traced to SVG paths (`LOGO_RING`, `LOGO_FACE`, `LOGO_DECOR`, `LOGO_FEATURES`, `LOGO_WORD`, `LOGO_TAGLINE`), `MARK_VIEWBOX` (head only) and `LOCKUP_VIEWBOX` (head, wordmark, tagline), `LOGO_COLOURS` and `logoSvg()` |
| `src/components/logo.tsx` | `<LogoMark>` (the head, same colours on white and on navy) and `<LogoLockup variant>`: `auto` (blue wordmark, white in dark mode), `reverse` (white wordmark on navy) |
| `public/brand/` | `edubotics-logo.svg` (colour lockup), `edubotics-logo-reverse.svg` (for navy) and `edubotics-mark.svg` (head), made from `logoSvg()` |
| `src/app/icon.svg`, `favicon.ico`, `apple-icon.png` | Navy rounded tile with the robot head |
| `src/app/opengraph-image.tsx` | Link preview: navy background, reverse lockup, "Orbit", the tagline, a short orange bar |
| `src/lib/pdf/layout.tsx` | `BRAND` (blue headings and rules), `NAVY`, `SPARK` and `<PdfLogo />`, the robot head at the top of every PDF |
| `src/lib/mail.ts` | Emails: navy header with an orange rule |

The robot head is on the sign-in page, the menu, careers, every PDF (invoice, quote, credit note, receipt, payslip, certificate, every HR letter and the ID card, from `src/lib/pdf/letter.tsx`) and the printable pages (invoice, quote, purchase order, payslip, programme report). The full lockup is on the sign-in panel and the link preview.

## Colour

Sampled from the 2 Nov 2026 logo:

| Name | Hex | Where it is used |
| --- | --- | --- |
| Wordmark blue | `#2563AE` | `brand-700` / `BRAND.blue`: buttons, links, the open tab, PDF headings and rules. White on it is 6.0:1, on the page 5.6:1 |
| Face light blue | `#1D7EC2` | `brand-500` / `BRAND.blueLight`: focus borders and accents. 4.4:1 with white, so never behind text |
| Deep blue-navy | `#0F2D57` | `--color-navy` / `BRAND.navy`: menu rail, banners, sign-in panel, first number card, app icon tile, email header, ID card band. White on it is 13.7:1 |
| Dark blue | `#1D4F93` | `brand-800`: button hover, menu flyout |
| Robot orange | `#EE6C23` | `--color-spark` / `BRAND.orange` (the logo runs `#E96324` to `#F07922`): the short bar on number cards, the mark beside the open menu page, the dot on the open tab, the short bar under page titles, the top edge of table cards, today's dot in the mini calendar, the email rule, the ID card rule. Small marks only: 3.2:1 on white, so never text or a button |
| Blue-grey text | `#4A5B71` | `slate-500` / `BRAND.muted`: secondary text (6.5:1 on the page) |
| Page | `#F4F7FB` | `--page-bg` / `BRAND.page` |
| Logo grey | `#3E3E3F` | The tagline in the colour logo only |

App tokens (light):

| Token | Value | Use |
| --- | --- | --- |
| `brand-50` … `brand-900` | `#f1f6fc` … `#173d73` (500 = `#1d7ec2`, 700 = `#2563ae`) | Blue scale: hovers, selected rows, badges, chart bars |
| `--color-navy` | `#0f2d57` | The menu rail, hero banners, sign-in panel, open tab |
| `--color-spark` | `#ee6c23` | Small orange marks (see above) |
| `--color-mint` | `#e2edf9` | Selected menu item and chip background (pale blue) |
| `--color-ink` | `#173d73` | Text on pale blue (9.6:1) |
| `slate-900` | `#14233a` | Main text |
| `slate-500` / `slate-400` | `#4a5b71` / `#56677d` | Secondary and helper text (both pass 4.5:1 on the page) |
| `--page-bg` | `#f4f7fb` | Page background |
| `--color-surface` | `#fff` | Cards, menus, inputs |
| `--line` / `slate-200` | `#dce4ee` | Borders |
| `--tint-2` … `--tint-4` | `#e9f1fb`, `#e8f5fb`, `#fff1e6` | Number card fills: pale blue, pale sky, sand |

Status colours come from `<Badge color>`: gray, blue, green, amber, red, purple. **Amber** means waiting on someone, **red** means overdue or blocked, **green** means done or paid; purple is kept for "in review". Don't use colour alone; the badge always has a word.

Dark mode (Light / Dark / System per person, `User.theme`) swaps the scales underneath: greys flip (with a slight blue tint), tints darken, link blue lightens to `#8cc0ef` (9.0:1 on cards), the button blue stays `#2563ae` with white text, and the wordmark turns white. The robot head keeps its colours. Pages need no `dark:` classes. Printed pages and PDFs are always light.

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
| Number card (clickable if it has `href`) | `<Stat>` inside a `.grid`; the first one becomes the filled navy tile |
| Status word | `<Badge color>` |
| Label + input | `<Field label>` wrapping an `.input` |
| Nothing to show | `<Empty>` with one line saying what to do next |
| Form bound to a server action | `<ActionForm>`, `<SubmitButton>` (`src/components/action-form.tsx`) |
| Delete or other risky action | `<ConfirmButton>`; deleting a project asks for its name |
| Page tabs under the title | `src/components/section-tabs.tsx` (driven by `src/lib/nav.ts`) |
| Toast after saving | returned `{ ok: "..." }` from the action; `ActionForm` shows it |
| Icons | `<Icon name>` from `src/components/icons.tsx` (24 px line icons; add a path there, no icon library) |

CSS classes: `.card`, `.input`, `.label`, `.btn-primary` (solid blue), `.btn-secondary` (soft grey, no border), `.btn-danger`, `.btn-sm`, `.table`, `.link`, `.hero-card`.

## Layout

- Shell (owner's choice, 28 Oct 2026): a navy rail on the left with one named icon per section, and beside it a white panel with the pages of the section you are on (or the one clicked), under small headings for long sections (`section` on a menu item in `src/lib/nav.ts`). The panel can be hidden to leave the rail (saved per person); pointing at an icon then shows its pages in a card; frosted top bar with the page title, Find anything, waiting-on-you chips, messages, bell and user menu. Below 768 px the menu is a drawer.
- Every page works at 375 px with no sideways page scroll. Wide tables scroll inside their card.
- Breakpoints are Tailwind's defaults (640, 768, 1024, 1280).

## Rules

- One accent colour. No new hues, rainbow charts or decorative gradients.
- No emoji or illustrations in the interface.
- Every interactive element has a visible focus ring; the active menu item has `aria-current`; form errors use `role="alert"`.
- Words are for office staff in Kerala: short, plain English, Indian formats (DD MMM YYYY, ₹, lakh grouping, financial year April to March).
