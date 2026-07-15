import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchSourcePages, collectSource, validateUser, normalizeUsername } from "../src/fetch.js";
import type { RawPage } from "../src/fetch.js";
import { loadFixture } from "./helpers.js";
import { FakePage } from "./fixtures/fake-page.js";

function page(itemList: any[], hasMore: boolean, cursor = "0"): RawPage {
  return { itemList, cursor, hasMore, statusCode: 0 };
}
const rawItem = (id: string) => ({ id, author: { uniqueId: "u" }, video: { playAddr: `https://cdn/${id}.mp4` } });

test("normalizeUsername: strips @ and extracts from a profile URL", () => {
  assert.equal(normalizeUsername("exampleuser"), "exampleuser");
  assert.equal(normalizeUsername("@exampleuser"), "exampleuser");
  assert.equal(normalizeUsername("https://www.tiktok.com/@exampleuser?lang=en"), "exampleuser");
});

test("fetchSourcePages: single page, hasMore false -> stops without extra scrolling", async () => {
  const p = page([rawItem("a"), rawItem("b")], false);
  const fp = new FakePage([p], "/api/post/item_list/");
  const pages = await fetchSourcePages(fp as any, "u", "posts", { limit: 100 });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].itemList.length, 2);
});

test("fetchSourcePages: multi-page, follows hasMore across two scroll rounds", async () => {
  const p1 = page([rawItem("a"), rawItem("b")], true);
  const p2 = page([rawItem("c")], false);
  const fp = new FakePage([p1, p2], "/api/post/item_list/");
  const pages = await fetchSourcePages(fp as any, "u", "posts", { limit: 100 });
  assert.equal(pages.length, 2);
  assert.deepEqual(
    pages.flatMap((pg) => pg.itemList.map((i: any) => i.id)),
    ["a", "b", "c"],
  );
});

test("fetchSourcePages: stops once limit reached, even with hasMore true", async () => {
  const p1 = page(
    Array.from({ length: 16 }, (_, i) => rawItem(`i${i}`)),
    true,
  );
  const p2 = page([rawItem("never")], false);
  const fp = new FakePage([p1, p2], "/api/post/item_list/");
  const pages = await fetchSourcePages(fp as any, "u", "posts", { limit: 5 });
  assert.equal(pages.length, 1, "second page should never be requested once limit is already met");
});

test("fetchSourcePages: incremental isKnown - whole known page stops pagination early", async () => {
  const p1 = page([rawItem("known1"), rawItem("known2")], true);
  const p2 = page([rawItem("new1")], false);
  const fp = new FakePage([p1, p2], "/api/post/item_list/");
  const known = new Set(["known1", "known2"]);
  const pages = await fetchSourcePages(fp as any, "u", "posts", {
    limit: 100,
    isKnown: (item) => known.has(item.id),
  });
  assert.equal(pages.length, 1, "should stop after the fully-known page, never fetching page 2");
});

test("fetchSourcePages: responses for a different endpoint are ignored", async () => {
  const p1 = page([rawItem("a")], false);
  const fp = new FakePage([p1], "/api/post/item_list/");
  // deliver a bogus non-matching response first via goto's initial delivery being consumed by p1;
  // manually fire a non-matching one and confirm it doesn't get collected.
  await fp.deliverNonMatching({ itemList: [rawItem("intruder")], cursor: "0", hasMore: false, statusCode: 0 });
  const pages = await fetchSourcePages(fp as any, "u", "posts", { limit: 100 });
  const ids = pages.flatMap((pg) => pg.itemList.map((i: any) => i.id));
  assert.ok(!ids.includes("intruder"));
});

test("fetchSourcePages: broken/empty JSON body doesn't throw, treated as no data", async () => {
  const fp = new FakePage([], "/api/post/item_list/");
  // override goto to deliver a broken body instead of nothing
  const originalGoto = fp.goto.bind(fp);
  fp.goto = (async (url: string) => {
    fp.gotoUrls.push(url);
    await fp.deliverBroken();
  }) as any;
  const pages = await fetchSourcePages(fp as any, "u", "posts", { limit: 10, maxScrolls: 1 });
  assert.deepEqual(pages, []);
});

test("collectSource: dedupes by id, caps at limit, preserves arrival order", () => {
  const pages: RawPage[] = [page([rawItem("a"), rawItem("b")], true), page([rawItem("b"), rawItem("c")], false)];
  const { items, meta } = collectSource(pages, "posts", 2);
  assert.deepEqual(
    items.map((i) => i.id),
    ["a", "b"],
  );
  assert.equal(meta.length, 2);
});

test("validateUser: parses SSR blob for private/nickname/videoCount", async () => {
  const ssr = await loadFixture("universal-data-user.json");
  const fp = new FakePage([], "/api/post/item_list/");
  fp.ssrText = JSON.stringify(ssr);
  const info = await validateUser(fp as any, "exampleuser");
  assert.deepEqual(info, { username: "exampleuser", private: false, videoCount: 23, nickname: "Example" });
});

test("validateUser: returns undefined (not throw) when SSR blob is missing", async () => {
  const fp = new FakePage([], "/api/post/item_list/");
  fp.ssrText = null;
  const info = await validateUser(fp as any, "exampleuser");
  assert.equal(info, undefined);
});
