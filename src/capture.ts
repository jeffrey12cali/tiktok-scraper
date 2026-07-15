import { chromium, type Cookie } from "patchright";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";

function parseNetscapeCookies(path: string): Cookie[] {
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

const username = process.argv[2] ?? "applehunnibun";
const cookiesPath = process.env.COOKIES;
const outDir = new URL("../capture/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const jsonlPath = `${outDir}${username}.jsonl`;
const universalPath = `${outDir}${username}.universal.json`;
writeFileSync(jsonlPath, "");

const headless = process.env.HEADFUL !== "1";
const userDataDir = `${outDir}.profile-${username}`;
mkdirSync(userDataDir, { recursive: true });
const context = await chromium.launchPersistentContext(userDataDir, {
  headless,
  viewport: { width: 1280, height: 900 },
  locale: "en-US",
  timezoneId: "America/New_York",
});
if (cookiesPath) {
  const cookies = parseNetscapeCookies(cookiesPath);
  await context.addCookies(cookies);
  console.error(`loaded ${cookies.length} cookies from ${cookiesPath}`);
}
const page = await context.newPage();

page.on("response", async (res) => {
  const url = res.url();
  if (!url.includes("tiktok.com/api/")) return;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    try {
      body = await res.text();
    } catch {
      body = null;
    }
  }
  const entry = {
    url,
    status: res.status(),
    headers: res.headers(),
    body,
  };
  appendFileSync(jsonlPath, JSON.stringify(entry) + "\n");
  console.error(`captured: ${res.status()} ${url}`);
});

console.error(`navigating to profile @${username}`);
await page.goto(`https://www.tiktok.com/@${username}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(4000);

const universal = await page
  .locator("#__UNIVERSAL_DATA_FOR_REHYDRATION__")
  .textContent()
  .catch(() => null);
if (universal) {
  writeFileSync(universalPath, universal);
  console.error(`wrote universal data blob -> ${universalPath}`);
} else {
  console.error("no __UNIVERSAL_DATA_FOR_REHYDRATION__ script found");
}

for (let i = 0; i < 4; i++) {
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(2500);
}

await page.screenshot({ path: `${outDir}${username}.png`, fullPage: false }).catch(() => {});

console.error("done, closing browser");
await context.close();
