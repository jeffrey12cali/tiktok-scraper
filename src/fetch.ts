import type { Page } from "patchright";
import type { FetchOptions, MediaItem, MediaSource, PostMeta, ProgressEvent, UserInfo } from "./types.js";
import { toMedia, toMeta } from "./normalize.js";

export interface RawPage {
  itemList: any[];
  cursor: string;
  hasMore: boolean;
  statusCode: number;
}

const ENDPOINT_MATCH: Record<MediaSource, string> = {
  posts: "/api/post/item_list/",
  likes: "/api/favorite/item_list/",
  stories: "/api/story/item_list/",
};

const PROFILE_URL: Record<MediaSource, (user: string) => string> = {
  posts: (u) => `https://www.tiktok.com/@${u}`,
  // Public likes live on a dedicated tab; most accounts hide this (TikTok removed
  // default public likes) so this source frequently yields zero items - by design.
  likes: (u) => `https://www.tiktok.com/@${u}/liked`,
  // Stories have no dedicated web tab; the profile page itself fires a small
  // (usually ~4 item) stories preview request that we intercept here.
  stories: (u) => `https://www.tiktok.com/@${u}`,
};

/** Accepts a raw handle, "@handle", or a profile URL; returns the bare username. */
export function normalizeUsername(input: string): string {
  let u = input.trim();
  const urlMatch = u.match(/tiktok\.com\/@([^/?#]+)/i);
  if (urlMatch) u = urlMatch[1];
  return u.replace(/^@/, "");
}

/** Best-effort profile lookup via the page's own embedded SSR data. Returns undefined on failure. */
export async function validateUser(page: Page, username: string): Promise<UserInfo | undefined> {
  try {
    await page.goto(PROFILE_URL.posts(username), { waitUntil: "domcontentloaded", timeout: 60000 });
    const raw = await page.locator("#__UNIVERSAL_DATA_FOR_REHYDRATION__").textContent({ timeout: 10000 });
    if (!raw) return undefined;
    const data = JSON.parse(raw);
    const detail = data?.__DEFAULT_SCOPE__?.["webapp.user-detail"];
    const user = detail?.userInfo?.user;
    if (!user) return undefined;
    return {
      username,
      private: Boolean(user.privateAccount),
      videoCount: detail?.userInfo?.stats?.videoCount,
      nickname: user.nickname,
    };
  } catch {
    return undefined;
  }
}

export interface FetchSourceOptions {
  limit: number;
  maxScrolls?: number;
  /** Incremental mode: if every item on a freshly-arrived page is already known, stop early. */
  isKnown?: (item: MediaItem) => boolean;
  onProgress?: (evt: ProgressEvent) => void;
}

/**
 * Fetch raw item_list pages for one source (posts/likes/stories).
 *
 * Sidesteps TikTok's request signing entirely: navigates a real (patchright)
 * browser to the profile, then intercepts the *signed* item_list responses
 * that the page's own JS produces while we scroll. Paginates by repeatedly
 * scrolling to the bottom until `limit` is reached, TikTok reports no more
 * (`hasMore: false`), incremental early-stop triggers, or scrolling stops
 * producing new pages.
 */
export async function fetchSourcePages(
  page: Page,
  username: string,
  source: MediaSource,
  opts: FetchSourceOptions,
): Promise<RawPage[]> {
  const pages: RawPage[] = [];
  const match = ENDPOINT_MATCH[source];
  let stoppedEarly = false;

  const onResponse = async (res: Awaited<ReturnType<Page["waitForResponse"]>>) => {
    const url = res.url();
    if (!url.includes(match)) return;
    try {
      const body = (await res.json()) as RawPage;
      if (!body || !Array.isArray(body.itemList)) return;
      pages.push(body);
      opts.onProgress?.({ type: "fetch-page", source, page: pages.length, itemCount: body.itemList.length });
      if (opts.isKnown && body.itemList.length > 0) {
        const allKnown = body.itemList.every((raw) => opts.isKnown!(toMedia(raw, source)));
        if (allKnown) stoppedEarly = true;
      }
    } catch {
      // empty/blocked body (e.g. no signature computed) - treat as no data, not an error
    }
  };
  page.on("response", onResponse);

  await page.goto(PROFILE_URL[source](username), { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  // wheel events scroll whatever's under the cursor - park it over the feed first
  const viewport = page.viewportSize();
  if (viewport) await page.mouse.move(viewport.width / 2, viewport.height / 2);

  const collected = () => pages.reduce((n, p) => n + p.itemList.length, 0);
  const hasMore = () => pages.length === 0 || pages[pages.length - 1].hasMore;
  const maxScrolls = opts.maxScrolls ?? 30;
  let stagnant = 0;

  for (let i = 0; i < maxScrolls && collected() < opts.limit && hasMore() && !stoppedEarly; i++) {
    const before = pages.length;
    // Real users scroll incrementally, not in one jump - and TikTok's lazy-load
    // listener seems to care. Small steps + a keyboard End as a second trigger.
    for (let s = 0; s < 3 && pages.length === before; s++) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(300);
    }
    await page.keyboard.press("End").catch(() => {});
    for (let t = 0; t < 16 && pages.length === before; t++) {
      await page.waitForTimeout(700);
    }
    if (pages.length === before) {
      stagnant++;
      if (stagnant >= 6) break;
    } else {
      stagnant = 0;
    }
  }

  page.off("response", onResponse);
  return pages;
}

/** Flatten pages into deduped, cap-limited MediaItem[] + PostMeta[] for one source. */
export function collectSource(
  pages: RawPage[],
  source: MediaSource,
  limit: number,
): { items: MediaItem[]; meta: PostMeta[] } {
  const seen = new Set<string>();
  const items: MediaItem[] = [];
  const meta: PostMeta[] = [];
  outer: for (const page of pages) {
    for (const raw of page.itemList) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      items.push(toMedia(raw, source));
      meta.push(toMeta(raw, source));
      if (items.length >= limit) break outer;
    }
  }
  return { items, meta };
}
