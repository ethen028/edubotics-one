import { notFound, redirect } from "next/navigation";
import { api } from "@convex/_generated/api";
import { requireUser } from "@/lib/auth";
import { convexQuery } from "@/lib/convex";
import { toDate } from "@/lib/notices";
import { PageHeader } from "@/components/ui";
import { NoticeForm } from "../../form";
import { updateNotice } from "../../actions";

export const metadata = { title: "Edit notice" };

export default async function EditNoticePage({ params }: PageProps<"/notices/[id]/edit">) {
  await requireUser(["ADMIN", "HR", "MANAGER"]);
  const { id } = await params;
  const notice = await convexQuery(api.notices.get, { id });
  if (!notice) notFound();
  if (!notice.editable) redirect(`/notices/${id}`);
  const { attachment, ...rest } = notice;
  return (
    <>
      <PageHeader title={`Edit ${notice.kind === "POLICY" ? "policy" : "announcement"}`} />
      <div className="max-w-3xl">
        <NoticeForm action={updateNotice.bind(null, id)} kind={notice.kind} notice={{ ...rest, ackDueDate: toDate(rest.ackDueDate), showUntil: toDate(rest.showUntil) }} fileName={attachment?.fileName} />
      </div>
    </>
  );
}
