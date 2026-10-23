"use client";

import { useState } from "react";
import { Icon } from "./icons";

/**
 * A small button that copies `value` (an invoice number, a phone number) so it can be pasted into WhatsApp,
 * an email or Tally. Shows "Copied" for a moment.
 */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-btn print:hidden"
      title={copied ? "Copied" : `${label} ${value}`}
      aria-label={copied ? "Copied" : `${label} ${value}`}
      data-copied={copied || undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          // Plain http on the office network has no clipboard API; fall back to the old way.
          const box = document.createElement("textarea");
          box.value = value;
          box.style.position = "fixed";
          box.style.opacity = "0";
          document.body.append(box);
          box.select();
          document.execCommand("copy");
          box.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <Icon name={copied ? "check" : "copy"} className="h-3.5 w-3.5" />
      <span className="sr-only sm:not-sr-only">{copied ? "Copied" : null}</span>
    </button>
  );
}

/** A phone number or email address that opens the dialler or mail app, with a copy button beside it. */
export function ContactValue({ value, kind }: { value: string | null | undefined; kind: "phone" | "email" }) {
  if (!value) return <>—</>;
  return (
    <span className="inline-flex max-w-full items-center gap-1 align-middle">
      <a href={`${kind === "phone" ? "tel" : "mailto"}:${value}`} className="link break-all">
        {value}
      </a>
      <CopyButton value={value} />
    </span>
  );
}
