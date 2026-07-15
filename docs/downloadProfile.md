# `downloadProfile(opts): Promise<DownloadSummary>`

High-level entry point. Opens one browser session, fetches the requested source(s),
downloads every media file, and writes a cumulative `<user>.metadata.json`. Closes the
session before returning (or throwing).

## Signature

```ts
function downloadProfile(opts: DownloadOptions): Promise<DownloadSummary>;
```

## Params — `DownloadOptions`

| Field | Type | Default | Notes |
|---|---|---|---|
| `user` | `string` | required | Handle, `@handle`, or a full profile URL |
| `output` | `string` | required | Base output directory; files land in `<output>/<username>/<source>/` |
| `types` | `MediaSource[]` | `["posts"]` | Any of `"posts" \| "likes" \| "stories"` |
| `limit` | `number` | `1000` | Max items fetched **per source** |
| `concurrency` | `number` | `3` | Parallel downloads |
| `delay` | `number` (ms) | `600` | Throttle between download starts (stagger, not a hard queue) |
| `retries` | `number` | `3` | Retry attempts per file, on `429`/`5xx`/network errors |
| `overwrite` | `boolean` | `false` | Re-download files that already exist |
| `images` | `boolean` | `true` | Set `false` to skip photo-carousel posts entirely |
| `music` | `boolean` | `true` | Set `false` to skip the soundtrack mp3 for photo posts |
| `update` | `boolean` | `false` | Incremental mode — see below |
| `cookies` | `string` | — | Path to a Netscape `cookies.txt`. Optional; not required to run |
| `headless` | `boolean` | `true` | Set `false` if you're hitting more blocks than expected |
| `profileDir` | `string` | `.tt-profile/<username>` | Persistent browser profile dir (reused across runs for a warmer session) |
| `onProgress` | `(evt: ProgressEvent) => void` | — | Called for fetch pages and each download outcome — see [types.md](./types.md#progressevent) |

## Returns — `DownloadSummary`

| Field | Type | Notes |
|---|---|---|
| `ok` | `number` | Files successfully downloaded |
| `skip` | `number` | Already present on disk (not re-downloaded) |
| `fail` | `number` | Every candidate URL failed for that item |
| `userDir` | `string` | `<output>/<username>` |
| `metadataPath` | `string \| undefined` | Set iff at least one item was fetched |
| `user` | `UserInfo \| undefined` | Best-effort profile lookup; `undefined` if it couldn't be determined |

## Behavior notes

- **Private accounts**: if `user.private` is `true`, the function returns immediately with
  `{ ok: 0, skip: 0, fail: 0 }` and no metadata file — it does not throw. Check
  `summary.user?.private` yourself if you need to distinguish "private" from "legitimately
  had nothing to download".
- **Video candidate URLs** are tried in priority order (first that downloads wins) — see
  [types.md#mediaitem](./types.md#mediaitem).
- **Photo posts** download every carousel image plus (if `music: true`) a `_music.mp3`
  soundtrack, since photo posts have no embedded audio.
- One browser session is reused across all sources and all downloads in a single call.

### Incremental update

```ts
await downloadProfile({ user: "someusername", output: "./downloads", update: true });
```

With `update: true`, before fetching each source the library reads what's already on disk
(`<output>/<username>/<source>/`) and stops paginating as soon as an entire freshly-arrived
page is already downloaded. TikTok returns newest-first, so a fully-known page means you've
reached previously-synced history — this is typically 1–2 requests, not a full re-fetch.
Deleted files are **not** backfilled by `update` mode; run without `update` to reconcile.

## Example

```ts
import { downloadProfile } from "tiktok-scrapper";

const summary = await downloadProfile({
  user: "@someusername",
  output: "./downloads",
  types: ["posts", "stories"],
  limit: 100,
  update: true,
  onProgress: (evt) => {
    if (evt.type === "download-item") console.log(evt.source, evt.id, evt.result);
  },
});

if (summary.user?.private) {
  console.error(`@${summary.user.username} is private`);
}
```
