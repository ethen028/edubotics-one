import Link from "next/link";
import type { LetterKind, LetterStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { LETTER_KINDS, type LetterBody } from "@/lib/letter-rules";

export function LetterStatusBadge({ status }: { status: LetterStatus }) {
  if (status === "ISSUED") return <Badge color="green">Issued</Badge>;
  if (status === "REPLACED") return <Badge>Replaced</Badge>;
  return <Badge color="red">Cancelled</Badge>;
}

/** The letter's wording on screen, to check it before printing or sending. The PDF adds the letterhead and signature. */
export function LetterPreview({ body }: { body: LetterBody }) {
  if (body.card) {
    const c = body.card;
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {(
          [
            ["Name", c.name],
            ["Employee code", c.code],
            ["Designation", c.designation],
            ["Department", c.department],
            ["Blood group", c.bloodGroup],
            ["Phone", c.phone],
            ["In an emergency", c.emergency],
            ["Joined", c.joined],
          ] as [string, string | null][]
        ).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd>{v || "—"}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {body.to.length > 0 && (
        <div>
          {body.to.map((l, i) => (
            <div key={i} className={i === 0 ? "font-medium" : undefined}>
              {l}
            </div>
          ))}
        </div>
      )}
      <h3 className="text-center font-semibold tracking-wide text-brand-700 uppercase">{body.title}</h3>
      {body.subject && <p className="text-center font-medium">{body.subject}</p>}
      {body.salutation && <p>{body.salutation}</p>}
      {body.blocks.map((b, i) =>
        "p" in b ? (
          <p key={i} className="whitespace-pre-line">
            {b.p}
          </p>
        ) : "heading" in b ? (
          <h4 key={i} className="pt-1 font-semibold">
            {b.heading}
          </h4>
        ) : (
          <div key={i} className="overflow-x-auto">
            <table className="table text-xs">
              {b.table.head && (
                <thead>
                  <tr>
                    {b.table.head.map((h, j) => (
                      <th key={j} className={b.table.numeric?.includes(j) ? "text-right" : undefined}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {[...b.table.rows, ...(b.table.foot ? [b.table.foot] : [])].map((r, j) => (
                  <tr key={j} className={b.table.foot && j === b.table.rows.length ? "font-semibold" : undefined}>
                    {r.map((v, k) => (
                      <td key={k} className={b.table.numeric?.includes(k) ? "text-right whitespace-nowrap" : undefined}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
      <div className="pt-4 text-slate-600">
        <div>For the company</div>
        <div className="font-medium">{body.signatory.name || "Authorised signatory"}</div>
        {body.signatory.name && body.signatory.title && <div className="text-xs">{body.signatory.title}</div>}
      </div>
      {body.ack && <p className="text-xs text-slate-500">Line for {body.to[0] ?? "them"} to sign: “{body.ack}”</p>}
      {body.note && <p className="text-xs text-slate-500">{body.note}</p>}
    </div>
  );
}

type ProfileLetter = { id: string; kind: LetterKind; number: string | null; issuedOn: Date; status: LetterStatus; manage: boolean };

/** The person's letters on their profile: HR and admins open each one to email or reissue it; the person downloads their own. */
export function EmployeeLetters({ employeeId, letters, canIssue, payslipsHref }: { employeeId: string; letters: ProfileLetter[]; canIssue: boolean; payslipsHref: string | null }) {
  return (
    <section className="card text-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Letters and certificates</h2>
        {canIssue && (
          <Link href={`/hr/letters/new?employee=${employeeId}`} className="btn-secondary btn-sm">
            Issue a letter
          </Link>
        )}
      </div>
      {letters.length === 0 ? (
        <p className="text-slate-500">None issued yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {letters.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <Link href={l.manage ? `/hr/letters/${l.id}` : `/hr/letters/${l.id}/pdf`} target={l.manage ? undefined : "_blank"} className="link">
                  {LETTER_KINDS[l.kind].label}
                </Link>
                <div className="text-xs text-slate-500">
                  {l.number ? `${l.number} · ` : ""}
                  {formatDate(l.issuedOn)}
                </div>
              </div>
              {l.status !== "ISSUED" && <LetterStatusBadge status={l.status} />}
            </li>
          ))}
        </ul>
      )}
      {payslipsHref && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Payslips are under{" "}
          <Link href={payslipsHref} className="link">
            Payroll
          </Link>
          .
        </p>
      )}
    </section>
  );
}
