# Edubotics One Mobile

A native React Native companion app using Expo. Android is the first delivery target; the same codebase is structured to support iOS. It connects to the existing Edubotics One Next.js backend and PostgreSQL-backed session/attendance data; it does not connect directly to PostgreSQL.

## Current MVP
- Email/password sign-in against the existing user table and sign-in lockout controls
- JWT session stored using Android/iOS secure storage
- Revocable sessions: each token references the existing `Session` database row
- Home dashboard, employee profile, today's attendance sessions
- Check-in / check-out using the existing `AttendanceSession` table
- Sign-out revokes the mobile session

## 1. Integrate backend changes
The parent project contains the mobile API routes and bearer-token support. Merge the supplied backend files into the existing project directory, preserving your `.env` and database volume. Rebuild only the app service:

```powershell
docker compose up -d --build app
docker compose logs --tail=80 app
```

Do not run `docker compose down -v`.

## 2. Configure the API URL
Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`:
- Android emulator with the backend on the same development PC: `http://10.0.2.2:3000`
- Physical phone on the same Wi-Fi: use the PC's LAN address, e.g. `http://192.168.1.20:3000`, and configure Docker to bind to `0.0.0.0` plus a Windows Firewall rule for private networks.
- Production: use an HTTPS hostname and a valid TLS certificate. Do not expose the app over plain HTTP on a public network.
- An installed APK (preview/production build) only talks to an `https://` address: Android blocks plain `http://` for release builds. Plain http on office Wi-Fi works only in Expo Go during development.

The existing Compose configuration binds to `127.0.0.1:3000` by default, so a physical phone cannot normally reach it until LAN binding is deliberately configured.

## 3. Run in development
Install Node.js LTS, then from this folder:

```powershell
npm install
npx expo start
```

Use an Android emulator or Expo Go for local UI development. For real backend calls, make sure the API URL is reachable from the device.

## 4. Build an installable Android APK
Install the EAS CLI and sign in to Expo:

```powershell
npm install -g eas-cli
eas login
eas build:configure
```

`app.json` has a placeholder EAS project ID; `eas build:configure` will create/assign the real project ID. Then build an internal APK:

```powershell
eas build --platform android --profile preview
```

EAS builds the APK in the cloud and provides a link when finished. A local APK build requires Android Studio/Android SDK and Java configured on the build machine. This source package does not include a compiled APK or signing key.

## Security notes
- Keep PostgreSQL private; the app talks only to HTTPS API routes.
- Use a strong unique admin password and rotate database/session secrets before production if they were exposed during setup.
- Mobile bearer tokens are stored with SecureStore and can be revoked by ending their `Session` row.
- If a user is required to change a temporary/weak password or verify email, complete that account setup in the web app before mobile access.
