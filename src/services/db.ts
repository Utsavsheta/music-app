import type { AppUser, YTVideo } from '../types';

export interface UserPlaylist {
  id: string;
  name: string;
  visibility: 'public' | 'private';
  userId: string;
  songs: YTVideo[];
  createdAt: number;
}

interface UserLike {
  id: string;
  userId: string;
  video: YTVideo;
}

export interface UserProfile extends AppUser {
  createdAt: number;
  updatedAt: number;
}

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
const API_BASE = configuredApiBase || (import.meta.env.DEV ? 'http://localhost:3001' : '/api');

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE.endsWith('/')) return `${API_BASE.slice(0, -1)}${normalizedPath}`;
  return `${API_BASE}${normalizedPath}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/* ─── Users ─── */
export async function upsertUserProfile(user: AppUser): Promise<UserProfile> {
  const email = user.email.trim().toLowerCase();
  const byEmail = email ? await apiFetch<UserProfile[]>(`/users?email=${encodeURIComponent(email)}`) : [];
  const byId = await apiFetch<UserProfile[]>(`/users?id=${encodeURIComponent(user.id)}`);
  const existing = byEmail[0] || byId[0];
  const now = Date.now();

  if (existing?.id) {
    return apiFetch<UserProfile>(`/users/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: user.name,
        email,
        picture: user.picture || '',
        updatedAt: now,
      }),
    });
  }

  return apiFetch<UserProfile>('/users', {
    method: 'POST',
    body: JSON.stringify({
      id: user.id || email || `user_${Date.now()}`,
      name: user.name,
      email,
      picture: user.picture || '',
      createdAt: now,
      updatedAt: now,
    }),
  });
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  if (!userId) return null;
  const users = await apiFetch<UserProfile[]>(`/users?id=${encodeURIComponent(userId)}`);
  return users[0] || null;
}

/* ─── Liked Songs ─── */
export async function fetchLikedSongs(userId: string): Promise<YTVideo[]> {
  if (!userId) return [];
  const likes = await apiFetch<UserLike[]>(`/likes?userId=${encodeURIComponent(userId)}`);
  return likes.map((l) => l.video);
}

export async function toggleLike(userId: string, video: YTVideo): Promise<YTVideo[]> {
  if (!userId) return [];
  const likes = await apiFetch<UserLike[]>(`/likes?userId=${encodeURIComponent(userId)}&video.videoId=${encodeURIComponent(video.videoId)}`);
  const existing = likes[0];

  if (existing?.id) {
    await apiFetch(`/likes/${existing.id}`, { method: 'DELETE' });
  } else {
    await apiFetch('/likes', {
      method: 'POST',
      body: JSON.stringify({ userId, video }),
    });
  }
  return fetchLikedSongs(userId);
}

/* ─── Playlists ─── */
export async function fetchPlaylists(userId: string): Promise<UserPlaylist[]> {
  if (!userId) return [];
  return apiFetch<UserPlaylist[]>(`/playlists?userId=${encodeURIComponent(userId)}`);
}

export async function fetchPublicPlaylists(): Promise<UserPlaylist[]> {
  return apiFetch<UserPlaylist[]>('/playlists?visibility=public');
}

export async function createPlaylist(userId: string, name: string, visibility: 'public' | 'private' = 'private'): Promise<UserPlaylist> {
  const newPl: UserPlaylist = {
    id: `pl_${Date.now()}`,
    userId,
    name,
    visibility,
    songs: [],
    createdAt: Date.now(),
  };
  return apiFetch<UserPlaylist>('/playlists', { method: 'POST', body: JSON.stringify(newPl) });
}

export async function updatePlaylist(userId: string, id: string, updates: Partial<Pick<UserPlaylist, 'name' | 'visibility'>>): Promise<UserPlaylist[]> {
  const existing = await apiFetch<UserPlaylist>(`/playlists/${id}`);
  if (existing.userId !== userId) return fetchPlaylists(userId);
  await apiFetch(`/playlists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: updates.name?.trim() ? updates.name.trim() : existing.name,
      visibility: updates.visibility || existing.visibility || 'private',
    }),
  });
  return fetchPlaylists(userId);
}

export async function deletePlaylist(userId: string, id: string): Promise<UserPlaylist[]> {
  const existing = await apiFetch<UserPlaylist>(`/playlists/${id}`);
  if (existing.userId !== userId) return fetchPlaylists(userId);
  await apiFetch(`/playlists/${id}`, { method: 'DELETE' });
  return fetchPlaylists(userId);
}

export async function addSongToPlaylist(userId: string, playlistId: string, video: YTVideo): Promise<UserPlaylist[]> {
  const pl = await apiFetch<UserPlaylist>(`/playlists/${playlistId}`);
  if (pl.userId !== userId) return fetchPlaylists(userId);
  if (!pl.songs.some((s) => s.videoId === video.videoId)) {
    await apiFetch(`/playlists/${playlistId}`, {
      method: 'PATCH',
      body: JSON.stringify({ songs: [...pl.songs, video] }),
    });
  }
  return fetchPlaylists(userId);
}

export async function removeSongFromPlaylist(userId: string, playlistId: string, videoId: string): Promise<UserPlaylist[]> {
  const pl = await apiFetch<UserPlaylist>(`/playlists/${playlistId}`);
  if (pl.userId !== userId) return fetchPlaylists(userId);
  await apiFetch(`/playlists/${playlistId}`, {
    method: 'PATCH',
    body: JSON.stringify({ songs: pl.songs.filter((s) => s.videoId !== videoId) }),
  });
  return fetchPlaylists(userId);
}
