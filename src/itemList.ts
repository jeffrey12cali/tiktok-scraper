import type { Page } from "patchright";

export interface ItemListResponse {
  itemList: any[];
  cursor: string;
  hasMore: boolean;
  statusCode: number;
}

export interface FetchOptions {
  count: number;
  maxScrolls?: number;
}

export async function fetchItemListPages(
  page: Page,
  username: string,
  opts: FetchOptions,
): Promise<ItemListResponse[]> {
  const pages: ItemListResponse[] = [];

  const onResponse = async (res: Awaited<ReturnType<Page["waitForResponse"]>>) => {
    const url = res.url();
    if (!url.includes("/api/post/item_list/")) return;
    try {
      const body = (await res.json()) as ItemListResponse;
      if (body && Array.isArray(body.itemList)) pages.push(body);
    } catch {
      // non-JSON or empty body (e.g. blocked request) - ignore
    }
  };
  page.on("response", onResponse);

  await page.goto(`https://www.tiktok.com/@${username}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(3000);

  const collected = () => pages.reduce((n, p) => n + p.itemList.length, 0);
  const hasMore = () => pages.length === 0 || pages[pages.length - 1].hasMore;
  const maxScrolls = opts.maxScrolls ?? 30;
  let stagnant = 0;

  for (let i = 0; i < maxScrolls && collected() < opts.count && hasMore(); i++) {
    const before = pages.length;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    for (let t = 0; t < 10 && pages.length === before; t++) {
      await page.waitForTimeout(500);
    }
    if (pages.length === before) {
      stagnant++;
      if (stagnant >= 6) break;
    } else {
      stagnant = 0;
    }
  }

  page.off("response", onResponse);
  return pages;
}
