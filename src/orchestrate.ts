import { readdir } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page, BrowserContext } from "patchright";
import { collectSource, fetchSourcePages, validateUser as validateUserOnPage } from "./fetch.js";
import { downloadAll } from "./download.js";
import { writeMetadata } from "./metadata.js";
import { primaryFilename } from "./normalize.js";
import type { DownloadOptions, DownloadSummary, FetchOptions, MediaItem, MediaSource, PostMeta, UserInfo } from "./types.js";

export interface FetchProfileResult {
  user?: UserInfo;
  items: MediaItem[];
  meta: PostMeta[];
}

async function readDirNames(dir: string): Promise<Set<string>> {
  try {
    return new Set(await readdir(dir));
  } catch {
    return new Set();
  }
}

/** Session-agnostic core of `fetchProfile` - takes an already-open page. */
export async function runFetchProfile(page: Page, username: string, opts: FetchOptions): Promise<FetchProfileResult> {
  const types: MediaSource[] = opts.types ?? ["posts"];
  const limit = opts.limit ?? 1000;

  const user = await validateUserOnPage(page, username);
  const items: MediaItem[] = [];
  const meta: PostMeta[] = [];
  for (const source of types) {
    const isKnown = opts.isKnown ? (item: MediaItem) => opts.isKnown!(source, item) : undefined;
    const pages = await fetchSourcePages(page, username, source, { limit, isKnown, onProgress: opts.onProgress });
    const collected = collectSource(pages, source, limit);
    items.push(...collected.items);
    meta.push(...collected.meta);
  }
  return { user, items, meta };
}

/** Session-agnostic core of `downloadProfile` - takes an already-open page + its context. */
export async function runDownloadProfile(
  page: Page,
  context: BrowserContext,
  username: string,
  opts: DownloadOptions,
): Promise<DownloadSummary> {
  const types: MediaSource[] = opts.types ?? ["posts"];
  const limit = opts.limit ?? 1000;
  const images = opts.images ?? true;
  const music = opts.music ?? true;
  const overwrite = opts.overwrite ?? false;
  const concurrency = opts.concurrency ?? 3;
  const delay = opts.delay ?? 600;
  const retries = opts.retries ?? 3;
  const update = opts.update ?? false;

  const userDir = join(opts.output, username);
  await mkdir(userDir, { recursive: true });

  const totals = { ok: 0, skip: 0, fail: 0 };
  const metaAll: PostMeta[] = [];

  const user = await validateUserOnPage(page, username);
  if (user?.private) {
    return { ok: 0, skip: 0, fail: 0, userDir, user };
  }

  for (const source of types) {
    let isKnown: ((item: MediaItem) => boolean) | undefined;
    if (update) {
      const have = await readDirNames(join(userDir, source));
      isKnown = (item) => have.has(primaryFilename(item));
    }
    const pages = await fetchSourcePages(page, username, source, { limit, isKnown, onProgress: opts.onProgress });
    const { items, meta } = collectSource(pages, source, limit);
    const downloadable = items.filter((m) => images || m.kind !== "image");

    if (downloadable.length > 0) {
      const r = await downloadAll(context, downloadable, userDir, source, {
        concurrency,
        delay,
        retries,
        overwrite,
        music,
        onProgress: opts.onProgress,
      });
      totals.ok += r.ok;
      totals.skip += r.skip;
      totals.fail += r.fail;
      for (const m of meta) m.downloaded = r.results[m.id];
    }
    metaAll.push(...meta);
  }

  let metadataPath: string | undefined;
  if (metaAll.length > 0) {
    metadataPath = await writeMetadata(userDir, username, metaAll);
  }

  return { ok: totals.ok, skip: totals.skip, fail: totals.fail, userDir, metadataPath, user };
}
