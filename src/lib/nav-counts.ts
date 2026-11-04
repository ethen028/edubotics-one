import "server-only";
import type { CurrentUser } from "./auth";
import { isAdmin } from "./auth";
import { pendingApprovals } from "./approvals";
import { lowStockItems } from "./inventory";
import { db } from "./db";
import { myPendingAcks } from "./notices";
import { helpdeskCounts } from "./helpdesk";
import { myReviewTodos } from "./reviews";
import { newOnlineApplications } from "./careers";
import { myChecklistsNow } from "./checklists";
import { unreadCount } from "./notifications";
import { unreadMessageCount } from "./messages";
import { canUseTeamwork } from "./teamwork";
import { myPlanTasksToUpdate } from "./plan";
import { canManagePeople } from "./permissions";
import type { NavCounts } from "./nav";

/** The numbers beside the menu items (things waiting on this person). The web menu and the phone app both use it. */
export async function loadNavCounts(user: CurrentUser): Promise<NavCounts> {
  const teamwork = await canUseTeamwork(user);
  const [approvals, lowStock, myInterviews, toAcknowledge, helpdesk, reviewTodos, onlineApplications, checklists, inbox, planToUpdate, messages] =
    await Promise.all([
      pendingApprovals(user),
      isAdmin(user) ? lowStockItems() : [],
      db.interview.count({ where: { interviewerId: user.id, status: "SCHEDULED" } }),
      myPendingAcks(),
      helpdeskCounts(user),
      myReviewTodos(user),
      canManagePeople(user) ? newOnlineApplications() : 0,
      myChecklistsNow(user.id),
      unreadCount(user.id),
      myPlanTasksToUpdate(user.id),
      teamwork ? unreadMessageCount(user.id) : 0,
    ]);
  return {
    teamwork,
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
  };
}
