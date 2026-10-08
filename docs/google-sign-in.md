# Sign-in safety and Google sign-in

## What is on from the start

Nothing to set up. After this update:

- **Everyone signs in once more.** Older sign-ins aren't carried over.
- **Weak passwords get replaced.** A password that is too short, has no number, is a common one, contains "edubotics", or contains the person's own name has to be changed straight after signing in. This includes the starting admin password from `docker-compose.yml`.
- **New and reset passwords are temporary.** When an admin creates a login or sets a new password under Admin → Users, the person picks their own at the next sign-in. A reset also signs them out everywhere.
- **Wrong passwords lock the account.** 5 wrong passwords in a row lock that email for 15 minutes (even the right password is refused while locked). Admin → Users shows "Locked" with an **Unlock** button. 30 wrong passwords from one device in 15 minutes block that device for 15 minutes.
- **Unused sign-ins end.** People are signed out after 12 hours without using the app, and at least once a week.
- **My account** (bottom of the menu): change your password and see where you're signed in, with "Sign out other devices".
- **Sign out everywhere**: Admin → Users, for a lost phone. Switching off a login also signs that person out at once.
- **Activity log** (Admin → Activity log): sign-ins and wrong passwords, logins and role changes, settings changes, salary and payroll finalising, cancelled invoices, credit notes and bills, removed payments and refunds, people marked as left, cancelled certificates, and deleted records. Only admins see it.

The numbers (5 tries, 15 minutes, 12 hours) can be changed in Admin → Settings → Sign-in safety.

## Google sign-in (optional, off)

This adds a "Sign in with Google" button for people whose Google email matches their login here. Email and password keep working alongside it.

**It needs an https web address first.** Google only sends people back to an address starting with `https://` (or `http://localhost` on the office computer itself). The office Wi-Fi address (like `http://192.168.1.20:3000`) won't work, so set this up once the app has a web address, for example after hosting is decided or through a Cloudflare Tunnel (see `careers-page.md`).

### Steps (about 15 minutes)

1. Go to <https://console.cloud.google.com> and sign in with the company Google account.
2. Create a project (top bar → project picker → **New project**), name it "Edubotics One".
3. Open **APIs & Services → OAuth consent screen** (or "Google Auth Platform → Branding"). Fill in the app name "Edubotics One" and your email. For **Audience**, choose **Internal** if the company uses Google Workspace (only company accounts can sign in), otherwise **External** and add staff emails as test users.
4. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**, name "Edubotics One".
   - **Authorised redirect URIs**: copy the address shown in Admin → Settings → Google sign-in, after you've saved the app address there. It looks like `https://one.eduboticsglobal.com/auth/google/callback`.
   - Click **Create**. Google shows a **Client ID** and a **Client secret**.
5. In Edubotics One, Admin → Settings → Google sign-in:
   - **App address**: the https address people open the app at.
   - **Client ID** and **Client secret**: paste from step 4. The secret is stored encrypted and never shown again.
   - **Only allow Google accounts on this domain**: `eduboticsglobal.com` if everyone has a company Google account; leave blank to also allow personal Gmail accounts whose email matches a login.
   - Tick **Google sign-in is on** and save.
6. Open the sign-in page in a private window and try "Sign in with Google" before telling everyone.

### Good to know

- Nobody gets a login just by having a Google account: an admin still creates the login (Admin → Users) with the same email.
- The first Google sign-in links that Google account to the login. A different Google account with the same email is refused afterwards.
- Someone signed in with Google isn't asked to change a temporary password.
- If Google sign-in stops working (for example the secret was deleted in Google), untick it in Settings; passwords still work.
- The client ID and secret live only in the app's settings, never in this code.
