import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, Options, PageHeader } from "@/components/ui";
import { humanize } from "@/lib/format";
import { LeadForm, ProgramList } from "../../forms";
import { convertLead, deleteLead, updateLead } from "../../actions";
import { activeUsers, orgOptions } from "../../data";
import { ActivityPanel, activityInclude } from "../../activity-panel";
import { ORG_TYPES, leadStatusColor } from "../../constants";

export default async function LeadPage({ params }: PageProps<"/crm/leads/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      convertedDeal: true,
      activities: { include: activityInclude, orderBy: { createdAt: "desc" } },
    },
  });
  if (!lead) notFound();
  const [users, orgs] = await Promise.all([activeUsers(), orgOptions()]);
  const match = lead.organizationName
    ? orgs.find((o) => o.name.toLowerCase() === lead.organizationName!.toLowerCase())
    : undefined;

  return (
    <>
      <PageHeader
        title={lead.name}
        subtitle={
          <>
            {lead.organizationName && `${lead.organizationName} · `}
            <Badge color={leadStatusColor[lead.status]}>{humanize(lead.status)}</Badge>
          </>
        }
        actions={
          <>
            <Link href="/crm/leads" className="btn-secondary">
              All leads
            </Link>
            {isAdmin(user) && (
              <form action={deleteLead.bind(null, lead.id)}>
                <button className="btn-danger">Delete</button>
              </form>
            )}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          {lead.convertedDeal ? (
            <div className="card border-emerald-200 bg-emerald-50 text-sm">
              Converted to deal{" "}
              <Link href={`/crm/deals/${lead.convertedDeal.id}`} className="link">
                {lead.convertedDeal.title}
              </Link>
              .
            </div>
          ) : (
            <ActionForm action={convertLead.bind(null, lead.id)} className="card space-y-3">
              <h2 className="font-semibold">Convert to deal</h2>
              <p className="text-sm text-slate-500">Creates the institution (or uses an existing one), a contact for {lead.name}, and an open deal.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Existing institution">
                  <select name="organizationId" defaultValue={match?.id ?? ""} className="input">
                    <option value="">— create new —</option>
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="…or new institution name">
                  <input name="organizationName" defaultValue={match ? "" : (lead.organizationName ?? "")} className="input" />
                </Field>
                <Field label="Institution type">
                  <select name="orgType" defaultValue={lead.orgType ?? "SCHOOL"} className="input">
                    <Options values={ORG_TYPES} labels={humanize} />
                  </select>
                </Field>
                <Field label="Deal title">
                  <input
                    name="dealTitle"
                    required
                    defaultValue={[lead.interest, lead.organizationName].filter(Boolean).join(" – ") || lead.name}
                    className="input"
                  />
                </Field>
                <Field label="Programme / product">
                  <input name="program" defaultValue={lead.interest ?? ""} className="input" list="programs" />
                  <ProgramList />
                </Field>
                <Field label="Value (₹)">
                  <input name="value" type="number" min="0" defaultValue={0} className="input" />
                </Field>
                <Field label="Expected close">
                  <input name="expectedClose" type="date" className="input" />
                </Field>
              </div>
              <SubmitButton>Convert</SubmitButton>
            </ActionForm>
          )}
          <LeadForm action={updateLead.bind(null, lead.id)} lead={lead} users={users} />
        </div>
        <div className="xl:col-span-2">
          <ActivityPanel activities={lead.activities} link={{ leadId: lead.id }} users={users} />
        </div>
      </div>
    </>
  );
}
