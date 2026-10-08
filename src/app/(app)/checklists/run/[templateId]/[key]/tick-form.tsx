"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/components/action-form";

function Submit({ children, className }: { children: React.ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Saving…" : children}
    </button>
  );
}

/**
 * Tick one item. Plain items are one tap; a photo item opens the phone camera first.
 * A note or photo can be added to any item, before or after ticking.
 */
export function TickForm({
  action,
  ticked,
  needsPhoto,
  hasPhoto,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  ticked: boolean;
  needsPhoto: boolean;
  hasPhoto: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [extra, setExtra] = useState(needsPhoto && !ticked);
  const form = useRef<HTMLFormElement>(null);

  if (ticked && !extra) {
    return (
      <div className="mt-2 pl-9">
        <button type="button" onClick={() => setExtra(true)} className="text-xs text-brand-700 hover:underline">
          {hasPhoto ? "Change photo or add a note" : "Add a note or photo"}
        </button>
      </div>
    );
  }

  return (
    <form ref={form} action={formAction} className="mt-2 space-y-2 pl-9">
      {state?.error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      {extra && (
        <div className="space-y-2">
          <label className="block">
            <span className="label">{needsPhoto ? "Photo (required)" : "Photo (optional)"}</span>
            <input
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              required={needsPhoto && !hasPhoto}
              className="text-sm"
            />
          </label>
          <textarea name="note" rows={2} maxLength={1000} placeholder="Note (optional)" className="input" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Submit className={ticked ? "btn-secondary btn-sm" : "btn-primary btn-sm min-w-24"}>{ticked ? "Save" : "Done"}</Submit>
        {!extra && (
          <button type="button" onClick={() => setExtra(true)} className="text-xs text-brand-700 hover:underline">
            Add a note or photo
          </button>
        )}
        {extra && ticked && (
          <button type="button" onClick={() => setExtra(false)} className="text-xs text-slate-500 hover:underline">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
