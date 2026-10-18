import Link from "next/link";
import { getCurrentSession } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { requestEmailVerification, verifyEmail } from "../account-actions";

export const metadata = { title: "Verify work email", robots: { index: false, follow: false } };
export default async function VerifyEmail({ searchParams }: PageProps<"/verify-email">) {
  const { token } = await searchParams;
  const current = await getCurrentSession();
  return <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
    <h1 className="text-3xl font-semibold">Verify your work email</h1>
    {typeof token === "string" && /^[a-f0-9]{64}$/.test(token) ?
      <ActionForm action={verifyEmail} className="mt-6 space-y-4"><input type="hidden" name="token" value={token} /><p className="text-sm text-slate-500">Confirm that you requested this verification email.</p><SubmitButton>Verify email</SubmitButton></ActionForm> :
      current ? current.user.emailVerifiedAt ? <p className="mt-4 text-sm">Your email is verified.</p> :
        <ActionForm action={requestEmailVerification} className="mt-6 space-y-4"><p className="text-sm text-slate-500">Send a verification link to {current.user.email}.</p><SubmitButton>Send verification email</SubmitButton></ActionForm> :
        <p className="mt-4 text-sm">Sign in to request a verification email.</p>}
    <Link href={current ? "/" : "/login"} className="link mt-6 text-sm">{current ? "Return to workspace" : "Sign in"}</Link>
  </main>;
}
