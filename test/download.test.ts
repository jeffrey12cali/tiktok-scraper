import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { downloadAll } from "../src/download.js";
import { mockFetch, bytesResp, makeMediaItem, tmpDir, rmDir, fakeContext, apiOk, apiFail, type FetchMock } from "./helpers.js";

let fm: FetchMock | undefined;
let dir: string;
afterEach(async () => {
  fm?.restore();
  if (dir) await rmDir(dir);
});

// context.request is made to always fail here, forcing every item through the
// plain-fetch fallback - isolates fallback behavior, ported from ttmd's downloader tests.
const noContextRequest = fakeContext(() => apiFail(403));

const vid = (over: Partial<ReturnType<typeof makeMediaItem>> = {}) => makeMediaItem(over);
const pic = (over: Partial<ReturnType<typeof makeMediaItem>> = {}) =>
  makeMediaItem({
    id: "p1",
    kind: "image",
    urls: ["https://cdn/1.jpg", "https://cdn/2.jpg"],
    ext: "jpg",
    pageUrl: "https://tiktok.com/@u/video/p1",
    musicUrl: "https://cdn/track.mp3",
    ...over,
  });

const files = (d: string) => readdir(join(d, "posts"));
const defaultOpts = { concurrency: 3, delay: 0, retries: 0, overwrite: false, music: true };

test("video: downloads mp4 with correct bytes (via fetch fallback)", async () => {
  dir = await tmpDir();
  fm = mockFetch(() => bytesResp("VIDEO"));
  const r = await downloadAll(noContextRequest, [vid()], dir, "posts", defaultOpts);
  assert.deepEqual({ ok: r.ok, skip: r.skip, fail: r.fail }, { ok: 1, skip: 0, fail: 0 });
  assert.equal(r.results["v1"], "ok");
  assert.equal(await readFile(join(dir, "posts", "v1.mp4"), "utf8"), "VIDEO");
});

test("video: context.request success path is used directly (no fetch fallback needed)", async () => {
  dir = await tmpDir();
  fm = mockFetch(() => {
    throw new Error("should not fall back to fetch");
  });
  const ctx = fakeContext(() => apiOk("FROM-CONTEXT"));
  const r = await downloadAll(ctx, [vid()], dir, "posts", defaultOpts);
  assert.equal(r.ok, 1);
  assert.equal(await readFile(join(dir, "posts", "v1.mp4"), "utf8"), "FROM-CONTEXT");
});

test("video: falls back to second candidate when first fails", async () => {
  dir = await tmpDir();
  fm = mockFetch((url) => (url.includes("bad") ? bytesResp("", 403) : bytesResp("GOOD")));
  const r = await downloadAll(
    noContextRequest,
    [vid({ urls: ["https://cdn/bad.mp4", "https://cdn/good.mp4"] })],
    dir,
    "posts",
    defaultOpts,
  );
  assert.equal(r.ok, 1);
  assert.equal(await readFile(join(dir, "posts", "v1.mp4"), "utf8"), "GOOD");
});

test("video: all candidates fail -> fail, no .part leftover", async () => {
  dir = await tmpDir();
  fm = mockFetch(() => bytesResp("", 500));
  const r = await downloadAll(noContextRequest, [vid()], dir, "posts", defaultOpts);
  assert.equal(r.fail, 1);
  assert.deepEqual(await files(dir), []); // no v1.mp4 and no v1.mp4.part
});

test("photo carousel: images + soundtrack mp3", async () => {
  dir = await tmpDir();
  fm = mockFetch((url) => bytesResp(url.includes("track") ? "MUS" : "IMG"));
  const r = await downloadAll(noContextRequest, [pic()], dir, "posts", defaultOpts);
  assert.equal(r.ok, 1);
  const names = (await files(dir)).sort();
  assert.deepEqual(names, ["p1_01.jpg", "p1_02.jpg", "p1_music.mp3"]);
  assert.equal(await readFile(join(dir, "posts", "p1_music.mp3"), "utf8"), "MUS");
});

test("photo: music:false skips the mp3", async () => {
  dir = await tmpDir();
  fm = mockFetch(() => bytesResp("IMG"));
  await downloadAll(noContextRequest, [pic()], dir, "posts", { ...defaultOpts, music: false });
  const names = (await files(dir)).sort();
  assert.deepEqual(names, ["p1_01.jpg", "p1_02.jpg"]);
});

test("skip existing; overwrite re-downloads", async () => {
  dir = await tmpDir();
  await mkdir(join(dir, "posts"), { recursive: true });
  await writeFile(join(dir, "posts", "v1.mp4"), "OLD");

  fm = mockFetch(() => bytesResp("NEW"));
  const skip = await downloadAll(noContextRequest, [vid()], dir, "posts", defaultOpts);
  assert.equal(skip.skip, 1);
  assert.equal(await readFile(join(dir, "posts", "v1.mp4"), "utf8"), "OLD");

  const over = await downloadAll(noContextRequest, [vid()], dir, "posts", { ...defaultOpts, overwrite: true });
  assert.equal(over.ok, 1);
  assert.equal(await readFile(join(dir, "posts", "v1.mp4"), "utf8"), "NEW");
});

test("photo already fully present -> skip (not ok)", async () => {
  dir = await tmpDir();
  await mkdir(join(dir, "posts"), { recursive: true });
  await writeFile(join(dir, "posts", "p1_01.jpg"), "IMG");
  await writeFile(join(dir, "posts", "p1_02.jpg"), "IMG");
  await writeFile(join(dir, "posts", "p1_music.mp3"), "MUS");

  fm = mockFetch(() => bytesResp("SHOULD-NOT-FETCH"));
  const r = await downloadAll(noContextRequest, [pic()], dir, "posts", defaultOpts);
  assert.equal(r.skip, 1);
  assert.equal(r.ok, 0);
  assert.equal(fm.calls.length, 0); // nothing re-fetched
});

test("retry: transient 500 then 200 -> ok", async () => {
  dir = await tmpDir();
  let n = 0;
  fm = mockFetch(() => {
    n++;
    return n === 1 ? bytesResp("", 500) : bytesResp("OK");
  });
  const r = await downloadAll(noContextRequest, [vid()], dir, "posts", { ...defaultOpts, retries: 2 });
  assert.equal(r.ok, 1);
  assert.equal(n, 2);
});

test("downloadAll: summary totals + results map complete", async () => {
  dir = await tmpDir();
  fm = mockFetch((url) => (url.includes("bad") ? bytesResp("", 500) : bytesResp("D")));
  const items = [
    vid({ id: "ok1", urls: ["https://cdn/ok1.mp4"] }),
    vid({ id: "ok2", urls: ["https://cdn/ok2.mp4"] }),
    vid({ id: "bad", urls: ["https://cdn/bad.mp4"] }),
  ];
  const r = await downloadAll(noContextRequest, items, dir, "posts", { ...defaultOpts, concurrency: 2 });
  assert.deepEqual({ ok: r.ok, fail: r.fail }, { ok: 2, fail: 1 });
  assert.deepEqual(Object.keys(r.results).sort(), ["bad", "ok1", "ok2"]);
  assert.equal(r.results["bad"], "fail");
});

test("onProgress: emits download-start and one download-item per item", async () => {
  dir = await tmpDir();
  fm = mockFetch(() => bytesResp("D"));
  const events: any[] = [];
  await downloadAll(noContextRequest, [vid({ id: "a" }), vid({ id: "b" })], dir, "posts", {
    ...defaultOpts,
    onProgress: (e) => events.push(e),
  });
  assert.equal(events.filter((e) => e.type === "download-start").length, 1);
  const items = events.filter((e) => e.type === "download-item");
  assert.deepEqual(
    items.map((e) => e.id).sort(),
    ["a", "b"],
  );
});
