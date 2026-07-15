import type { MediaItem, MediaSource, PostMeta } from "./types.js";

function videoCandidates(raw: any): string[] {
  const urlList: string[] = raw.video?.PlayAddrStruct?.UrlList ?? [];
  const awemeUrl = urlList.find((u) => typeof u === "string" && u.includes("/aweme/v1/play/"));
  const candidates = [raw.video?.playAddr, awemeUrl, raw.video?.downloadAddr, ...urlList];
  return [...new Set(candidates.filter((u): u is string => typeof u === "string" && u.length > 0))];
}

function imageUrls(raw: any): string[] {
  const images = raw.imagePost?.images ?? [];
  return images
    .map((im: any) => im.imageURL?.urlList?.[0])
    .filter((u: unknown): u is string => typeof u === "string" && u.length > 0);
}

/** Map a raw TikTok item_list item to a downloadable unit. */
export function toMedia(raw: any, source: MediaSource): MediaItem {
  const author = raw.author?.uniqueId ?? "unknown";
  const pageUrl = `https://www.tiktok.com/@${author}/video/${raw.id}`;
  const isImage = !!raw.imagePost;

  if (isImage) {
    return {
      id: raw.id,
      source,
      kind: "image",
      urls: imageUrls(raw),
      ext: "jpg",
      desc: raw.desc ?? "",
      createTime: Number(raw.createTime) || 0,
      authorUsername: author,
      pageUrl,
      musicUrl: raw.music?.playUrl,
    };
  }
  return {
    id: raw.id,
    source,
    kind: "video",
    urls: videoCandidates(raw),
    ext: "mp4",
    desc: raw.desc ?? "",
    createTime: Number(raw.createTime) || 0,
    authorUsername: author,
    pageUrl,
  };
}

/** Map a raw TikTok item_list item to a curated metadata record. */
export function toMeta(raw: any, source: MediaSource): PostMeta {
  const isImage = !!raw.imagePost;
  return {
    id: raw.id,
    source,
    kind: isImage ? "image" : "video",
    desc: raw.desc ?? "",
    createTime: Number(raw.createTime) || 0,
    createTimeISO: raw.createTime ? new Date(Number(raw.createTime) * 1000).toISOString() : "",
    stats: {
      likeCount: raw.stats?.diggCount,
      commentCount: raw.stats?.commentCount,
      shareCount: raw.stats?.shareCount,
      playCount: raw.stats?.playCount,
      collectCount: raw.stats?.collectCount,
    },
    author: {
      id: raw.author?.id,
      username: raw.author?.uniqueId,
      nickname: raw.author?.nickname,
      verified: !!raw.author?.verified,
    },
    music: raw.music
      ? { id: raw.music.id, title: raw.music.title, authorName: raw.music.authorName }
      : undefined,
    video: isImage ? undefined : { duration: raw.video?.duration, ratio: raw.video?.ratio },
    imageCount: isImage ? imageUrls(raw).length : undefined,
  };
}

/**
 * The primary output filename for an item, matching what `download.ts` writes:
 * `<id>.mp4` for video, `<id>_01.jpg` for a photo carousel. Used by incremental
 * (`update`) mode to detect already-downloaded items.
 */
export function primaryFilename(item: Pick<MediaItem, "id" | "kind">): string {
  return item.kind === "image" ? `${item.id}_01.jpg` : `${item.id}.mp4`;
}
