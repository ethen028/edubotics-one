/**
 * Rewards and recognition, the rules part (no database, so it can be tested on its own).
 * Recognition here is words only: there are no points, prizes or money attached. Anything that would turn it into a
 * real benefit is the owner's decision and is not built.
 */

/** What a colleague can be thanked for. Shown as a small label on each recognition. */
export const RECOGNITION_VALUES = [
  "Team player",
  "Above and beyond",
  "Great with students",
  "Happy schools",
  "Problem solver",
  "Always learning",
  "Thank you",
] as const;
export type RecognitionValue = (typeof RECOGNITION_VALUES)[number];

export const isRecognitionValue = (v: string): v is RecognitionValue => (RECOGNITION_VALUES as readonly string[]).includes(v);

/** How long a highlighted recognition stays in the spotlight on Home. */
export const SPOTLIGHT_DAYS = 30;

/** The highlighted recognition to show on Home: the most recent one highlighted within the last SPOTLIGHT_DAYS. */
export function spotlightSince(now: Date) {
  return new Date(now.getTime() - SPOTLIGHT_DAYS * 86_400_000);
}

export type Milestone = { key: string; label: string; detail: string };

const RECEIVED_STEPS = [1, 5, 10, 25, 50];
const GIVEN_STEPS = [5, 20];
const ALL_ROUNDER_VALUES = 4;

/**
 * Achievements worked out from what someone has received and given. Nothing is stored, so they can't drift from the
 * history, and deleting a recognition takes its share away again.
 */
export function milestones(received: { value: string }[], givenCount: number) {
  const done: Milestone[] = [];
  for (const n of RECEIVED_STEPS) {
    if (received.length >= n)
      done.push({ key: `received-${n}`, label: n === 1 ? "First recognition" : `${n} recognitions`, detail: `Thanked ${n === 1 ? "once" : `${n} times`} by colleagues` });
  }
  const values = new Set(received.map((r) => r.value));
  if (values.size >= ALL_ROUNDER_VALUES)
    done.push({ key: "all-rounder", label: "All-rounder", detail: `Recognised for ${values.size} different things` });
  for (const n of GIVEN_STEPS) {
    if (givenCount >= n) done.push({ key: `given-${n}`, label: n === GIVEN_STEPS[0] ? "Good colleague" : "Team booster", detail: `Thanked others ${n} times` });
  }

  const nextReceived = RECEIVED_STEPS.find((n) => received.length < n);
  const next = nextReceived
    ? { label: nextReceived === 1 ? "First recognition" : `${nextReceived} recognitions`, have: received.length, need: nextReceived }
    : null;
  return { done, next };
}

/** People recognised in a period, most first, ties by name. */
export function tally<T extends { toId: string; to: { name: string } }>(rows: T[]) {
  const by = new Map<string, { userId: string; name: string; count: number }>();
  for (const r of rows) {
    const row = by.get(r.toId) ?? { userId: r.toId, name: r.to.name, count: 0 };
    row.count++;
    by.set(r.toId, row);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Who may highlight a recognition, or remove one. The giver can always take back their own. */
export const canFeature = (user: { role: string }) => ["ADMIN", "HR", "MANAGER"].includes(user.role);
export const canRemove = (user: { id: string; role: string }, r: { fromId: string }) => user.role === "ADMIN" || r.fromId === user.id;
