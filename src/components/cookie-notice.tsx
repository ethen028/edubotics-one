"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener("cookie-notice", notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener("cookie-notice", notify); };
}
function dismissed() {
  try { return localStorage.getItem("edubotics-cookie-notice") === "v1"; } catch { return false; }
}
export function CookieNotice() {
  const hidden = useSyncExternalStore(subscribe, dismissed, () => true);
  const [dismissedHere, setDismissedHere] = useState(false);
  if (hidden || dismissedHere) return null;
  return <aside aria-label="Cookie notice" className="fixed right-4 bottom-4 left-4 z-40 max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-lg print:hidden sm:left-auto">
    <p className="text-sm leading-relaxed text-slate-600">We use essential cookies to keep you signed in. We do not use optional analytics or advertising cookies. <Link href="/cookies" className="link">Cookie details</Link></p>
    <button type="button" className="btn-secondary mt-3" onClick={() => {
      setDismissedHere(true);
      try { localStorage.setItem("edubotics-cookie-notice", "v1"); } catch { /* Browser storage may be blocked. */ }
      window.dispatchEvent(new Event("cookie-notice"));
    }}>Understood</button>
  </aside>;
}
