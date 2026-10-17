/**
 * One CSV cell, quoted. Text starting with = + - @ (or a tab or line break) gets a leading ' so Excel and Google Sheets
 * show it instead of running it as a formula: a school or applicant name like "=HYPERLINK(…)" stays plain text.
 * Numbers, and text that is just a number like "-250.00", are left alone so amounts still add up.
 */
export function csvCell(v: string | number | null | undefined) {
  let s = String(v ?? "");
  if (typeof v === "string" && /^[=+\-@\t\r\n]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
