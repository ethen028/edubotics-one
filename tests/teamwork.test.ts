// Checks for Teamwork: the company-domain rule, folder permissions, call links and meeting times.
// Run with `npm test`. Pure functions only: no database needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  callService,
  canDeleteFile,
  canManageFolder,
  canOpenFolder,
  checkJoinUrl,
  cleanDomain,
  emailInDomain,
  isDomain,
  meetingStatus,
  storageLimitBytes,
} from "../src/lib/teamwork-rules";

const domain = "eduboticsglobal.com";
const at = (local: string, host: string) => `${local}${String.fromCharCode(64)}${host}`;

test("no domain set: every login can use Teamwork", () => {
  assert.equal(emailInDomain(at("anu", "gmail.com"), null), true);
  assert.equal(emailInDomain(at("anu", "gmail.com"), ""), true);
  assert.equal(emailInDomain(at("anu", "gmail.com"), "  "), true);
});

test("domain set: only exactly that domain, any letter case", () => {
  assert.equal(emailInDomain(at("anu", domain), domain), true);
  assert.equal(emailInDomain(at("Anu.K", "EduboticsGlobal.com"), domain), true);
  assert.equal(emailInDomain(at("anu", "gmail.com"), domain), false);
  assert.equal(emailInDomain(at("anu", `mail.${domain}`), domain), false, "a subdomain is not the company domain");
  assert.equal(emailInDomain(at("anu", `${domain}.evil.in`), domain), false, "a look-alike domain is not the company domain");
  assert.equal(emailInDomain(at("anu", `x${domain}`), domain), false);
  assert.equal(emailInDomain(domain, domain), false, "no @ at all");
});

test("the domain an admin types is tidied and checked", () => {
  assert.equal(cleanDomain(" @EduboticsGlobal.com "), domain);
  assert.equal(cleanDomain(""), null);
  assert.equal(isDomain(domain), true);
  assert.equal(isDomain("edubotics"), false);
  assert.equal(isDomain(at("anu", domain)), false);
});

const admin = { id: "a", role: "ADMIN" };
const maker = { id: "m", role: "EMPLOYEE" };
const picked = { id: "p", role: "EMPLOYEE" };
const other = { id: "o", role: "MANAGER" };

test("folders for all staff open for everyone", () => {
  const top = { access: "EVERYONE" as const, createdById: "m", memberIds: [] };
  for (const u of [admin, maker, picked, other]) assert.equal(canOpenFolder(top, u), true);
});

test("folders for chosen people open for them, their maker and admins only", () => {
  const top = { access: "PEOPLE" as const, createdById: "m", memberIds: ["p"] };
  assert.equal(canOpenFolder(top, maker), true);
  assert.equal(canOpenFolder(top, picked), true);
  assert.equal(canOpenFolder(top, admin), true);
  assert.equal(canOpenFolder(top, other), false, "a manager not picked can't open it");
});

test("only the maker or an admin manage a folder; files can also go by their uploader", () => {
  assert.equal(canManageFolder({ createdById: "m" }, maker), true);
  assert.equal(canManageFolder({ createdById: "m" }, admin), true);
  assert.equal(canManageFolder({ createdById: "m" }, picked), false);
  assert.equal(canDeleteFile({ uploadedById: "p" }, { createdById: "m" }, picked), true);
  assert.equal(canDeleteFile({ uploadedById: "p" }, { createdById: "m" }, maker), true);
  assert.equal(canDeleteFile({ uploadedById: "p" }, { createdById: "m" }, other), false);
  assert.equal(canDeleteFile({ uploadedById: "p" }, null, other), false, "a loose file only goes by its uploader or an admin");
  assert.equal(canDeleteFile({ uploadedById: "p" }, null, admin), true);
});

test("storage limit defaults to 2 GB and can be changed", () => {
  assert.equal(storageLimitBytes(undefined), 2048 * 1024 * 1024);
  assert.equal(storageLimitBytes("500"), 500 * 1024 * 1024);
  assert.equal(storageLimitBytes("nonsense"), 2048 * 1024 * 1024);
  assert.equal(storageLimitBytes("-5"), 2048 * 1024 * 1024);
});

test("call links: https only, blank is fine, a bare link gets https", () => {
  assert.deepEqual(checkJoinUrl(""), { url: null });
  assert.deepEqual(checkJoinUrl("  https://meet.google.com/abc-defg-hij "), { url: "https://meet.google.com/abc-defg-hij" });
  assert.deepEqual(checkJoinUrl("zoom.us/j/123"), { url: "https://zoom.us/j/123" });
  assert.ok("error" in checkJoinUrl("http://meet.google.com/abc"));
  assert.ok("error" in checkJoinUrl("javascript:alert(1)"));
  assert.ok("error" in checkJoinUrl(`https://${at("user:pass", "zoom.us")}/j/1`));
});

test("the Join button names the service", () => {
  assert.equal(callService("https://meet.google.com/abc"), "Google Meet");
  assert.equal(callService("https://us02web.zoom.us/j/1"), "Zoom");
  assert.equal(callService("https://teams.microsoft.com/l/meetup-join/x"), "Teams");
  assert.equal(callService("https://meet.jit.si/OrbitMonday"), "Jitsi");
  assert.equal(callService("https://zoom.us.evil.in/j/1"), "the call");
});

test("a meeting is upcoming, soon (15 minutes before), live, then ended", () => {
  const startsAt = new Date("2026-10-26T04:30:00Z");
  const m = { startsAt, minutes: 30, cancelledAt: null };
  const t = (min: number) => new Date(startsAt.getTime() + min * 60_000);
  assert.equal(meetingStatus(m, t(-16)), "upcoming");
  assert.equal(meetingStatus(m, t(-15)), "soon");
  assert.equal(meetingStatus(m, t(0)), "live");
  assert.equal(meetingStatus(m, t(29)), "live");
  assert.equal(meetingStatus(m, t(30)), "ended");
  assert.equal(meetingStatus({ ...m, cancelledAt: t(-60) }, t(0)), "cancelled");
});
