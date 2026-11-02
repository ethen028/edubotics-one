"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";

/** A round "back to top" button that appears once a long list has been scrolled well down. */
export function BackToTop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 1200);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!shown) return null;
  return (
    <button
      type="button"
      className="back-to-top print:hidden"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => {
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
        document.getElementById("main-content")?.focus({ preventScroll: true });
      }}
    >
      <Icon name="arrowUp" className="h-4 w-4" />
    </button>
  );
}

function subscribeOnline(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

/** Says so when the office Wi-Fi or phone data drops, so nobody thinks a save went through when it can't. */
export function OfflineNote() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="offline-note print:hidden">
      <Icon name="wifiOff" className="h-4 w-4" />
      No connection. Changes won&rsquo;t save until you&rsquo;re back online.
    </div>
  );
}
