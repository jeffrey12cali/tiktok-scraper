export type MediaSource = "posts" | "likes" | "stories";
export type MediaKind = "video" | "image";

/** Normalized, downloadable unit derived from a TikTok post/repost. */
export interface MediaItem {
  id: string;
  source: MediaSource;
  kind: MediaKind;
  /** Candidate URLs in priority order (first that succeeds wins). */
  urls: string[];
  ext: "mp4" | "jpg";
  desc: string;
  createTime: number;
  authorUsername: string;
  /** Original video page URL, used as a Referer / fallback context. */
  pageUrl: string;
  /** Soundtrack mp3 URL — set for image posts (which have no embedded audio). */
  musicUrl?: string;
}

/** Curated, stable metadata record for one item. Built by `toMeta`. */
export interface PostMeta {
  id: string;
  source: MediaSource;
  kind: MediaKind;
  desc: string;
  createTime: number;
  createTimeISO: string;
  stats: {
    likeCount?: number;
    commentCount?: number;
    shareCount?: number;
    playCount?: number;
    collectCount?: number;
  };
  author: {
    id?: string;
    username?: string;
    nickname?: string;
    verified?: boolean;
  };
  music?: {
    id?: string;
    title?: string;
    authorName?: string;
  };
  video?: {
    duration?: number;
    ratio?: string;
  };
  imageCount?: number;
  /** Post download status, filled after the download pass. */
  downloaded?: "ok" | "skip" | "fail";
}

export interface UserInfo {
  username: string;
  private: boolean;
  videoCount?: number;
  nickname?: string;
}

export type ProgressEvent =
  | { type: "fetch-page"; source: MediaSource; page: number; itemCount: number }
  | { type: "download-start"; source: MediaSource; total: number }
  | { type: "download-item"; source: MediaSource; id: string; result: "ok" | "skip" | "fail"; done: number; total: number }
  | { type: "download-retry"; source: MediaSource; id: string; attempt: number; message: string };

export interface FetchOptions {
  user: string;
  types?: MediaSource[];
  limit?: number;
  cookies?: string;
  headless?: boolean;
  profileDir?: string;
  /** Incremental mode: stop paginating a source once a whole page is already known. */
  isKnown?: (source: MediaSource, item: MediaItem) => boolean;
  onProgress?: (evt: ProgressEvent) => void;
}

export interface DownloadOptions {
  user: string;
  output: string;
  types?: MediaSource[];
  limit?: number;
  concurrency?: number;
  delay?: number;
  retries?: number;
  overwrite?: boolean;
  images?: boolean;
  music?: boolean;
  update?: boolean;
  cookies?: string;
  headless?: boolean;
  profileDir?: string;
  onProgress?: (evt: ProgressEvent) => void;
}

export interface DownloadSummary {
  ok: number;
  skip: number;
  fail: number;
  userDir: string;
  metadataPath?: string;
  user?: UserInfo;
}
