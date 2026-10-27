// A searchable catalog of the functions sandboxed code may call. The model finds functions with search_api
// instead of loading every declaration up front. Pure: no imports, so it is easy to test.

export type CatalogEntry = {
  /** The function name, as called on `api` */
  name: string;
  /** Short words the search matches against. Say what the function returns, not how it works. */
  description: string;
  /** The TypeScript declaration shown to the model */
  declaration: string;
};

export type ApiCatalog = {
  /** Shared TypeScript types the declarations refer to */
  types: string;
  entries: CatalogEntry[];
};

const STOPWORDS = new Set(["a", "an", "and", "by", "for", "in", "of", "or", "the", "to"]);

/** Ranks entries against the words in the query. Name matches count more than description matches.
 *  An empty query returns the first few entries. */
export function searchCatalog(entries: CatalogEntry[], query: string, limit = 5): CatalogEntry[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  if (words.length === 0) return entries.slice(0, limit);
  return entries
    .map((e) => {
      const name = e.name.toLowerCase();
      const text = `${name} ${e.description.toLowerCase()}`;
      const score = words.reduce((n, w) => n + (name.includes(w) ? 2 : 0) + (text.includes(w) ? 1 : 0), 0);
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((x) => x.e);
}
