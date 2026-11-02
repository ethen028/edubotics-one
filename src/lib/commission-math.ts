const round2 = (n: number) => Math.round(n * 100) / 100;

/** Commission on one payment: the GST share is taken out first, then the rate applied. */
export function commissionFor(received: number, invoiceSubtotal: number, invoiceTotal: number, rate: number) {
  const base = invoiceTotal > 0 ? round2((received * invoiceSubtotal) / invoiceTotal) : 0;
  return { base, commission: round2((base * rate) / 100) };
}

/** Rows added up per person, biggest first. */
export function byPerson(rows: { userId: string; userName: string; base: number; commission: number }[]) {
  const map = new Map<string, { userId: string; name: string; base: number; commission: number; count: number }>();
  for (const r of rows) {
    const e = map.get(r.userId) ?? { userId: r.userId, name: r.userName, base: 0, commission: 0, count: 0 };
    e.base = round2(e.base + r.base);
    e.commission = round2(e.commission + r.commission);
    e.count++;
    map.set(r.userId, e);
  }
  return [...map.values()].sort((a, b) => b.commission - a.commission);
}
