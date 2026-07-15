# API reference

`tiktok-scrapper` exports four functions and a set of types. Start with
[`downloadProfile`](./downloadProfile.md) if you want files on disk; use
[`fetchProfile`](./fetchProfile.md) if you just want the data.

| Page | What it's for |
|---|---|
| [`downloadProfile`](./downloadProfile.md) | High-level: fetch + download a profile's media, write a metadata JSON |
| [`fetchProfile`](./fetchProfile.md) | Mid-level: fetch metadata + download URLs without downloading anything |
| [`validateUser`](./validateUser.md) | Look up a profile (private flag, nickname, video count) with no post fetching |
| [`normalizeUsername`](./normalizeUsername.md) | Turn a handle / `@handle` / profile URL into a bare username |
| [`types`](./types.md) | Every exported type/interface, field by field |

See the top-level [README](../README.md) for how the library works and its limitations.
