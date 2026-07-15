# tiktok-scrapper

CLI to fetch a public TikTok user's posts as JSON, without logging in.

## How it works

TikTok's web `item_list` API requires a per-request signature (`X-Bogus`/`X-Gnarly`)
computed by TikTok's own client JS. Rather than reverse-engineer that signature,
this drives a real (patched, undetectable) Chromium via [patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright),
navigates to the profile page, and intercepts the signed `item_list` responses
the page's own JS produces. Pagination is done by scrolling and collecting
each new page of results until enough posts are collected or TikTok reports
no more (`hasMore: false`).

Plain Playwright gets silently blocked here (TikTok's JS detects the CDP
`Runtime.enable` leak and returns a fake signature, so the API responds
`200` with an empty body). patchright patches that leak away.

## Usage

```
npm install
npx patchright install chromium
npx tsx src/cli.ts <username> [options]
```

Options:
- `-c, --count <n>` — number of posts to fetch (default 20)
- `--cookies <path>` — Netscape cookies.txt to warm the session (optional; not required to run)
- `--headful` — run the browser headed instead of headless (debugging)
- `--profile-dir <path>` — persistent browser profile dir (default `.tt-profile/<username>`)
- `-o, --out <path>` — write JSON to a file instead of stdout

## Exploration tool

`src/capture.ts` dumps every TikTok `/api/*` response and the SSR data blob
for a profile to `capture/` — useful when TikTok changes its API shape.

```
npx tsx src/capture.ts <username>
```
