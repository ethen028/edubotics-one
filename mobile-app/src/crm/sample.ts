import type { Contact, Deal, FollowUp, Institution, Lead } from './types';

/**
 * SAMPLE DATA, not Orbit's. The same schools, leads, deals and follow-ups as the demo seed
 * (scripts/seed-demo.ts), with dates counted from today, so the CRM screens can be tried before their
 * /api/mobile/crm routes exist. Changes made in the app (a lead's status, a deal's stage, a follow-up marked
 * done, a note) live only until the app is closed. Phone numbers and email addresses are made up.
 */

const DOMAIN = 'example.in';
const RAHUL = { id: 'u-rahul', name: 'Rahul Varghese' };
const SNEHA = { id: 'u-sneha', name: 'Sneha Pillai' };
const OWNER = { 'employee.demo': RAHUL, 'sales.demo': SNEHA } as const;

function day(offset: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}
const date = (offset: number) => day(offset).toISOString();
const at = (offset: number, time: string) => {
  const d = day(offset);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h!, m!);
  return d.toISOString();
};
const slug = (s: string) => s.split(' ')[0]!.toLowerCase().replace(/\W/g, '');

const ORGS = [
  ['Maple Leaf Public School', 'SCHOOL', 'CBSE', 'Kakkanad', 'Ernakulam', 'employee.demo', 'Dr. Leena Mathew', 'Principal'],
  ['Lakeview Vidyalaya', 'SCHOOL', 'State', 'Alappuzha', 'Alappuzha', 'employee.demo', 'Sr. Mary Joseph', 'Principal'],
  ['Hillcrest Central School', 'SCHOOL', 'CBSE', 'Thodupuzha', 'Idukki', 'sales.demo', 'Mr. Sajeev Kumar', 'Vice Principal'],
  ['Riverside International School', 'SCHOOL', 'ICSE', 'Aluva', 'Ernakulam', 'sales.demo', 'Ms. Divya Raj', 'Academic Coordinator'],
  ['Coastal Model HSS', 'SCHOOL', 'State', 'Kozhikode', 'Kozhikode', 'employee.demo', 'Mr. Haris P', 'Headmaster'],
  ['Periyar College of Engineering', 'COLLEGE', null, 'Aluva', 'Ernakulam', 'sales.demo', 'Prof. Suresh Babu', 'Head, ECE'],
  ['Malabar Institute of Technology', 'COLLEGE', null, 'Kannur', 'Kannur', 'employee.demo', 'Dr. Ameena K', 'Placement Officer'],
] as const;

export const institutions: Institution[] = ORGS.map(([name, type, board, city, district, owner], i) => ({
  id: `o${i + 1}`, name, type, board, city, district, owner: OWNER[owner],
  phone: `+91 484 240 ${String(1100 + i * 7)}`, email: `office.${slug(name)}@${DOMAIN}`,
}));

export const contacts: Contact[] = ORGS.map(([orgName, , , , , owner, name, designation], i) => ({
  id: `c${i + 1}`, name, designation, organization: { id: `o${i + 1}`, name: orgName }, owner: OWNER[owner],
  phone: `+91 98470 ${String(21000 + i * 113)}`, email: `${name.split(' ').at(-1)!.toLowerCase()}@${DOMAIN}`,
}));

const LEADS = [
  ["St. Jude's English School", 'SCHOOL', 'Fort Kochi', 'Robotics lab for classes 6-9', 'REFERRAL', 'NEW', 'sales.demo', -1],
  ['Green Meadows School', 'SCHOOL', 'Thrissur', 'After-school coding club', 'WEBSITE', 'CONTACTED', 'employee.demo', -4],
  ['Sree Narayana Polytechnic', 'COLLEGE', 'Kollam', 'IoT workshop for 2nd years', 'EMAIL', 'QUALIFIED', 'sales.demo', -6],
  ['Bethany Girls HSS', 'SCHOOL', 'Kottayam', 'ATL lab support', 'PHONE', 'CONTACTED', 'employee.demo', -9],
  ['Carmel Academy', 'SCHOOL', 'Palakkad', 'Summer camp enquiry', 'SOCIAL', 'UNQUALIFIED', 'sales.demo', -12],
  ['Westfort College', 'COLLEGE', 'Thrissur', 'Final-year project guidance', 'EVENT', 'NEW', 'employee.demo', -2],
  ['Little Flower School', 'SCHOOL', 'Kollam', 'Teacher training on Arduino', 'WALK_IN', 'QUALIFIED', 'sales.demo', -15],
] as const;

export const leads: Lead[] = LEADS.map(([org, orgType, city, interest, source, status, owner, ago], i) => ({
  id: `l${i + 1}`, name: `Office, ${org}`, organizationName: org, orgType, city, interest, source, status,
  owner: OWNER[owner], email: `enquiry.${slug(org)}@${DOMAIN}`, phone: `+91 94460 ${String(30500 + i * 211)}`,
  notes: null, createdAt: date(ago),
}));

const DEALS = [
  ['Robotics lab, classes 5-9', 1, 420000, 'WON', 320, 'employee.demo', -70],
  ['Coding club, two batches', 2, 180000, 'WON', 120, 'employee.demo', -40],
  ['ATL lab support 2026-27', 3, 240000, 'WON', 200, 'sales.demo', -25],
  ['Final-year IoT projects', 6, 150000, 'WON', 30, 'sales.demo', -20],
  ['STEM week and robotics demo', 4, 95000, 'PROPOSAL', 150, 'sales.demo', null],
  ['Robotics for classes 6-8', 5, 210000, 'NEGOTIATION', 180, 'employee.demo', null],
  ['Drone workshop for mechanical', 7, 60000, 'DEMO', 60, 'employee.demo', null],
] as const;

export const deals: Deal[] = DEALS.map(([title, o, value, stage, students, owner, closed], i) => {
  const org = institutions[o - 1]!;
  const contact = contacts[o - 1]!;
  return {
    id: `d${i + 1}`, title, value, stage, students, owner: OWNER[owner],
    program: org.type === 'COLLEGE' ? 'College projects' : 'School robotics',
    organization: { id: org.id, name: org.name }, contact: { id: contact.id, name: contact.name, phone: contact.phone },
    expectedClose: date(closed ?? 20), closedAt: closed === null ? null : date(closed), lostReason: null, notes: null,
  };
});

const ACTS = [
  ['MEETING', 'Demo of the robotics kit to the principal', 5, 6, 'employee.demo', -6, true],
  ['VISIT', 'Lab space visit', 4, 5, 'sales.demo', -4, true],
  ['CALL', 'Follow up on the proposal', 4, 5, 'sales.demo', 1, false],
  ['MEETING', 'Department meeting for the drone workshop', 7, 7, 'employee.demo', 3, false],
  ['MEETING', 'Price discussion with the manager', 5, 6, 'employee.demo', -2, true],
  ['EMAIL', 'Send the revised quote', 5, 6, 'employee.demo', 0, false],
] as const;

export const followUps: FollowUp[] = [
  ...ACTS.map(([type, subject, o, d, who, when, done], i): FollowUp => ({
    id: `a${i + 1}`, type, subject, body: null, dueAt: at(when, '11:00'), done, assignee: OWNER[who],
    organization: { id: institutions[o - 1]!.id, name: institutions[o - 1]!.name },
    deal: { id: deals[d - 1]!.id, title: deals[d - 1]!.title }, lead: null, contact: null, createdAt: date(Math.min(when, 0) - 1),
  })),
  // Two more on leads, so "due today" and "overdue" both show something on the phone.
  {
    id: 'a7', type: 'CALL', subject: 'Call back about the robotics lab', body: null, dueAt: at(0, '15:30'), done: false,
    assignee: SNEHA, lead: { id: 'l1', name: "St. Jude's English School" }, deal: null, organization: null, contact: null, createdAt: date(-1),
  },
  {
    id: 'a8', type: 'VISIT', subject: 'Visit the coding club room', body: null, dueAt: at(-1, '10:00'), done: false,
    assignee: RAHUL, lead: { id: 'l2', name: 'Green Meadows School' }, deal: null, organization: null, contact: null, createdAt: date(-4),
  },
];
