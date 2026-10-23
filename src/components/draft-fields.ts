/** The named boxes of a form, in page order, as [name, value] (ticks as true/false). */
export type Fields = [string, string | boolean][];

type Box = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

// Never kept: secrets, files, and the hidden ids a page fills in itself.
const SKIP = new Set(["hidden", "password", "file", "submit", "button", "reset", "image"]);

function boxes(form: HTMLFormElement): Box[] {
  return Array.from(form.elements).filter(
    (e): e is Box =>
      (e instanceof HTMLInputElement || e instanceof HTMLSelectElement || e instanceof HTMLTextAreaElement) &&
      !!e.name &&
      !e.disabled &&
      !(e instanceof HTMLInputElement && SKIP.has(e.type)),
  );
}

export function readFields(form: HTMLFormElement): Fields {
  return boxes(form).map((b) => [b.name, b instanceof HTMLInputElement && (b.type === "checkbox" || b.type === "radio") ? b.checked : b.value]);
}

/** Puts values back by name, matching the 1st, 2nd… box of the same name in order. */
export function writeFields(form: HTMLFormElement, fields: Fields) {
  const seen = new Map<string, number>();
  const byName = new Map<string, Box[]>();
  for (const b of boxes(form)) byName.set(b.name, [...(byName.get(b.name) ?? []), b]);
  for (const [name, value] of fields) {
    const i = seen.get(name) ?? 0;
    seen.set(name, i + 1);
    const box = byName.get(name)?.[i];
    if (!box) continue;
    if (box instanceof HTMLInputElement && (box.type === "checkbox" || box.type === "radio")) box.checked = value === true;
    else if (typeof value === "string") {
      // A select only takes a value it still offers (someone may have been removed from a list since).
      if (box instanceof HTMLSelectElement && !Array.from(box.options).some((o) => o.value === value)) continue;
      box.value = value;
    }
  }
}

export function formatDraftTime(at: number) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(at);
}
