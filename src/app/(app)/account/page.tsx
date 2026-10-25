import { redirect } from "next/navigation";
import { rawDb as db } from "@/lib/db"; // your own sessions, across the group
import { allCompanies, companyOfSession, firstCompanyId } from "@/lib/company";
import { switchCompany } from "../companies/actions";
import { getCurrentSession } from "@/lib/auth";
import { PASSWORD_RULES } from "@/lib/passwords";
import { googleSetup } from "@/lib/google-sign-in";
import { deviceName } from "@/lib/devices";
import { formatDateTime } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, PageHeader } from "@/components/ui";
import { changePassword, setAppearance, signOutOtherDevices } from "../../actions";

const THEMES = [
  { value: "LIGHT", label: "Light" },
  { value: "DARK", label: "Dark" },
  { value: "SYSTEM", label: "Match my device" },
] as const;
import { requestEmailVerification } from "../../account-actions";
import { PasswordInput } from "@/components/password-input";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const { user, session } = current;
  const [sessions, settings] = await Promise.all([
    db.session.findMany({ where: { userId: user.id, endedAt: null }, orderBy: { lastSeenAt: "desc" } }),
    db.companySettings.findUnique({ where: { companyId: await firstCompanyId() } }), // Google sign-in is set up in the first company
  ]);
  const companies = user.isSuperadmin ? await allCompanies() : [];
  const here = companyOfSession(current);
  const googleOn = !!settings && !!googleSetup(settings);
  const others = sessions.filter((s) => s.id !== session.id).length;

  return (
    <>
      <PageHeader title="My account" subtitle={`${user.name} · ${user.email}`} />
      <div className="grid gap-6 xl:grid-cols-2">
        <ActionForm action={changePassword} className="card space-y-3 self-start">
          <h2 className="font-semibold">Change password</h2>
          <Field label="Current password" className="block">
            <PasswordInput name="current" required autoComplete="current-password" className="input" />
          </Field>
          <Field label="New password" className="block">
            <PasswordInput name="password" required minLength={8} autoComplete="new-password" className="input" />
          </Field>
          <Field label="New password again" className="block">
            <PasswordInput name="confirm" required minLength={8} autoComplete="new-password" className="input" />
          </Field>
          <p className="text-xs text-slate-500">{PASSWORD_RULES} Changing it signs you out on your other devices.</p>
          <SubmitButton>Change password</SubmitButton>
          {user.passwordChangedAt && <p className="text-xs text-slate-500">Last changed {formatDateTime(user.passwordChangedAt)}.</p>}
        </ActionForm>

        <div className="space-y-6">
          {companies.length > 0 && (
            <div className="card space-y-3">
              <div>
                <h2 className="font-semibold">Your companies</h2>
                <p className="mt-1 text-xs text-slate-500">You are the group&apos;s superadmin. Pick the company to work in; this browser stays in it until you switch.</p>
              </div>
              <ul className="divide-y divide-slate-100">
                {companies.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-sm font-medium">{c.name}</span>
                    {c.id === here ? (
                      <Badge color="green">Open now</Badge>
                    ) : (
                      <form action={switchCompany}>
                        <input type="hidden" name="companyId" value={c.id} />
                        <button className="btn-secondary">Switch</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <form action={setAppearance} className="card space-y-4">
            <div>
              <h2 className="font-semibold">Appearance</h2>
              <p className="mt-1 text-xs text-slate-500">Applies on every device you sign in on. Printed pages always come out light.</p>
            </div>
            <div>
              <div className="label">Colours</div>
              <div className="flex flex-wrap gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    name="theme"
                    value={t.value}
                    aria-pressed={user.theme === t.value}
                    className={user.theme === t.value ? "btn-primary" : "btn-secondary"}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </form>

          <div className="card space-y-3">
            <h2 className="font-semibold">Work email</h2>
            <p className="text-sm text-slate-500">{user.emailVerifiedAt ? `Verified ${formatDateTime(user.emailVerifiedAt)}` : "Your work email has not been verified."}</p>
            {!user.emailVerifiedAt && <ActionForm action={requestEmailVerification}><SubmitButton className="btn-secondary">Send verification email</SubmitButton></ActionForm>}
          </div>
          <div className="card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Where you&apos;re signed in</h2>
              {others > 0 && (
                <form action={signOutOtherDevices}>
                  <button className="btn-secondary">Sign out other devices</button>
                </form>
              )}
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <div className="font-medium">
                      {deviceName(s.userAgent)} {s.id === session.id && <Badge color="blue">This device</Badge>}
                    </div>
                    <div className="text-xs text-slate-500">
                      Signed in {formatDateTime(s.createdAt)} {s.method === "GOOGLE" ? "with Google" : "with password"}
                      {s.ip ? ` from ${s.ip}` : ""}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">Last used {formatDateTime(s.lastSeenAt)}</div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              You&apos;re signed out after {settings?.sessionIdleHours ?? 12} hours without using the app, and once a week in any case.
            </p>
          </div>

          {googleOn && (
            <div className="card text-sm">
              <h2 className="mb-1 font-semibold">Google sign-in</h2>
              {user.googleSub ? (
                <p>Your Google account is linked. Use &ldquo;Sign in with Google&rdquo; on the sign-in page.</p>
              ) : (
                <p>
                  You can use &ldquo;Sign in with Google&rdquo; with the Google account for <strong>{user.email}</strong>. It links on first use.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
