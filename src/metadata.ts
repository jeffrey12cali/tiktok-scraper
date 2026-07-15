import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PostMeta } from "./types.js";

/**
 * Merge new entries into the per-user metadata JSON, keyed by id, and write it.
 *
 * Reading + merging keeps history intact across partial fetches (small `limit`
 * or `update` runs only return recent items). New entries overwrite old ones
 * with the same id (fresh stats/download status); the union is sorted newest-first.
 */
export async function writeMetadata(userDir: string, username: string, entries: PostMeta[]): Promise<string> {
  const dest = join(userDir, `${username}.metadata.json`);

  const byId = new Map<string, PostMeta>();
  try {
    const prev = JSON.parse(await readFile(dest, "utf8")) as { posts?: PostMeta[] };
    for (const p of prev.posts ?? []) byId.set(p.id, p);
  } catch {
    /* no existing file - start fresh */
  }
  for (const e of entries) byId.set(e.id, e);

  const posts = [...byId.values()].sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0));
  const doc = {
    username,
    generatedAt: new Date().toISOString(),
    count: posts.length,
    posts,
  };
  await writeFile(dest, JSON.stringify(doc, null, 2), "utf8");
  return dest;
}
