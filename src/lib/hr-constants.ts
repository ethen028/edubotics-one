// Business rules carried over from Edubotics HR V1.2.

/** Standard joining checklist. dueDays counts from the date of joining. */
export const ONBOARDING_TEMPLATE = [
  { title: "Fill in personal details", category: "HR", dueDays: 0 },
  { title: "Upload Aadhaar / ID proof", category: "Documents", dueDays: 1 },
  { title: "Upload PAN card", category: "Documents", dueDays: 1 },
  { title: "Share bank details", category: "Documents", dueDays: 2 },
  { title: "Sign offer letter and policies", category: "HR", dueDays: 2 },
  { title: "Issue ID card", category: "Admin", dueDays: 3 },
  { title: "Create official email and accounts", category: "IT Setup", dueDays: 1 },
  { title: "Assign laptop and lab kit", category: "IT Setup", dueDays: 3 },
  { title: "Complete induction training", category: "Training", dueDays: 7 },
  { title: "First meeting with manager", category: "Manager", dueDays: 2 },
] as const;

export const TASK_CATEGORIES = ["Documents", "HR", "Admin", "IT Setup", "Training", "Manager", "Other"] as const;

export const DOCUMENT_TYPES = [
  "Aadhaar / ID proof",
  "PAN card",
  "Bank details",
  "Educational certificate",
  "Offer letter",
  "Experience letter",
  "Resume",
  "Other",
] as const;

export const ASSET_CATEGORIES = ["Laptop", "Phone", "Access card", "Lab kit", "Robotics kit", "Tools", "Other"] as const;

export const TRAINING_MODULES = [
  { title: "Company Orientation", description: "Company, culture, teams and reporting structure" },
  { title: "Products & Solutions", description: "Edubotics products, programs and delivery model" },
  { title: "Information Security", description: "Security, passwords and data-handling responsibilities" },
  { title: "Workplace Safety", description: "Office, electronics lab and field safety" },
] as const;

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/** Allowlisted file signatures and format envelopes; never trust browser MIME or extensions.
 * This is format validation, not malware scanning or a full document decoder.
 */
export function sniffMime(bytes: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (/^%PDF-(1\.[0-7]|2\.0)[\r\n]/.test(ascii(0, 9)) &&
      /%%EOF\s*$/.test(ascii(Math.max(0, bytes.length - 1024), bytes.length))) return "application/pdf";
  if (bytes.length >= 12 && starts(0xff, 0xd8, 0xff) &&
      bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) return "image/jpeg";
  if (bytes.length >= 45 && starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) &&
      ascii(12, 16) === "IHDR" && ascii(bytes.length - 8, bytes.length - 4) === "IEND") return "image/png";
  if (bytes.length >= 20 && starts(0x52, 0x49, 0x46, 0x46) && ascii(8, 12) === "WEBP" &&
      ["VP8 ", "VP8L", "VP8X"].includes(ascii(12, 16))) {
    const declared = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
    if (declared + 8 === bytes.length) return "image/webp";
  }
  return null;
}

/** Rows for the standard checklist, due dates counted from the joining date. Skips titles in `existing`. */
export function checklistRows(employeeId: string, joining: Date, existing: Set<string> = new Set()) {
  return ONBOARDING_TEMPLATE.filter((t) => !existing.has(t.title)).map((t) => ({
    employeeId,
    title: t.title,
    category: t.category,
    dueDate: new Date(Date.UTC(joining.getUTCFullYear(), joining.getUTCMonth(), joining.getUTCDate() + t.dueDays)),
  }));
}

/** Performance review scale, 1 to 5. */
export const RATING_LABEL: Record<number, string> = {
  1: "Needs improvement",
  2: "Below expectations",
  3: "Meets expectations",
  4: "Exceeds expectations",
  5: "Outstanding",
};
