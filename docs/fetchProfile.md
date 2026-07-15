# `fetchProfile(opts): Promise<FetchProfileResult>`

Mid-level entry point: fetches profile data (posts/likes/stories) and returns normalized
items + curated metadata, **without downloading any files**. Use this if you want the URLs
and metadata to feed your own download/storage logic.

## Signature

```ts
function fetchProfile(opts: FetchOptions): Promise<FetchProfileResult>;
```

## Params — `FetchOptions`

| Field | Type | Default | Notes |
|---|---|---|---|
| `user` | `string` | required | Handle, `@handle`, or a full profile URL |
| `types` | `MediaSource[]` | `["posts"]` | Any of `"posts" \| "likes" \| "stories"` |
| `limit` | `number` | `1000` | Max items fetched **per source** |
| `cookies` | `string` | — | Path to a Netscape `cookies.txt`. Optional |
| `headless` | `boolean` | `true` | Set `false` if you're hitting more blocks than expected |
| `profileDir` | `string` | `.tt-profile/<username>` | Persistent browser profile dir |
| `isKnown` | `(source: MediaSource, item: MediaItem) => boolean` | — | Incremental early-stop: if every item on a freshly-arrived page returns `true`, that source stops paginating |
| `onProgress` | `(evt: ProgressEvent) => void` | — | Called once per fetched page (`type: "fetch-page"`) |

## Returns — `FetchProfileResult`

| Field | Type | Notes |
|---|---|---|
| `user` | `UserInfo \| undefined` | Best-effort profile lookup |
| `items` | `MediaItem[]` | Deduped by id, capped at `limit` per source, in arrival order |
| `meta` | `PostMeta[]` | Same items, curated metadata shape (no `downloaded` field — nothing was downloaded) |

`items` and `meta` are parallel arrays across **all** requested `types`, concatenated in
the order `types` was given — not merged or re-sorted.

## Behavior notes

- Does not check `user.private` for you — unlike `downloadProfile`, it will still attempt
  to fetch (and typically get nothing back) for a private profile. Check `result.user?.private`
  yourself if you need to short-circuit.
- `isKnown` is your own logic — `fetchProfile` doesn't touch the filesystem. (`downloadProfile`'s
  `update` option builds this automatically from what's on disk; roll your own here if you're
  not using `downloadProfile`'s download step.)

## Example

```ts
import { fetchProfile } from "tiktok-scrapper";

const { user, items, meta } = await fetchProfile({
  user: "someusername",
  types: ["posts", "likes"],
  limit: 30,
});

console.log(`${user?.nickname}: ${items.length} items`);
for (const item of items) {
  console.log(item.kind, item.id, item.urls[0]);
}
```
