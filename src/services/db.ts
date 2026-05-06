import type { YTVideo } from '../types';

export interface UserPlaylist {
  id: string;
  name: string;
  songs: YTVideo[];
  createdAt: number;
}

interface AppData {
  likedSongs: YTVideo[];
  playlists: UserPlaylist[];
}

const DB_KEY = 'yt_music_player_v2';

// Helper to get all data
function getData(): AppData {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return { likedSongs: [], playlists: [] };
    const parsed = JSON.parse(raw);
    return {
      likedSongs: Array.isArray(parsed.likedSongs) ? parsed.likedSongs : [],
      playlists: Array.isArray(parsed.playlists) ? parsed.playlists.map((p: any) => ({
        ...p,
        songs: Array.isArray(p.songs) ? p.songs : []
      })) : []
    };
  } catch {
    return { likedSongs: [], playlists: [] };
  }
}

// Helper to save all data
function saveData(data: AppData) {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
}

/* ─── Liked Songs ─── */
export async function fetchLikedSongs(): Promise<YTVideo[]> {
  return getData().likedSongs;
}

export async function toggleLike(video: YTVideo): Promise<YTVideo[]> {
  const data = getData();
  const index = data.likedSongs.findIndex(s => s.videoId === video.videoId);
  
  if (index >= 0) {
    data.likedSongs.splice(index, 1);
  } else {
    data.likedSongs.unshift(video);
  }
  
  saveData(data);
  return data.likedSongs;
}

/* ─── Playlists ─── */
export async function fetchPlaylists(): Promise<UserPlaylist[]> {
  return getData().playlists;
}

export async function createPlaylist(name: string): Promise<UserPlaylist> {
  const data = getData();
  const newPl: UserPlaylist = {
    id: 'pl_' + Date.now(),
    name,
    songs: [],
    createdAt: Date.now()
  };
  data.playlists.push(newPl);
  saveData(data);
  return newPl;
}

export async function deletePlaylist(id: string): Promise<UserPlaylist[]> {
  const data = getData();
  data.playlists = data.playlists.filter(p => p.id !== id);
  saveData(data);
  return data.playlists;
}

export async function addSongToPlaylist(playlistId: string, video: YTVideo): Promise<UserPlaylist[]> {
  const data = getData();
  const pl = data.playlists.find(p => p.id === playlistId);
  if (pl && !pl.songs.some(s => s.videoId === video.videoId)) {
    pl.songs.push(video);
    saveData(data);
  }
  return data.playlists;
}

export async function removeSongFromPlaylist(playlistId: string, videoId: string): Promise<UserPlaylist[]> {
  const data = getData();
  const pl = data.playlists.find(p => p.id === playlistId);
  if (pl) {
    pl.songs = pl.songs.filter(s => s.videoId !== videoId);
    saveData(data);
  }
  return data.playlists;
}
