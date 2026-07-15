import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { MediaItem, PostMeta } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadFixture(name: string): Promise<any> {
  const raw = await readFile(join(__dirname, "fixtures", name), "utf8");
  return JSON.parse(raw);
}

/** Swap globalThis.fetch with a handler; records requested URLs; restore() reverts. */
export interface FetchMock {
  calls: string[];
  restore(): void;
}
export function mockFetch(handler: (url: string) => Response | Promise<Response>): FetchMock {
  const orig = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = orig) };
}

export const jsonResp = (obj: unknown): Response => Response.json(obj as any);

/** 2xx body from bytes, or an error status with no body (mimics a failed fetch). */
export const bytesResp = (body: Buffer | string, status = 200): Response =>
  status >= 200 && status < 300 ? new Response(Buffer.from(body as any)) : new Response(null, { status });

export async function tmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "tiktok-scrapper-test-"));
}
export async function rmDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** Minimal MediaItem; override any field. */
export function makeMediaItem(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "v1",
    source: "posts",
    kind: "video",
    urls: ["https://cdn/v1.mp4"],
    ext: "mp4",
    desc: "",
    createTime: 0,
    authorUsername: "u",
    pageUrl: "https://tiktok.com/@u/video/v1",
    ...over,
  };
}

/** Minimal PostMeta; override any field. */
export function makeMeta(id: string, createTime: number, over: Partial<PostMeta> = {}): PostMeta {
  return {
    id,
    source: "posts",
    kind: "video",
    desc: "",
    createTime,
    createTimeISO: new Date(createTime * 1000).toISOString(),
    stats: {},
    author: {},
    ...over,
  };
}

export interface FakeApiResponse {
  ok(): boolean;
  status(): number;
  body(): Promise<Buffer>;
}

/** Fake `BrowserContext.request` handler: `context.request.get(url) -> handler(url)`. */
export function fakeContext(handler: (url: string) => FakeApiResponse | Promise<FakeApiResponse>): any {
  return {
    request: {
      get: async (url: string, _opts?: unknown) => handler(url),
    },
  };
}

export function apiOk(body: Buffer | string): FakeApiResponse {
  const buf = Buffer.from(body as any);
  return { ok: () => true, status: () => 200, body: async () => buf };
}
export function apiFail(status: number): FakeApiResponse {
  return {
    ok: () => false,
    status: () => status,
    body: async () => {
      throw new Error("no body on failed response");
    },
  };
}
