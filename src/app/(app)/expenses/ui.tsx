import type { ClaimStatus, Prisma } from "@prisma/client";
import { Badge } from "@/components/ui";
import { CATEGORY_LABEL, CLAIM_COLOR, CLAIM_LABEL, VEHICLE_LABEL } from "@/lib/expenses";
import { formatDate, formatINR } from "@/lib/format";
import { monthLabel } from "@/lib/payroll";

type ClaimForDisplay = {
  id: string;
  category: keyof typeof CATEGORY_LABEL;
  description: string;
  amount: Prisma.Decimal;
  approvedAmount: Prisma.Decimal | null;
  distanceKm: Prisma.Decimal | null;
  vehicle: string | null;
  status: ClaimStatus;
  decisionNote: string | null;
  paidOn: Date | null;
  paidNote: string | null;
  project: { name: string } | null;
  organization: { name: string } | null;
  payslip: { run: { month: string } } | null;
  receipt: { id: string } | null;
};

/** Category, description and what it was linked to. */
export function ClaimWhat({ c }: { c: ClaimForDisplay }) {
  const links = [c.project?.name, c.organization?.name].filter(Boolean).join(" · ");
  return (
    <div className="min-w-48">
      <div>
        <span className="font-medium">{CATEGORY_LABEL[c.category]}</span>
        {c.vehicle && (
          <span className="text-slate-500">
            {" "}
            · {VEHICLE_LABEL[c.vehicle as keyof typeof VEHICLE_LABEL] ?? c.vehicle}, {Number(c.distanceKm)} km
          </span>
        )}
      </div>
      <div className="text-slate-600">{c.description}</div>
      {links && <div className="text-xs text-slate-500">{links}</div>}
      {c.receipt && (
        <a href={`/api/expenses/${c.id}/receipt`} target="_blank" className="link text-xs">
          Receipt
        </a>
      )}
    </div>
  );
}

export function ClaimAmount({ c }: { c: ClaimForDisplay }) {
  const reduced = c.approvedAmount !== null && Number(c.approvedAmount) !== Number(c.amount);
  return (
    <div className="text-right whitespace-nowrap">
      {reduced ? (
        <>
          <div className="font-medium">{formatINR(c.approvedAmount!)}</div>
          <div className="text-xs text-slate-400 line-through">{formatINR(c.amount)}</div>
        </>
      ) : (
        <div className="font-medium">{formatINR(c.amount)}</div>
      )}
    </div>
  );
}

/** Status badge plus the next thing that happens to the money. */
export function ClaimState({ c }: { c: ClaimForDisplay }) {
  const detail =
    c.status === "PAID"
      ? c.payslip
        ? `With ${monthLabel(c.payslip.run.month)} salary, ${formatDate(c.paidOn)}`
        : `${formatDate(c.paidOn)}${c.paidNote ? ` · ${c.paidNote}` : ""}`
      : c.status === "APPROVED"
        ? c.payslip
          ? `On ${monthLabel(c.payslip.run.month)} payroll`
          : "Paid with the next salary"
        : null;
  return (
    <div>
      <Badge color={CLAIM_COLOR[c.status]}>{CLAIM_LABEL[c.status]}</Badge>
      {detail && <div className="mt-0.5 text-xs text-slate-500">{detail}</div>}
      {c.decisionNote && <div className="mt-0.5 text-xs text-slate-500">“{c.decisionNote}”</div>}
    </div>
  );
}

/** What every claims list loads: links, the payroll month and whether a receipt exists (not its bytes). */
export const claimInclude = {
  project: { select: { name: true } },
  organization: { select: { name: true } },
  payslip: { select: { run: { select: { month: true } } } },
  receipt: { select: { id: true } },
} satisfies Prisma.ExpenseClaimInclude;
