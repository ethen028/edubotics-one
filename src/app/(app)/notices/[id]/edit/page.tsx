import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canEditNotice } from "@/lib/notices";
import { PageHeader } from "@/components/ui";
import { NoticeForm } from "../../form";
import { updateNotice } from "../../actions";

export const metadata = { title: "Edit notice" };

export default async function EditNoticePage({ params }: PageProps<"/notices/[id]/edit">) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const { id } = await params;
  const notice = await db.notice.findUnique({ where: { id }, include: { attachment: { select: { fileName: true } } } });
  if (!notice) notFound();
  if (!canEditNotice(user, notice)) redirect(`/notices/${id}`);
  const { attachment, ...rest } = notice;
  return (
    <>
      <PageHeader title={`Edit ${notice.kind === "POLICY" ? "policy" : "announcement"}`} />
      <div className="max-w-3xl">
        <NoticeForm action={updateNotice.bind(null, id)} kind={notice.kind} notice={rest} fileName={attachment?.fileName} />
      </div>
    </>
  );
}
