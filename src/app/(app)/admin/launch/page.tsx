import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { backupDir, backupProblem, copyDir, listBackups } from "@/lib/backups";
import { captchaConfig } from "@/lib/captcha";
import { db } from "@/lib/db";
import { type LaunchGate, gateStatus, launchSummary, productionOriginReady } from "@/lib/launch-readiness";
import { mailSetup } from "@/lib/mail";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Launch readiness", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const statusText = { ready: "Ready", setup: "Needs setup", owner: "Owner input" } as const;
const statusColor = { ready: "green", setup: "amber", owner: "purple" } as const;

export default async function LaunchReadinessPage() {
  await requireUser(["ADMIN"]);
  const [settings, departments, activeEmployees, managedEmployees, inventoryItems, movements, locations, publicJobs, usersByRole, backups, backupIssue] =
    await Promise.all([
      getSettings(),
      db.department.count(),
      db.employee.count({ where: { status: { not: "EXITED" } } }),
      db.employee.count({ where: { status: { not: "EXITED" }, managerId: { not: null } } }),
      db.stockItem.count({ where: { active: true } }),
      db.stockMovement.count(),
      db.stockItem.findMany({ where: { active: true, location: { not: null } }, select: { location: true }, distinct: ["location"] }),
      db.jobOpening.count({ where: { status: "OPEN", onCareersPage: true } }),
      db.user.groupBy({ by: ["role"], where: { active: true, closedAt: null }, _count: true }),
      listBackups(),
      backupProblem(),
    ]);

  const roleCounts = Object.fromEntries(usersByRole.map((row) => [row.role, row._count]));
  const captcha = captchaConfig();
  const deploymentReady =
    process.env.NODE_ENV === "production" &&
    productionOriginReady(process.env.APP_URL) &&
    process.env.COOKIE_SECURE === "true" &&
    process.env.FORCE_HTTPS === "true" &&
    process.env.TRUST_PROXY_HEADERS === "true" &&
    (process.env.SESSION_SECRET?.length ?? 0) >= 32;
  const organizationReady = departments > 0 && activeEmployees > 0 && managedEmployees > 0 && !!settings.companyName && !!settings.companyAddress;
  const inventoryReady = inventoryItems > 0 && movements > 0 && locations.length > 0;
  const emailReady = mailSetup(settings) === "READY";
  const recruitmentReady = settings.careersEnabled && publicJobs > 0 && (!captcha.required || captcha.ready);
  const backupsReady = !!backupDir() && !!copyDir() && backups.length > 0 && !backupIssue;
  const uatProfilesReady = ["ADMIN", "HR", "MANAGER", "EMPLOYEE"].every((role) => (roleCounts[role] ?? 0) > 0);

  const gates: LaunchGate[] = [
    {
      key: "deployment",
      title: "1. Production deployment",
      status: gateStatus(deploymentReady, true),
      evidence: [
        `Runtime: ${process.env.NODE_ENV === "production" ? "production" : "development"}`,
        `HTTPS origin: ${productionOriginReady(process.env.APP_URL) ? "configured" : "awaiting final domain"}`,
        `Secure proxy settings: ${process.env.COOKIE_SECURE === "true" && process.env.FORCE_HTTPS === "true" && process.env.TRUST_PROXY_HEADERS === "true" ? "on" : "incomplete"}`,
        "Database: connected (this page loaded live evidence)",
      ],
      action: "Open deployment runbook",
      href: "/admin/health",
    },
    {
      key: "organization",
      title: "2. Organization setup",
      status: gateStatus(organizationReady),
      evidence: [`${departments} departments`, `${activeEmployees} current employees`, `${managedEmployees} employees with a reporting manager`, `${settings.companyName} · ${settings.companyAddress}`],
      action: "Review people and departments",
      href: "/hr/employees",
    },
    {
      key: "inventory",
      title: "3. Inventory setup",
      status: gateStatus(inventoryReady),
      evidence: [`${inventoryItems} active items`, `${movements} traceable stock movements`, `${locations.length} stock locations`, "Requests, approval, issue, return and write-off workflows are enabled"],
      action: "Review inventory",
      href: "/inventory",
    },
    {
      key: "email",
      title: "4. Email and account recovery",
      status: gateStatus(emailReady, !settings.smtpHost),
      evidence: [`Mail account: ${settings.smtpHost ? "configured" : "awaiting organization credentials"}`, `Test delivery: ${settings.mailVerifiedAt ? "passed" : "not passed"}`, "Password reset links are one-use, expiring and enumeration-safe"],
      action: "Configure and test email",
      href: "/admin/settings#email",
    },
    {
      key: "recruitment",
      title: "5. Public recruitment",
      status: gateStatus(recruitmentReady, !process.env.PUBLIC_CAREERS_HOST),
      evidence: [`Careers page: ${settings.careersEnabled ? "enabled" : "disabled"}`, `${publicJobs} published open jobs`, `Application protection: ${captcha.required ? (captcha.ready ? "CAPTCHA ready" : "CAPTCHA credentials missing") : "private/demo mode"}`, "Public job fields are allow-listed; salary and staff data stay private"],
      action: "Review recruitment",
      href: "/recruitment",
    },
    {
      key: "backups",
      title: "6. Backups and monitoring",
      status: gateStatus(backupsReady, !copyDir()),
      evidence: [`Daily backups: ${backupDir() ? (settings.backupsEnabled ? "enabled" : "disabled") : "available in Docker deployment"}`, `${backups.length} verified backup files visible`, `Off-host copy: ${copyDir() ? "configured" : "awaiting organization-owned location"}`, `Current issue: ${backupIssue?.text ?? "none detected"}`],
      action: "Open backups",
      href: "/admin/backups",
    },
    {
      key: "uat",
      title: "7. User acceptance",
      status: "owner",
      evidence: [`Role coverage: ${uatProfilesReady ? "profiles ready" : "profiles incomplete"}`, `Admin accounts: ${roleCounts.ADMIN ?? 0}`, `HR accounts: ${roleCounts.HR ?? 0} · Manager accounts: ${roleCounts.MANAGER ?? 0} · Employee accounts: ${roleCounts.EMPLOYEE ?? 0}`, "Automated suites are included; business owners must still sign off real scenarios"],
      action: "Prepare role accounts",
      href: "/admin/users",
    },
    {
      key: "legal",
      title: "8. Legal and data governance",
      status: "owner",
      evidence: ["Privacy, terms and cookie pages are published", "Account closure anonymizes login identity and ends every session", "Audit logs, retention-aware backups and access controls are implemented", "The organization must approve wording, retention periods and the incident owner"],
      action: "Review privacy notice",
      href: "/privacy",
    },
  ];
  const summary = launchSummary(gates);

  return (
    <div className="max-w-6xl">
      <PageHeader title="Launch readiness" eyebrow="Administration" icon="admin" subtitle="Live evidence for the eight workstreams required to operate Edubotics One. A green gate is verified by the application; purple gates need organization-owned information or approval." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="card border-emerald-200 bg-emerald-50"><div className="text-sm text-emerald-800">Ready</div><div className="mt-1 text-3xl font-semibold text-emerald-950">{summary.ready}</div></div>
        <div className="card border-amber-200 bg-amber-50"><div className="text-sm text-amber-800">Needs setup</div><div className="mt-1 text-3xl font-semibold text-amber-950">{summary.setup}</div></div>
        <div className="card border-violet-200 bg-violet-50"><div className="text-sm text-violet-800">Owner input</div><div className="mt-1 text-3xl font-semibold text-violet-950">{summary.owner}</div></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {gates.map((gate) => (
          <section key={gate.key} className="card flex min-h-64 flex-col border-slate-200">
            <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold text-slate-900">{gate.title}</h2><Badge color={statusColor[gate.status]}>{statusText[gate.status]}</Badge></div>
            <ul className="mt-4 flex-1 space-y-2 text-sm leading-relaxed text-slate-600">{gate.evidence.map((line) => <li key={line} className="flex gap-2"><span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />{line}</li>)}</ul>
            <Link href={gate.href} className="btn-secondary mt-5 self-start">{gate.action}</Link>
          </section>
        ))}
      </div>
      <p className="mt-6 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm leading-relaxed text-violet-950">Production credentials and formal approvals are deliberately never inferred from demo data. Resolve every purple gate with the responsible owner, then refresh this page to see the updated evidence.</p>
    </div>
  );
}
