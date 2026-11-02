import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center p-6">
      <p className="mb-3 text-xs font-semibold tracking-widest text-brand-600 uppercase">404 · Page not found</p>
      <h1 className="text-3xl font-semibold">Let’s get you back to work</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-500">This page may have moved, or the address may be incorrect.</p>
      <Link href="/" className="btn-primary mt-6 self-start">Go to home</Link>
    </main>
  );
}
