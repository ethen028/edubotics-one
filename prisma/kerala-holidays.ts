/**
 * Kerala general holidays for 2026 and 2027, from published Kerala holiday lists (October 2026).
 * `tentative` marks festivals that follow the moon or the Malayalam calendar, and every movable
 * 2027 date (the 2027 list isn't notified yet). Check against the Government of Kerala order and
 * fix any date under HR → Holidays; the seed never overwrites an existing date.
 */
type Row = [date: string, name: string, tentative?: boolean];

export const KERALA_HOLIDAYS: Row[] = [
  // 2026
  ["2026-01-02", "Mannam Jayanthi"],
  ["2026-01-26", "Republic Day"],
  ["2026-02-15", "Maha Shivaratri"],
  ["2026-03-20", "Eid-ul-Fitr (Ramzan)", true],
  ["2026-04-02", "Maundy Thursday"],
  ["2026-04-03", "Good Friday"],
  ["2026-04-05", "Easter"],
  ["2026-04-14", "Dr. B.R. Ambedkar Jayanthi"],
  ["2026-04-15", "Vishu", true],
  ["2026-05-01", "May Day"],
  ["2026-05-27", "Bakrid (Eid-ul-Adha)", true],
  ["2026-06-25", "Muharram", true],
  ["2026-08-12", "Karkidaka Vavu", true],
  ["2026-08-15", "Independence Day"],
  ["2026-08-25", "First Onam (Uthradom)", true],
  ["2026-08-26", "Thiruvonam · Milad-un-Nabi", true],
  ["2026-08-27", "Third Onam", true],
  ["2026-08-28", "Sree Narayana Guru Jayanthi · Ayyankali Jayanthi", true],
  ["2026-09-04", "Sree Krishna Jayanthi", true],
  ["2026-09-21", "Sree Narayana Guru Samadhi", true],
  ["2026-10-02", "Gandhi Jayanthi"],
  ["2026-10-20", "Maha Navami", true],
  ["2026-10-21", "Vijayadashami", true],
  ["2026-11-08", "Deepavali", true],
  ["2026-12-25", "Christmas"],
  // 2027 (not notified yet: movable dates are estimates)
  ["2027-01-02", "Mannam Jayanthi"],
  ["2027-01-26", "Republic Day"],
  ["2027-03-06", "Maha Shivaratri", true],
  ["2027-03-10", "Eid-ul-Fitr (Ramzan)", true],
  ["2027-03-25", "Maundy Thursday", true],
  ["2027-03-26", "Good Friday", true],
  ["2027-03-28", "Easter", true],
  ["2027-04-14", "Dr. B.R. Ambedkar Jayanthi"],
  ["2027-04-15", "Vishu", true],
  ["2027-05-01", "May Day"],
  ["2027-05-17", "Bakrid (Eid-ul-Adha)", true],
  ["2027-06-15", "Muharram", true],
  ["2027-08-02", "Karkidaka Vavu", true],
  ["2027-08-15", "Independence Day · Milad-un-Nabi", true],
  ["2027-08-25", "Sree Krishna Jayanthi", true],
  ["2027-08-28", "Ayyankali Jayanthi"],
  ["2027-09-11", "First Onam (Uthradom)", true],
  ["2027-09-12", "Thiruvonam", true],
  ["2027-09-13", "Third Onam", true],
  ["2027-09-14", "Sree Narayana Guru Jayanthi", true],
  ["2027-09-21", "Sree Narayana Guru Samadhi", true],
  ["2027-10-02", "Gandhi Jayanthi"],
  ["2027-10-09", "Maha Navami", true],
  ["2027-10-10", "Vijayadashami", true],
  ["2027-10-29", "Deepavali", true],
  ["2027-12-25", "Christmas"],
];
