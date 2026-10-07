import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Options, PageHeader } from "@/components/ui";
import { HELPDESK_CATEGORIES } from "@/lib/helpdesk";
import { createTicket } from "../actions";

export const metadata = { title: "New request" };

export default async function NewTicketPage({ searchParams }: PageProps<"/helpdesk/new">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const myAssets = user.employee
    ? await db.asset.findMany({ where: { employeeId: user.employee.id }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } })
    : [];
  const category = HELPDESK_CATEGORIES.find((c) => c === sp.category) ?? "";

  return (
    <>
      <PageHeader
        title="New request"
        subtitle={
          <>
            Goes to the admin team. You&apos;ll see replies and status changes here and on Home.{" "}
            <Link href="/helpdesk" className="link">
              Back to Helpdesk
            </Link>
          </>
        }
      />
      <div className="card max-w-2xl">
        <ActionForm action={createTicket} className="grid gap-4 sm:grid-cols-2">
          <Field label="What do you need?" className="sm:col-span-2">
            <input name="title" required maxLength={150} placeholder="e.g. Laptop charger not working" className="input" />
          </Field>
          <Field label="Category">
            <select name="category" required defaultValue={category} className="input">
              <option value="" disabled>
                Pick one
              </option>
              <Options values={HELPDESK_CATEGORIES} />
            </select>
          </Field>
          <Field label="How urgent?">
            <select name="priority" defaultValue="MEDIUM" className="input">
              <option value="LOW">Low: whenever you can</option>
              <option value="MEDIUM">Medium: this week</option>
              <option value="HIGH">High: it&apos;s stopping my work</option>
            </select>
          </Field>
          <Field label="Details" className="sm:col-span-2">
            <textarea
              name="description"
              required
              rows={5}
              maxLength={4000}
              placeholder="What happened, what you need, and by when. For a letter, say who it's addressed to."
              className="input"
            />
          </Field>
          {myAssets.length > 0 && (
            <Field label="Is it about one of your items? (optional)">
              <select name="assetId" defaultValue="" className="input">
                <option value="">No</option>
                {myAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Photo or PDF (optional, up to 5 MB)" className={myAssets.length > 0 ? "" : "sm:col-span-2"}>
            <input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="input py-1.5" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton>Send request</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </>
  );
}
