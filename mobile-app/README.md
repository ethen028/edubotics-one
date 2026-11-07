# Orbit phone app

Orbit for Android and iPhone, built with Expo (React Native) and TypeScript. It talks to the same Orbit server as the website; it never connects to the database.

## What it does

- **Sign in** with the Orbit email and password, and the code from the authenticator app for people who switched sign-in codes on. Same lockout, rate limits and activity log as the web sign-in. The session is kept in the phone's secure storage.
- **My leave** (phone screen): balances, ask for leave with a date picker and half day, cancel, coming holidays. Same rules as the web form (`src/lib/leave-requests.ts`).
- **Approvals** (phone screen, managers and admins): everything waiting on them, grouped like the web Approvals page, with Approve and Reject (or Send back), a note, and the amount to approve on expense claims. Same rules as the web page (`src/lib/decisions.ts`, `src/lib/leave-requests.ts`); resignations open the web page.
- **My work** (phone screen, the My work tab): tasks assigned to you by when they're due, with progress, blocked and waiting notes, and a tap to change status. "Post update" opens the task page. Rules: `src/lib/my-work.ts`.
- **Timesheet** (phone screen): a week at a time, hours per day, log time against a task or project (start and end, or just hours), remove entries and send the week to your manager. Same checks as the web form (`src/lib/timesheet-entries.ts`); editing an entry and attaching files stay on the web page for now.
- **Home**: check in and out, hours today, "Waiting on you" (approvals, Inbox, messages) and shortcuts (My leave, Timesheet, Expenses, My payslips, Calendar, Follow-ups), each shown only when the person's role has the page.
- **Tabs**: Home, My work, Messages, Approvals, More. A tab only shows when the person can open that page.
- **More**: every page the person's role can open, grouped as in the web menu, with a search box; their name (opens My account) and Sign out.
- **Every other page** is the real Orbit page shown inside the app, already signed in, so the role checks, forms and rules are the website's own. Links to other sites (video calls) and file downloads open in the phone's browser.

### How pages open signed in

The app never puts its session token in a web address. To open a page it asks `POST /api/mobile/open-code` for a code that names the same session, works once and lasts one minute, then loads `/api/mobile/open?code=…&to=/page`, which turns the code into the normal session cookie and goes to the page (only pages inside Orbit). Because the cookie names the phone's own session, signing out on the phone, the idle limit, or ending the session in Admin signs the pages out too. Code: `src/lib/mobile-open.ts` in the web app.

## Server routes it uses

| Route | What for |
| --- | --- |
| `POST /api/mobile/auth/login` | Sign in; answers `needsCode: true` when a sign-in code is needed |
| `POST /api/mobile/auth/logout` | Ends the phone's session |
| `GET /api/mobile/dashboard` | Name, role and today's attendance |
| `POST /api/mobile/attendance` | Check in or out |
| `GET /api/mobile/leave`, `POST /api/mobile/leave`, `POST /api/mobile/leave/[id]/cancel` | My leave |
| `GET /api/mobile/approvals`, `POST /api/mobile/approvals/decide` | Approvals |
| `GET /api/mobile/work`, `POST /api/mobile/work/[id]/status` | My work |
| `GET /api/mobile/timesheet?week=`, `POST /api/mobile/timesheet`, `POST /api/mobile/timesheet/entries/[id]/delete`, `POST /api/mobile/timesheet/[id]/submit` | Timesheet |
| `GET /api/mobile/menu` | The person's menu (same as the website's) and waiting counts |
| `POST /api/mobile/open-code`, `GET /api/mobile/open` | Open an Orbit page inside the app |

## Point it at Orbit

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`:

- Android emulator with Orbit on the same computer: `http://10.0.2.2:3000`
- A phone on the office Wi-Fi with Expo Go (development only): the computer's address, e.g. `http://192.168.1.20:3000` (needs `APP_BIND_ADDRESS=0.0.0.0` in Orbit's `.env`)
- An installed app: an **https** address. Android blocks plain http for installed apps, so the office copy has to be reachable over https first (steps: `docs/office-https.md` in the web app, a free Cloudflare Tunnel).

## Run it while developing

```powershell
npm install
npx expo start
```

Open it in an Android emulator or the Expo Go app. `npm run typecheck` checks the code.

## Build the Android install file

Needs a free Expo account.

```powershell
npm install -g eas-cli
eas login
eas build:configure          # puts the real project id in app.json
eas build --platform android --profile preview     # an .apk to share by link
```

`--profile production` makes the Play Store bundle. iPhones need an Apple developer account and go through TestFlight.

## Look

Colours come from the web app's `src/lib/brand.ts` (`src/theme.ts`), icons from `src/components/icons.tsx` (`src/icon-paths.ts`), and the logo from `public/brand`. `tests/mobile-app.test.ts` in the web app fails if they drift apart. The app icon and splash are in `assets/`.

## Adding a phone screen for a module

1. Move the module's rules out of its server actions into `src/lib/` (as `src/lib/leave-requests.ts`), so the web form and the phone call the same function.
2. Add routes under `src/app/api/mobile/<module>` that start with `getApiUser()` and call those functions.
3. Add the screen in `src/screens/` and its page address in `src/native.tsx`. Home, More and the tabs then open the phone screen instead of the web page.
