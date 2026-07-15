#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openSession } from "./browser.js";
import { fetchItemListPages } from "./itemList.js";
import { normalizeItem } from "./normalize.js";

const program = new Command();

program
  .name("tt-scrape")
  .description("Fetch a public TikTok user's posts without logging in")
  .argument("<username>", "TikTok username, without @")
  .option("-c, --count <n>", "number of posts to fetch", "20")
  .option("--cookies <path>", "Netscape cookies.txt to warm the browser session")
  .option("--headful", "run the browser headed instead of headless")
  .option("--profile-dir <path>", "persistent browser profile dir (default: .tt-profile/<username>)")
  .option("-o, --out <path>", "write JSON to a file instead of stdout")
  .action(async (username: string, options) => {
    const count = Number(options.count);
    const profileDir = options.profileDir ?? join(process.cwd(), ".tt-profile", username);

    const session = await openSession({
      headless: !options.headful,
      cookiesPath: options.cookies,
      profileDir,
    });

    try {
      const pages = await fetchItemListPages(session.page, username, { count });
      const seen = new Set<string>();
      const posts = [];
      outer: for (const page of pages) {
        for (const raw of page.itemList) {
          if (seen.has(raw.id)) continue;
          seen.add(raw.id);
          posts.push(normalizeItem(raw));
          if (posts.length >= count) break outer;
        }
      }

      const json = JSON.stringify(posts, null, 2);
      if (options.out) {
        writeFileSync(options.out, json);
        console.error(`wrote ${posts.length} posts -> ${options.out}`);
      } else {
        console.log(json);
      }
    } finally {
      await session.close();
    }
  });

await program.parseAsync();
