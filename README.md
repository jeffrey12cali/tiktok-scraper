# tiktok-scrapper

A library that fetches and downloads public TikTok profile media — posts, likes, stories —
**without logging in** and without reimplementing TikTok's request signing.

## Why this exists

Third-party aggregators like tikwm.com used to make this easy: they did the signing
server-side and exposed a clean JSON API. As of this project's writing, tikwm sits behind
a Cloudflare challenge and is no longer usable as a data source. TikTok's own web API
(`/api/post/item_list/`) requires per-request signed parameters (`msToken`, `X-Bogus`,
`X-Gnarly`, `ttwid`, `device_id`) computed by TikTok's client JS (`webmssdk.js`), and that
signing logic changes with every TikTok release — hand-rolling it is a losing game.

So this library doesn't sign requests at all. It drives a real (patched, undetectable)
Chromium browser to the profile page and lets **TikTok's own JS** compute the signature,
then intercepts the response. See [How it works](#how-it-works) for the two blockers this
had to clear.

## Install

```bash
npm install tiktok-scrapper
npx patchright install chromium   # one-time: downloads the patched Chromium build
```

## Quickstart

```ts
import { downloadProfile } from "tiktok-scrapper";

const summary = await downloadProfile({
  user: "someusername",       // handle, "@handle", or a full profile URL
  output: "./downloads",
  types: ["posts"],           // "posts" | "likes" | "stories"
  limit: 50,
});

console.log(summary);
// { ok: 48, skip: 0, fail: 2, userDir: "./downloads/someusername",
//   metadataPath: "./downloads/someusername/someusername.metadata.json",
//   user: { username: "someusername", private: false, videoCount: 214, nickname: "..." } }
```

Fetch metadata without downloading anything:

```ts
import { fetchProfile } from "tiktok-scrapper";

const { user, items, meta } = await fetchProfile({ user: "someusername", limit: 20 });
```

Full API reference (every exported function and type, with examples): **[docs/](./docs/README.md)**.

## How it works

Two problems had to be solved, in order, before any real data came back:

1. **Signing.** Rather than reimplement `webmssdk.js`, a real Chromium browser navigates to
   the profile page. TikTok's own client JS computes the signature and fires the
   `item_list` XHR; we intercept that response via the browser's network events. We never
   construct a signed URL ourselves.
2. **Automation detection.** Plain Playwright gets silently blocked: TikTok's JS detects
   the CDP `Runtime.enable` leak that Playwright's protocol exposes, and responds by
   emitting a fake signature (`X-Bogus=1`) — the server then returns `200` with an empty
   body. No error, just nothing. Switching the browser driver to
   [`patchright`](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright) (a source-patched
   Playwright fork that removes this leak) fixed it: real signatures, real data, headless,
   with or without cookies.

Pagination works by scrolling: TikTok's profile grid lazy-loads via a real wheel-scroll
listener (programmatic `scrollTo` alone does *not* trigger it reliably — this library uses
small incremental `mouse.wheel` steps plus a keyboard `End` press, mirroring how a human
scrolls). Each new page's response is intercepted the same way as the first, and we follow
the `cursor`/`hasMore` fields TikTok returns until the requested `limit` is hit.

Downloading is a second signing problem: TikTok's CDN URLs are time-boxed but are **not**
session-gated the way the API is — a plain HTTPS `fetch` with a `Referer` header works
just as well as an authenticated request. `download.ts` still tries the browser context's
own `request` API first (in case that ever changes) and falls back to plain `fetch`.

## Project structure

```
src/
  browser.ts       patchright session factory: persistent profile dir, optional cookie load
  fetch.ts          low-level: navigate + scroll + intercept item_list, per source (posts/likes/stories)
  normalize.ts      raw TikTok item -> MediaItem (downloadable) + PostMeta (curated metadata)
  download.ts       concurrent downloader: retry/backoff, image carousels + soundtrack, onProgress
  metadata.ts       merges results into a cumulative <user>.metadata.json, keyed by id
  orchestrate.ts     session-agnostic core of fetchProfile/downloadProfile (this is what's unit-tested)
  index.ts          public API: opens/closes the browser session, delegates to orchestrate.ts
  types.ts          all exported types
```

`index.ts` is intentionally thin — it just owns the browser session's lifecycle. All the
actual logic lives in `orchestrate.ts` and is tested against a fake page/session, with no
browser or network involved (see `test/`).

## Sources and incremental mode

- **posts** — the profile's own videos/photos. The default, and the reliable one.
- **likes** — TikTok removed default public likes some time ago; most accounts don't expose
  this, so it commonly returns zero items. Not a bug — check `user.private` and treat an
  empty likes list as expected.
- **stories** — ephemeral (~24h) and only available as a small preview widget on the
  profile page (no dedicated feed to paginate), so this source is inherently limited.

Pass `update: true` (`isKnown` at the `fetchProfile` level) to stop paginating once an
entire page is already-downloaded — see [docs/downloadProfile.md](./docs/downloadProfile.md#incremental-update).

## Cookies (optional)

`cookies` accepts a Netscape-format `cookies.txt`. Not required — this library works
headless with **no** cookies and **no** login. Passing cookies from a real browsing session
can make the fetch more reliable (see Limitations), but is a reliability knob, not a
requirement.

## Limitations

- **TikTok rate-limits by request velocity**, independent of the automation-detection fix
  above. Hammering the same (or even different) profiles from one IP in a short window will
  get you empty `item_list` responses for a while — this was observed directly during this
  project's own testing. Space out requests; there's no fixed cooldown window to document.
- CDN URLs are time-boxed — download in the same run as the fetch (which `downloadProfile`
  always does).
- Headless Chromium is a heavier runtime dependency than a plain HTTP client. If you hit
  more blocks than expected, try `headless: false`.
- `likes` and `stories` are inherently limited by what TikTok exposes publicly (see above) —
  design around `posts` being the primary, reliable source.
