# Careers page

Edubotics One has a public jobs page at `/careers`. Candidates read the open jobs and apply with their resume; each application arrives in **Recruitment** as a new candidate (source "Careers page"), and the Recruitment menu item shows a count until someone moves them on.

## Turning it on

1. **Admin → Settings → Careers page**: tick "Careers page is on", add a welcome line and, if you like, an email for candidates' questions.
2. On each job you want listed, open it in **Recruitment** and tick **Show on the careers page**. An optional "Apply by" date takes it off the page after that day. Filled, closed or on-hold jobs drop off by themselves.

The page shows only a job's title, department, type, location, description and closing date. It never shows salary ranges, the hiring manager, other candidates or anything else inside the app.

## Today: office network only

The app runs on the office computer, so `/careers` opens only for people on the office Wi-Fi (for example `http://192.168.1.20:3000/careers`). That is enough to check how it looks and to let a walk-in candidate apply on a tablet at the front desk.

## Putting it on the internet later

Once hosting is decided, there are two safe ways. Both rely on the guard in `src/proxy.ts`: when the `PUBLIC_CAREERS_HOST` setting names the public address, any request for that address can only read the careers pages and send an application. Sign-in, every app page, file downloads and every internal form answer "not found", so nobody on the internet can try passwords or see staff data.

### Option A: a tunnel from the office computer (no hosting needed)

A free Cloudflare Tunnel publishes one address, such as `jobs.eduboticsglobal.com`, to the app on the office computer without opening any port on the office router.

1. Add the domain `eduboticsglobal.com` to a free Cloudflare account (or use a subdomain of it).
2. Install `cloudflared` on the office computer and create a tunnel that sends `jobs.eduboticsglobal.com` to `http://localhost:3000`. As a second lock, limit the tunnel to the careers paths:

   ```yaml
   ingress:
     - hostname: jobs.eduboticsglobal.com
       path: ^/(careers|_next/static|favicon\.ico|$)
       service: http://localhost:3000
     - service: http_status:404
   ```

3. In `docker-compose.yml`, under `app:` → `environment:`, add `PUBLIC_CAREERS_HOST: jobs.eduboticsglobal.com`, then run `docker compose up -d --build`.
4. Link to `https://jobs.eduboticsglobal.com/careers` from the "Careers" menu on www.eduboticsglobal.com.

Anything arriving through Cloudflare is treated as public even if it uses another name, so the office address stays private. The page is only up while the office computer is on.

### Option B: when Edubotics One moves to a hosted server

Set `PUBLIC_CAREERS_HOST` to the public jobs address on the server and point that address at the same app. Staff keep using their own address with sign-in; the jobs address serves only the careers page.

## Protection already built in

- Resume is required: PDF, JPG, PNG or WebP only (checked from the file itself), up to 5 MB.
- A hidden field catches simple bots; their posts are thanked and dropped.
- At most 5 applications an hour from one connection and 60 an hour in total.
- Someone applying twice for the same job (same email or phone) is added to their existing record with the new resume, not duplicated.
- Candidates tick a box agreeing that their details may be kept for hiring.

Not built yet: an automatic "we got your application" email (the emails module only sends when someone clicks), and a CAPTCHA. Add a CAPTCHA if junk applications start arriving once the page is public.
