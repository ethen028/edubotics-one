# Put the office copy on an https address

The phone app (and phones away from the office Wi-Fi) need Orbit on an `https://` address. This guide gives the office computer one, `https://orbit.eduboticsglobal.com`, through a free Cloudflare Tunnel. No port is opened on the office router and nothing moves off the office computer. About 45 minutes, plus up to a day for the domain change to spread.

Orbit is only reachable while the office computer is on and online.

## 0. Before you start

1. **Take a backup**: Admin > Backups > Back up now, and copy the file somewhere safe.
2. **Change the weak passwords**, because the sign-in page will now be reachable from the internet:
   - Sign in as the admin and change the admin password (My account > Change password) to a long one.
   - Put a new `SESSION_SECRET` in `.env` (any 64 random characters). Everyone signs in once more after the restart. Do this before anyone switches on sign-in codes.
   - The database password stays inside the office computer (the tunnel never exposes the database), but if it was shared, change it with the steps in the update pack.
3. Ask staff with admin, HR or manager logins to switch on sign-in codes (My account > Sign-in codes). It stays optional.

## 1. Move the domain's DNS to Cloudflare (once)

1. Make a free account at <https://dash.cloudflare.com/sign-up>.
2. **Add a domain**: `eduboticsglobal.com`, Free plan. Cloudflare copies the current DNS records.
3. Check the copied list against your domain provider's list. The website (`@`, `www`) and the **email records (MX, TXT)** must all be there, or the website or email stops working.
4. At the domain provider, replace the two nameservers with the two Cloudflare shows. Cloudflare emails you when the domain is active (minutes to a day).

## 2. Make the tunnel on the office computer

1. In Cloudflare: **Zero Trust > Networks > Tunnels > Create a tunnel > Cloudflared**. Name it `orbit-office`.
2. Choose **Windows**, copy the install command it shows, and run it in PowerShell opened **as administrator** on the office computer. It installs `cloudflared` as a service that starts with Windows.
3. Back in Cloudflare, the tunnel shows **Healthy**. Add a **Public hostname**:
   - Subdomain `orbit`, Domain `eduboticsglobal.com`
   - Service type `HTTP`, URL `localhost:3000`
4. Save.

## 3. Tell Orbit its new address

In the folder with `docker-compose.yml`, open `.env` and set these lines (add any that are missing):

```
APP_URL=https://orbit.eduboticsglobal.com
COOKIE_SECURE=true
TRUST_PROXY_HEADERS=true
APP_BIND_ADDRESS=127.0.0.1
```

Leave `PUBLIC_CAREERS_HOST` empty while Orbit itself is on the tunnel (with it set, everything arriving through Cloudflare is limited to the careers page).

`APP_BIND_ADDRESS=127.0.0.1` means only the tunnel and the office computer itself can reach Orbit, so staff in the office use the new address too. Leave `FORCE_HTTPS` off: the tunnel already sends everyone over https.

Then restart:

```
docker compose up -d --build
```

## 4. Check it

1. On a phone with **Wi-Fi off** (mobile data), open `https://orbit.eduboticsglobal.com` and sign in.
2. On a staff laptop, do the same and try one form (apply for leave, then cancel it).
3. Admin > Activity log shows the sign-ins with the phone's real address, not `unknown`.

## 5. Tell staff

Send everyone the new address and ask them to bookmark it, or add it to the phone's home screen (browser menu > Add to Home screen). The old `http://192.168…` address stops working.

## If something goes wrong

- **The page doesn't open**: Cloudflare > Tunnels shows the tunnel Down. On the office computer, open Services and start "Cloudflared agent".
- **Sign-in goes round in a circle**: `COOKIE_SECURE=true` was set but the page was opened over `http://`. Use the https address.
- **Go back to office Wi-Fi only**: set `APP_BIND_ADDRESS=0.0.0.0`, `COOKIE_SECURE=false`, clear `APP_URL`, run `docker compose up -d --build`, and delete the public hostname in Cloudflare.
