import type { Notice, NoticeKind } from "@prisma/client";
import { ActionForm, SubmitButton, type FormState } from "@/components/action-form";
import { Field } from "@/components/ui";
import { toDateInput } from "@/lib/format";
import { POLICY_CATEGORIES } from "@/lib/notices";

export function NoticeForm({
  action,
  kind,
  notice,
  fileName,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  kind: NoticeKind;
  notice?: Notice;
  fileName?: string;
}) {
  const policy = kind === "POLICY";
  return (
    <ActionForm action={action} className="card space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <Field label="Title">
        <input
          name="title"
          required
          defaultValue={notice?.title}
          placeholder={policy ? "e.g. Leave policy 2026" : "e.g. Office closed on Saturday for Onam"}
          className="input"
        />
      </Field>
      {policy && (
        <Field label="Category">
          <select name="category" defaultValue={notice?.category ?? ""} className="input">
            <option value="">None</option>
            {POLICY_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label={policy ? "Summary or full policy text" : "Message"}>
        <textarea name="body" required rows={policy ? 10 : 6} defaultValue={notice?.body} className="input" />
      </Field>

      <div>
        <span className="label">{policy ? "Policy document (PDF or image, up to 5 MB)" : "Poster or document (optional, PDF or image, up to 5 MB)"}</span>
        {fileName && (
          <p className="mb-1 text-xs text-slate-500">
            Attached now: <b>{fileName}</b>. Choose a new file to replace it, or{" "}
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" name="removeFile" /> remove it
            </label>
            .
          </p>
        )}
        <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="text-sm" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {!policy && (
          <Field label="Show on Home until (optional)">
            <input name="showUntil" type="date" defaultValue={toDateInput(notice?.showUntil)} className="input" />
          </Field>
        )}
        <Field label="Acknowledge by (optional)">
          <input name="ackDueDate" type="date" defaultValue={toDateInput(notice?.ackDueDate)} className="input" />
        </Field>
      </div>

      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="requiresAck" defaultChecked={notice ? notice.requiresAck : policy} className="mt-0.5" />
          <span>
            Everyone must read and acknowledge this
            <span className="block text-xs text-slate-500">They see it on Home until they tap “I have read this”, and you see who hasn&apos;t.</span>
          </span>
        </label>
        {notice?.requiresAck && (
          <label className="flex items-start gap-2">
            <input type="checkbox" name="askAgain" className="mt-0.5" />
            <span>
              Ask everyone to acknowledge again
              <span className="block text-xs text-slate-500">Use this when the content changed. Earlier acknowledgements stop counting.</span>
            </span>
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pinned" defaultChecked={notice?.pinned} /> Pin to the top
        </label>
      </div>

      <SubmitButton>{notice ? "Save changes" : policy ? "Publish policy" : "Post announcement"}</SubmitButton>
    </ActionForm>
  );
}
