export interface YTVideo {
  id: string;
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  thumbnailHigh: string;
  duration: number; // in seconds
  durationFormatted: string;
  publishedAt: string;
}

export interface YTPlaylist {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  thumbnailHigh: string;
  itemCount: number;
  description: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

export type ViewMode = 'home' | 'search' | 'playlist';
