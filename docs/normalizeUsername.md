# `normalizeUsername(input): string`

Turns a raw handle, `@handle`, or a full profile URL into a bare username. Every other
function in the library calls this internally on `user`/`opts.user` — it's exported so
callers can normalize consistently for their own comparisons (e.g. matching against a
saved list of usernames) without duplicating the regex.

## Signature

```ts
function normalizeUsername(input: string): string;
```

## Params

| Field | Type | Notes |
|---|---|---|
| `input` | `string` | A handle, `@handle`, or a `tiktok.com/@handle` URL (with or without query/hash) |

## Returns

`string` — the bare username, no `@`.

## Example

```ts
import { normalizeUsername } from "tiktok-scrapper";

normalizeUsername("someusername");                              // "someusername"
normalizeUsername("@someusername");                              // "someusername"
normalizeUsername("https://www.tiktok.com/@someusername?lang=en"); // "someusername"
```
