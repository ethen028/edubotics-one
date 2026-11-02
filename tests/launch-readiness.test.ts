import assert from "node:assert/strict";
import test from "node:test";
import { gateStatus, launchSummary, productionOriginReady } from "../src/lib/launch-readiness";

test("launch gates distinguish verified, configurable, and owner-controlled work", () => {
  assert.equal(gateStatus(true), "ready");
  assert.equal(gateStatus(false), "setup");
  assert.equal(gateStatus(false, true), "owner");
  assert.deepEqual(launchSummary([{ status: "ready" }, { status: "ready" }, { status: "setup" }, { status: "owner" }]), {
    ready: 2,
    setup: 1,
    owner: 1,
  });
});

test("only a real HTTPS production origin passes the deployment gate", () => {
  assert.equal(productionOriginReady("https://one.edubotics.example"), true);
  assert.equal(productionOriginReady("http://one.edubotics.example"), false);
  assert.equal(productionOriginReady("https://localhost:3001"), false);
  assert.equal(productionOriginReady("not a URL"), false);
  assert.equal(productionOriginReady(undefined), false);
});
