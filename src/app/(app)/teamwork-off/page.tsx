import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canUseTeamwork, teamworkDomain } from "@/lib/teamwork";
import { Icon } from "@/components/icons";

export const metadata = { title: "Teamwork" };

/** Where people outside the company email domain land if they open Messages, Channels, Files or Meetings. */
export default async function TeamworkOffPage() {
  const user = await requireUser();
  if (await canUseTeamwork(user)) redirect("/messages");
  const domain = await teamworkDomain();
  return (
    <div className="card mx-auto mt-6 max-w-md text-center">
      <span className="chat-avatar mx-auto mb-3 h-12 w-12">
        <Icon name="shield" className="h-5 w-5" />
      </span>
      <h1 className="font-semibold text-slate-900">Teamwork is for company email addresses</h1>
      <p className="mt-2 text-sm text-slate-600">
        Messages, Channels, Files and Meetings are only for logins on <strong>@{domain}</strong>. You are signed in as {user.email}. Ask an
        admin to move your login to your company email under Admin → Users.
      </p>
      <Link href="/" className="btn-secondary mt-4">
        Back to Home
      </Link>
    </div>
  );
}
