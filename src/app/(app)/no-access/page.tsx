import Link from "next/link";
import type { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { ROLES } from "@/lib/permissions";
import { ROLE_LABEL, whoCanOpen, type PageAccess } from "@/lib/page-access";

export const metadata = { title: "Not for your role" };

/** Where a page or action refuses someone: says who it is for and what their own role is. */
export default async function NoAccessPage({ searchParams }: PageProps<"/no-access">) {
  const user = await requireUser();
  const { for: raw = "" } = (await searchParams) as Record<string, string | undefined>;
  const roles = raw.split(".").filter((r): r is Role => (ROLES as readonly string[]).includes(r));
  const access: PageAccess | null = raw === "owner" ? "owner" : roles.length ? roles : null;
  const mine = user.isOwner && user.role === "ADMIN" ? "Owner" : ROLE_LABEL[user.role];

  return (
    <div className="mx-auto max-w-lg py-10">
      <p className="mb-3 text-xs font-semibold tracking-widest text-brand-600 uppercase">Not for your role</p>
      <h1 className="text-2xl font-semibold">This page isn&apos;t part of your work in Orbit</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {access ? <>It is for {whoCanOpen(access)}. </> : null}
        You are signed in as <strong>{user.name}</strong> ({mine}).
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        If you need it for your job, ask an admin to change your role in Users.
      </p>
      <Link href="/" className="btn-primary mt-6 inline-block">Go to home</Link>
    </div>
  );
}
