import { join } from "node:path";
import { openSession } from "./browser.js";
import { normalizeUsername, validateUser as validateUserOnPage } from "./fetch.js";
import { runDownloadProfile, runFetchProfile, type FetchProfileResult } from "./orchestrate.js";
import type { DownloadOptions, DownloadSummary, FetchOptions, UserInfo } from "./types.js";

export * from "./types.js";
export { normalizeUsername } from "./fetch.js";
export type { FetchProfileResult } from "./orchestrate.js";

function defaultProfileDir(username: string): string {
  return join(process.cwd(), ".tt-profile", username);
}

/** Look up a public profile (private flag, nickname, video count) without fetching any posts. */
export async function validateUser(
  user: string,
  opts: { cookies?: string; headless?: boolean; profileDir?: string } = {},
): Promise<UserInfo | undefined> {
  const username = normalizeUsername(user);
  const profileDir = opts.profileDir ?? defaultProfileDir(username);
  const session = await openSession({ headless: opts.headless ?? true, cookiesPath: opts.cookies, profileDir });
  try {
    return await validateUserOnPage(session.page, username);
  } finally {
    await session.close();
  }
}

/** Mid-level: fetch (but don't download) a profile's posts/likes/stories. */
export async function fetchProfile(opts: FetchOptions): Promise<FetchProfileResult> {
  const username = normalizeUsername(opts.user);
  const profileDir = opts.profileDir ?? defaultProfileDir(username);
  const session = await openSession({ headless: opts.headless ?? true, cookiesPath: opts.cookies, profileDir });
  try {
    return await runFetchProfile(session.page, username, opts);
  } finally {
    await session.close();
  }
}

/**
 * High-level: fetch AND download a profile's media, writing a cumulative
 * `<user>.metadata.json` alongside it. One browser session is reused for
 * both fetching (signed item_list interception) and downloading (session
 * cookies carried by `context.request`).
 */
export async function downloadProfile(opts: DownloadOptions): Promise<DownloadSummary> {
  const username = normalizeUsername(opts.user);
  const profileDir = opts.profileDir ?? defaultProfileDir(username);
  const session = await openSession({ headless: opts.headless ?? true, cookiesPath: opts.cookies, profileDir });
  try {
    return await runDownloadProfile(session.page, session.context, username, opts);
  } finally {
    await session.close();
  }
}
