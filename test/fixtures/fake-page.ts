import type { RawPage } from "../../src/fetch.js";

type ResponseHandler = (res: any) => Promise<void> | void;

/**
 * Minimal stand-in for a patchright `Page`, covering only what fetch.ts uses:
 * on/off('response'), goto, waitForTimeout, viewportSize, mouse, keyboard, locator.
 *
 * `queue` holds one RawPage body per "scroll round" - `goto` delivers the first
 * (simulating the request that fires on initial navigation), and each
 * `keyboard.press('End')` (called once per scroll round in fetch.ts) delivers
 * the next, so one test page arrives per loop iteration.
 */
export class FakePage {
  private handler?: ResponseHandler;
  private queue: RawPage[];
  private matchUrl: string;
  public gotoUrls: string[] = [];
  public ssrText: string | null = null;

  constructor(queue: RawPage[], matchUrl: string) {
    this.queue = queue;
    this.matchUrl = matchUrl;
  }

  on(event: string, cb: ResponseHandler) {
    if (event === "response") this.handler = cb;
  }
  off() {
    this.handler = undefined;
  }
  async goto(url: string) {
    this.gotoUrls.push(url);
    await this.deliverNext();
  }
  async waitForTimeout() {}
  viewportSize() {
    return { width: 1280, height: 900 };
  }
  mouse = {
    move: async () => {},
    wheel: async () => {},
  };
  keyboard = {
    press: async (key: string) => {
      if (key === "End") await this.deliverNext();
    },
  };
  locator(_sel: string) {
    return {
      textContent: async (_opts?: unknown) => this.ssrText,
    };
  }

  /** Deliver a response for a non-matching endpoint (should be ignored by fetch.ts). */
  async deliverNonMatching(body: unknown) {
    await this.handler?.({ url: () => "https://www.tiktok.com/api/other/thing/", json: async () => body });
  }
  /** Deliver a response whose body isn't valid JSON (simulates an empty/blocked body). */
  async deliverBroken() {
    await this.handler?.({
      url: () => `https://www.tiktok.com${this.matchUrl}?cursor=x`,
      json: async () => {
        throw new Error("Unexpected end of JSON input");
      },
    });
  }

  private async deliverNext() {
    // No listener yet (e.g. validateUser's own navigation, which doesn't watch
    // item_list) -> nothing observes this response in real life either; leave
    // the queue untouched so a later, listened-to navigation still sees it.
    if (!this.handler) return;
    const body = this.queue.shift();
    if (!body) return;
    await this.handler({ url: () => `https://www.tiktok.com${this.matchUrl}?cursor=x`, json: async () => body });
  }
}
