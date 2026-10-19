import { requireUser, isAdmin } from "@/lib/auth";
import { canManagePeople } from "@/lib/permissions";
import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { Sidebar } from "@/components/sidebar";
import { NavGroup } from "@/components/nav-group";
import { SectionTabs } from "@/components/section-tabs";
import { CommandPalette } from "@/components/command-palette";
import { Icon } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { humanize } from "@/lib/format";
import { pendingApprovals } from "@/lib/approvals";
import { lowStockItems } from "@/lib/inventory";
import { db } from "@/lib/db";
import { myPendingAcks } from "@/lib/notices";
import { helpdeskCounts } from "@/lib/helpdesk";
import { myReviewTodos } from "@/lib/reviews";
import { newOnlineApplications } from "@/lib/careers";
import { myChecklistsNow } from "@/lib/checklists";
import { unreadCount } from "@/lib/notifications";
import { unreadMessageCount } from "@/lib/messages";
import { myPlanTasksToUpdate } from "@/lib/plan";
import { buildNav } from "@/lib/nav";
import { logout, setAppearance } from "../actions";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

const badgeTone = {
  amber: "rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-amber-950",
  red: "rounded-full bg-red-400 px-1.5 text-[11px] font-semibold text-red-950",
  brand: "nav-badge",
};

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [approvals, lowStock, myInterviews, toAcknowledge, helpdesk, reviewTodos, onlineApplications, checklists, inbox, planToUpdate, messages] =
    await Promise.all([
      pendingApprovals(user),
      isAdmin(user) ? lowStockItems() : [],
      db.interview.count({ where: { interviewerId: user.id, status: "SCHEDULED" } }),
      myPendingAcks(user),
      helpdeskCounts(user),
      myReviewTodos(user),
      canManagePeople(user) ? newOnlineApplications() : 0,
      myChecklistsNow(user.id),
      unreadCount(user.id),
      myPlanTasksToUpdate(user.id),
      unreadMessageCount(user.id),
    ]);
  const groups = buildNav(user, {
    inbox,
    messages,
    toAcknowledge: toAcknowledge.length,
    checklists: checklists.open.length,
    overdueChecklists: checklists.open.some((e) => e.status === "OVERDUE"),
    helpdesk: helpdesk.total,
    approvals: approvals.total,
    lowStock: lowStock.length,
    onlineApplications,
    myInterviews,
    reviewTodos: reviewTodos.length,
    planToUpdate,
  });
  // Shortcuts in the bar along the top: only the things this person has to act on.
  const waiting = [
    { n: approvals.total, label: `${approvals.total} to approve`, href: "/approvals" },
    { n: planToUpdate, label: `${planToUpdate} plan task${planToUpdate === 1 ? "" : "s"} to update`, href: "/plan" },
    { n: checklists.open.length, label: `${checklists.open.length} checklist${checklists.open.length === 1 ? "" : "s"} to tick`, href: "/checklists" },
    { n: toAcknowledge.length, label: `${toAcknowledge.length} notice${toAcknowledge.length === 1 ? "" : "s"} to read`, href: "/notices" },
    { n: reviewTodos.length, label: `${reviewTodos.length} review${reviewTodos.length === 1 ? "" : "s"} to do`, href: "/hr/reviews" },
    { n: myInterviews, label: `${myInterviews} interview${myInterviews === 1 ? "" : "s"}`, href: "/recruitment/interviews" },
  ].filter((w) => w.n > 0);
  const dark = user.theme === "DARK";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        defaultCollapsed={user.menuCollapsed}
        header={
          <div className="flex items-center">
            <div className="brand-mark" role="img" aria-label="Edubotics">
              <LogoMark />
            </div>
            <div className="rail-hide ml-2 leading-tight">
              <div className="font-display text-sm font-semibold">Edubotics One</div>
              <div className="sidebar-muted text-[11px]">Global Operations</div>
            </div>
          </div>
        }
      >
        <nav aria-label="Main menu" className="flex-1 space-y-1.5 overflow-y-auto">
          {groups.map((g) => (
            <NavGroup
              key={g.title}
              title={g.title}
              icon={g.icon}
              paths={g.paths}
              count={g.items.reduce((sum, i) => sum + (i.tone && i.tone !== "red" ? (i.badge ?? 0) : 0), 0)}
            >
              {g.items.map((item) => (
                <NavLink key={item.href} href={item.href} exact={item.exact} except={item.except}>
                  {item.badge ? (
                    <span className="flex items-center justify-between">
                      {item.label}
                      <span className={badgeTone[item.tone ?? "brand"]} title={item.title}>
                        {item.badge}
                      </span>
                    </span>
                  ) : (
                    item.label
                  )}
                </NavLink>
              ))}
            </NavGroup>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="avatar md:hidden">{initials(user.name)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium md:hidden">{user.name}</div>
            <div className="sidebar-muted text-xs md:hidden">{humanize(user.role)}</div>
            <div className="sidebar-links mt-1 flex items-center gap-2">
              <Link href="/account" className="sidebar-link text-xs" title="My account">
                <Icon name="user" className="h-4 w-4 shrink-0" />
                <span className="rail-hide ml-1.5">My account</span>
              </Link>
              <form action={logout}>
                <button className="sidebar-link text-xs" title="Sign out">
                  <Icon name="logout" className="h-4 w-4 shrink-0" />
                  <span className="rail-hide ml-1.5">Sign out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </Sidebar>
      <main id="main-content" tabIndex={-1} className="app-main min-w-0 flex-1 p-4 md:py-3 md:pr-4 md:pl-1">
        <div className="mx-auto max-w-[1400px]">
          <header className="topbar">
            <div className="min-w-0 flex-1">
              <CommandPalette groups={groups} />
            </div>
            <div className="flex items-center gap-2">
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
              <Link href="/messages" className="icon-btn" title={messages > 0 ? `Messages · ${messages} unread` : "Messages"} aria-label="Messages">
                <Icon name="chat" className="h-4 w-4" />
                {messages > 0 && <span className="icon-btn-dot">{messages}</span>}
              </Link>
              <Link href="/inbox" className="icon-btn" title={inbox > 0 ? `Inbox · ${inbox} unread` : "Inbox"} aria-label="Inbox">
                <Icon name="bell" className="h-4 w-4" />
                {inbox > 0 && <span className="icon-btn-dot">{inbox}</span>}
              </Link>
              <Link href="/account" className="flex items-center gap-2.5 rounded-full py-1 pr-3 pl-1 hover:bg-slate-50">
                <span className="avatar">{initials(user.name)}</span>
                <span className="hidden leading-tight lg:block">
                  <span className="block text-sm font-semibold">{user.name}</span>
                  <span className="block text-xs text-slate-500">{humanize(user.role)}</span>
                </span>
              </Link>
            </div>
          </header>
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
          <div className="md:px-4 md:pt-1 md:pb-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
