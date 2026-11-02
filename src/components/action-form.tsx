"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFormStatus } from "react-dom";
import { useNotification } from "./notifications";
import { formatDraftTime, readFields, writeFields, type Fields } from "./draft-fields";

export type FormState = { error?: string; ok?: string } | undefined;

/** The signed-in person's id, so drafts are kept per login. Forms outside the app (sign-in) keep no drafts. */
const DraftOwner = createContext<string | null>(null);
export function DraftOwnerProvider({ userId, children }: { userId: string; children: ReactNode }) {
  return <DraftOwner.Provider value={userId}>{children}</DraftOwner.Provider>;
}

type Draft = { at: number; fields: Fields };
const DRAFT_DAYS = 7;

/**
 * Keeps what's typed into a long "new …" form in this browser, so a dropped connection, a closed tab or a
 * mistake the server sends back doesn't lose it. Cleared once the form is saved.
 */
function useDraft(form: RefObject<HTMLFormElement | null>, name: string | undefined, state: FormState) {
  const owner = useContext(DraftOwner);
  const key = owner && name ? `orbit:draft:${owner}:${name}` : null;
  const [restored, setRestored] = useState<number | null>(null);
  const sent = useRef<Fields | null>(null);

  // Bring a draft back when the form opens.
  useEffect(() => {
    const el = form.current;
    if (!key || !el) return;
    try {
      const draft = JSON.parse(localStorage.getItem(key) ?? "null") as Draft | null;
      if (!draft?.fields?.length) return;
      if (Date.now() - draft.at > DRAFT_DAYS * 86_400_000) {
        localStorage.removeItem(key);
        return;
      }
      writeFields(el, draft.fields);
      // Shown once the browser has filled the boxes in; a draft is found only after the page has loaded.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRestored(draft.at);
    } catch {
      // No storage (private window): the form just starts empty.
    }
  }, [form, key]);

  // Save as the person types, a moment after they pause.
  useEffect(() => {
    const el = form.current;
    if (!key || !el) return;
    let timer: ReturnType<typeof setTimeout>;
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const fields = readFields(el);
        try {
          if (fields.some(([, v]) => v !== "" && v !== false)) localStorage.setItem(key, JSON.stringify({ at: Date.now(), fields }));
          else localStorage.removeItem(key);
        } catch {}
      }, 600);
    };
    const submit = () => {
      clearTimeout(timer);
      sent.current = readFields(el);
    };
    el.addEventListener("input", save);
    el.addEventListener("change", save);
    el.addEventListener("submit", submit);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("input", save);
      el.removeEventListener("change", save);
      el.removeEventListener("submit", submit);
    };
  }, [form, key]);

  // After sending: a mistake sent back puts the typed values back in (React empties the form after every
  // send); a save clears the draft. A save that moves on to the new record never comes back here, so the
  // draft is dropped when the form goes away after sending.
  useEffect(() => {
    if (!key || !sent.current) return;
    const el = form.current;
    if (state?.error && el) {
      writeFields(el, sent.current);
      try {
        localStorage.setItem(key, JSON.stringify({ at: Date.now(), fields: sent.current }));
      } catch {}
    } else {
      try {
        localStorage.removeItem(key);
      } catch {}
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRestored(null);
    }
    sent.current = null;
  }, [state, form, key]);
  useEffect(
    () => () => {
      if (key && sent.current) {
        try {
          localStorage.removeItem(key);
        } catch {}
      }
    },
    [key],
  );

  function discard() {
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {}
    form.current?.reset();
    setRestored(null);
  }
  return { restored, discard };
}

/**
 * A <form> bound to a server action that returns { error } on validation failure. With `draft` (a short name
 * such as "new-lead") what's typed is kept in the browser until the form is saved.
 */
export function ActionForm({
  action,
  children,
  className,
  draft,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  draft?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const notify = useNotification();
  const form = useRef<HTMLFormElement>(null);
  const { restored, discard } = useDraft(form, draft, state);
  useEffect(() => { if (state?.ok) notify(state.ok); }, [state, notify]);
  return (
    <form ref={form} action={formAction} className={className}>
      {restored && (
        <div role="status" className="draft-note">
          <span>We kept what you typed here on {formatDraftTime(restored)}.</span>
          <button type="button" className="link text-sm" onClick={discard}>
            Start again
          </button>
        </div>
      )}
      {state?.error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>
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
    <button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending && <span className="submit-spinner" aria-hidden="true" />}{pending ? pendingLabel : children}
    </button>
  );
}

/**
 * A submit button for something that can't be undone (deleting, removing, cancelling). It asks
 * first, naming what will go; with `typeToConfirm` the person has to type that text (a project's
 * name, say) before it goes ahead.
 */
export function ConfirmButton({
  children,
  message,
  typeToConfirm,
  className,
  title,
}: {
  children: ReactNode;
  message: string;
  typeToConfirm?: string;
  className?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      title={title}
      aria-label={title}
      onClick={(e) => {
        if (typeToConfirm) {
          const typed = window.prompt(`${message}\n\nType "${typeToConfirm}" to confirm.`);
          if (typed?.trim().toLowerCase() !== typeToConfirm.trim().toLowerCase()) e.preventDefault();
        } else if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
