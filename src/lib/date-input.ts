import { z } from "zod";
import { parseDateOnly } from "./leave";

/** Validate before transforming so impossible dates become form errors, not thrown transforms. */
export const dateOnlyInput = z.string().trim().pipe(z.iso.date({ error: "Enter a valid calendar date (YYYY-MM-DD)." })).refine(value => !value.startsWith("0000"), "Year must be at least 0001.").transform(parseDateOnly);
export const optionalDateOnlyInput = z.preprocess(value => typeof value === "string" ? value.trim() : value,
  z.union([z.literal("").transform(() => null), dateOnlyInput]).nullable().optional());
export const timeInput = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time (HH:MM).");
