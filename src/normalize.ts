export interface NormalizedPost {
  id: string;
  desc: string;
  createTime: number;
  createTimeIso: string;
  author: {
    id: string;
    uniqueId: string;
    nickname: string;
    avatar: string;
    verified: boolean;
  };
  stats: {
    playCount: number;
    diggCount: number;
    commentCount: number;
    shareCount: number;
    collectCount: number;
  };
  video: {
    durationSec: number;
    width: number;
    height: number;
    cover: string;
    dynamicCover: string;
    playUrl: string;
    downloadUrl: string;
  } | null;
  images: { url: string; width: number; height: number }[] | null;
  music: {
    id: string;
    title: string;
    authorName: string;
    playUrl: string;
    durationSec: number;
  } | null;
}

export function normalizeItem(raw: any): NormalizedPost {
  const isImagePost = !!raw.imagePost;
  return {
    id: raw.id,
    desc: raw.desc ?? "",
    createTime: Number(raw.createTime),
    createTimeIso: new Date(Number(raw.createTime) * 1000).toISOString(),
    author: {
      id: raw.author?.id ?? "",
      uniqueId: raw.author?.uniqueId ?? "",
      nickname: raw.author?.nickname ?? "",
      avatar: raw.author?.avatarLarger ?? "",
      verified: !!raw.author?.verified,
    },
    stats: {
      playCount: raw.stats?.playCount ?? 0,
      diggCount: raw.stats?.diggCount ?? 0,
      commentCount: raw.stats?.commentCount ?? 0,
      shareCount: raw.stats?.shareCount ?? 0,
      collectCount: raw.stats?.collectCount ?? 0,
    },
    video:
      !isImagePost && raw.video
        ? {
            durationSec: raw.video.duration,
            width: raw.video.width,
            height: raw.video.height,
            cover: raw.video.cover,
            dynamicCover: raw.video.dynamicCover,
            playUrl: raw.video.playAddr,
            downloadUrl: raw.video.downloadAddr,
          }
        : null,
    images: isImagePost
      ? (raw.imagePost.images ?? []).map((im: any) => ({
          url: im.imageURL?.urlList?.[0] ?? "",
          width: im.imageWidth,
          height: im.imageHeight,
        }))
      : null,
    music: raw.music
      ? {
          id: raw.music.id,
          title: raw.music.title,
          authorName: raw.music.authorName,
          playUrl: raw.music.playUrl,
          durationSec: raw.music.duration,
        }
      : null,
  };
}
