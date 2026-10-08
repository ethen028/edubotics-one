import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { assignableUsers } from "../data";
import { saveTemplate } from "../../actions";
import { TemplateForm } from "../template-form";
import { BLANK, STARTERS } from "../starters";

export const metadata = { title: "New checklist" };

export default async function NewTemplatePage({ searchParams }: PageProps<"/checklists/templates/new">) {
  await requireUser(["ADMIN", "MANAGER"]);
  const { starter } = (await searchParams) as Record<string, string | undefined>;
  const chosen = starter ? STARTERS[starter] : undefined;
  const users = await assignableUsers();

  return (
    <>
      <PageHeader
        title="New checklist"
        subtitle={
          <>
            Start from a ready-made list or a blank one.{" "}
            <Link href="/checklists/templates" className="link">
              Back to checklists
            </Link>
          </>
        }
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(STARTERS).map(([key, s]) => (
          <Link
            key={key}
            href={`?starter=${key}`}
            className={`rounded-lg border px-3 py-2 text-sm ${starter === key ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:border-brand-300"}`}
          >
            <b>{s.name}</b>
            <span className="block text-xs text-slate-500">{s.hint}</span>
          </Link>
        ))}
        <Link
          href="?"
          className={`rounded-lg border px-3 py-2 text-sm ${!chosen ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:border-brand-300"}`}
        >
          <b>Blank</b>
          <span className="block text-xs text-slate-500">Write your own</span>
        </Link>
      </div>
      <div className="max-w-3xl">
        <TemplateForm key={starter ?? "blank"} action={saveTemplate.bind(null, null)} defaults={chosen?.defaults ?? BLANK} users={users} />
      </div>
    </>
  );
}
