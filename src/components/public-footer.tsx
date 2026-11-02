import Link from "next/link";

export function PublicFooter() {
  return <nav aria-label="Legal" className="mt-3 flex flex-wrap justify-center gap-5 text-sm">
    <Link className="link" href="/privacy">Privacy</Link>
    <Link className="link" href="/terms">Terms</Link>
    <Link className="link" href="/cookies">Cookie preferences</Link>
  </nav>;
}
