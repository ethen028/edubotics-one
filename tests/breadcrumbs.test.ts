import assert from "node:assert/strict";
import test from "node:test";
import { breadcrumbsFor } from "../src/lib/breadcrumbs";

test("breadcrumbs hide record IDs and keep real project return paths", () => {
  const crumbs = breadcrumbsFor("/projects/cm123/tasks/cm456");
  assert.deepEqual(crumbs.map(c => c.label), ["Home", "Projects", "Project", "Tasks", "Task"]);
  assert.equal(crumbs[2].href, "/projects/cm123");
  assert.equal(crumbs[3].linked, false);
});
test("real HR overview links while group-only routes remain unlinked", () => {
  const crumbs = breadcrumbsFor("/hr/employees/new");
  assert.equal(crumbs[1].linked, true);
  assert.equal(crumbs[2].linked, true);
  assert.equal(crumbs.at(-1)?.label, "New");
  assert.equal(breadcrumbsFor("/crm/deals")[1].linked, false);
  assert.equal(breadcrumbsFor("/admin/users")[1].linked, false);
});
test("breadcrumb root and unknown record labels never expose raw identifiers", () => {
  assert.deepEqual(breadcrumbsFor("/").map(c => c.label), ["Home"]);
  assert.equal(breadcrumbsFor("/inventory/cm123").at(-1)?.label, "Details");
});
test("nested breadcrumbs never link to grouping paths without pages", () => {
  for (const [page, group] of [
    ["/purchases/bills/id", "/purchases/bills"],
    ["/operations/sessions/id", "/operations/sessions"],
    ["/recruitment/offers/id", "/recruitment/offers"],
    ["/hr/reviews/cycles/id", "/hr/reviews/cycles"],
    ["/workshops/registrations/id", "/workshops/registrations"],
    ["/checklists/run/template/day", "/checklists/run/template"],
  ]) assert.equal(breadcrumbsFor(page).find(crumb => crumb.href === group)?.linked, false, group);
});
