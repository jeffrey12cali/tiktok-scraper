# `validateUser(user, opts?): Promise<UserInfo | undefined>`

Looks up a public profile — private flag, nickname, video count — without fetching any
posts. Cheapest call in the library: one page navigation, no scrolling/pagination.

## Signature

```ts
function validateUser(
  user: string,
  opts?: { cookies?: string; headless?: boolean; profileDir?: string },
): Promise<UserInfo | undefined>;
```

## Params

| Field | Type | Default | Notes |
|---|---|---|---|
| `user` | `string` | required | Handle, `@handle`, or a full profile URL |
| `opts.cookies` | `string` | — | Path to a Netscape `cookies.txt`. Optional |
| `opts.headless` | `boolean` | `true` | |
| `opts.profileDir` | `string` | `.tt-profile/<username>` | |

## Returns — `UserInfo | undefined`

| Field | Type | Notes |
|---|---|---|
| `username` | `string` | Normalized (no `@`, no URL) |
| `private` | `boolean` | |
| `videoCount` | `number \| undefined` | |
| `nickname` | `string \| undefined` | |

Returns `undefined` — not a throw — if the profile's SSR data can't be parsed (page
structure changed, network hiccup, profile doesn't exist). Callers should treat `undefined`
as "couldn't verify", not as "definitely doesn't exist".

## Example

```ts
import { validateUser } from "tiktok-scrapper";

const info = await validateUser("someusername");
if (!info) {
  console.log("couldn't verify — continuing anyway");
} else if (info.private) {
  console.log(`@${info.username} is private`);
} else {
  console.log(`${info.nickname} — ${info.videoCount} videos`);
}
```
