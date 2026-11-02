export type DealView = { q: string; mine: boolean; closed: boolean; view: "board" | "list" };

export function parseDealView(params: Record<string, string | string[] | undefined>): DealView {
  return { q: typeof params.q === "string" ? params.q.trim().slice(0, 120) : "", mine: params.mine === "1", closed: params.closed === "1", view: params.view === "list" ? "list" : "board" };
}

export function dealViewHref(current: DealView, update: Partial<DealView> = {}) {
  const next = { ...current, ...update };
  const query = new URLSearchParams();
  if (next.q) query.set("q", next.q);
  if (next.mine) query.set("mine", "1");
  if (next.closed) query.set("closed", "1");
  if (next.view === "list") query.set("view", "list");
  return "/crm/deals" + (query.size ? "?" + query.toString() : "");
}
