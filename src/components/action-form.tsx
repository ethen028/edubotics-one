"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type FormState = { error?: string; ok?: string } | undefined;

/** A <form> bound to a server action that returns { error } on validation failure. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {state?.error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>
      )}
      {state?.ok && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</div>
      )}
      {children}
    </form>
  );
}

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingLabel = "Saving…",
}: {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
