import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { NoticeForm } from "../form";
import { createNotice } from "../actions";

export const metadata = { title: "New notice" };

export default async function NewNoticePage({ searchParams }: PageProps<"/notices/new">) {
  await requireUser(["ADMIN", "MANAGER"]);
  const { kind } = (await searchParams) as Record<string, string | undefined>;
  const policy = kind === "POLICY";
  return (
    <>
      <PageHeader
        title={policy ? "New policy" : "New announcement"}
        subtitle={
          policy
            ? "Policies stay on the board until archived. Everyone is asked to acknowledge them by default."
            : "Announcements show on everyone's Home page."
        }
      />
      <div className="max-w-3xl">
        <NoticeForm action={createNotice} kind={policy ? "POLICY" : "ANNOUNCEMENT"} />
      </div>
    </>
  );
}
