"use client";

import type { ReactNode } from "react";

/**
 * Sign-out form that also clears what Orbit keeps in this browser (unsaved form drafts, recently viewed
 * pages), so the next person on a shared or school computer can't read them.
 */
export function SignOutForm({ action, className, children }: { action: () => Promise<void>; className?: string; children: ReactNode }) {
  function forget() {
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith("orbit:")) localStorage.removeItem(key);
    } catch {
      // No storage (private window): nothing was kept.
    }
  }
  return <form action={action} onSubmit={forget} className={className}>{children}</form>;
}
