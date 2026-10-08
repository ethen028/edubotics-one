import type { TemplateDefaults } from "./template-form";

const base = { description: "", weekday: 6, dayOfMonth: 0, dueTime: "", audience: "PEOPLE" as const, role: "EMPLOYEE", people: [] };
const items = (...labels: (string | [string, true])[]) =>
  labels.map((l) => (Array.isArray(l) ? { label: l[0], needsPhoto: true } : { label: l, needsPhoto: false }));

/** Ready-made lists to start from on the New checklist page. Edit freely before saving. */
export const STARTERS: Record<string, { name: string; hint: string; defaults: TemplateDefaults }> = {
  "office-opening": {
    name: "Office opening",
    hint: "Every working day by 9:30 am",
    defaults: {
      ...base,
      title: "Office opening",
      frequency: "DAILY",
      dueTime: "09:30",
      items: items("Unlock the office and switch off the alarm", "Lights, fans and AC on", "Wi-Fi and printer working", "Drinking water filled", "Check the courier and post"),
    },
  },
  "office-closing": {
    name: "Office closing",
    hint: "Every working day by 7:00 pm",
    defaults: {
      ...base,
      title: "Office closing",
      frequency: "DAILY",
      dueTime: "19:00",
      items: items("Lights, fans and AC off", "Robotics kits back in the store room", "Windows closed", ["Main door locked", true]),
    },
  },
  "kit-check": {
    name: "Kit check before a session",
    hint: "Each school session, for its trainer",
    defaults: {
      ...base,
      title: "Kit check before a session",
      frequency: "SESSION",
      audience: "EVERYONE",
      items: items(
        "Lesson plan and slides ready",
        "Laptop charged, charger packed",
        "Robotics kits counted against the kit list",
        "Batteries and spare parts packed",
        ["Photo of the packed kit", true],
      ),
    },
  },
  "month-end": {
    name: "Month-end",
    hint: "Last working day of each month",
    defaults: {
      ...base,
      title: "Month-end",
      frequency: "MONTHLY",
      dayOfMonth: 0,
      dueTime: "17:00",
      items: items(
        "All timesheets for the month approved",
        "Expense claims approved or sent back",
        "School invoices for the month issued",
        "Vendor bills entered",
        "Stock count of kits and parts",
        "Payroll run drafted",
      ),
    },
  },
  "weekly-store": {
    name: "Weekly store room check",
    hint: "Every Saturday",
    defaults: {
      ...base,
      title: "Weekly store room check",
      frequency: "WEEKLY",
      weekday: 6,
      items: items("Returned kits checked and put back", "Broken parts set aside and reported", "Low-stock items listed for purchase", ["Photo of the shelves", true]),
    },
  },
};

export const BLANK: TemplateDefaults = { ...base, title: "", frequency: "DAILY", items: [] };
