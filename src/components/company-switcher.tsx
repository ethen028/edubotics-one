"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

/**
 * The superadmin's company picker in the top bar: choosing a company opens it straight away, on the same
 * page where that makes sense. Staff never see it; they only have their own company.
 */
export function CompanySwitcher({
  companies,
  current,
  action,
  id,
  className = "",
}: {
  companies: { id: string; name: string }[];
  current: string;
  action: (formData: FormData) => Promise<void>;
  /** Two copies are drawn: in the top bar on wider screens, on a row of its own on phones. */
  id: string;
  className?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  // A record page (/crm/leads/abc) belongs to one company, so a switch lands on its list or section instead.
  const path = usePathname().split("/").slice(0, 3).join("/") || "/";
  return (
    <form ref={form} key={current} action={action} className={`company-switch ${className}`} title="Company you are working in">
      <Icon name="building" className="h-4 w-4 shrink-0 text-brand-700" />
      <label className="sr-only" htmlFor={id}>Company</label>
      <select id={id} name="companyId" defaultValue={current} onChange={() => form.current?.requestSubmit()}>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input type="hidden" name="next" value={path} />
      <noscript><button className="btn-secondary">Open</button></noscript>
    </form>
  );
}
