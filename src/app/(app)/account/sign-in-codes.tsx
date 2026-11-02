"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/action-form";
import { PasswordInput } from "@/components/password-input";
import { Field } from "@/components/ui";
import { cancelSignInCodeSetup, confirmSignInCodes, newSignInBackupCodes, startSignInCodes, turnOffSignInCodes, type CodesState } from "./actions";

type Props = {
  on: boolean;
  enabledOn: string | null;
  backupLeft: number;
  /** The key being set up, grouped in fours, and the link that opens it in an authenticator app. */
  setup: { key: string; link: string } | null;
};

/** My account card: switch on a code from an authenticator app at sign-in, and manage backup codes. */
export function SignInCodes({ on, enabledOn, backupLeft, setup }: Props) {
  const [confirmed, confirm] = useActionState<CodesState, FormData>(confirmSignInCodes, undefined);
  const [renewed, renew] = useActionState<CodesState, FormData>(newSignInBackupCodes, undefined);
  const [off, turnOff] = useActionState<CodesState, FormData>(turnOffSignInCodes, undefined);
  const codes = renewed?.codes ?? confirmed?.codes;

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="font-semibold">Sign-in codes</h2>
        <p className="mt-1 text-xs text-slate-500">
          An extra step at sign-in: after your password, type the 6-digit code from an authenticator app on your phone (Google Authenticator,
          Microsoft Authenticator or similar). Someone who learns your password still can&apos;t get in.
        </p>
      </div>

      {codes && (
        <div role="status" className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
          <p className="font-medium">Your backup codes</p>
          <p className="mt-1 text-xs text-slate-600">Each works once if you lose your phone. Write them down or print this page now; they won&apos;t be shown again.</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
            {codes.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}
      {off?.ok && <p role="status" className="text-sm text-brand-800">{off.ok}</p>}

      {on ? (
        <>
          <p className="text-sm">
            On since {enabledOn}. {backupLeft} backup {backupLeft === 1 ? "code" : "codes"} left.
          </p>
          <form action={renew} className="space-y-2">
            <Field label="Your password" className="block">
              <PasswordInput name="password" required autoComplete="current-password" className="input" />
            </Field>
            {renewed?.error && <p role="alert" className="text-sm text-red-700">{renewed.error}</p>}
            <SubmitButton className="btn-secondary">Make new backup codes</SubmitButton>
          </form>
          <form action={turnOff} className="space-y-2 border-t border-slate-100 pt-3">
            <Field label="Your password" className="block">
              <PasswordInput name="password" required autoComplete="current-password" className="input" />
            </Field>
            {off?.error && <p role="alert" className="text-sm text-red-700">{off.error}</p>}
            <SubmitButton className="btn-secondary">Turn off sign-in codes</SubmitButton>
          </form>
        </>
      ) : setup ? (
        <>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              In your authenticator app, add an account and choose to enter a setup key. Use this key, time-based:
              <div className="mt-1 rounded-lg bg-slate-50 p-2 font-mono text-sm break-all select-all">{setup.key}</div>
              <a href={setup.link} className="link mt-1 inline-block text-xs">On this phone? Open it in your authenticator app</a>
            </li>
            <li>Type the 6-digit code the app shows for Orbit.</li>
          </ol>
          <form action={confirm} className="space-y-2">
            <Field label="Code from the app" className="block">
              <input name="code" required autoComplete="one-time-code" inputMode="numeric" maxLength={7} className="input tracking-widest" />
            </Field>
            {confirmed?.error && <p role="alert" className="text-sm text-red-700">{confirmed.error}</p>}
            <div className="flex flex-wrap gap-2">
              <SubmitButton>Switch on</SubmitButton>
              <button formAction={cancelSignInCodeSetup} formNoValidate className="btn-secondary">Cancel</button>
            </div>
          </form>
        </>
      ) : (
        <form action={startSignInCodes}>
          <p className="mb-3 text-sm text-slate-500">Off. Optional for everyone.</p>
          <SubmitButton className="btn-secondary">Set up sign-in codes</SubmitButton>
        </form>
      )}
    </div>
  );
}
