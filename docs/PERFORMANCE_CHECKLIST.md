# Speed checklist

A 31-point app-speed checklist, checked against Orbit's code on 3 Nov 2026 (main at `eb9b576`). It was read from the code only: nothing was measured, timed or profiled, and no code was changed.

Orbit is used by about 10 staff, on one office computer over Wi-Fi (Docker) and a Vercel demo in Mumbai (`bom1`). Several items below are written for apps with thousands of users and are marked "Not needed" for that reason, not because they are wrong.

**Marks:** Done = applies and the code already does it. Partly = applies, done in places. To do = applies, not done. Not needed = does not apply to Orbit today. Unclear = can't tell from the code; needs a measurement or a setting only the owner can see.

| # | Item | Mark | Evidence |
| --- | --- | --- | --- |
| 1 | Skeleton loading screens | Done | `src/app/(app)/loading.tsx` shows grey header, number-card and table blocks for every signed-in page; `.skeleton` in `globals.css` only pulses under `motion-safe`. |
| 2 | Images in WebP/AVIF, sized to fit | Partly | The app's own art is SVG. Photos people upload (notice attachments, checklist photos, chat images) are served as uploaded at full size, with no resizing, via plain `<img>` (`notices/[id]/page.tsx:81`, `checklists/run/.../page.tsx:136`). |
| 3 | No duplicate requests | Done | Session lookup is wrapped in React `cache()` (`src/lib/auth.ts:70`); submit buttons disable while saving (`SubmitButton` in `action-form.tsx` uses `useFormStatus`); the Messages poll is one call every 5 s and stops when the tab is hidden (`messages/client.tsx`). |
| 4 | Debounce search inputs | Not needed | No input calls the server per keystroke: the menu search and Ctrl K filter a list already in the page (`sidebar.tsx:243`, `command-palette.tsx:120`). List filters are submitted forms. |
| 5 | Paginate lists | To do | 360 `findMany` calls, 75 with `take`, and only one page with real next/previous paging (`admin/activity/page.tsx`, `PAGE + 1`). Leads and Helpdesk stop at 200 rows with no way to see the rest (`crm/leads/page.tsx:38`); invoices load every invoice with its payments and credit notes (`invoices/data.ts:69`). |
| 6 | Static files through a CDN | Done | Vercel serves `/_next/static` from its edge. The office copy is on the same Wi-Fi as its users, so a CDN would add distance, not remove it. |
| 7 | Slow work in a background job | Partly | Recovery emails go through a queue table (`accountMailJob`, `src/lib/account-mailer.ts`) and reminders/backups run on a timer (`src/instrumentation.ts`). But "Email all payslips" and "Email all certificates" build a PDF and send each email one after another inside the button press (`emails/actions.ts:189`, `:307`). |
| 8 | N+1 queries | Done | Reads use `include`/`select` to fetch related rows in one query. The `await` inside loops are writes inside one transaction over a handful of invoice or order lines (`invoices/actions.ts:187`, `purchases/actions.ts:292`), which is fine at this size. |
| 9 | Brotli/Gzip compression | Done | `next start` gzips responses by default (`compress` is not turned off in `next.config.ts`); Vercel compresses at its edge; the optional https gateway has `encode zstd gzip` (`docker/Caddyfile`). |
| 10 | Shared cache (Redis) | Not needed | One server, ten people, Postgres on the same machine. A second store would add a moving part for no visible gain. |
| 11 | Remove unused dependencies | Done | Ten runtime dependencies, each in use (`package.json`); AGENTS.md rule 3 keeps it that way. Starter files `public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg` look unused but are tiny and never downloaded unless linked. |
| 12 | Timeouts on outside calls | Done | Turnstile and Google sign-in use `AbortSignal.timeout(10s)` (`captcha.ts:23`, `google-sign-in.ts:114`); SMTP has connect/greeting/socket timeouts (`mail.ts:48`). The Claude call in `src/lib/agent/claude-loop.ts` has none, but no page uses it yet. |
| 13 | Stream AI answers | Not needed | The expense-claims helper in `src/lib/agent/` is not wired to any page (`ask.ts` says so). Revisit if it is. |
| 14 | Update the screen before the server answers | Not needed | Buttons show "Saving…" while pending, which is right for HR, payroll and billing where a false "done" would mislead. The one place it would help is sending a chat message. |
| 15 | Lazy-load images below the screen | Partly | Chat images have `loading="lazy"` (`messages/ui.tsx:23`); notice and checklist photos don't. |
| 16 | Independent requests in parallel | Done | 152 `Promise.all` calls; pages load their data side by side (for example `admin/users/page.tsx:16`). |
| 17 | Database indexes | Done | 194 `@@index` lines across 110 tables in `prisma/schema.prisma`, plus unique keys. Not checked with `EXPLAIN` on real data. |
| 18 | Request tracing (OpenTelemetry) | Not needed | `src/lib/telemetry.ts` already keeps per-route counts and durations for 24 h (Admin > Health). Full tracing needs an outside service; not worth it for ten users. |
| 19 | Server close to the database | Unclear | Vercel functions run in Mumbai (`vercel.json` `"regions": ["bom1"]`). The Neon databases' region isn't in the repo; if either is outside Mumbai/Singapore, every query pays the distance. The office copy has both on one computer. |
| 20 | Render pages on the server | Done | App Router server components; 30 of 251 `.tsx` files are `"use client"`. |
| 21 | Third-party scripts after the page | Done | The only outside script is the Turnstile captcha on public forms, through `next/script`, and only when `REQUIRE_CAPTCHA` is on (`components/captcha.tsx`). Video calls open Jitsi in a new tab, so its script never loads in Orbit. |
| 22 | Split JavaScript by page | Done | Next splits per route. The heavy PDF library (`@react-pdf/renderer`) is only imported on the server (`src/lib/pdf/`). No chart or editor libraries. |
| 23 | Virtualize long lists | Not needed | No list is long enough to need it; paging (item 5) is the better fix. |
| 24 | Fetch only needed columns | Partly | 608 `select:` blocks. Some list pages still pull whole rows: leads load the full owner user row (`include: { owner: true }`, `crm/leads/page.tsx:38`), Users loads every user with the whole employee record (`admin/users/page.tsx:18`). Server-only, so nothing leaks, but more than the page shows. |
| 25 | Database connection pooling | Unclear | One shared Prisma client per server process (`src/lib/db.ts`). On Vercel each function needs Neon's pooled address (`-pooler` in `DATABASE_URL`); that setting lives in Vercel, not the repo. The office copy doesn't need it. |
| 26 | Avoid needless re-renders | Unclear | Small client side (30 files, 33 `useEffect`, 8 `useMemo`/`useCallback`), nothing obviously wrong. Needs the React profiler to say more. |
| 27 | Browser caching of static files | Done | Next sends `immutable`, one-year caching for hashed files under `/_next/static`; private files send `private, no-store` (`admin/settings/signature/route.ts`). |
| 28 | Load balancing | Not needed | One office computer, ten users. Vercel scales on its own. |
| 29 | Self-hosted fonts, few weights | Done | `next/font/google` downloads Plus Jakarta Sans at build time and serves it from Orbit itself, as one variable font (`src/app/layout.tsx:9`). |
| 30 | Real-user speed tracking | To do | Nothing records how fast pages feel on staff devices (no Web Vitals reporting). Server timings exist (item 18) but not what the browser sees. |
| 31 | Test on slow phones and networks | To do | No recorded test on a budget Android over office Wi-Fi or mobile data. AGENTS.md asks for 375 px layout checks, not speed checks. |

## Applies but not done, in priority order

1. **Page through long lists (5).** Leads and Helpdesk silently stop at 200 rows, and invoices, employees and users load everything. This is the one that will get slower every month. Reuse the next/previous paging already on Admin > Activity.
2. **Send bulk emails in the background (7).** "Email all payslips" and "Email all certificates" make a PDF and send each email in turn while the button spins; on Vercel a big workshop could hit the time limit. Queue them like recovery emails and show "Sending…" progress.
3. **Check the Neon region and pooled address on Vercel (19, 25).** Five minutes in the Vercel and Neon dashboards; owner only. Both databases should be in Mumbai or Singapore and `DATABASE_URL` should use the `-pooler` host.
4. **Try Orbit on a budget phone (31).** Open Home, Leads, Invoices and Messages on a cheap Android over office Wi-Fi and over mobile data, and note anything that takes more than two seconds.
5. **Trim columns on list pages (24).** Swap `include: { owner: true }` and whole-row loads for `select` of the fields shown, starting with Leads and Users.
6. **Shrink and lazy-load uploaded photos (2, 15).** Add `loading="lazy"` to notice and checklist photos now; resizing uploads on save can wait until phones are in daily use.
7. **Record real page speed (30).** Optional. Next's built-in Web Vitals hook could feed the existing Admin > Health counts without any outside service.

Items 12 (Claude call timeout) and 13 (streaming) only matter once the expense-claims helper is put on a page; add both then.
