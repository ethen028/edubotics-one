import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { login } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            E1
          </div>
          <h1 className="text-xl font-semibold">Edubotics One</h1>
          <p className="text-sm text-slate-500">Sign in with your work account</p>
        </div>
        <ActionForm action={login} className="card space-y-4">
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" required autoComplete="email" className="input" />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input name="password" type="password" required autoComplete="current-password" className="input" />
          </label>
          <SubmitButton className="btn-primary w-full">Sign in</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
