import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeMetadata } from "../src/metadata.js";
import { tmpDir, rmDir, makeMeta } from "./helpers.js";

let dir: string;
afterEach(async () => {
  if (dir) await rmDir(dir);
});

const read = async (d: string, user: string) => JSON.parse(await readFile(join(d, `${user}.metadata.json`), "utf8"));

test("fresh write: creates file, count, newest-first sort", async () => {
  dir = await tmpDir();
  await writeMetadata(dir, "u", [makeMeta("a", 100), makeMeta("b", 200)]);
  const doc = await read(dir, "u");
  assert.equal(doc.count, 2);
  assert.equal(doc.username, "u");
  assert.deepEqual(
    doc.posts.map((p: any) => p.id),
    ["b", "a"],
  ); // ct 200 before 100
});

test("merge across runs: upsert by id, preserve old, keep sorted", async () => {
  dir = await tmpDir();
  await writeMetadata(dir, "u", [makeMeta("id1", 100), makeMeta("id2", 200)]);
  // second run: updates id2, adds id3 - id1 not re-fetched but must survive
  await writeMetadata(dir, "u", [makeMeta("id2", 200, { stats: { likeCount: 999 } }), makeMeta("id3", 150)]);
  const doc = await read(dir, "u");
  assert.equal(doc.count, 3); // union, id1 preserved
  assert.deepEqual(
    doc.posts.map((p: any) => p.id),
    ["id2", "id3", "id1"],
  ); // 200,150,100
  const id2 = doc.posts.find((p: any) => p.id === "id2");
  assert.equal(id2.stats.likeCount, 999); // new entry won
});

test("corrupt existing file: starts fresh, no throw", async () => {
  dir = await tmpDir();
  await writeFile(join(dir, "u.metadata.json"), "{ not valid json");
  await writeMetadata(dir, "u", [makeMeta("a", 100)]);
  const doc = await read(dir, "u");
  assert.equal(doc.count, 1);
  assert.equal(doc.posts[0].id, "a");
});
