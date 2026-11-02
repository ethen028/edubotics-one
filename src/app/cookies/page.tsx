import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Cookie preferences", robots: { index: true, follow: true } };

export default function CookiesPage() {
  return <LegalPage title="Cookie preferences">
    <p>This release uses essential cookies to maintain a signed-in session. These cookies are needed for workspace access and cannot be disabled independently while staying signed in.</p>
    <fieldset className="rounded-lg border border-slate-200 p-5">
      <legend className="px-2 font-semibold">Current settings</legend>
      <p>Essential authentication: always active when signed in.</p>
      <p>Optional analytics and advertising cookies: none used.</p>
    </fieldset>
    <p>There are no optional cookies to accept or reject. You can sign out to end your session or remove cookies using your browser settings. Blocking all cookies may prevent sign-in. Browser settings also control storage on this device.</p>
    <p>We store only the acknowledgement of the cookie notice in this browser’s local storage. When configured, Cloudflare Turnstile provides essential spam protection on public forms. It is not used as a visitor analytics service.</p>
    <p>If optional tracking is introduced later, this page and the consent controls must be updated before it is enabled.</p>
  </LegalPage>;
}
