import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PASSWORD_RULES } from "@/lib/passwords";
import { resetPassword } from "../account-actions";
import { PasswordInput } from "@/components/password-input";

export const metadata = { title: "Choose a new password", robots: { index: false, follow: false } };
export default async function ResetPassword({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
  return <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
    <h1 className="text-3xl font-semibold">Choose a new password</h1>
    {valid ? <ActionForm action={resetPassword} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block"><span className="label">New password</span><PasswordInput name="password" autoComplete="new-password" required minLength={8} maxLength={72} className="input" /></label>
      <label className="block"><span className="label">Repeat new password</span><PasswordInput name="confirm" autoComplete="new-password" required minLength={8} maxLength={72} className="input" /></label>
      <p className="text-xs text-slate-500">{PASSWORD_RULES} Resetting your password signs out all devices.</p>
      <SubmitButton>Reset password</SubmitButton>
    </ActionForm> : <p role="alert" className="mt-4 text-sm text-red-700">This link is invalid. Request another recovery email.</p>}
    <Link href="/forgot-password" className="link mt-6 text-sm">Request a new link</Link>
  </main>;
}
