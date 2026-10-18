import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { GiveForm } from "../form";

export const metadata = { title: "Thank a colleague" };

export default async function GiveRecognitionPage({ searchParams }: PageProps<"/recognition/give">) {
  const user = await requireUser();
  const { to } = (await searchParams) as Record<string, string | undefined>;
  const people = await db.user.findMany({
    where: { active: true, id: { not: user.id } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeader
        title="Thank a colleague"
        subtitle="Say what someone did well. It goes on the recognition wall for everyone to see."
        actions={
          <Link href="/recognition" className="btn-secondary">
            Back to recognition
          </Link>
        }
      />
      <div className="card max-w-2xl">
        <GiveForm people={people} to={to} />
      </div>
    </>
  );
}
