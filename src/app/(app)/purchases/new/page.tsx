import Link from "next/link";
import { db } from "@/lib/db";
import { isAdmin, isManagerOrAdmin, requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { OPEN_PROJECT_STAGES, projectScope } from "@/lib/projects";
import { createOrder } from "../actions";
import { OrderForm } from "../order-form";

export const metadata = { title: "New purchase order" };

export default async function NewOrderPage({ searchParams }: PageProps<"/purchases/new">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const [vendors, items, projects] = await Promise.all([
    db.vendor.findMany({ where: { active: true }, select: { id: true, name: true, state: true }, orderBy: { name: "asc" } }),
    db.stockItem.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    db.project.findMany({
      where: { ...projectScope(user), stage: { in: [...OPEN_PROJECT_STAGES] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const item = items.find((i) => i.id === sp.item);
  // From a low-stock alert: suggest enough to get back above the alert level.
  const quantity = item && Number(sp.qty) > 0 ? Math.floor(Number(sp.qty)) : undefined;

  return (
    <>
      <PageHeader
        title="New purchase order"
        subtitle={
          isAdmin(user)
            ? "Your own orders are approved straight away."
            : "Your manager or an admin approves it, then an admin places the order."
        }
        actions={
          <Link href="/purchases" className="btn-secondary">
            Back
          </Link>
        }
      />
      {vendors.length === 0 ? (
        <Empty>
          No vendors yet.{" "}
          {isManagerOrAdmin(user) ? (
            <Link href="/purchases/vendors?back=order" className="link">
              Add the first vendor
            </Link>
          ) : (
            "Ask a manager or an admin to add the vendor first."
          )}
        </Empty>
      ) : (
        <div className="card max-w-5xl">
          <OrderForm
            action={createOrder}
            vendors={vendors}
            items={items.map((i) => ({
              id: i.id,
              name: i.name,
              sku: i.sku,
              unit: i.unit,
              category: i.category,
              onHand: i.onHand,
              unitCost: i.unitCost == null ? null : Number(i.unitCost),
            }))}
            projects={projects}
            initial={{
              vendorId: vendors.some((v) => v.id === sp.vendor) ? sp.vendor : undefined,
              itemId: item?.id,
              quantity,
              projectId: projects.some((p) => p.id === sp.project) ? sp.project : undefined,
            }}
            submitLabel={isAdmin(user) ? "Create order" : "Send for approval"}
          />
        </div>
      )}
    </>
  );
}
