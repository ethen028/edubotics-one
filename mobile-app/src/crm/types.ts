/**
 * What the phone's CRM screens show. The shapes follow the Lead, Deal, Organization, Contact and Activity
 * tables in prisma/schema.prisma, cut down to what a phone needs, so the /api/mobile/crm routes can return
 * them as they are when the screens move from sample data to Orbit.
 */

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED';
export type LeadSource = 'WEBSITE' | 'REFERRAL' | 'WALK_IN' | 'PHONE' | 'EMAIL' | 'SOCIAL' | 'EVENT' | 'OTHER';
export type DealStage = 'PROSPECT' | 'DEMO' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';
export type OrgType = 'SCHOOL' | 'COLLEGE' | 'UNIVERSITY' | 'CORPORATE' | 'GOVERNMENT' | 'NGO' | 'PARTNER' | 'OTHER';
export type ActivityType = 'CALL' | 'MEETING' | 'VISIT' | 'EMAIL' | 'TASK' | 'NOTE';

export type Person = { id: string; name: string };

export type Lead = {
  id: string; name: string; organizationName: string | null; orgType: OrgType | null;
  email: string | null; phone: string | null; city: string | null; interest: string | null;
  source: LeadSource; status: LeadStatus; notes: string | null; owner: Person | null; createdAt: string;
};

export type Deal = {
  id: string; title: string; value: number; stage: DealStage; program: string | null; students: number | null;
  expectedClose: string | null; closedAt: string | null; lostReason: string | null; notes: string | null;
  organization: { id: string; name: string } | null; contact: { id: string; name: string; phone: string | null } | null;
  owner: Person | null;
};

export type Institution = {
  id: string; name: string; type: OrgType; board: string | null; phone: string | null; email: string | null;
  city: string | null; district: string | null; owner: Person | null;
};

export type Contact = {
  id: string; name: string; designation: string | null; email: string | null; phone: string | null;
  organization: { id: string; name: string } | null; owner: Person | null;
};

export type FollowUp = {
  id: string; type: ActivityType; subject: string; body: string | null; dueAt: string | null; done: boolean;
  assignee: Person | null;
  /** What it is about, so the row can say "Coastal Model HSS · Robotics for classes 6-8" and open it. */
  lead: { id: string; name: string } | null; deal: { id: string; title: string } | null;
  organization: { id: string; name: string } | null; contact: { id: string; name: string } | null;
  createdAt: string;
};

export type InstitutionDetail = Institution & { contacts: Contact[]; deals: Deal[]; activities: FollowUp[] };
export type LeadDetail = Lead & { activities: FollowUp[] };
export type DealDetail = Deal & { activities: FollowUp[] };
