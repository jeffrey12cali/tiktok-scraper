import { chromium, type BrowserContext, type Cookie, type Page } from "patchright";
import { mkdirSync, readFileSync } from "node:fs";

export function parseNetscapeCookies(path: string): Cookie[] {
  const lines = readFileSync(path, "utf8").split("\n");
  const cookies: Cookie[] = [];
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts.length < 7) continue;
    const [domain, , path_, secure, expiry, name, value] = parts;
    cookies.push({
      domain,
      path: path_,
      secure: secure === "TRUE",
      expires: Number(expiry) || -1,
      name,
      value,
      httpOnly: false,
      sameSite: "Lax",
    });
  }
  return cookies;
}

export interface SessionOptions {
  headless?: boolean;
  cookiesPath?: string;
  profileDir: string;
}

export interface Session {
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

export async function openSession(opts: SessionOptions): Promise<Session> {
  mkdirSync(opts.profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(opts.profileDir, {
    headless: opts.headless ?? true,
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });
  if (opts.cookiesPath) {
    await context.addCookies(parseNetscapeCookies(opts.cookiesPath));
  }
  const page = context.pages()[0] ?? (await context.newPage());
  return {
    context,
    page,
    close: () => context.close(),
  };
}
