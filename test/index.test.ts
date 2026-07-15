import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runDownloadProfile } from "../src/orchestrate.js";
import type { RawPage } from "../src/fetch.js";
import { mockFetch, bytesResp, tmpDir, rmDir, fakeContext, apiFail, type FetchMock } from "./helpers.js";
import { FakePage } from "./fixtures/fake-page.js";

let fm: FetchMock | undefined;
let dir: string;
afterEach(async () => {
  fm?.restore();
  if (dir) await rmDir(dir);
});

const noContextRequest = fakeContext(() => apiFail(403));

function page(itemList: any[], hasMore: boolean): RawPage {
  return { itemList, cursor: "0", hasMore, statusCode: 0 };
}
const rawItem = (id: string) => ({
  id,
  createTime: Number(id),
  author: { uniqueId: "u", id: "au1", nickname: "U" },
  stats: {},
  video: { playAddr: `https://cdn/${id}.mp4`, duration: 1, width: 1, height: 1 },
});

function ssrFor(videoCount: number, priv = false) {
  return JSON.stringify({
    __DEFAULT_SCOPE__: {
      "webapp.user-detail": {
        userInfo: {
          user: { id: "au1", uniqueId: "u", nickname: "U", privateAccount: priv },
          stats: { videoCount },
        },
      },
    },
  });
}

test("runDownloadProfile: end-to-end - fetches, downloads, writes metadata", async () => {
  dir = await tmpDir();
  fm = mockFetch(() => bytesResp("D"));
  const fp = new FakePage([page([rawItem("100"), rawItem("200")], false)], "/api/post/item_list/");
  fp.ssrText = ssrFor(2);

  const summary = await runDownloadProfile(fp as any, noContextRequest, "u", {
    user: "u",
    output: dir,
    types: ["posts"],
    limit: 10,
    delay: 0,
  });

  assert.deepEqual({ ok: summary.ok, skip: summary.skip, fail: summary.fail }, { ok: 2, skip: 0, fail: 0 });
  assert.ok(summary.metadataPath);
  const files = await readdir(join(dir, "u", "posts"));
  assert.deepEqual(files.sort(), ["100.mp4", "200.mp4"]);
  const meta = JSON.parse(await readFile(summary.metadataPath!, "utf8"));
  assert.equal(meta.count, 2);
  assert.equal(meta.posts[0].downloaded, "ok");
});

test("runDownloadProfile: private account - returns immediately, downloads nothing", async () => {
  dir = await tmpDir();
  fm = mockFetch(() => {
    throw new Error("should not fetch media for a private account");
  });
  const fp = new FakePage([page([rawItem("100")], false)], "/api/post/item_list/");
  fp.ssrText = ssrFor(1, true);

  const summary = await runDownloadProfile(fp as any, noContextRequest, "u", { user: "u", output: dir, types: ["posts"] });
  assert.deepEqual({ ok: summary.ok, skip: summary.skip, fail: summary.fail }, { ok: 0, skip: 0, fail: 0 });
  assert.equal(summary.user?.private, true);
  assert.equal(summary.metadataPath, undefined);
});

test("runDownloadProfile: update mode - already-downloaded page stops pagination, downloads 0 new", async () => {
  dir = await tmpDir();
  const userDir = join(dir, "u", "posts");
  await mkdir(userDir, { recursive: true });
  await writeFile(join(userDir, "100.mp4"), "OLD");

  fm = mockFetch(() => {
    throw new Error("should not re-download an already-known item");
  });
  const p1 = page([rawItem("100")], true);
  const p2 = page([rawItem("999-should-not-be-fetched")], false);
  const fp = new FakePage([p1, p2], "/api/post/item_list/");
  fp.ssrText = ssrFor(1);

  const summary = await runDownloadProfile(fp as any, noContextRequest, "u", {
    user: "u",
    output: dir,
    types: ["posts"],
    update: true,
  });

  assert.equal(summary.ok, 0);
  assert.equal(summary.skip, 1, "the known item is a filesystem skip, not a re-download");
  const files = await readdir(userDir);
  assert.deepEqual(files, ["100.mp4"]);
});

test("runDownloadProfile: images:false filters out photo posts before download", async () => {
  dir = await tmpDir();
  fm = mockFetch(() => bytesResp("D"));
  const imagePost = {
    id: "300",
    createTime: 300,
    author: { uniqueId: "u", id: "au1", nickname: "U" },
    stats: {},
    imagePost: { images: [{ imageWidth: 1, imageHeight: 1, imageURL: { urlList: ["https://cdn/img.jpg"] } }] },
  };
  const fp = new FakePage([page([rawItem("100"), imagePost], false)], "/api/post/item_list/");
  fp.ssrText = ssrFor(2);

  const summary = await runDownloadProfile(fp as any, noContextRequest, "u", {
    user: "u",
    output: dir,
    types: ["posts"],
    images: false,
  });

  assert.equal(summary.ok, 1);
  const files = await readdir(join(dir, "u", "posts"));
  assert.deepEqual(files, ["100.mp4"]);
});
