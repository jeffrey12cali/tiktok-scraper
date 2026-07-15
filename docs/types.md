# Types

All types below are exported from the package root (`import type { ... } from "tiktok-scrapper"`).

## `MediaSource`

```ts
type MediaSource = "posts" | "likes" | "stories";
```

## `MediaKind`

```ts
type MediaKind = "video" | "image";
```

## `MediaItem`

A normalized, downloadable unit. Produced by `fetchProfile`/`downloadProfile`, one per post.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | TikTok's item id |
| `source` | `MediaSource` | Which source this came from |
| `kind` | `MediaKind` | `"video"` or `"image"` (photo carousel) |
| `urls` | `string[]` | **Video**: candidate URLs in priority order, first that downloads wins (all point to the same file). **Image**: one URL per carousel image (each downloaded separately) |
| `ext` | `"mp4" \| "jpg"` | |
| `desc` | `string` | Caption text |
| `createTime` | `number` | Unix seconds |
| `authorUsername` | `string` | |
| `pageUrl` | `string` | The post's `tiktok.com/@user/video/<id>` URL — used as the download `Referer` |
| `musicUrl` | `string \| undefined` | Set only for image posts (which have no embedded audio) |

## `PostMeta`

Curated, stable metadata — what gets written to `<user>.metadata.json`.

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `source` | `MediaSource` | |
| `kind` | `MediaKind` | |
| `desc` | `string` | |
| `createTime` | `number` | Unix seconds |
| `createTimeISO` | `string` | ISO 8601, derived from `createTime` |
| `stats.likeCount` | `number \| undefined` | |
| `stats.commentCount` | `number \| undefined` | |
| `stats.shareCount` | `number \| undefined` | |
| `stats.playCount` | `number \| undefined` | |
| `stats.collectCount` | `number \| undefined` | |
| `author.id` | `string \| undefined` | |
| `author.username` | `string \| undefined` | |
| `author.nickname` | `string \| undefined` | |
| `author.verified` | `boolean \| undefined` | |
| `music.id` / `.title` / `.authorName` | `string \| undefined` | Present only when the post has music metadata |
| `video.duration` / `.ratio` | `number \| string \| undefined` | Present only for `kind: "video"` |
| `imageCount` | `number \| undefined` | Present only for `kind: "image"` |
| `downloaded` | `"ok" \| "skip" \| "fail" \| undefined` | Filled in by `downloadProfile` after the download pass; absent from `fetchProfile`'s output |

## `UserInfo`

| Field | Type | Notes |
|---|---|---|
| `username` | `string` | Normalized |
| `private` | `boolean` | |
| `videoCount` | `number \| undefined` | |
| `nickname` | `string \| undefined` | |

## `ProgressEvent`

A discriminated union passed to `onProgress`. Switch on `type`.

| `type` | Fields | When |
|---|---|---|
| `"fetch-page"` | `source, page, itemCount` | Each time a new item_list page is intercepted |
| `"download-start"` | `source, total` | Once per source, before its downloads begin |
| `"download-item"` | `source, id, result, done, total` | After each item finishes (`result` is `"ok" \| "skip" \| "fail"`) |
| `"download-retry"` | `source, id, attempt, message` | Each retry attempt for a single file |

## `FetchOptions`

Input to `fetchProfile` — see [fetchProfile.md](./fetchProfile.md#params--fetchoptions) for the full field table.

## `DownloadOptions`

Input to `downloadProfile` — see [downloadProfile.md](./downloadProfile.md#params--downloadoptions) for the full field table.

## `DownloadSummary`

Output of `downloadProfile` — see [downloadProfile.md](./downloadProfile.md#returns--downloadsummary) for the full field table.

## `FetchProfileResult`

Output of `fetchProfile` — see [fetchProfile.md](./fetchProfile.md#returns--fetchprofileresult) for the full field table.
