import Link from "next/link";
import type { Role } from "@prisma/client";
import { ConfirmButton } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { formatDate } from "@/lib/format";
import { canFeature, canRemove } from "@/lib/recognition-rules";
import { removeRecognition, toggleFeatured } from "./actions";

export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export type RecognitionRow = {
  id: string;
  fromId: string;
  toId: string;
  value: string;
  message: string;
  featuredAt: Date | null;
  createdAt: Date;
  from: { name: string };
  to: { name: string };
};

type Viewer = { id: string; role: Role };

/** One thank-you in the history: who, for what, and the words. */
export function RecognitionItem({ r, viewer }: { r: RecognitionRow; viewer: Viewer }) {
  return (
    <li id={`r-${r.id}`} className="card scroll-mt-24">
      <div className="flex items-start gap-3">
        <span className="member-initials" aria-hidden>
          {initials(r.to.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Link href={`/recognition?person=${r.toId}`} className="font-semibold text-slate-900 hover:underline">
              {r.to.name}
            </Link>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{r.value}</span>
            {r.featuredAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">
                <Icon name="star" className="h-3 w-3" /> Spotlight
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm whitespace-pre-line text-slate-700">{r.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>
              From{" "}
              <Link href={`/recognition?person=${r.fromId}`} className="hover:underline">
                {r.from.name}
              </Link>{" "}
              · {formatDate(r.createdAt)}
            </span>
            {canFeature(viewer) && (
              <form action={toggleFeatured.bind(null, r.id)}>
                <button className="link">{r.featuredAt ? "Take out of spotlight" : "Put in spotlight"}</button>
              </form>
            )}
            {canRemove(viewer, r) && (
              <form action={removeRecognition.bind(null, r.id)}>
                <ConfirmButton
                  message={`Remove this recognition for ${r.to.name}? It disappears from the history for everyone.`}
                  className="text-slate-500 hover:text-red-600 hover:underline"
                >
                  Remove
                </ConfirmButton>
              </form>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/** The highlighted recognition, as a violet banner at the top of Home. */
export function SpotlightCard({ r }: { r: RecognitionRow }) {
  return (
    <section className="recognition-spotlight mb-6 p-5">
      <div className="flex items-start gap-4">
        <span className="recognition-spotlight-avatar" aria-hidden>
          {initials(r.to.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-brand-700 uppercase">
            <Icon name="star" className="h-3.5 w-3.5" /> In the spotlight
          </div>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            {r.to.name} <span className="font-normal text-slate-500">· {r.value}</span>
          </h2>
          <p className="mt-1 line-clamp-3 text-sm text-slate-700">“{r.message}”</p>
          <p className="mt-2 text-xs text-slate-500">
            From {r.from.name} · {formatDate(r.createdAt)}
          </p>
        </div>
        <Link href="/recognition/give" className="btn-secondary hidden shrink-0 sm:inline-flex">
          Thank someone
        </Link>
      </div>
    </section>
  );
}

/** The side card on Home: the latest few thank-yous and a button to give one. */
export function RecognitionHomeCard({ recent, receivedThisMonth }: { recent: RecognitionRow[]; receivedThisMonth: number }) {
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Recognition</h2>
        <Link href="/recognition" className="link text-sm">
          All
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-slate-500">No one has been thanked yet. Be the first.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {recent.map((r) => (
            <li key={r.id} className="flex items-start gap-2.5">
              <span className="member-initials" aria-hidden>
                {initials(r.to.name)}
              </span>
              <Link href={`/recognition#r-${r.id}`} className="min-w-0 hover:underline">
                <b>{r.to.name}</b> <span className="text-slate-500">· {r.value}</span>
                <span className="block truncate text-slate-600">{r.message}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {receivedThisMonth > 0 && (
        <p className="mt-3 text-xs text-brand-700">
          You were thanked {receivedThisMonth === 1 ? "once" : `${receivedThisMonth} times`} this month.
        </p>
      )}
      <Link href="/recognition/give" className="btn-primary mt-4 w-full justify-center">
        Thank a colleague
      </Link>
    </section>
  );
}
