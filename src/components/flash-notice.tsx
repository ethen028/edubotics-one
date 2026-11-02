"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useNotification } from "./notifications";

const NAME = "orbit-flash";

function readCookie() {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${NAME}=`));
  if (!raw) return null;
  try {
    return decodeURIComponent(raw.slice(NAME.length + 1));
  } catch {
    return null;
  }
}

/**
 * Shows the message an action left with flash() ("Invoice saved as a draft.") once the next page opens, then
 * clears it. `initial` is the same message read by the server, for the first page load after a redirect.
 */
export function FlashNotice({ initial }: { initial?: string }) {
  const notify = useNotification();
  const pathname = usePathname();
  const shown = useRef<string | null>(null);

  useEffect(() => {
    const value = readCookie() ?? initial ?? null;
    if (!value || shown.current === value) return;
    shown.current = value;
    document.cookie = `${NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
    const message = value.slice(value.indexOf("|") + 1);
    if (message) notify(message);
  }, [initial, pathname, notify]);

  return null;
}
