import Link from "next/link";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { Empty, Field, PageHeader } from "@/components/ui";
import { OPEN_PROJECT_STAGES, projectScope } from "@/lib/projects";
import { reservedByItem } from "@/lib/inventory";
import { createRequest } from "../../actions";
import { KeepValuesForm, RequestLines } from "./lines";

export const metadata = { title: "Request items" };

export default async function NewRequestPage({ searchParams }: PageProps<"/inventory/requests/new">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const [items, projects, reserved] = await Promise.all([
    db.stockItem.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    db.project.findMany({
      where: { ...projectScope(user), stage: { in: [...OPEN_PROJECT_STAGES] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    reservedByItem(),
  ]);
  const projectId = projects.some((p) => p.id === sp.project) ? sp.project : undefined;

  return (
    <>
      <PageHeader
        title="Request items"
        subtitle={
          isAdmin(user)
            ? "Your own requests are approved straight away."
            : "Your manager or an admin approves it, then an admin hands the items out."
        }
        actions={
          <Link href="/inventory/requests" className="btn-secondary">
            Back
          </Link>
        }
      />
      {items.length === 0 ? (
        <Empty>There are no items in stock yet. An admin adds them under Inventory → Stock.</Empty>
      ) : (
        <div className="card max-w-3xl">
          <KeepValuesForm action={createRequest} className="space-y-4">
            <div>
              <span className="label">Items</span>
              <RequestLines
                items={items.map((i) => ({
                  id: i.id,
                  name: i.name,
                  sku: i.sku,
                  unit: i.unit,
                  category: i.category,
                  available: Math.max(0, i.onHand - (reserved.get(i.id) ?? 0)),
                }))}
                initialItemId={items.some((i) => i.id === sp.item) ? sp.item : undefined}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Project" className="sm:col-span-3">
                <select name="projectId" defaultValue={projectId ?? ""} className="input">
                  <option value="">Not for a project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="What it's for" className="sm:col-span-3">
                <input name="purpose" required placeholder="Grade 6 robotics batch at St. Mary's, Edappally" className="input" />
              </Field>
              <Field label="Needed by">
                <input name="neededBy" type="date" className="input" />
              </Field>
              <Field label="Will return by">
                <input name="returnBy" type="date" className="input" />
              </Field>
            </div>
          </KeepValuesForm>
        </div>
      )}
    </>
  );
}
