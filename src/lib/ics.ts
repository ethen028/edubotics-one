/** A calendar invite (.ics) that Gmail, Outlook and phone calendars can add with one tap. */

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** Lines longer than 75 octets are folded, as the iCalendar format requires. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function calendarInvite(e: {
  uid: string;
  start: Date;
  minutes: number;
  title: string;
  description: string;
  location?: string | null;
  organizer: { name: string; email: string };
}) {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Edubotics One//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(e.title)}`,
    `DESCRIPTION:${escape(e.description)}`,
    ...(e.location ? [`LOCATION:${escape(e.location)}`] : []),
    `ORGANIZER;CN=${escape(e.organizer.name)}:mailto:${e.organizer.email}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n");
}
