import * as sample from './sample';
import type { ActivityType, Deal, DealDetail, DealStage, FollowUp, Institution, InstitutionDetail, Contact, Lead, LeadDetail, LeadStatus } from './types';

/**
 * Where the phone's CRM screens get their data. For now every function answers from SAMPLE DATA (./sample.ts);
 * nothing here talks to Orbit yet. When the /api/mobile/crm routes exist, each function becomes one api() call
 * with the same name and answer, and the screens don't change. The token is already passed for that day.
 *
 * Who sees what will be Orbit's rule (owners see their own records, managers and admins see all), checked on
 * the server. The sample shows everything.
 */
export const CRM_IS_SAMPLE = true;

/** Screens that stay open underneath (a list under its record) listen here and reload after a change. */
const listeners = new Set<() => void>();
export function onCrmChange(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const changed = <T,>(answer: T) => { listeners.forEach((l) => l()); return answer; };

const wait = <T,>(value: T) => new Promise<T>((done) => setTimeout(() => done(structuredCopy(value)), 120));
const structuredCopy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const has = (q: string, ...fields: (string | null | undefined)[]) => fields.some((f) => f?.toLowerCase().includes(q));
const byNewest = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);
const activitiesFor = (match: (a: FollowUp) => boolean) =>
  sample.followUps.filter(match).sort((a, b) => (b.dueAt ?? b.createdAt).localeCompare(a.dueAt ?? a.createdAt));

export async function listLeads(_token: string, find = '', status: LeadStatus | 'OPEN' | 'ALL' = 'OPEN'): Promise<Lead[]> {
  const q = find.trim().toLowerCase();
  return wait(sample.leads
    .filter((l) => status === 'ALL' || (status === 'OPEN' ? !['UNQUALIFIED', 'CONVERTED'].includes(l.status) : l.status === status))
    .filter((l) => !q || has(q, l.name, l.organizationName, l.city, l.interest, l.phone, l.email))
    .sort(byNewest));
}

export async function getLead(_token: string, id: string): Promise<LeadDetail | null> {
  const lead = sample.leads.find((l) => l.id === id);
  return wait(lead ? { ...lead, activities: activitiesFor((a) => a.lead?.id === id) } : null);
}

export async function setLeadStatus(_token: string, id: string, status: LeadStatus) {
  const lead = sample.leads.find((l) => l.id === id);
  if (lead) lead.status = status;
  return changed(await wait({ ok: 'Lead updated' }));
}

export async function listDeals(_token: string): Promise<Deal[]> {
  return wait([...sample.deals].sort((a, b) => (a.expectedClose ?? '').localeCompare(b.expectedClose ?? '')));
}

export async function getDeal(_token: string, id: string): Promise<DealDetail | null> {
  const deal = sample.deals.find((d) => d.id === id);
  return wait(deal ? { ...deal, activities: activitiesFor((a) => a.deal?.id === id) } : null);
}

export async function moveDeal(_token: string, id: string, stage: DealStage, lostReason?: string) {
  const deal = sample.deals.find((d) => d.id === id);
  if (deal) {
    deal.stage = stage;
    deal.closedAt = stage === 'WON' || stage === 'LOST' ? new Date().toISOString() : null;
    deal.lostReason = stage === 'LOST' ? lostReason?.trim() || null : null;
  }
  return changed(await wait({ ok: stage === 'WON' ? 'Deal won' : stage === 'LOST' ? 'Deal marked lost' : 'Deal moved' }));
}

export async function listInstitutions(_token: string, find = ''): Promise<Institution[]> {
  const q = find.trim().toLowerCase();
  return wait(sample.institutions.filter((o) => !q || has(q, o.name, o.city, o.district, o.board)).sort((a, b) => a.name.localeCompare(b.name)));
}

export async function getInstitution(_token: string, id: string): Promise<InstitutionDetail | null> {
  const org = sample.institutions.find((o) => o.id === id);
  if (!org) return wait(null);
  return wait({
    ...org,
    contacts: sample.contacts.filter((c) => c.organization?.id === id),
    deals: sample.deals.filter((d) => d.organization?.id === id),
    activities: activitiesFor((a) => a.organization?.id === id),
  });
}

export async function listContacts(_token: string, find = ''): Promise<Contact[]> {
  const q = find.trim().toLowerCase();
  return wait(sample.contacts.filter((c) => !q || has(q, c.name, c.designation, c.organization?.name, c.phone, c.email)).sort((a, b) => a.name.localeCompare(b.name)));
}

/** Open follow-ups up to the end of today (overdue ones included), and the next few days after it. */
export async function listFollowUps(_token: string): Promise<{ overdue: FollowUp[]; today: FollowUp[]; later: FollowUp[] }> {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const open = sample.followUps.filter((a) => !a.done && a.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  return wait({
    overdue: open.filter((a) => new Date(a.dueAt!) < start),
    today: open.filter((a) => new Date(a.dueAt!) >= start && new Date(a.dueAt!) < end),
    later: open.filter((a) => new Date(a.dueAt!) >= end).slice(0, 10),
  });
}

export async function markDone(_token: string, id: string) {
  const a = sample.followUps.find((x) => x.id === id);
  if (a) a.done = true;
  return changed(await wait({ ok: 'Marked done' }));
}

/** Logs a call, visit or note on a lead or deal, or sets a follow-up when it has a due date. */
export async function logActivity(_token: string, on: { leadId?: string; dealId?: string }, input: { type: ActivityType; subject: string; dueAt?: string | null }) {
  const lead = on.leadId ? sample.leads.find((l) => l.id === on.leadId) : undefined;
  const deal = on.dealId ? sample.deals.find((d) => d.id === on.dealId) : undefined;
  sample.followUps.push({
    id: `a${Date.now()}`, type: input.type, subject: input.subject.trim(), body: null,
    dueAt: input.dueAt ?? null, done: !input.dueAt, assignee: lead?.owner ?? deal?.owner ?? null,
    lead: lead ? { id: lead.id, name: lead.organizationName ?? lead.name } : null,
    deal: deal ? { id: deal.id, title: deal.title } : null,
    organization: deal?.organization ?? null, contact: null, createdAt: new Date().toISOString(),
  });
  return changed(await wait({ ok: input.dueAt ? 'Follow-up set' : 'Saved' }));
}
