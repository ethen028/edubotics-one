import { getApiUser } from "@/lib/auth";
import { myWork } from "@/lib/my-work";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** The phone's My work: the person's open tasks grouped by when they are due, and what they finished this week. */
export async function GET() {
  const access = await getApiUser();
  if (access.error) return access.error;
  const { open, recentlyDone, groups } = await myWork(access.user);
  return Response.json({
    open: open.length,
    groups: groups
      .filter((g) => g.tasks.length > 0)
      .map((g) => ({
        title: g.title,
        tasks: g.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          project: t.project.name,
          onHold: t.project.onHold,
          status: t.status,
          priority: t.priority,
          progress: t.progress,
          dueDate: day(t.dueDate),
          blocked: t.blockedAt ? (t.blockedReason ?? "Blocked") : null,
          waitingOn: t.dependsOn && t.dependsOn.status !== "DONE" ? t.dependsOn.title : null,
          checklist: { done: t.checklist.filter((c) => c.doneAt).length, total: t.checklist.length },
          path: `/projects/${t.project.id}/tasks/${t.id}`,
        })),
      })),
    recentlyDone: recentlyDone.map((t) => ({ id: t.id, title: t.title, project: t.project.name })),
  }, { headers: noStore });
}
