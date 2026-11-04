import assert from "node:assert/strict";
import test from "node:test";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { canEditNotice, isAcked, nextNoticeVersion, sortBoard, sortPending } from "../src/lib/notice-rules";

// The notice board on Convex, run against convex-test (an in-memory Convex) with the real functions.
const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () => import("../convex/_generated/server.js"),
  "../convex/notices.ts": () => import("../convex/notices"),
};

const person = (id: string, role: string, companyId = "company-a") => ({ subject: id, sid: `session-${id}`, companyId, role, isOwner: false });
const admin = person("u-admin", "ADMIN");
const hr = person("u-hr", "HR");
const manager = person("u-manager", "MANAGER");
const employee = person("u-employee", "EMPLOYEE");
const otherCompanyAdmin = person("u-other", "ADMIN", "company-b");

const policy = { kind: "POLICY" as const, title: "Leave policy 2026", body: "15 casual, 3 sick.", category: "HR and leave", pinned: false, requiresAck: true };
const { kind: _kind, ...edit } = policy; // update keeps the notice's kind
void _kind;
const setup = () => convexTest(schema, modules);

test("only admins, HR and managers can post notices; staff can't", async () => {
  const t = setup();
  for (const who of [admin, hr, manager]) await t.withIdentity(who).mutation(api.notices.create, policy);
  await assert.rejects(t.withIdentity(employee).mutation(api.notices.create, policy), /Not for your role/);
  await assert.rejects(t.mutation(api.notices.create, policy), /Sign in first/);
});

test("a notice from one company is invisible and unchangeable from another", async () => {
  const t = setup();
  const id = await t.withIdentity(admin).mutation(api.notices.create, policy);
  const other = t.withIdentity(otherCompanyAdmin);
  assert.equal(await other.query(api.notices.get, { id }), null);
  assert.deepEqual(await other.query(api.notices.list, { kind: "POLICY", archived: false }), []);
  await assert.rejects(other.mutation(api.notices.togglePinned, { id }), /removed/);
  await assert.rejects(other.mutation(api.notices.update, { id, ...edit, askAgain: false, removeFile: false }), /removed/);
});

test("the poster has acknowledged their own notice; everyone else sees it pending until they do", async () => {
  const t = setup();
  const id = await t.withIdentity(hr).mutation(api.notices.create, policy);
  assert.deepEqual(await t.withIdentity(hr).query(api.notices.myPending, {}), []);
  const pending = await t.withIdentity(employee).query(api.notices.myPending, {});
  assert.equal(pending.length, 1);
  await t.withIdentity(employee).mutation(api.notices.acknowledge, { id });
  await t.withIdentity(employee).mutation(api.notices.acknowledge, { id }); // twice is still one acknowledgement
  assert.deepEqual(await t.withIdentity(employee).query(api.notices.myPending, {}), []);
  const acks = await t.withIdentity(hr).query(api.notices.acknowledgements, { id });
  assert.deepEqual(acks.map((a) => a.userId).sort(), ["u-employee", "u-hr"]);
  await assert.rejects(t.withIdentity(employee).query(api.notices.acknowledgements, { id }), /Not for your role/);
});

test("asking again after a change makes earlier acknowledgements stop counting", async () => {
  const t = setup();
  const id = await t.withIdentity(admin).mutation(api.notices.create, policy);
  await t.withIdentity(employee).mutation(api.notices.acknowledge, { id });
  await t.withIdentity(admin).mutation(api.notices.update, { id, ...edit, body: "Changed.", askAgain: true, removeFile: false });
  const notice = await t.withIdentity(employee).query(api.notices.get, { id });
  assert.equal(notice?.version, 2);
  assert.equal(notice?.myAck?.version, 1);
  assert.equal((await t.withIdentity(employee).query(api.notices.myPending, {})).length, 1);
  assert.deepEqual(await t.withIdentity(admin).query(api.notices.myPending, {}), []); // the editor re-acknowledged
});

test("managers change only their own notices; admins change any", async () => {
  const t = setup();
  const id = await t.withIdentity(hr).mutation(api.notices.create, policy);
  await assert.rejects(t.withIdentity(manager).mutation(api.notices.togglePinned, { id }), /Only the person who posted this/);
  await t.withIdentity(admin).mutation(api.notices.togglePinned, { id });
  assert.equal((await t.withIdentity(admin).query(api.notices.get, { id }))?.pinned, true);
});

test("archived notices leave the board and stop asking; only posters see the archive", async () => {
  const t = setup();
  const id = await t.withIdentity(admin).mutation(api.notices.create, policy);
  await t.withIdentity(admin).mutation(api.notices.toggleArchived, { id });
  assert.deepEqual(await t.withIdentity(employee).query(api.notices.myPending, {}), []);
  assert.deepEqual(await t.withIdentity(employee).query(api.notices.list, { kind: "POLICY", archived: false }), []);
  assert.deepEqual(await t.withIdentity(employee).query(api.notices.list, { kind: "POLICY", archived: true }), []);
  assert.equal((await t.withIdentity(admin).query(api.notices.list, { kind: "POLICY", archived: true })).length, 1);
  await t.withIdentity(employee).mutation(api.notices.acknowledge, { id }); // ignored once archived
  assert.deepEqual(await t.withIdentity(admin).query(api.notices.acknowledgements, { id }).then((a) => a.map((x) => x.userId)), ["u-admin"]);
});

test("Home shows at most three current announcements, hiding ones past their last day", async () => {
  const t = setup();
  const day = (d: number) => Date.UTC(2026, 10, d);
  const post = (title: string, showUntil?: number) =>
    t.withIdentity(admin).mutation(api.notices.create, { kind: "ANNOUNCEMENT", title, body: "x", pinned: false, requiresAck: false, showUntil });
  await post("Ended", day(3));
  for (const title of ["One", "Two", "Three", "Four"]) await post(title, day(30));
  const home = await t.withIdentity(employee).query(api.notices.forHome, { today: day(4) });
  assert.equal(home.length, 3);
  assert.ok(!home.some((n) => n.title === "Ended"));
});

test("attachments must be a PDF or picture of up to 5 MB, and replacing one deletes the old file", async () => {
  const t = setup();
  const store = (bytes: number, type: string) => t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })));
  const big = await store(5 * 1024 * 1024 + 1, "application/pdf");
  await assert.rejects(
    t.withIdentity(admin).mutation(api.notices.create, { ...policy, attachment: { storageId: big, fileName: "a.pdf", mimeType: "application/pdf", size: 10 } }),
    /up to 5 MB/,
  );
  const exe = await store(10, "application/x-msdownload");
  await assert.rejects(
    t.withIdentity(admin).mutation(api.notices.create, { ...policy, attachment: { storageId: exe, fileName: "a.exe", mimeType: "application/x-msdownload", size: 10 } }),
    /PDF, JPG, PNG or WebP/,
  );
  const first = await store(10, "application/pdf");
  const id = await t.withIdentity(admin).mutation(api.notices.create, { ...policy, attachment: { storageId: first, fileName: "v1.pdf", mimeType: "application/pdf", size: 1 } });
  assert.equal((await t.withIdentity(admin).query(api.notices.get, { id }))?.attachment?.size, 10); // size taken from storage, not the caller
  const second = await store(20, "application/pdf");
  await t.withIdentity(admin).mutation(api.notices.update, { id, ...edit, askAgain: false, removeFile: false, attachment: { storageId: second, fileName: "v2.pdf", mimeType: "application/pdf", size: 20 } });
  assert.equal(await t.run((ctx) => ctx.storage.get(first)), null);
  const file = await t.withIdentity(employee).query(api.notices.attachment, { id });
  assert.equal(file?.fileName, "v2.pdf");
});

test("copying notices from PostgreSQL twice adds each one once", async () => {
  const t = setup();
  const row = { legacyId: "pg-1", ...policy, version: 2, authorId: "u-hr", createdAt: 1, updatedAt: 2, acks: [{ userId: "u-employee", version: 2, ackedAt: 3 }] };
  const first = await t.withIdentity(admin).mutation(api.notices.importFromPostgres, row);
  const again = await t.withIdentity(admin).mutation(api.notices.importFromPostgres, row);
  assert.equal(first.added, true);
  assert.equal(again.added, false);
  assert.equal(first.id, again.id);
  await assert.rejects(t.withIdentity(hr).mutation(api.notices.importFromPostgres, { ...row, legacyId: "pg-2" }), /Not for your role/);
  assert.deepEqual(await t.withIdentity(employee).query(api.notices.myPending, {}), []);
});

test("notice rules: versions, editing rights and ordering", () => {
  assert.deepEqual(nextNoticeVersion({ version: 1, requiresAck: false }, { requiresAck: true, askAgain: false }), { newRound: true, version: 2 });
  assert.deepEqual(nextNoticeVersion({ version: 3, requiresAck: true }, { requiresAck: true, askAgain: false }), { newRound: false, version: 3 });
  assert.equal(isAcked({ version: 2 }, { version: 1 }), false);
  assert.equal(canEditNotice({ id: "a", role: "MANAGER" }, { authorId: "b" }), false);
  assert.equal(canEditNotice({ id: "a", role: "ADMIN" }, { authorId: "b" }), true);
  const sorted = sortPending([{ ackDueDate: null, createdAt: 1 }, { ackDueDate: 5, createdAt: 9 }, { ackDueDate: 2, createdAt: 9 }]);
  assert.deepEqual(sorted.map((n) => n.ackDueDate), [2, 5, null]);
  const board = sortBoard([
    { kind: "POLICY", pinned: false, category: "Safety", title: "B", createdAt: 1 },
    { kind: "POLICY", pinned: false, category: undefined, title: "A", createdAt: 1 },
    { kind: "POLICY", pinned: true, category: "Conduct", title: "Z", createdAt: 1 },
    { kind: "POLICY", pinned: false, category: "Conduct", title: "C", createdAt: 1 },
  ]);
  assert.deepEqual(board.map((n) => n.title), ["Z", "C", "B", "A"]);
});

test("the sign-in token Next signs is one Convex accepts: ES256 with key id, issuer, audience, and a 5-minute life", async () => {
  const { jwtVerify, decodeProtectedHeader, createLocalJWKSet } = await import("jose");
  const { newConvexKeys, signConvexToken } = await import("../src/lib/convex-token");
  const { ORBIT_TOKEN_AUDIENCE, ORBIT_TOKEN_ISSUER } = await import("../convex/lib/token");
  const keys = await newConvexKeys();
  const token = await signConvexToken({ userId: "u1", sessionId: "s1", companyId: "c1", role: "HR", isOwner: false }, keys.privateKeyPem);
  const jwks = JSON.parse(Buffer.from(keys.jwksDataUri.split("base64,")[1], "base64").toString());
  assert.equal(jwks.keys[0].d, undefined, "the public key set must not carry the private key");
  const header = decodeProtectedHeader(token);
  assert.deepEqual([header.alg, header.typ, header.kid], ["ES256", "JWT", jwks.keys[0].kid]);
  const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), { issuer: ORBIT_TOKEN_ISSUER, audience: ORBIT_TOKEN_AUDIENCE });
  assert.equal(payload.sub, "u1");
  assert.equal(payload.companyId, "c1");
  assert.equal(payload.role, "HR");
  assert.equal(payload.exp! - payload.iat!, 300);
});

test("file addresses from Convex are fetched through the address Next uses to reach it", async () => {
  const { onConvexUrl } = await import("../src/lib/convex-token");
  assert.equal(onConvexUrl("http://192.168.1.20:3210/api/storage/abc?x=1", "http://convex:3210"), "http://convex:3210/api/storage/abc?x=1");
  assert.equal(onConvexUrl("https://happy-cat-1.convex.cloud/api/storage/abc", "https://happy-cat-1.convex.cloud"), "https://happy-cat-1.convex.cloud/api/storage/abc");
});
