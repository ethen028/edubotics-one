const paths: Record<string, string> = {
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "m6 6 12 12 M18 6 6 18",
  search: "M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  home: "m3 10 9-7 9 7v10H3z M9 20v-7h6v7",
  work: "M8 6V4h8v2 M3 7h18v13H3z M3 12h18 M10 12v3h4v-3",
  inventory: "m3 7 9-4 9 4v13H3z M3 7l9 4 9-4 M12 11v9",
  operations: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
  purchases: "M3 4h2l3 12h11l2-8H6 M10 20h.01 M18 20h.01",
  crm: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M17 4a3 3 0 0 1 0 6 M22 21v-3a4 4 0 0 0-3-3.9",
  billing: "M5 3h14v18l-3-2-4 2-4-2-3 2z M8 8h8 M8 12h8 M8 16h4",
  hr: "M3 21v-4a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v4 M8.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M17 10l2 2 4-4 M18 16v5",
  payroll: "M3 5h18v14H3z M3 9h18 M7 15h4 M17 15h.01",
  admin: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z M8 12l3 3 5-6",
  calendar: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 18h2",
  clock: "M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  chart: "M4 3v18h17 M8 16v-5 M13 16V7 M18 16v-9",
  document: "M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6",
  check: "M4 4h16v16H4z M8 12l3 3 5-6",
  message: "M3 4h18v13H8l-5 4z M7 8h10 M7 12h7",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
  chevron: "m9 5 7 7-7 7",
  collapse: "M4 4h16v16H4z M9 4v16 M16 9l-3 3 3 3",
  expand: "M4 4h16v16H4z M9 4v16 M13 9l3 3-3 3",
  account: "M20 21a8 8 0 0 0-16 0 M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  logout: "M9 3H4v18h5 M10 12h11 M17 8l4 4-4 4",
};

const bodies: Record<string, string> = {
  home: "m3 10 9-7 9 7v10H3z",
  work: "M3 7h18v13H3z",
  inventory: "m3 7 9-4 9 4v13H3z",
  operations: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
  billing: "M5 3h14v18l-3-2-4 2-4-2-3 2z",
  payroll: "M3 5h18v14H3z",
  admin: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z",
  calendar: "M4 5h16v16H4z",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  document: "M5 3h10l4 4v14H5z",
  check: "M4 4h16v16H4z",
  message: "M3 4h18v13H8l-5 4z",
};

export function NavIcon({ name, className = "", appearance = "line" }: { name: string; className?: string; appearance?: "line" | "clay" }) {
  const path = paths[name] ?? paths.document;
  const clay = appearance === "clay";
  const glyph = <svg className={clay ? "material-glyph" : `nav-icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {clay && bodies[name] && <path d={bodies[name]} fill="currentColor" fillOpacity=".1" stroke="none" />}
    <path d={path} />
  </svg>;
  return clay ? <span className={`nav-icon material-icon ${className}`} aria-hidden="true">{glyph}</span> : glyph;
}

export function iconForRoute(href: string) {
  if (href === "/") return "home";
  if (/schedule|attendance|holidays|leave|interviews/.test(href)) return "calendar";
  if (/timesheet/.test(href)) return "clock";
  if (/dashboard|reports|accounts|health/.test(href)) return "chart";
  if (/checklists|approvals|reviews/.test(href)) return "check";
  if (/notices|helpdesk|activities/.test(href)) return "message";
  if (/settings|departments/.test(href)) return "settings";
  if (/employees|users|contacts|recruitment|onboarding/.test(href)) return "crm";
  if (/invoices|expenses|payroll|credit|quotes|payables/.test(href)) return "billing";
  if (/inventory|assets/.test(href)) return "inventory";
  if (/purchases|vendors/.test(href)) return "purchases";
  if (/projects|work$/.test(href)) return "work";
  if (/operations|workshops/.test(href)) return "operations";
  return "document";
}
