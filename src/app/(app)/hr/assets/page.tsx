import Link from "next/link";
import type { AssetStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, PageHeader } from "@/components/ui";
import { formatDate, humanize } from "@/lib/format";
import { ASSET_CATEGORIES } from "@/lib/hr-constants";
import { assignAsset, createAsset, setAssetStatus } from "./actions";

export const metadata = { title: "Assets" };

const COLOR: Record<AssetStatus, "green" | "blue" | "amber" | "gray"> = {
  AVAILABLE: "green",
  ASSIGNED: "blue",
  REPAIR: "amber",
  RETIRED: "gray",
};

export default async function AssetsPage({ searchParams }: PageProps<"/hr/assets">) {
  await requireUser(["ADMIN"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const filter = ["AVAILABLE", "ASSIGNED", "REPAIR", "RETIRED"].includes(sp.status ?? "") ? (sp.status as AssetStatus) : undefined;
  const [assets, employees, counts] = await Promise.all([
    db.asset.findMany({
      where: filter ? { status: filter } : { status: { not: "RETIRED" } },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ category: "asc" }, { code: "asc" }],
    }),
    db.employee.findMany({ where: { status: { not: "EXITED" } }, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
    db.asset.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: AssetStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <>
      <PageHeader title="Assets" subtitle="Laptops, access cards, lab and robotics kits, and who has them." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="?" className={!filter ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
          In use or stock
        </Link>
        {(["AVAILABLE", "ASSIGNED", "REPAIR", "RETIRED"] as const).map((s) => (
          <Link key={s} href={`?status=${s}`} className={filter === s ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
            {humanize(s)} ({count(s)})
          </Link>
        ))}
      </div>

      {assets.length === 0 ? (
        <Empty>No assets here yet.</Empty>
      ) : (
        <div className="card mb-6 overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Asset</th>
                <th>Status</th>
                <th>With</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td className="font-mono text-xs">{a.code}</td>
                  <td>
                    {a.name}
                    <div className="text-xs text-slate-500">
                      {a.category}
                      {a.serialNo && ` · S/N ${a.serialNo}`}
                      {a.purchaseDate && ` · bought ${formatDate(a.purchaseDate)}`}
                    </div>
                  </td>
                  <td>
                    <Badge color={COLOR[a.status]}>{humanize(a.status)}</Badge>
                  </td>
                  <td>
                    {a.employee ? (
                      <>
                        <Link href={`/hr/employees/${a.employee.id}`} className="link">
                          {a.employee.firstName} {a.employee.lastName}
                        </Link>
                        {a.assignedAt && <div className="text-xs text-slate-500">since {formatDate(a.assignedAt)}</div>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {a.status === "AVAILABLE" && (
                      <form action={assignAsset.bind(null, a.id)} className="flex gap-1">
                        <select name="employeeId" required className="input w-auto py-1 text-xs">
                          {employees.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.firstName} {e.lastName}
                            </option>
                          ))}
                        </select>
                        <button className="btn-secondary btn-sm">Assign</button>
                      </form>
                    )}
                    {a.status !== "AVAILABLE" && (
                      <form action={setAssetStatus.bind(null, a.id)} className="flex gap-1">
                        <button name="status" value="AVAILABLE" className="btn-secondary btn-sm">
                          {a.status === "ASSIGNED" ? "Returned" : "Back in stock"}
                        </button>
                        {a.status === "ASSIGNED" && (
                          <button name="status" value="REPAIR" className="btn-secondary btn-sm">
                            To repair
                          </button>
                        )}
                      </form>
                    )}
                    {a.status === "AVAILABLE" && (
                      <form action={setAssetStatus.bind(null, a.id)} className="mt-1 flex gap-2 text-xs">
                        <button name="status" value="REPAIR" className="text-slate-500 hover:underline">
                          Repair
                        </button>
                        <button name="status" value="RETIRED" className="text-slate-500 hover:underline">
                          Retire
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card max-w-3xl">
        <h2 className="mb-3 font-semibold">Add an asset</h2>
        <ActionForm action={createAsset} className="grid gap-3 sm:grid-cols-3">
          <Field label="Code">
            <input name="code" required placeholder="EDU-LAP-021" className="input" />
          </Field>
          <Field label="Name" className="sm:col-span-2">
            <input name="name" required placeholder="Dell Latitude 5440" className="input" />
          </Field>
          <Field label="Category">
            <select name="category" className="input">
              {ASSET_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Serial number">
            <input name="serialNo" className="input" />
          </Field>
          <Field label="Purchase date">
            <input name="purchaseDate" type="date" className="input" />
          </Field>
          <Field label="Notes" className="sm:col-span-3">
            <input name="notes" className="input" />
          </Field>
          <div className="sm:col-span-3">
            <SubmitButton>Add asset</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </>
  );
}
