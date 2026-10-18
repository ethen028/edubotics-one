import Link from "next/link";
import { headers } from "next/headers";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Captcha } from "@/components/captcha";
import { captchaConfig } from "@/lib/captcha";
import { requestPasswordReset } from "../account-actions";

export const metadata = { title: "Reset password", robots: { index: false, follow: false } };
export default async function ForgotPassword() {
  const config = captchaConfig();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
    <h1 className="text-3xl font-semibold">Reset your password</h1>
    <p className="mt-3 text-sm text-slate-500">Enter your work email. If email recovery is available, we’ll send a one-use link. Your admin can also help.</p>
    <ActionForm action={requestPasswordReset} className="mt-6 space-y-4">
      <label className="block"><span className="label">Work email</span><input name="email" type="email" autoComplete="email" required maxLength={254} className="input" /></label>
      <Captcha siteKey={config.ready ? config.siteKey : null} action="account-recovery" nonce={nonce} />
      {config.required && !config.ready ? <p role="status" className="text-sm text-amber-800">Email recovery is temporarily unavailable. Contact your admin.</p> : <SubmitButton>Send recovery link</SubmitButton>}
    </ActionForm>
    <Link href="/login" className="link mt-6 text-sm">Back to sign in</Link>
  </main>;
}
