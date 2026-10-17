import Link from "next/link";
import { careersSettings } from "@/lib/careers";

// The public jobs page. It sits outside the signed-in app (no sidebar, no login) and reads only
// what src/lib/careers.ts lets it.
export const dynamic = "force-dynamic";

export default async function CareersLayout({ children }: LayoutProps<"/careers">) {
  const { companyName, contactEmail } = await careersSettings();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--side-line)] bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <div className="brand-mark h-9 w-9">E</div>
          <Link href="/careers" className="leading-tight">
            <div className="font-display font-semibold">{companyName}</div>
            <div className="text-xs text-slate-500">Careers</div>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        {companyName}
        {contactEmail && (
          <>
            {" · Questions about a job? "}
            <a href={`mailto:${contactEmail}`} className="link">
              {contactEmail}
            </a>
          </>
        )}
      </footer>
    </div>
  );
}
