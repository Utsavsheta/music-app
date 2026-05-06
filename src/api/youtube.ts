import type { YTVideo, YTPlaylist } from '../types';

function parseApiKeys(rawValue: string): string[] {
  const trimmed = rawValue.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((key) => String(key).trim())
          .filter(Boolean);
      }
    } catch {
      // Fallback to CSV parsing if JSON format is invalid
    }
  }

  return trimmed
    .split(',')
    .map((key) => key.trim().replace(/^[\s'"[]+|[\s'"\]]+$/g, ''))
    .filter((key) => Boolean(key) && key !== ';');
}

const API_KEYS = parseApiKeys(import.meta.env.VITE_YT_API_KEYS || '');

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

// Track the current key index globally (persisted in session)
let currentKeyIndex = Number.parseInt(localStorage.getItem('yt_api_key_index') || '0', 10);
if (!Number.isFinite(currentKeyIndex) || currentKeyIndex < 0) currentKeyIndex = 0;

async function fetchYoutube(endpoint: string, params: Record<string, string>): Promise<any> {
  if (currentKeyIndex >= API_KEYS.length) {
    throw new Error('ADD_MORE_TOKENS');
  }

  const queryParams = new URLSearchParams({
    ...params,
    key: API_KEYS[currentKeyIndex]
  });

  const url = `${BASE_URL}${endpoint}?${queryParams.toString()}`;
  const res = await fetch(url);

  if (res.status === 403) {
    const errorData = await res.json();
    const isQuotaError = errorData.error?.errors?.some((e: any) => e.reason === 'quotaExceeded');
    
    if (isQuotaError) {
      console.warn(`API Key at index ${currentKeyIndex} exhausted. Rotating...`);
      currentKeyIndex++;
      localStorage.setItem('yt_api_key_index', currentKeyIndex.toString());
      
      // Recursive call with next key
      return fetchYoutube(endpoint, params);
    }
    
    throw new Error(errorData.error?.message || 'Forbidden');
  }

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error?.message || `YouTube API error: ${res.status}`);
  }

  return res.json();
}

// ── Helpers ──
function parseDuration(iso: string): number {
  const durationRegex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const match = durationRegex.exec(iso);
  if (!match) return 0;
  return Number.parseInt(match[1] || '0', 10) * 3600 + Number.parseInt(match[2] || '0', 10) * 60 + Number.parseInt(match[3] || '0', 10);
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function mapVideoItems(items: any[]): YTVideo[] {
  return (items || []).map((item: any) => {
    const dur = parseDuration(item.contentDetails?.duration || 'PT0S');
    return {
      id: item.id,
      videoId: item.id,
      title: item.snippet?.title || 'Unknown',
      channelTitle: item.snippet?.channelTitle || 'Unknown',
      thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
      thumbnailHigh: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || '',
      duration: dur,
      durationFormatted: formatDuration(dur),
      publishedAt: item.snippet?.publishedAt || '',
    } as YTVideo;
  });
}

async function fetchVideoDetails(videoIds: string): Promise<YTVideo[]> {
  if (!videoIds) return [];
  const data = await fetchYoutube('/videos', {
    part: 'contentDetails,snippet',
    id: videoIds
  });
  return mapVideoItems(data.items);
}

export interface PaginatedVideos {
  videos: YTVideo[];
  nextPageToken: string | null;
}

export interface PaginatedPlaylists {
  playlists: YTPlaylist[];
  nextPageToken: string | null;
}

// ── Search Videos ──
export async function searchVideos(query: string, maxResults = 12, pageToken?: string): Promise<PaginatedVideos> {
  const params: any = {
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    q: query,
    maxResults: maxResults.toString()
  };
  if (pageToken) params.pageToken = pageToken;

  const data = await fetchYoutube('/search', params);
  const videoIds = data.items?.map((item: any) => item.id?.videoId).filter(Boolean).join(',');
  const videos = await fetchVideoDetails(videoIds);

  return { videos, nextPageToken: data.nextPageToken || null };
}

// ── Search Playlists ──
export async function searchPlaylists(query: string, maxResults = 8, pageToken?: string): Promise<PaginatedPlaylists> {
  const params: any = {
    part: 'snippet',
    type: 'playlist',
    q: query + ' music',
    maxResults: maxResults.toString()
  };
  if (pageToken) params.pageToken = pageToken;

  const data = await fetchYoutube('/search', params);
  const playlistIds = data.items?.map((item: any) => item.id?.playlistId).filter(Boolean).join(',');
  if (!playlistIds) return { playlists: [], nextPageToken: null };

  const detailsData = await fetchYoutube('/playlists', {
    part: 'snippet,contentDetails',
    id: playlistIds
  });

  const playlists = (detailsData.items || []).map((item: any) => ({
    id: item.id,
    title: item.snippet?.title || 'Unknown',
    channelTitle: item.snippet?.channelTitle || 'Unknown',
    thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
    thumbnailHigh: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || '',
    itemCount: item.contentDetails?.itemCount || 0,
    description: item.snippet?.description || '',
  }));

  return { playlists, nextPageToken: data.nextPageToken || null };
}

// ── Fetch Playlist Items ──
export async function fetchPlaylistItems(playlistId: string, maxResults = 20, pageToken?: string): Promise<PaginatedVideos> {
  const params: any = {
    part: 'snippet,contentDetails',
    playlistId: playlistId,
    maxResults: maxResults.toString()
  };
  if (pageToken) params.pageToken = pageToken;

  const data = await fetchYoutube('/playlistItems', params);
  const videoIds = data.items
    ?.map((item: any) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId)
    .filter(Boolean).join(',');

  const videos = await fetchVideoDetails(videoIds);
  return { videos, nextPageToken: data.nextPageToken || null };
}

// ── Fetch Trending Music ──
export async function fetchTrendingMusic(maxResults = 12, pageToken?: string): Promise<PaginatedVideos> {
  const params: any = {
    part: 'snippet,contentDetails',
    chart: 'mostPopular',
    videoCategoryId: '10',
    regionCode: 'US',
    maxResults: maxResults.toString()
  };
  if (pageToken) params.pageToken = pageToken;

  const data = await fetchYoutube('/videos', params);
  return { videos: mapVideoItems(data.items), nextPageToken: data.nextPageToken || null };
}

// ── Fetch Latest Music Videos ──
export async function fetchLatestMusic(maxResults = 12, pageToken?: string): Promise<PaginatedVideos> {
  const params: any = {
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    order: 'date',
    q: 'latest music songs',
    maxResults: maxResults.toString(),
  };
  if (pageToken) params.pageToken = pageToken;

  const data = await fetchYoutube('/search', params);
  const videoIds = data.items?.map((item: any) => item.id?.videoId).filter(Boolean).join(',');
  const videos = await fetchVideoDetails(videoIds);
  return { videos, nextPageToken: data.nextPageToken || null };
}

// ── Fetch Popular Playlists ──
export async function fetchPopularPlaylists(): Promise<YTPlaylist[]> {
  const queries = ['Top Hits 2025', 'Pop Music Playlist', 'Lo-Fi Hip Hop', 'Chill Vibes'];
  const randomQuery = queries[Math.floor(Math.random() * queries.length)];
  const result = await searchPlaylists(randomQuery, 8);
  return result.playlists;
}
