import Link from "next/link";
import { careersSettings } from "@/lib/careers";
import { PublicFooter } from "@/components/public-footer";
import { LogoMark } from "@/components/logo";

// The public jobs page. It sits outside the signed-in app (no sidebar, no login) and reads only
// what src/lib/careers.ts lets it.
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: true, follow: true } };

export default async function CareersLayout({ children }: LayoutProps<"/careers">) {
  const { companyName, contactEmail } = await careersSettings();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--side-line)] bg-surface">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <div className="brand-mark h-9 w-9" role="img" aria-label="Edubotics">
            <LogoMark />
          </div>
          <Link href="/careers" className="leading-tight">
            <div className="font-display font-semibold">{companyName}</div>
            <div className="text-xs text-slate-500">Careers</div>
          </Link>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        {companyName}
        {" · "}
        <Link href="/careers/privacy" className="link">
          How we use your application
        </Link>
        {contactEmail && (
          <>
            {" · Questions about a job? "}
            <a href={`mailto:${contactEmail}`} className="link">
              {contactEmail}
            </a>
          </>
        )}
        <PublicFooter />
      </footer>
    </div>
  );
}
