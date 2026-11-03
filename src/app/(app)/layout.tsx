import { requireUser, isBackupAdmin } from "@/lib/auth";
import { loadNavCounts } from "@/lib/nav-counts";
import { allCompanies, currentCompany } from "@/lib/company";
import { CompanySwitcher } from "@/components/company-switcher";
import { switchCompany } from "./companies/actions";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { SectionTabs } from "@/components/section-tabs";
import { CommandPalette } from "@/components/command-palette";
import { BackToTop, OfflineNote } from "@/components/page-touches";
import { FlashNotice } from "@/components/flash-notice";
import { DraftOwnerProvider } from "@/components/action-form";
import { FLASH_COOKIE } from "@/lib/flash";
import { cookies } from "next/headers";
import { Icon } from "@/components/icons";
import { humanize } from "@/lib/format";
import { buildNav } from "@/lib/nav";
import { logout, setAppearance } from "../actions";
import { SignOutForm } from "@/components/sign-out-form";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const counts = await loadNavCounts(user);
  const [company, companies, backups] = await Promise.all([
    currentCompany(),
    user.isSuperadmin ? allCompanies() : [],
    isBackupAdmin(user),
  ]);
  const groups = buildNav(user, counts, { backups });
  const { approvals, planToUpdate, checklists, toAcknowledge, reviewTodos, myInterviews, teamwork, messages, inbox } = counts;
  // Shortcuts in the bar along the top: only the things this person has to act on.
  const waiting = [
    { n: approvals, label: `${approvals} to approve`, href: "/approvals" },
    { n: planToUpdate, label: `${planToUpdate} plan task${planToUpdate === 1 ? "" : "s"} to update`, href: "/plan" },
    { n: checklists, label: `${checklists} checklist${checklists === 1 ? "" : "s"} to tick`, href: "/checklists" },
    { n: toAcknowledge, label: `${toAcknowledge} notice${toAcknowledge === 1 ? "" : "s"} to read`, href: "/notices" },
    { n: reviewTodos, label: `${reviewTodos} review${reviewTodos === 1 ? "" : "s"} to do`, href: "/hr/reviews" },
    { n: myInterviews, label: `${myInterviews} interview${myInterviews === 1 ? "" : "s"}`, href: "/recruitment/interviews" },
  ].filter((w) => w.n > 0);
  const dark = user.theme === "DARK";
  const flashed = (await cookies()).get(FLASH_COOKIE)?.value;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        groups={groups}
        company={company.name}
        defaultCollapsed={user.menuCollapsed}
        account={
          <>
            <Link href="/account" className="menu-rail-item" title="My account" aria-label="My account">
              <Icon name="user" className="h-4 w-4" />
            </Link>
            <SignOutForm action={logout}>
              <button className="menu-rail-item" title="Sign out" aria-label="Sign out">
                <Icon name="logout" className="h-4 w-4" />
              </button>
            </SignOutForm>
          </>
        }
      />
      <main id="main-content" tabIndex={-1} className="app-main min-w-0 flex-1 p-4 md:py-3 md:pr-4 md:pl-1">
        <div className="mx-auto max-w-[1400px]">
          <header className="topbar">
            <div className="min-w-0 flex-1">
              <CommandPalette groups={groups} userId={user.id} />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              {companies.length > 0 && (
                <CompanySwitcher id="company-switch" className="hidden sm:flex" companies={companies} current={company.id} action={switchCompany} />
              )}
              <form action={setAppearance} className="theme-pill" aria-label="Colours">
                <button name="theme" value="LIGHT" aria-pressed={!dark} title="Light colours">
                  <Icon name="sun" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Light</span>
                </button>
                <button name="theme" value="DARK" aria-pressed={dark} title="Dark colours">
                  <Icon name="moon" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Dark</span>
                </button>
              </form>
              <Link href="/calendar" className="icon-btn" title="Calendar" aria-label="Calendar">
                <Icon name="calendar" className="h-4 w-4" />
              </Link>
              {teamwork && (
              <Link href="/messages" className="icon-btn" title={messages > 0 ? `Messages · ${messages} unread` : "Messages"} aria-label="Messages">
                <Icon name="chat" className="h-4 w-4" />
                {messages > 0 && <span className="icon-btn-dot">{messages}</span>}
              </Link>
              )}
              <Link href="/inbox" className="icon-btn" title={inbox > 0 ? `Inbox · ${inbox} unread` : "Inbox"} aria-label="Inbox">
                <Icon name="bell" className="h-4 w-4" />
                {inbox > 0 && <span className="icon-btn-dot">{inbox}</span>}
              </Link>
              <Link href="/account" className="flex items-center gap-2.5 rounded-full py-1 pr-3 pl-1 hover:bg-slate-50">
                <span className="avatar">{initials(user.name)}</span>
                <span className="hidden leading-tight lg:block">
                  <span className="block text-sm font-semibold">{user.name}</span>
                  <span className="block text-xs text-slate-500">{user.isSuperadmin ? "Superadmin" : humanize(user.role)}</span>
                </span>
              </Link>
            </div>
          </header>
          {companies.length > 0 && (
            <CompanySwitcher id="company-switch-phone" className="mb-3 sm:hidden" companies={companies} current={company.id} action={switchCompany} />
          )}
          {waiting.length > 0 && (
            <div className="waiting-strip print:hidden">
              <span className="text-slate-500">Waiting on you:</span>
              {waiting.map((w) => (
                <Link key={w.href} href={w.href} className="waiting-chip">
                  {w.label}
                </Link>
              ))}
            </div>
          )}
          <SectionTabs groups={groups} />
          <div className="md:px-4 md:pt-1 md:pb-6">
            <DraftOwnerProvider userId={user.id}>{children}</DraftOwnerProvider>
          </div>
        </div>
        <BackToTop />
        <OfflineNote />
        <FlashNotice initial={flashed} />
      </main>
    </div>
  );
}
