import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth";
import { PASSWORD_RULES } from "@/lib/passwords";
import { googleSetup } from "@/lib/google-sign-in";
import { deviceName } from "@/lib/devices";
import { formatDateTime } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, PageHeader } from "@/components/ui";
import { changePassword, signOutOtherDevices } from "../../actions";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const { user, session } = current;
  const [sessions, settings] = await Promise.all([
    db.session.findMany({ where: { userId: user.id, endedAt: null }, orderBy: { lastSeenAt: "desc" } }),
    db.companySettings.findUnique({ where: { id: 1 } }),
  ]);
  const googleOn = !!settings && !!googleSetup(settings);
  const others = sessions.filter((s) => s.id !== session.id).length;

  return (
    <>
      <PageHeader title="My account" subtitle={`${user.name} · ${user.email}`} />
      <div className="grid gap-6 xl:grid-cols-2">
        <ActionForm action={changePassword} className="card space-y-3 self-start">
          <h2 className="font-semibold">Change password</h2>
          <Field label="Current password" className="block">
            <input name="current" type="password" required autoComplete="current-password" className="input" />
          </Field>
          <Field label="New password" className="block">
            <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </Field>
          <Field label="New password again" className="block">
            <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </Field>
          <p className="text-xs text-slate-500">{PASSWORD_RULES} Changing it signs you out on your other devices.</p>
          <SubmitButton>Change password</SubmitButton>
          {user.passwordChangedAt && <p className="text-xs text-slate-500">Last changed {formatDateTime(user.passwordChangedAt)}.</p>}
        </ActionForm>

        <div className="space-y-6">
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
