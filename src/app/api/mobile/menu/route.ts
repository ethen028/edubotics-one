import { getApiUser, isBackupAdmin } from "@/lib/auth";
import { buildNav } from "@/lib/nav";
import { loadNavCounts } from "@/lib/nav-counts";
import { phoneMenu } from "@/lib/mobile-menu";
import { currentCompany } from "@/lib/company";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };

/** Everything this person can open in Orbit, for the phone app's tabs and its More list. */
export async function GET() {
  const access = await getApiUser();
  if (access.error) return access.error;
  const { user } = access;
  const [counts, company] = await Promise.all([loadNavCounts(user), currentCompany()]);
  const groups = phoneMenu(buildNav(user, counts, { backups: isBackupAdmin(user) }), user);
  return Response.json({
    company: company.name,
    counts: { approvals: counts.approvals, messages: counts.messages, inbox: counts.inbox },
    groups,
  }, { headers: noStore });
}
