import Link from "next/link";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Getting started", robots: { index: false, follow: false } };

export default async function GuidePage() {
  await requireUser();
  const steps = [
    ["/account", "Check your account", "Review your details and change your password. Never share your login."],
    ["/notices", "Read your notices", "Review announcements and acknowledge notices that require a response."],
    ["/work", "Review your work", "Find assigned tasks, then open Projects for the wider context."],
    ["/timesheets", "Record your time", "Keep your timesheet up to date with the work you completed."],
    ["/hr/attendance", "Check attendance", "Review your attendance and raise discrepancies with your manager."],
    ["/hr/leave", "Request leave", "Check your balance and submit leave for approval."],
    ["/checklists", "Complete your checklists", "Work through assigned items and check due dates."],
    ["/helpdesk", "Ask for help", "Raise a ticket when you need support. Do not include passwords or secret keys."],
  ];
  return <div className="max-w-3xl"><h1 className="text-3xl font-semibold">Getting started</h1>
    <p className="mt-3 text-slate-600">Start with these everyday tools. Your account permissions determine which records and actions are available; ask your administrator if access is missing.</p>
    <ol className="mt-6 space-y-3">{steps.map(([href, title, detail], i) => <li key={href} className="card">
      <Link href={href} className="link font-semibold">{i + 1}. {title}</Link><p className="mt-1 text-sm text-slate-600">{detail}</p>
    </li>)}</ol>
    <p className="mt-6 text-sm text-slate-600">Managers should review approvals regularly. Administrators should complete company settings, account permissions and backup setup before inviting staff. See the client handover guide supplied with this app for deployment responsibilities.</p>
  </div>;
}
