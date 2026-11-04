import assert from "node:assert/strict";
import test from "node:test";
import { PAGE_SIZE, pageHref, pageNumber, pageQuery, pageRows } from "../src/lib/paging";

test("page numbers from the address are whole numbers from 1", () => {
  assert.equal(pageNumber(undefined), 1);
  assert.equal(pageNumber(""), 1);
  assert.equal(pageNumber("3"), 3);
  assert.equal(pageNumber("0"), 1);
  assert.equal(pageNumber("-2"), 1);
  assert.equal(pageNumber("2.5"), 1);
  assert.equal(pageNumber("abc"), 1);
  assert.equal(pageNumber("999999"), 10_000);
});

test("the database is asked for one page plus one row", () => {
  assert.deepEqual(pageQuery(1), { skip: 0, take: PAGE_SIZE + 1 });
  assert.deepEqual(pageQuery(3, 20), { skip: 40, take: 21 });
});

test("an extra row means there is a next page", () => {
  const rows = Array.from({ length: 21 }, (_, i) => i);
  assert.deepEqual(pageRows(rows, 2, 20), { rows: rows.slice(0, 20), more: true, first: 21 });
  assert.deepEqual(pageRows(rows.slice(0, 20), 1, 20).more, false);
});

test("a list already in memory is cut to the page", () => {
  const rows = Array.from({ length: 45 }, (_, i) => i);
  assert.deepEqual(pageRows(rows, 3, 20, false), { rows: [40, 41, 42, 43, 44], more: false, first: 41 });
  assert.equal(pageRows(rows, 2, 20, false).more, true);
});

test("page links keep the filters and drop page 1", () => {
  assert.equal(pageHref({ status: "OPEN", q: "st mary", page: "4" }, 2), "?status=OPEN&q=st+mary&page=2");
  assert.equal(pageHref({ status: "OPEN", page: "2" }, 1), "?status=OPEN");
  assert.equal(pageHref({}, 1), "?");
});
