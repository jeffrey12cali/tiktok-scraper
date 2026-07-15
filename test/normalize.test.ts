import { test } from "node:test";
import assert from "node:assert/strict";
import { toMedia, toMeta, primaryFilename } from "../src/normalize.js";
import { loadFixture } from "./helpers.js";

// raw-video-item.json is a trimmed but real TikTok item_list response item
// (captured live against a public profile in this project's exploration phase).
test("toMedia: video - candidate url order playAddr -> aweme -> downloadAddr", async () => {
  const raw = await loadFixture("raw-video-item.json");
  const item = toMedia(raw, "posts");

  assert.equal(item.kind, "video");
  assert.equal(item.id, "7647741268608470285");
  assert.equal(item.ext, "mp4");
  assert.equal(item.source, "posts");
  assert.equal(item.authorUsername, "applehunnibun");
  assert.equal(item.pageUrl, "https://www.tiktok.com/@applehunnibun/video/7647741268608470285");
  assert.equal(item.images, undefined);

  // playAddr first, then the /aweme/v1/play/ candidate from PlayAddrStruct.UrlList, then downloadAddr
  assert.equal(item.urls[0], raw.video.playAddr);
  assert.ok(item.urls.some((u) => u.includes("/aweme/v1/play/")));
  assert.ok(item.urls.includes(raw.video.downloadAddr));
  assert.equal(new Set(item.urls).size, item.urls.length, "no duplicate candidate urls");
});

test("toMedia: video has no musicUrl (soundtrack is embedded, not a separate download)", async () => {
  const raw = await loadFixture("raw-video-item.json");
  const item = toMedia(raw, "posts");
  assert.equal(item.musicUrl, undefined);
});

// raw-image-item.json is a synthetic fixture (this profile had no carousel posts to
// capture live) built to match TikTok's documented imagePost.images[].imageURL shape.
test("toMedia: image - one url per carousel image + musicUrl for the soundtrack", async () => {
  const raw = await loadFixture("raw-image-item.json");
  const item = toMedia(raw, "posts");

  assert.equal(item.kind, "image");
  assert.equal(item.ext, "jpg");
  assert.deepEqual(item.urls, [
    "https://p16-sign.tiktokcdn-us.com/img/img1.jpeg",
    "https://p16-sign.tiktokcdn-us.com/img/img2.jpeg",
  ]);
  assert.equal(item.musicUrl, raw.music.playUrl);
});

test("toMeta: video - stats/author/music/kind mapped, ISO time derived", async () => {
  const raw = await loadFixture("raw-video-item.json");
  const meta = toMeta(raw, "posts");

  assert.equal(meta.kind, "video");
  assert.equal(meta.source, "posts");
  assert.equal(meta.createTime, raw.createTime);
  assert.equal(meta.createTimeISO, new Date(raw.createTime * 1000).toISOString());
  assert.deepEqual(meta.stats, {
    likeCount: raw.stats.diggCount,
    commentCount: raw.stats.commentCount,
    shareCount: raw.stats.shareCount,
    playCount: raw.stats.playCount,
    collectCount: raw.stats.collectCount,
  });
  assert.equal(meta.author.username, "applehunnibun");
  assert.equal(meta.music?.title, raw.music.title);
  assert.equal(meta.video?.duration, raw.video.duration);
  assert.equal(meta.imageCount, undefined);
});

test("toMeta: image - imageCount set, video undefined", async () => {
  const raw = await loadFixture("raw-image-item.json");
  const meta = toMeta(raw, "posts");
  assert.equal(meta.kind, "image");
  assert.equal(meta.imageCount, 2);
  assert.equal(meta.video, undefined);
});

test("primaryFilename: matches what download.ts writes", () => {
  assert.equal(primaryFilename({ id: "123", kind: "video" }), "123.mp4");
  assert.equal(primaryFilename({ id: "123", kind: "image" }), "123_01.jpg");
});
