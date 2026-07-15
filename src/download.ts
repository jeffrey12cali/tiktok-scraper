import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext } from "patchright";
import type { DownloadOptions, MediaItem, MediaSource, ProgressEvent } from "./types.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * TikTok CDN URLs are session-signed (`signature`/`tt_chain_token`/`expire`),
 * unlike tikwm's clean unsigned URLs. Try the browser context's own request
 * first (shares the session's cookies for matching domains), then fall back
 * to plain fetch for URLs that don't need it.
 */
async function fetchBytes(context: BrowserContext, url: string, referer: string): Promise<Buffer> {
  try {
    const res = await context.request.get(url, { headers: { Referer: referer } });
    if (res.ok()) return await res.body();
    if (res.status() === 429 || res.status() >= 500) throw new Error(`HTTP ${res.status()}`);
    // non-retriable via context (e.g. 403) - try plain fetch as a fallback source
  } catch {
    // context.request failed outright - fall through to plain fetch
  }
  const res = await fetch(url, { headers: { "User-Agent": UA, Referer: referer } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function streamToFile(context: BrowserContext, url: string, dest: string, referer: string): Promise<void> {
  const bytes = await fetchBytes(context, url, referer);
  if (bytes.length === 0) throw new Error("empty response body");
  const tmp = `${dest}.part`;
  try {
    await writeFile(tmp, bytes);
    await rename(tmp, dest);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
}

/** Retry with exponential backoff. Retries network errors and 429/5xx. */
async function withRetry(fn: () => Promise<void>, retries: number, onRetry: (attempt: number, msg: string) => void): Promise<void> {
  let attempt = 0;
  for (;;) {
    try {
      await fn();
      return;
    } catch (e) {
      const msg = (e as Error).message;
      const retriable = /HTTP (429|5\d\d)|ECONN|ETIMEDOUT|EAI_AGAIN|fetch failed|socket|empty response body/i.test(msg);
      if (attempt >= retries || !retriable) throw e;
      attempt++;
      onRetry(attempt, msg);
      await sleep(Math.min(500 * 2 ** attempt, 8000) + Math.random() * 300);
    }
  }
}

type Result = "ok" | "skip" | "fail";

async function downloadItem(
  context: BrowserContext,
  item: MediaItem,
  dir: string,
  opts: Required<Pick<DownloadOptions, "overwrite" | "retries" | "music">>,
  onRetry: (attempt: number, msg: string) => void,
): Promise<Result> {
  if (item.kind === "image") {
    let got = 0;
    let had = 0;
    for (let i = 0; i < item.urls.length; i++) {
      const dest = join(dir, `${item.id}_${String(i + 1).padStart(2, "0")}.jpg`);
      if (!opts.overwrite && (await exists(dest))) {
        had++;
        continue;
      }
      try {
        await withRetry(() => streamToFile(context, item.urls[i], dest, item.pageUrl), opts.retries, onRetry);
        got++;
      } catch {
        // per-image failure doesn't fail the whole item; reflected via got/had below
      }
    }
    if (opts.music && item.musicUrl) {
      const mdest = join(dir, `${item.id}_music.mp3`);
      if (opts.overwrite || !(await exists(mdest))) {
        try {
          await withRetry(() => streamToFile(context, item.musicUrl!, mdest, item.pageUrl), opts.retries, onRetry);
          got++;
        } catch {
          // soundtrack is best-effort
        }
      } else {
        had++;
      }
    }
    if (got > 0) return "ok";
    return had > 0 ? "skip" : "fail";
  }

  const dest = join(dir, `${item.id}.mp4`);
  if (!opts.overwrite && (await exists(dest))) return "skip";

  for (const url of item.urls) {
    try {
      await withRetry(() => streamToFile(context, url, dest, item.pageUrl), opts.retries, onRetry);
      return "ok";
    } catch {
      /* try next candidate url */
    }
  }
  return "fail";
}

export interface DownloadPassResult {
  ok: number;
  skip: number;
  fail: number;
  /** Per-item outcome keyed by post id (for metadata). */
  results: Record<string, Result>;
}

/** Run downloads with a bounded concurrency pool + throttle between starts. */
export async function downloadAll(
  context: BrowserContext,
  items: MediaItem[],
  baseDir: string,
  source: MediaSource,
  opts: {
    concurrency: number;
    delay: number;
    retries: number;
    overwrite: boolean;
    music: boolean;
    onProgress?: (evt: ProgressEvent) => void;
  },
): Promise<DownloadPassResult> {
  const dir = join(baseDir, source);
  await mkdir(dir, { recursive: true });

  let ok = 0,
    skip = 0,
    fail = 0,
    done = 0;
  const results: Record<string, Result> = {};
  const total = items.length;
  let cursor = 0;

  opts.onProgress?.({ type: "download-start", source, total });

  const worker = async (): Promise<void> => {
    for (;;) {
      const idx = cursor++;
      if (idx >= total) return;
      await sleep(opts.delay * (idx === 0 ? 0 : 1) + Math.random() * 200);
      const item = items[idx];
      const r = await downloadItem(
        context,
        item,
        dir,
        { overwrite: opts.overwrite, retries: opts.retries, music: opts.music },
        (attempt, msg) => opts.onProgress?.({ type: "download-retry", source, id: item.id, attempt, message: msg }),
      ).catch(() => "fail" as Result);
      results[item.id] = r;
      if (r === "ok") ok++;
      else if (r === "skip") skip++;
      else fail++;
      done++;
      opts.onProgress?.({ type: "download-item", source, id: item.id, result: r, done, total });
    }
  };

  const pool = Array.from({ length: Math.min(opts.concurrency, total || 1) }, worker);
  await Promise.all(pool);
  return { ok, skip, fail, results };
}
