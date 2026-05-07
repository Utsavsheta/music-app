import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import type { YTVideo, YTPlaylist, RepeatMode, ViewMode } from './types';
import { searchVideos, searchPlaylists, fetchPlaylistItems, fetchTrendingMusic, fetchLatestMusic } from './api/youtube';
import { useYouTubePlayer } from './hooks/useYouTubePlayer';
import { useGoogleAuth } from './hooks/useGoogleAuth';
import * as DB from './services/db';

/* ── Helpers ── */
function fmtTime(s: number) {
  if (!isFinite(s) || s < 0 || s > 360000) return '0:00';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

const GR = ['linear-gradient(135deg,#667eea,#764ba2)', 'linear-gradient(135deg,#ff0844,#ffb199)', 'linear-gradient(135deg,#f093fb,#f5576c)', 'linear-gradient(135deg,#4facfe,#00f2fe)', 'linear-gradient(135deg,#fa709a,#fee140)', 'linear-gradient(135deg,#a18cd1,#fbc2eb)', 'linear-gradient(135deg,#43e97b,#38f9d7)', 'linear-gradient(135deg,#f857a6,#ff5858)', 'linear-gradient(135deg,#ffecd2,#fcb69f)', 'linear-gradient(135deg,#a1c4fd,#c2e9fb)'];

function grad(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return GR[Math.abs(h) % GR.length];
}

/* ── UI Elements ── */
function Spin() {
  return (
    <div className="flex justify-center py-12 w-full">
      <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function SongCardLoader({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white/5 p-3 rounded-2xl border border-white/5 animate-card-in">
          <div className="aspect-square rounded-xl mb-4 shimmer" />
          <div className="h-3 rounded w-5/6 mb-2 shimmer" />
          <div className="h-2.5 rounded w-2/3 shimmer" />
        </div>
      ))}
    </div>
  );
}

const LAST_PLAYBACK_STORAGE_PREFIX = 'last_playback:';

function ListRowLoader({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={`row-loader-${i}`} className="h-14 rounded-xl bg-white/5 border border-white/10 shimmer" />
      ))}
    </div>
  );
}

function Hart({ on, sz = 18 }: { on: boolean; sz?: number }) {
  return (
    <svg width={sz} height={sz} viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill={on ? '#ef4444' : 'none'} stroke={on ? '#ef4444' : 'currentColor'} strokeWidth="2.5" /></svg>
  );
}

function SBtn({ on, click, ico, label }: { on: boolean; click: () => void; ico: ReactNode; label: string }) {
  return <button onClick={click} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition ${on ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">{ico}</svg>{label}</button>;
}

export default function App() {
  const [queue, setQueue] = useState<YTVideo[]>([]);
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(70);
  const [shuf, setShuf] = useState(false);
  const [rep, setRep] = useState<RepeatMode>('off');
  const [likedSongs, setLikedSongs] = useState<YTVideo[]>([]);
  const [userPls, setUserPls] = useState<DB.UserPlaylist[]>([]);
  const [publicPls, setPublicPls] = useState<DB.UserPlaylist[]>([]);
  const [view, setView] = useState<ViewMode>('home');
  const [query, setQuery] = useState('');
  const [stab, setStab] = useState<'v' | 'p'>('v');
  const [collapsed, setCollapsed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [newName, setNewName] = useState('');
  const [newVisibility, setNewVisibility] = useState<'public' | 'private'>('private');
  const [editPl, setEditPl] = useState<DB.UserPlaylist | null>(null);
  const [editName, setEditName] = useState('');
  const [editVisibility, setEditVisibility] = useState<'public' | 'private'>('private');
  const [showLiked, setShowLiked] = useState(false);
  const [a2pTarget, setA2pTarget] = useState<YTVideo | null>(null);
  const [viewUPL, setViewUPL] = useState<DB.UserPlaylist | null>(null);
  const [trending, setTrending] = useState<YTVideo[]>([]);
  const [latestSongs, setLatestSongs] = useState<YTVideo[]>([]);
  const [musicForYou, setMusicForYou] = useState<YTVideo[]>([]);
  const [popularEpisodes, setPopularEpisodes] = useState<YTVideo[]>([]);
  const [newMusicVideos, setNewMusicVideos] = useState<YTVideo[]>([]);
  const [bollywoodIndian, setBollywoodIndian] = useState<YTVideo[]>([]);
  const [ytCommunityPlaylists, setYtCommunityPlaylists] = useState<YTPlaylist[]>([]);
  const [srVids, setSrVids] = useState<YTVideo[]>([]);
  const [srPls, setSrPls] = useState<YTPlaylist[]>([]);
  const [ytPl, setYtPl] = useState<YTPlaylist | null>(null);
  const [plVids, setPlVids] = useState<YTVideo[]>([]);
  const [tkTrend, setTkTrend] = useState<string | null>(null);
  const [tkSrV, setTkSrV] = useState<string | null>(null);
  const [tkSrP, setTkSrP] = useState<string | null>(null);
  const [tkPl, setTkPl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadMore, setLoadMore] = useState(false);
  const [loadPl, setLoadPl] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [completedTracks, setCompletedTracks] = useState<string[]>([]);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [artistPanel, setArtistPanel] = useState<{ name: string; songs: YTVideo[]; loading: boolean } | null>(null);
  const [showNowPlayingSidebar, setShowNowPlayingSidebar] = useState(false);
  const [sidebarSyncTime, setSidebarSyncTime] = useState(0);
  const [unavailableVideoIds, setUnavailableVideoIds] = useState<string[]>([]);
  const [recommendedSongs, setRecommendedSongs] = useState<YTVideo[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(false);
  const { user, login, logout, authReady, authError } = useGoogleAuth();
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const exploreNewReleasesRef = useRef<HTMLElement | null>(null);
  const exploreMoodsRef = useRef<HTMLElement | null>(null);
  const explorePodcastsRef = useRef<HTMLElement | null>(null);
  const exploreTrendingRef = useRef<HTMLElement | null>(null);
  const restoredPlaybackForUserRef = useRef<string | null>(null);
  const lastPlaybackSavedRef = useRef<{ videoId: string; position: number; savedAt: number } | null>(null);

  const stateRef = useRef({ queue, idx, rep, shuf });
  const volRef = useRef(vol);
  const currentTrackIdRef = useRef<string | null>(null);
  useEffect(() => { stateRef.current = { queue, idx, rep, shuf }; }, [queue, idx, rep, shuf]);
  useEffect(() => { volRef.current = vol; }, [vol]);
  useEffect(() => {
    currentTrackIdRef.current = idx >= 0 && idx < queue.length ? queue[idx]?.videoId || null : null;
  }, [idx, queue]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('completed_tracks');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setCompletedTracks(parsed.map(String).filter(Boolean));
      }
    } catch {
      // ignore malformed persisted state
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('completed_tracks', JSON.stringify(completedTracks.slice(-1000)));
  }, [completedTracks]);

  const currentTrack = idx >= 0 && idx < queue.length ? queue[idx] : null;
  const currentTrackId = currentTrack?.videoId;
  const likedSet = new Set(likedSongs.map(s => s.videoId));
  const isCurrentVideoUnavailable = !!currentTrackId && unavailableVideoIds.includes(currentTrackId);
  const seekPct = dur > 0 ? Math.min(100, Math.max(0, (time / dur) * 100)) : 0;
  const volPct = Math.min(100, Math.max(0, vol));
  const visiblePublicPls = publicPls.filter((p) => p.userId !== user?.id);
  const completedSet = new Set(completedTracks);
  const markCompleted = useCallback((videoId: string | null | undefined) => {
    if (!videoId) return;
    setCompletedTracks((prev) => (prev.includes(videoId) ? prev : [...prev, videoId]));
  }, []);

  const toast = (msg: string) => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p.slice(-2), { id, msg }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2500);
  };

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [user?.picture]);
  useEffect(() => {
    setShowProfileMenu(false);
  }, [user?.id]);
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!showProfileMenu) return;
      const target = event.target as Node | null;
      if (profileMenuRef.current && target && !profileMenuRef.current.contains(target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showProfileMenu]);

  const goNext = useCallback((auto: boolean) => {
    const { queue: q, idx: ci, rep: r, shuf: s } = stateRef.current;
    if (!q.length) return;
    if (auto && r === 'one') { player.seekTo(0); player.play(); return; }
    let n = s ? Math.floor(Math.random() * q.length) : (ci >= q.length - 1 ? (r === 'all' || !auto ? 0 : -1) : ci + 1);
    if (n === -1) { setPlaying(false); return; }
    setIdx(n); setTime(0); setDur(q[n]?.duration || 0);
    player.loadVideo(q[n].videoId); setPlaying(false);
    if (volRef.current > 0) player.unMute();
    player.setVolume(volRef.current);
    player.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onState = useCallback((state: number) => {
    if (state === 0) {
      markCompleted(currentTrackIdRef.current);
      (goNext as any)(true);
    }
    else if (state === 1) {
      setPlaying(true);
      setTimeout(() => {
        const d = player.getDuration();
        if (d > 0 && d < 360000) setDur(d);
      }, 400);
    }
    else if (state === 2) setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goNext, markCompleted]);

  const player = useYouTubePlayer('yt-player-hidden', onState, (code) => {
    const failedId = currentTrackIdRef.current;
    if (failedId) {
      setUnavailableVideoIds((prev) => (prev.includes(failedId) ? prev : [...prev, failedId]));
    }
    toast(`Playback error (${code})`);
    (goNext as any)(false);
  });

  const persistLastPlayback = useCallback(async (force = false) => {
    if (!user?.id || !currentTrack?.videoId || !player.isReady) return;
    const nowPos = Math.max(0, Math.floor(player.getCurrentTime() || time || 0));
    if (nowPos < 2 && !force) return;

    const prev = lastPlaybackSavedRef.current;
    const tooSoon = prev && Date.now() - prev.savedAt < 6000;
    const sameTrack = prev?.videoId === currentTrack.videoId;
    const smallDelta = prev ? Math.abs(prev.position - nowPos) < 5 : false;
    if (!force && sameTrack && tooSoon && smallDelta) return;

    const payload = { video: currentTrack, position: nowPos, updatedAt: Date.now() };
    try {
      localStorage.setItem(`${LAST_PLAYBACK_STORAGE_PREFIX}${user.id}`, JSON.stringify(payload));
    } catch {
      // ignore local storage errors
    }
    try {
      await DB.saveLastPlayback(user.id, payload);
      lastPlaybackSavedRef.current = { videoId: currentTrack.videoId, position: nowPos, savedAt: Date.now() };
    } catch {
      // don't block playback when persistence fails
    }
  }, [currentTrack, player, time, user?.id]);

  const goPrev = useCallback(() => {
    if (!queue.length) return;
    if (player.getCurrentTime() > 5) { player.seekTo(0); return; }
    const n = idx <= 0 ? queue.length - 1 : idx - 1;
    setIdx(n); setTime(0); setDur(queue[n]?.duration || 0);
    player.loadVideo(queue[n].videoId); setPlaying(false);
    if (vol > 0) player.unMute();
    player.setVolume(vol);
    player.play();
  }, [player, queue, idx, vol]);

  useEffect(() => {
    if (!player.isReady) return;
    if (vol <= 0) player.mute();
    else player.unMute();
    player.setVolume(vol);
  }, [player, vol]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [t, pub, indian, latest, forYou, episodes, newVideos, communityPls] = await Promise.all([
          fetchTrendingMusic(12),
          DB.fetchPublicPlaylists(),
          searchVideos('Bollywood Indian latest songs', 12),
          fetchLatestMusic(12),
          searchVideos('music videos for you', 12),
          searchVideos('popular podcast episodes india', 12),
          searchVideos('new music videos india', 12),
          searchPlaylists('trending community playlists music', 8),
        ]);
        setTrending(t.videos);
        setTkTrend(t.nextPageToken);
        setPublicPls(pub);
        setBollywoodIndian(indian.videos);
        setLatestSongs(latest.videos);
        setMusicForYou(forYou.videos);
        setPopularEpisodes(episodes.videos);
        setNewMusicVideos(newVideos.videos);
        setYtCommunityPlaylists(communityPls.playlists);
      } catch {
        // silent fail for initial data load
      }
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadUserData() {
      if (!user?.id) {
        setLikedSongs([]);
        setUserPls([]);
        restoredPlaybackForUserRef.current = null;
        lastPlaybackSavedRef.current = null;
        return;
      }
      const [likes, ownPlaylists] = await Promise.all([
        DB.fetchLikedSongs(user.id),
        DB.fetchPlaylists(user.id),
      ]);
      setLikedSongs(likes);
      setUserPls(ownPlaylists);
    }
    loadUserData();
  }, [user?.id]);

  useEffect(() => {
    async function restoreLastPlayback() {
      if (!user?.id || !player.isReady) return;
      if (restoredPlaybackForUserRef.current === user.id) return;
      restoredPlaybackForUserRef.current = user.id;
      try {
        let localSaved: DB.LastPlaybackState | null = null;
        try {
          const raw = localStorage.getItem(`${LAST_PLAYBACK_STORAGE_PREFIX}${user.id}`);
          if (raw) {
            const parsed = JSON.parse(raw) as DB.LastPlaybackState;
            if (parsed?.video?.videoId) localSaved = parsed;
          }
        } catch {
          // ignore malformed local storage payload
        }

        const remoteSaved = await DB.fetchLastPlayback(user.id);
        const saved = (localSaved?.updatedAt || 0) >= (remoteSaved?.updatedAt || 0) ? localSaved : remoteSaved;
        if (!saved?.video?.videoId) return;
        const resumeAt = Math.max(0, Math.floor(saved.position || 0));
        setQueue([saved.video]);
        setIdx(0);
        setTime(resumeAt);
        setDur(saved.video.duration || 0);
        player.loadVideo(saved.video.videoId);
        setPlaying(false);
        if (vol > 0) player.unMute();
        player.setVolume(vol);
        setTimeout(() => {
          player.seekTo(resumeAt);
          player.pause();
          setPlaying(false);
        }, 450);
      } catch {
        // silently skip resume when API is unavailable
      }
    }
    restoreLastPlayback();
  }, [player.isReady, user?.id, vol]);

  const fetchMore = async () => {
    if (loadMore) return;
    setLoadMore(true);
    try {
      if (view === 'home' && tkTrend) {
        const r = await fetchTrendingMusic(12, tkTrend);
        setTrending(p => [...p, ...r.videos]); setTkTrend(r.nextPageToken);
      } else if (view === 'search' && query) {
        if (stab === 'v' && tkSrV) { const r = await searchVideos(query, 12, tkSrV); setSrVids(p => [...p, ...r.videos]); setTkSrV(r.nextPageToken); }
        if (stab === 'p' && tkSrP) { const r = await searchPlaylists(query, 8, tkSrP); setSrPls(p => [...p, ...r.playlists]); setTkSrP(r.nextPageToken); }
      } else if (view === 'playlist' && ytPl && tkPl) {
        const r = await fetchPlaylistItems(ytPl.id, 20, tkPl); setPlVids(p => [...p, ...r.videos]); setTkPl(r.nextPageToken);
      }
    } catch {
      // silent fail for background pagination fetch
    }
    setLoadMore(false);
  };

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting && !loadMore && !loading) fetchMore(); }, { threshold: 0.1 });
    const sent = document.getElementById('sentinel');
    if (sent) obs.observe(sent);
    return () => obs.disconnect();
  });

  const handleLike = async (v: YTVideo) => {
    if (!user?.id) {
      toast('Login required to like songs');
      return;
    }
    const up = await DB.toggleLike(user.id, v); setLikedSongs(up); toast(up.some(s => s.videoId === v.videoId) ? 'Liked ❤️' : 'Removed');
  };
  const handleCreatePl = async () => {
    if (!user?.id) {
      toast('Login required to create playlists');
      return;
    }
    if (!newName.trim()) return;
    await DB.createPlaylist(user.id, newName.trim(), newVisibility); setUserPls(await DB.fetchPlaylists(user.id));
    setPublicPls(await DB.fetchPublicPlaylists());
    setNewName(''); setNewVisibility('private'); setShowCreate(false); toast('Created');
  };
  const openEditPl = (pl: DB.UserPlaylist) => {
    setEditPl(pl);
    setEditName(pl.name);
    setEditVisibility(pl.visibility);
  };
  const handleEditPl = async () => {
    if (!user?.id || !editPl || !editName.trim()) return;
    const updated = await DB.updatePlaylist(user.id, editPl.id, { name: editName.trim(), visibility: editVisibility });
    setUserPls(updated);
    setPublicPls(await DB.fetchPublicPlaylists());
    if (viewUPL?.id === editPl.id) {
      setViewUPL(updated.find((p) => p.id === editPl.id) || null);
    }
    setEditPl(null);
    toast('Playlist updated');
  };
  const handleAddToPl = async (plId: string, v: YTVideo) => {
    if (!user?.id) {
      toast('Login required to add songs');
      return;
    }
    const up = await DB.addSongToPlaylist(user.id, plId, v);
    setUserPls(up); setA2pTarget(null); toast('Added');
    if (viewUPL?.id === plId) setViewUPL(up.find(p => p.id === plId) || null);
  };
  const handleRemoveFromPl = async (plId: string, vId: string) => {
    if (!user?.id) return;
    const up = await DB.removeSongFromPlaylist(user.id, plId, vId);
    setUserPls(up); if (viewUPL?.id === plId) setViewUPL(up.find(p => p.id === plId) || null);
  };

  const navHome = () => { setView('home'); setShowLiked(false); setYtPl(null); setViewUPL(null); setQuery(''); };
  const navLiked = () => { setShowLiked(true); setView('playlist'); setYtPl(null); setViewUPL(null); };
  const navUPL = (pl: DB.UserPlaylist) => { setViewUPL(pl); setView('playlist'); setYtPl(null); setShowLiked(false); };
  const handleBack = () => {
    if (view === 'playlist' || showLiked || viewUPL || ytPl) {
      navHome();
      return;
    }
    if (view === 'search') {
      if (query.trim()) {
        setQuery('');
        return;
      }
      navHome();
      return;
    }
    if (globalThis.history.length > 1) {
      globalThis.history.back();
    }
  };

  const doSearch = (q: string) => {
    setQuery(q); setView('search'); setLoading(true);
    setTimeout(async () => {
      try { const [v, p] = await Promise.all([searchVideos(q, 12), searchPlaylists(q, 8)]); setSrVids(v.videos); setTkSrV(v.nextPageToken); setSrPls(p.playlists); setTkSrP(p.nextPageToken); }
      catch { setSrVids([]); setSrPls([]); setTkSrV(null); setTkSrP(null); }
      setLoading(false);
    }, 500);
  };

  const fetchByTitle = (title: string) => {
    setStab('v');
    doSearch(title);
  };

  const openArtistSection = async (artistName: string) => {
    setArtistPanel({ name: artistName, songs: [], loading: true });
    try {
      const result = await searchVideos(artistName, 24);
      const normalized = artistName.trim().toLowerCase();
      const filtered = result.videos.filter((song) => song.channelTitle.toLowerCase().includes(normalized));
      setArtistPanel({ name: artistName, songs: filtered.length ? filtered : result.videos, loading: false });
    } catch {
      setArtistPanel({ name: artistName, songs: [], loading: false });
    }
  };

  const handleExploreChipClick = (chip: string) => {
    const normalized = chip.trim().toLowerCase();
    const scrollToSection = (section: HTMLElement | null) => {
      if (!section) return false;
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    };
    if (view === 'search' && !query.trim()) {
      if (normalized === 'new releases' && scrollToSection(exploreNewReleasesRef.current)) return;
      if (normalized === 'charts' && scrollToSection(exploreTrendingRef.current)) return;
      if (normalized === 'moods & genres' && scrollToSection(exploreMoodsRef.current)) return;
      if (normalized === 'podcasts' && scrollToSection(explorePodcastsRef.current)) return;
    }
    if (normalized === 'new releases') {
      doSearch('new albums and singles');
      return;
    }
    if (normalized === 'charts') {
      doSearch('top music charts');
      return;
    }
    if (normalized === 'moods & genres') {
      doSearch('mood based songs');
      return;
    }
    if (normalized === 'podcasts') {
      doSearch('popular music podcasts');
      return;
    }
    doSearch(chip);
  };

  const openNowPlayingSidebar = () => {
    const syncAt = Math.max(0, Math.floor(time || 0));
    setSidebarSyncTime(syncAt);
    setShowNowPlayingSidebar(true);
  };

  useEffect(() => {
    if (!showNowPlayingSidebar || !currentTrack?.videoId) return;
    const syncAt = Math.max(0, Math.floor(time || 0));
    setSidebarSyncTime(syncAt);
  }, [currentTrack?.videoId, showNowPlayingSidebar, playing]);

  useEffect(() => {
    async function loadRecommendedSongs() {
      if (!showNowPlayingSidebar || !currentTrack) {
        setRecommendedSongs([]);
        return;
      }
      setRecommendedLoading(true);
      try {
        const result = await searchVideos(`${currentTrack.title} ${currentTrack.channelTitle}`, 6);
        setRecommendedSongs(result.videos.filter((video) => video.videoId !== currentTrack.videoId));
      } catch {
        setRecommendedSongs([]);
      }
      setRecommendedLoading(false);
    }
    loadRecommendedSongs();
  }, [currentTrack, showNowPlayingSidebar]);

  const playSongFromList = useCallback((list: YTVideo[], startIndex: number) => {
    if (!player.isReady || !list.length || startIndex < 0 || startIndex >= list.length) return;
    setQueue(list);
    setIdx(startIndex);
    const track = list[startIndex];
    setTime(0);
    setDur(track.duration || 0);
    player.loadVideo(track.videoId);
    setPlaying(false);
    if (vol > 0) player.unMute();
    player.setVolume(vol);
    player.play();
  }, [player, vol]);

  const playAll = (vids: YTVideo[], start = 0) => {
    if (!player.isReady || !vids.length) return;
    setQueue(vids); setIdx(start); setTime(0); setDur(vids[start]?.duration || 0);
    player.loadVideo(vids[start].videoId); setPlaying(false);
    if (vol > 0) player.unMute();
    player.setVolume(vol);
    player.play();
    toast(`Playing ${vids.length} tracks`);
  };

  const togglePlayback = useCallback(() => {
    if (!player.isReady || !currentTrack) return;
    const state = player.getPlayerState();
    if (state === 1) {
      if (vol > 0) player.unMute();
      player.setVolume(vol);
      player.pause();
      setPlaying(false);
      return;
    }
    if (vol > 0) player.unMute();
    player.setVolume(vol);
    player.play();
    setPlaying(true);
  }, [currentTrack, player, vol]);

  useEffect(() => {
    if (!player.isReady || !playing || !currentTrack) return;
    const id = setInterval(() => {
      setTime(player.getCurrentTime());
    }, 300);
    return () => clearInterval(id);
  }, [currentTrack, player, player.isReady, playing]);

  useEffect(() => {
    if (!playing || !user?.id || !currentTrack?.videoId) return;
    const id = setInterval(() => {
      void persistLastPlayback();
    }, 7000);
    return () => clearInterval(id);
  }, [currentTrack?.videoId, persistLastPlayback, playing, user?.id]);

  useEffect(() => {
    if (!user?.id || !currentTrack?.videoId || playing) return;
    void persistLastPlayback(true);
  }, [currentTrack?.videoId, persistLastPlayback, playing, user?.id]);

  useEffect(() => {
    const onBeforeUnload = () => {
      void persistLastPlayback(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void persistLastPlayback(true);
      }
    };
    globalThis.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      globalThis.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [persistLastPlayback]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') setVol((v) => Math.min(100, v + 5));
      if (e.key === 'ArrowDown') setVol((v) => Math.max(0, v - 5));
      if (e.key.toLowerCase() === 'm') setVol((v) => (v > 0 ? 0 : 70));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => player.play());
    navigator.mediaSession.setActionHandler('pause', () => player.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => goPrev());
    navigator.mediaSession.setActionHandler('nexttrack', () => (goNext as any)(false));
  }, [goNext, goPrev, player]);

  const openYTPl = async (pl: YTPlaylist) => {
    setYtPl(pl); setView('playlist'); setShowLiked(false); setViewUPL(null); setLoadPl(true);
    try {
      const r = await fetchPlaylistItems(pl.id, 20);
      setPlVids(r.videos); setTkPl(r.nextPageToken);
    } catch {
      setPlVids([]);
      setTkPl(null);
    }
    setLoadPl(false);
  };

  const curPlSongs = showLiked ? likedSongs : viewUPL ? (viewUPL.songs || []) : plVids;
  const curPlTitle = showLiked ? 'Liked Songs' : viewUPL ? viewUPL.name : ytPl?.title || '';
  const curPlGrad = showLiked ? '#e74' : grad(viewUPL?.id || ytPl?.id || 'x');
  const currentTrackUrl = currentTrack ? `https://www.youtube.com/watch?v=${currentTrack.videoId}` : '';
  const quickPicks = (latestSongs.length ? latestSongs : trending).slice(0, 12);
  const charts = trending.slice(0, 10);
  const communityPlaylists = visiblePublicPls.slice(0, 8);
  const trendingCommunityPlaylists = ytCommunityPlaylists.slice(0, 8);
  const moodsGenres = ['Hindi', 'Feel good', '2000s', 'Romance', 'Sleep', 'Workout', '2010s', 'Sad', 'Commute', 'Monsoon', '1960s', 'Jazz', 'Folk & acoustic', 'Desi hip-hop', 'African', 'Energize', '1980s', 'Hindustani classical'];
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const handleCast = useCallback(async () => {
    if (!currentTrack || !currentTrackUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: currentTrack.title,
          text: `Listen on Music: ${currentTrack.title}`,
          url: currentTrackUrl,
        });
        toast('Sent to cast/share target');
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentTrackUrl);
        toast('Link copied. Open on your cast device.');
        return;
      }
      window.open(currentTrackUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast('Cast cancelled or unavailable');
    }
  }, [currentTrack, currentTrackUrl]);

  return (
    <div className="flex h-screen bg-[#121212] text-white font-sans select-none overflow-hidden relative">
      <aside className={`${collapsed ? 'w-[72px]' : 'w-[280px]'} bg-black flex flex-col transition-all border-r border-white/5`}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[linear-gradient(145deg,#1f2937,#0b0f19)] border border-white/15 flex items-center justify-center shadow-lg flex-shrink-0 relative overflow-visible">
            <span className="text-sm font-black text-white">M</span>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-red-600 flex items-center justify-center ring-2 ring-black">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </div>
          {!collapsed && <span className="text-xl font-black tracking-tight">Muzic</span>}
        </div>
        <nav className="flex flex-col gap-1 px-2">
          <SBtn on={view === 'home' && !showLiked && !viewUPL} click={navHome} ico={<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />} label={collapsed ? '' : 'Home'} />
          <SBtn on={view === 'search'} click={() => { setView('search'); setShowLiked(false); setViewUPL(null); }} ico={<path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />} label={collapsed ? '' : 'Explore'} />
          <button onClick={navLiked} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition ${showLiked ? 'bg-red-500/20 text-red-400' : 'text-white/40 hover:text-white'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>{!collapsed && <span className="flex-1 flex justify-between">Liked <span className="opacity-40">{likedSongs.length}</span></span>}</button>
        </nav>
        {!collapsed && (
          <div className="mt-6 flex-1 flex flex-col border-t border-white/5 overflow-hidden">
            <div className="px-5 py-3 flex items-center justify-between"><span className="text-xs font-bold text-white/40 uppercase tracking-widest">Playlists</span><button onClick={() => user ? setShowCreate(true) : toast('Login required to create playlist')} className="text-white/40 hover:text-white text-xl leading-none">+</button></div>
            <div className="flex-1 overflow-y-auto cscr px-2 pb-4 space-y-0.5">
              {userPls.map((p) => (
                <div key={p.id} className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition ${viewUPL?.id === p.id ? 'bg-white/10 text-white shadow-sm' : 'text-white/60 hover:bg-white/5'}`}>
                  <button onClick={() => navUPL(p)} className="flex-1 text-left text-sm truncate">♪ {p.name} <span className="opacity-40 text-[10px]">({p.visibility})</span></button>
                  <button onClick={(e) => { e.stopPropagation(); openEditPl(p); }} className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-white transition text-xs">✎</button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!user?.id) return;
                      const next = await DB.deletePlaylist(user.id, p.id);
                      setUserPls(next);
                      setPublicPls(await DB.fetchPublicPlaylists());
                      if (viewUPL?.id === p.id) navHome();
                    }}
                    className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-500 transition text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {!!visiblePublicPls.length && <div className="pt-3 px-3 text-[10px] uppercase tracking-widest text-white/30 font-bold">Public playlists</div>}
              {visiblePublicPls.map((p) => (
                <button key={`pub-${p.id}`} onClick={() => navUPL(p)} className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition truncate">
                  🌍 {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <button onClick={() => setCollapsed(s => !s)} className="p-4 text-xs text-white/30 hover:text-white/60 text-center">{collapsed ? '→' : '← Collapse'}</button>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center gap-4 px-6 py-3 bg-black/40 backdrop-blur-md border-b border-white/5 flex-shrink-0 z-10">
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition"
            title="Back"
            aria-label="Back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.58-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>
          <div className="flex-1 min-w-0 relative">
            <input type="text" placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { (e.target as any).blur(); doSearch((e.target as any).value); } }} className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/15 text-white rounded-full px-5 py-2 text-sm outline-none transition border border-transparent focus:border-white/10" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <div className="relative" ref={profileMenuRef}>
                <button onClick={() => setShowProfileMenu((s) => !s)} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center overflow-hidden">
                  {user.picture && !avatarLoadFailed ? (
                    <img
                      src={user.picture}
                      alt={user.name}
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarLoadFailed(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="w-full h-full bg-white/20 text-xs font-bold flex items-center justify-center">
                      {user.name?.trim()?.charAt(0)?.toUpperCase() || 'U'}
                    </span>
                  )}
                </button>
                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl bg-[#1f1f1f]/95 border border-white/15 shadow-2xl overflow-hidden z-20 backdrop-blur-xl">
                    <div className="px-3 py-2.5 text-xs text-white/70 truncate border-b border-white/10">{user.name}</div>
                    <button onClick={() => { setShowProfileMenu(false); setShowLogoutConfirm(true); }} className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/10">Logout</button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={login} disabled={!authReady} title={authError || ''} className="text-xs bg-white text-black px-4 py-1.5 rounded-full font-bold disabled:opacity-50 disabled:cursor-not-allowed">{authReady ? 'Login with Google' : 'Loading login...'}</button>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto cscr pb-32">
          {view === 'home' && !showLiked && !viewUPL && (
            <div className="p-6 space-y-10">
              <h1 className="text-3xl font-black tracking-tight">{greeting}</h1>
              {loading && !trending.length && <SongCardLoader count={12} />}

              <section>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-black tracking-tight">Quick picks</h2>
                  <button onClick={() => { if (quickPicks.length) playAll(quickPicks); }} className="text-xs bg-white text-black px-4 py-1.5 rounded-full font-bold uppercase tracking-widest">Play all</button>
                </div>
                {quickPicks.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {quickPicks.map((v, i) => (
                      <button key={`${v.videoId}-quick`} onClick={() => playSongFromList(quickPicks, i)} className="group flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-2.5 text-left transition">
                        <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
                          {v.thumbnail ? <img src={v.thumbnail} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full" style={{ background: grad(v.videoId) }} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); fetchByTitle(v.title); }}
                            className="text-sm font-bold truncate text-left hover:underline w-full"
                            title={`Find songs like ${v.title}`}
                          >
                            {v.title}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openArtistSection(v.channelTitle); }}
                            className="text-xs text-white/55 truncate text-left hover:text-white hover:underline w-full"
                            title={`View songs by ${v.channelTitle}`}
                          >
                            {v.channelTitle}
                          </button>
                        </div>
                        <span className="text-[10px] text-white/55 font-mono">{v.durationFormatted}</span>
                      </button>
                    ))}
                  </div>
                ) : <ListRowLoader count={6} />}
              </section>

              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Music videos for you</h2>
                  <button
                    onClick={() => { if (musicForYou.length) playAll(musicForYou); }}
                    className="text-xs bg-white text-black px-4 py-1.5 rounded-full font-bold uppercase tracking-widest"
                  >
                    Play all
                  </button>
                </div>
                {musicForYou.length ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {musicForYou.map((v, i) => (
                      <button
                        key={`for-you-${v.videoId}`}
                        onClick={() => playSongFromList(musicForYou, i)}
                        className="group bg-white/5 p-3 rounded-2xl hover:bg-white/10 transition text-left"
                      >
                        <div className="aspect-square relative overflow-hidden rounded-xl mb-4 shadow-lg">
                          {v.thumbnail ? <img src={v.thumbnailHigh || v.thumbnail} className="w-full h-full object-cover group-hover:scale-110 transition duration-500" alt="" /> : <div className="w-full h-full" style={{ background: grad(v.videoId) }} />}
                          <span className="absolute bottom-2 right-2 bg-black/80 text-[10px] font-black px-1.5 py-0.5 rounded-md">{v.durationFormatted}</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); fetchByTitle(v.title); }}
                          className="text-sm font-bold truncate text-left hover:underline w-full"
                        >
                          {v.title}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openArtistSection(v.channelTitle); }}
                          className="text-xs text-white/40 truncate text-left hover:text-white hover:underline w-full"
                        >
                          {v.channelTitle}
                        </button>
                      </button>
                    ))}
                  </div>
                ) : <SongCardLoader count={6} />}
              </section>

              <section>
                <h2 className="text-xl font-bold mb-4">Trending music</h2>
                {trending.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {trending.map((v, i) => (
                    <div key={v.videoId} className={`group bg-white/5 p-3 rounded-2xl hover:bg-white/10 transition cursor-pointer animate-card-in ${completedSet.has(v.videoId) ? 'ring-1 ring-emerald-400/40' : ''}`} onClick={() => playSongFromList(trending, i)}>
                      <div className="aspect-square relative overflow-hidden rounded-xl mb-4 shadow-lg">
                        {v.thumbnail ? <img src={v.thumbnailHigh || v.thumbnail} className="w-full h-full object-cover group-hover:scale-110 transition duration-500" alt="" /> : <div className="w-full h-full" style={{ background: grad(v.videoId) }} />}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center"><div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition shadow-xl">{playing && currentTrackId === v.videoId ? <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg> : <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}</div></div>
                        <span className="absolute bottom-2 right-2 bg-black/80 text-[10px] font-black px-1.5 py-0.5 rounded-md">{v.durationFormatted}</span>
                        {completedSet.has(v.videoId) && <span className="absolute top-2 left-2 bg-emerald-500/90 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Played</span>}
                      </div>
                      <div className="min-w-0 relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); fetchByTitle(v.title); }}
                          className="text-sm font-bold truncate pr-6 mb-1 text-left hover:underline w-full"
                          title={`Find songs like ${v.title}`}
                        >
                          {v.title}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openArtistSection(v.channelTitle); }}
                          className="text-xs text-white/40 truncate text-left hover:text-white hover:underline w-full"
                          title={`View songs by ${v.channelTitle}`}
                        >
                          {v.channelTitle}
                        </button>
                        <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 flex flex-col gap-2 transition"><button onClick={e => { e.stopPropagation(); handleLike(v); }} className="text-white hover:text-red-500"><Hart on={likedSet.has(v.videoId)} sz={16} /></button><button onClick={e => { e.stopPropagation(); setA2pTarget(v); }} className="text-white/40 hover:text-white"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" /></svg></button></div>
                      </div>
                    </div>
                  ))}
                </div>
                ) : <SongCardLoader count={6} />}
              </section>

              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">From the community</h2>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/45">Public playlists</span>
                </div>
                {communityPlaylists.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {communityPlaylists.map((pl) => (
                      <button
                        key={`community-${pl.id}`}
                        onClick={() => navUPL(pl)}
                        className="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition p-4"
                      >
                        <p className="text-sm font-bold truncate">{pl.name}</p>
                        <p className="text-xs text-white/55 mt-1">{pl.songs.length} songs</p>
                      </button>
                    ))}
                  </div>
                ) : <SongCardLoader count={8} />}
              </section>

              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Charts</h2>
                  <button
                    onClick={() => { if (charts.length) playAll(charts); }}
                    className="text-xs bg-white text-black px-4 py-1.5 rounded-full font-bold uppercase tracking-widest"
                  >
                    Play chart
                  </button>
                </div>
                {charts.length ? (
                <div className="space-y-2">
                  {charts.map((song, i) => (
                    <button
                      key={`chart-${song.videoId}`}
                      onClick={() => playSongFromList(charts, i)}
                      className="w-full text-left grid grid-cols-[24px_44px_1fr_auto] gap-3 items-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 transition"
                    >
                      <span className="text-xs text-white/50 font-black">{i + 1}</span>
                      <img src={song.thumbnail} alt={song.title} className="w-11 h-11 rounded-lg object-cover" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{song.title}</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); openArtistSection(song.channelTitle); }}
                          className="text-xs text-white/55 truncate hover:text-white hover:underline"
                        >
                          {song.channelTitle}
                        </button>
                      </div>
                      <span className="text-[10px] font-mono text-white/45">{song.durationFormatted}</span>
                    </button>
                  ))}
                </div>
                ) : <ListRowLoader count={8} />}
              </section>

              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Bollywood &amp; Indian</h2>
                  <button
                    onClick={() => { if (bollywoodIndian.length) playAll(bollywoodIndian); }}
                    className="text-xs bg-white text-black px-4 py-1.5 rounded-full font-bold uppercase tracking-widest"
                  >
                    Play all
                  </button>
                </div>
                {bollywoodIndian.length ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {bollywoodIndian.map((song, i) => (
                      <button
                        key={`india-${song.videoId}`}
                        onClick={() => playSongFromList(bollywoodIndian, i)}
                        className="text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition p-3"
                      >
                        <img src={song.thumbnailHigh || song.thumbnail} alt={song.title} className="w-full aspect-square object-cover rounded-xl mb-3" />
                        <p className="text-sm font-bold truncate">{song.title}</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); openArtistSection(song.channelTitle); }}
                          className="text-xs text-white/50 truncate hover:text-white hover:underline"
                        >
                          {song.channelTitle}
                        </button>
                      </button>
                    ))}
                  </div>
                ) : <SongCardLoader count={6} />}
              </section>

              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Trending community playlists</h2>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/45">From YouTube</span>
                </div>
                {trendingCommunityPlaylists.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {trendingCommunityPlaylists.map((pl) => (
                      <button
                        key={`tr-community-${pl.id}`}
                        onClick={() => openYTPl(pl)}
                        className="text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition p-4"
                      >
                        <p className="text-sm font-bold truncate">{pl.title}</p>
                        <p className="text-xs text-white/55 mt-1">{pl.itemCount} songs</p>
                      </button>
                    ))}
                  </div>
                ) : <SongCardLoader count={8} />}
              </section>
            </div>
          )}
          {view === 'search' && !query.trim() && (
            <div className="p-6 space-y-10">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['New releases', 'Charts', 'Moods & genres', 'Podcasts'].map((chip) => (
                  <button key={chip} onClick={() => handleExploreChipClick(chip)} className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-3 text-sm font-bold text-left">
                    {chip}
                  </button>
                ))}
              </div>

              <section ref={exploreNewReleasesRef}>
                <h2 className="text-4xl font-black tracking-tight mb-4">New albums & singles</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {(latestSongs.length ? latestSongs : trending).slice(0, 12).map((v, i) => (
                    <button key={`exp-release-${v.videoId}`} onClick={() => playSongFromList((latestSongs.length ? latestSongs : trending).slice(0, 12), i)} className="text-left">
                      <img src={v.thumbnailHigh || v.thumbnail} alt={v.title} className="w-full aspect-square object-cover rounded-xl mb-2" />
                      <p className="text-sm font-bold truncate">{v.title}</p>
                      <p className="text-xs text-white/60 truncate">{v.channelTitle}</p>
                    </button>
                  ))}
                </div>
              </section>

              <section ref={exploreMoodsRef}>
                <h2 className="text-4xl font-black tracking-tight mb-4">Moods & genres</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {moodsGenres.map((mood) => (
                    <button key={mood} onClick={() => doSearch(mood)} className="rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-sm font-semibold text-left">
                      {mood}
                    </button>
                  ))}
                </div>
              </section>

              <section ref={explorePodcastsRef}>
                <h2 className="text-4xl font-black tracking-tight mb-4">Popular episodes</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {popularEpisodes.slice(0, 9).map((v, i) => (
                    <button key={`exp-ep-${v.videoId}`} onClick={() => playSongFromList(popularEpisodes, i)} className="grid grid-cols-[120px_1fr] gap-3 items-center text-left rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-2">
                      <img src={v.thumbnail} alt={v.title} className="w-[120px] h-[68px] object-cover rounded-lg" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{v.title}</p>
                        <p className="text-xs text-white/60 truncate">{v.channelTitle}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section ref={exploreTrendingRef}>
                <h2 className="text-4xl font-black tracking-tight mb-4">Trending</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {charts.slice(0, 12).map((v, i) => (
                    <button key={`exp-trend-${v.videoId}`} onClick={() => playSongFromList(charts, i)} className="grid grid-cols-[24px_52px_1fr] gap-3 items-center text-left rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-2">
                      <span className="text-sm font-black text-white/70">{i + 1}</span>
                      <img src={v.thumbnail} alt={v.title} className="w-12 h-12 object-cover rounded-lg" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{v.title}</p>
                        <p className="text-xs text-white/60 truncate">{v.channelTitle}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-4xl font-black tracking-tight mb-4">New music videos</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {newMusicVideos.slice(0, 8).map((v, i) => (
                    <button key={`exp-new-video-${v.videoId}`} onClick={() => playSongFromList(newMusicVideos, i)} className="text-left">
                      <img src={v.thumbnailHigh || v.thumbnail} alt={v.title} className="w-full aspect-video object-cover rounded-xl mb-2" />
                      <p className="text-sm font-bold truncate">{v.title}</p>
                      <p className="text-xs text-white/60 truncate">{v.channelTitle}</p>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
          {view === 'search' && query.trim() && (<div className="p-6"><div className="flex gap-4 mb-8"><button onClick={() => setStab('v')} className={`px-6 py-2 rounded-full text-xs font-black transition ${stab === 'v' ? 'bg-white text-black' : 'bg-white/5 text-white/40'}`}>Songs</button><button onClick={() => setStab('p')} className={`px-6 py-2 rounded-full text-xs font-black transition ${stab === 'p' ? 'bg-white text-black' : 'bg-white/5 text-white/40'}`}>Playlists</button></div>{loading ? <Spin /> : stab === 'v' ? (<div className="space-y-1">{srVids.map((v, i) => (<div key={v.videoId + i} onClick={() => playSongFromList(srVids, i)} className={`grid grid-cols-[40px_1fr_1fr_140px] gap-4 items-center px-4 py-3 rounded-xl cursor-pointer group transition duration-200 ${currentTrackId === v.videoId ? 'bg-white/10 shadow-md border border-white/5' : 'hover:bg-white/5 border border-transparent'}`}><div className="flex items-center justify-center">{currentTrackId === v.videoId && playing ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <span className="text-xs font-black text-white/20 group-hover:hidden">{i + 1}</span>}<svg className="hidden group-hover:block" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></div><div className="flex items-center gap-4 min-w-0"><div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 shadow-md">{v.thumbnail ? <img src={v.thumbnail} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full" style={{ background: grad(v.videoId) }} />}</div><div className="min-w-0"><div className={`text-sm font-bold truncate ${currentTrackId === v.videoId ? 'text-red-400' : 'text-white'}`}>{v.title}</div><div className="text-[10px] font-bold text-white/30 tracking-wider uppercase truncate">{v.channelTitle}</div></div></div><div className="text-xs font-medium text-white/30 truncate hidden md:block">{v.channelTitle}</div><div className="flex items-center justify-end gap-3" onClick={e => e.stopPropagation()}><button onClick={() => handleLike(v)} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-500 transition"><Hart on={likedSet.has(v.videoId)} sz={16} /></button><button onClick={() => setA2pTarget(v)} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white transition"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" /></svg></button><span className="text-[10px] font-mono font-bold text-white/20 w-10 text-right">{v.durationFormatted}</span></div></div>))}</div>) : (<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">{srPls.map(p => (<div key={p.id} className="group bg-white/5 p-4 rounded-2xl hover:bg-white/10 transition cursor-pointer" onClick={() => openYTPl(p)}><div className="aspect-square relative overflow-hidden rounded-xl mb-4 shadow-xl">{p.thumbnail ? <img src={p.thumbnailHigh || p.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition duration-700" alt="" /> : <div className="w-full h-full" style={{ background: grad(p.id) }} />}<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition"><div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-xl"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></div></div><div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{p.itemCount} SONGS</div></div><h3 className="text-sm font-bold truncate mb-1 uppercase tracking-tighter italic">{p.title}</h3><p className="text-[10px] font-black text-white/30 tracking-widest uppercase truncate">{p.channelTitle}</p></div>))}</div>)}</div>)}
          {view === 'playlist' && (<div><div className="relative p-8 pt-16 flex items-end gap-8 overflow-hidden"><div className="absolute inset-0 -z-10" style={{ background: curPlGrad }} /><div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/20 to-[#121212]" /><div className="w-48 h-48 bg-white/5 rounded-xl shadow-2xl flex items-center justify-center text-8xl flex-shrink-0 overflow-hidden">{showLiked ? '❤️' : viewUPL ? '🎵' : ytPl?.thumbnailHigh ? <img src={ytPl.thumbnailHigh} className="w-full h-full object-cover" alt="" /> : '📀'}</div><div><p className="text-sm font-bold uppercase tracking-widest text-white/70 mb-2">{showLiked ? 'Collection' : 'Playlist'}</p><h1 className="text-4xl md:text-7xl font-black mb-4 line-clamp-2 uppercase italic tracking-tighter">{curPlTitle}</h1><p className="text-sm font-bold text-white/60">{curPlSongs.length} songs</p></div></div><div className="p-8"><button onClick={() => { if (curPlSongs.length) playAll(curPlSongs); }} className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center mb-8 shadow-xl hover:scale-105 transition"><svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg></button>{loadPl ? <Spin /> : <div className="space-y-1">{curPlSongs.map((v, i) => (<div key={v.videoId + i} onClick={() => playSongFromList(curPlSongs, i)} className={`grid grid-cols-[40px_1fr_1fr_140px] gap-4 items-center px-4 py-3 rounded-xl cursor-pointer group transition duration-200 ${currentTrackId === v.videoId ? 'bg-white/10 shadow-md border border-white/5' : 'hover:bg-white/5 border border-transparent'}`}><div className="flex items-center justify-center">{currentTrackId === v.videoId && playing ? <div className="flex items-end gap-0.5 h-4"><span className="w-[2.5px] bg-red-500 rounded-full h-[40%] animate-pulse" /><span className="w-[2.5px] bg-red-500 rounded-full h-[90%] animate-pulse" /><span className="w-[2.5px] bg-red-500 rounded-full h-[60%] animate-pulse" /></div> : <span className="text-xs font-black text-white/20 group-hover:hidden">{i + 1}</span>}<svg className="hidden group-hover:block" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></div><div className="flex items-center gap-4 min-w-0"><div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 shadow-md">{v.thumbnail ? <img src={v.thumbnail} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full" style={{ background: grad(v.videoId) }} />}</div><div className="min-w-0"><div className={`text-sm font-bold truncate ${currentTrackId === v.videoId ? 'text-red-400' : 'text-white'}`}>{v.title}</div><div className="text-[10px] font-bold text-white/30 tracking-wider uppercase truncate">{v.channelTitle}</div></div></div><div className="text-xs font-medium text-white/30 truncate hidden md:block">{v.channelTitle}</div><div className="flex items-center justify-end gap-3" onClick={e => e.stopPropagation()}><button onClick={() => handleLike(v)} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-500 transition"><Hart on={likedSet.has(v.videoId)} sz={16} /></button><button onClick={() => setA2pTarget(v)} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white transition"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" /></svg></button>{viewUPL && <button onClick={() => handleRemoveFromPl(viewUPL.id, v.videoId)} className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-500 transition text-sm">✕</button>}<span className="text-[10px] font-mono font-bold text-white/20 w-10 text-right">{v.durationFormatted}</span></div></div>))}</div>}</div></div>)}
          <div id="sentinel" className="h-4 w-full" />{loadMore && <Spin />}
        </main>
      </div>

      <footer className="fixed bottom-3 left-3 right-3 z-50 pb-safe">
        <div className="glass-player mx-auto max-w-[2000px] rounded-2xl border border-white/15 bg-white/10 px-4 py-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 w-full text-[10px] font-mono text-white/55 mb-2">
            <span className="w-10 text-right">{fmtTime(time)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(dur, 1)}
              step={0.1}
              value={Math.min(time, Math.max(dur, 1))}
              disabled={!currentTrack || !player.isReady}
              onChange={(e) => {
                const nextTime = Number(e.target.value);
                setTime(nextTime);
                player.seekTo(nextTime);
              }}
              className="seek-slider w-full"
              style={{ background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${seekPct}%, rgba(255,255,255,0.18) ${seekPct}%, rgba(255,255,255,0.18) 100%)` }}
            />
            <span className="w-10">{fmtTime(dur)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-1/3 min-w-0">
              {currentTrack ? <>
                <button onClick={openNowPlayingSidebar} className="flex items-center gap-3 min-w-0 text-left hover:opacity-90 transition">
                  <div className="w-14 h-14 rounded-lg overflow-hidden relative flex-shrink-0">
                    {currentTrack.thumbnail ? <img src={currentTrack.thumbnail} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full" style={{ background: grad(currentTrack.videoId) }} />}
                    {playing && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="flex items-end gap-0.5 h-4"><span className="w-[2.5px] bg-red-500 rounded-full h-[40%] animate-pulse" /><span className="w-[2.5px] bg-red-500 rounded-full h-[90%] animate-pulse" /><span className="w-[2.5px] bg-red-500 rounded-full h-[60%] animate-pulse" /></div></div>}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate flex items-center gap-2">
                      {currentTrack.title}
                      {completedSet.has(currentTrack.videoId) && <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/90 uppercase tracking-wider">Played</span>}
                    </div>
                    <div className="text-xs text-white/50 truncate">{currentTrack.channelTitle}</div>
                  </div>
                </button>
                <button onClick={() => handleLike(currentTrack)} className="flex-shrink-0 ml-2 text-white/40 hover:text-white transition"><Hart on={likedSet.has(currentTrack.videoId)} sz={20} /></button>
              </> : <span className="text-sm text-white/20 font-bold uppercase tracking-widest italic">No music selected</span>}
            </div>
            <div className="flex items-center gap-6 flex-1 justify-center">
              <button onClick={() => setShuf(!shuf)} className={shuf ? 'text-red-500' : 'text-white/40 hover:text-white'}><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" /></svg></button>
              <button onClick={goPrev} className="text-white/80 hover:text-white transition"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg></button>
              <button onClick={togglePlayback} disabled={!player.isReady || !currentTrack} className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg">{playing ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}</button>
              <button onClick={() => (goNext as any)(false)} className="text-white/80 hover:text-white transition"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z" /></svg></button>
              <button onClick={() => setRep(r => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')} className={`relative ${rep !== 'off' ? 'text-red-500' : 'text-white/40 hover:text-white'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" /></svg>{rep === 'one' && <span className="absolute -top-1 -right-1 text-[8px] font-bold">1</span>}</button>
            </div>
            <div className="flex items-center justify-end gap-3 w-1/3">
              <button onClick={handleCast} disabled={!currentTrack} className="w-9 h-9 rounded-full bg-white/15 border border-white/20 text-white hover:bg-red-500/80 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center" title="Cast / Share">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M1 18h2c0-2.76-2.24-5-5-5v2c1.66 0 3 1.34 3 3zm0-4h2c0-4.42-3.58-8-8-8v2c3.31 0 6 2.69 6 6zm0-8v2c4.97 0 9 4.03 9 9h2c0-6.08-4.92-11-11-11zm20-3H3c-1.1 0-2 .9-2 2v6h2V5h18v14h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" /></svg>
              </button>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-white/40"><path d="M7 9v6h4l5 5V4l-5 5H7zm9.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" /></svg>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.max(0, Math.min(100, vol))}
                onChange={(e) => setVol(Number(e.target.value))}
                className="volume-slider w-28"
                style={{ background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${volPct}%, rgba(255,255,255,0.18) ${volPct}%, rgba(255,255,255,0.18) 100%)` }}
              />
            </div>
          </div>
        </div>
      </footer>

      {showNowPlayingSidebar && currentTrack && (
        <>
          <div className="fixed inset-0 z-[103] bg-black/55 backdrop-blur-[2px] cursor-pointer" onClick={() => setShowNowPlayingSidebar(false)} />
          <aside className="fixed right-0 top-0 h-full w-full sm:w-[420px] lg:w-[460px] z-[104] bg-[linear-gradient(160deg,rgba(255,255,255,0.18),rgba(255,255,255,0.06))] border-l border-white/15 shadow-[0_20px_80px_rgba(0,0,0,0.65)] backdrop-blur-2xl flex flex-col animate-slide-in-right">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-white/10">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">Now playing</p>
                <h3 className="text-base font-bold truncate">{currentTrack.title}</h3>
              </div>
              <button
                onClick={() => setShowNowPlayingSidebar(false)}
                className="shrink-0 mr-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold uppercase tracking-wide whitespace-nowrap"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.3 5.71L12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.3-6.3z" />
                </svg>
                Close
              </button>
            </div>
            <div className="p-4 sm:p-5 overflow-y-auto cscr space-y-4 flex-1">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
                {!isCurrentVideoUnavailable ? (
                  <iframe
                    key={`${currentTrack.videoId}-${playing ? 'play' : 'pause'}-${sidebarSyncTime}`}
                    title={`Now playing ${currentTrack.title}`}
                    src={`https://www.youtube.com/embed/${currentTrack.videoId}?autoplay=${playing ? 1 : 0}&start=${sidebarSyncTime}&mute=1&rel=0&controls=0&modestbranding=1&iv_load_policy=3&disablekb=1&playsinline=1`}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    className="w-full aspect-video rounded-lg mb-3"
                  />
                ) : (
                  <img src={currentTrack.thumbnailHigh || currentTrack.thumbnail} alt={currentTrack.title} className="w-full aspect-video object-cover rounded-lg mb-3" />
                )}
                <p className="text-sm font-bold">{currentTrack.title}</p>
                <p className="text-xs text-white/60 mt-1">{currentTrack.channelTitle}</p>
                <p className="text-xs text-white/45 mt-1">{currentTrack.durationFormatted}</p>
                {isCurrentVideoUnavailable && (
                  <p className="text-xs text-yellow-300/90 mt-3">Current video unavailable. Showing YouTube API template recommendations below.</p>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/55 mb-2">Recommended videos</p>
                {recommendedLoading ? <SongCardLoader count={4} /> : (
                  <div className="space-y-2">
                    {recommendedSongs.length ? recommendedSongs.map((v, i) => (
                      <button key={`recommended-${v.videoId}`} onClick={() => { playSongFromList(recommendedSongs, i); setShowNowPlayingSidebar(false); }} className="w-full text-left grid grid-cols-[52px_1fr] gap-2 items-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 p-2 transition">
                        <img src={v.thumbnail} alt={v.title} className="w-12 h-12 rounded-md object-cover" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{v.title}</p>
                          <p className="text-[10px] text-white/55 truncate">{v.channelTitle}</p>
                        </div>
                      </button>
                    )) : <p className="text-xs text-white/55">No recommendations found.</p>}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-pointer" onClick={() => setShowCreate(false)}>
          <div className="bg-[#222] rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-white/5 cursor-pointer" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-6 uppercase tracking-widest italic">Create Playlist</h3>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Playlist Name" autoFocus onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') handleCreatePl(); }} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500 mb-4 transition" />
            <div className="mb-6">
              <p className="text-xs uppercase tracking-widest text-white/50 font-bold">Visibility</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setNewVisibility('private')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${newVisibility === 'private' ? 'bg-white text-black' : 'bg-white/5 text-white/60'}`}>Private</button>
                <button onClick={() => setNewVisibility('public')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${newVisibility === 'public' ? 'bg-white text-black' : 'bg-white/5 text-white/60'}`}>Public</button>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-3 rounded-full font-bold hover:bg-white/5 transition text-sm">Cancel</button>
              <button onClick={handleCreatePl} disabled={!newName.trim()} className="flex-1 py-3 rounded-full bg-red-600 font-bold hover:bg-red-700 disabled:opacity-30 transition text-sm shadow-xl">Create</button>
            </div>
          </div>
        </div>
      )}
      {editPl && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-pointer" onClick={() => setEditPl(null)}>
          <div className="bg-[#222] rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-white/5 cursor-pointer" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-6 uppercase tracking-widest italic">Edit Playlist</h3>
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Playlist Name" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500 mb-4 transition" />
            <div className="mb-6">
              <p className="text-xs uppercase tracking-widest text-white/50 font-bold">Visibility</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setEditVisibility('private')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${editVisibility === 'private' ? 'bg-white text-black' : 'bg-white/5 text-white/60'}`}>Private</button>
                <button onClick={() => setEditVisibility('public')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${editVisibility === 'public' ? 'bg-white text-black' : 'bg-white/5 text-white/60'}`}>Public</button>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditPl(null)} className="flex-1 py-3 rounded-full font-bold hover:bg-white/5 transition text-sm">Cancel</button>
              <button onClick={handleEditPl} disabled={!editName.trim()} className="flex-1 py-3 rounded-full bg-red-600 font-bold hover:bg-red-700 disabled:opacity-30 transition text-sm shadow-xl">Save</button>
            </div>
          </div>
        </div>
      )}
      {artistPanel && (
        <div className="fixed inset-0 z-[103] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-pointer" onClick={() => setArtistPanel(null)}>
          <div className="bg-[#222] rounded-2xl p-6 w-full max-w-2xl shadow-2xl border border-white/10 max-h-[80vh] overflow-hidden flex flex-col cursor-pointer" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/50">Artist section</p>
                <h3 className="text-xl font-bold text-white truncate">{artistPanel.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { if (artistPanel.songs.length) playAll(artistPanel.songs); }}
                  className="px-4 py-2 rounded-full bg-white text-black text-xs font-black uppercase tracking-wide disabled:opacity-50"
                  disabled={!artistPanel.songs.length}
                >
                  Play all
                </button>
                <button onClick={() => setArtistPanel(null)} className="px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold uppercase tracking-wide">Close</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto cscr pr-1">
              {artistPanel.loading ? <Spin /> : (
                artistPanel.songs.length ? (
                  <div className="space-y-1">
                    {artistPanel.songs.map((song, i) => (
                      <button
                        key={song.videoId + i}
                        onClick={() => playSongFromList(artistPanel.songs, i)}
                        className="w-full grid grid-cols-[52px_1fr_auto] items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/8 text-left"
                      >
                        <img src={song.thumbnail} alt={song.title} className="w-12 h-12 rounded-lg object-cover" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{song.title}</p>
                          <p className="text-xs text-white/55 truncate">{song.channelTitle}</p>
                        </div>
                        <span className="text-[10px] text-white/55 font-mono">{song.durationFormatted}</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="text-sm text-white/60 py-6 text-center">No songs found for this artist.</p>
              )}
            </div>
          </div>
        </div>
      )}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[102] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-pointer" onClick={() => setShowLogoutConfirm(false)}>
          <div className="bg-[#222] rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-white/5 cursor-pointer" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-3 uppercase tracking-widest italic">Confirm Logout</h3>
            <p className="text-sm text-white/60 mb-6">Are you sure you want to logout from this account?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-3 rounded-full font-bold hover:bg-white/5 transition text-sm">Cancel</button>
              <button onClick={() => { logout(); setShowLogoutConfirm(false); }} className="flex-1 py-3 rounded-full bg-red-600 font-bold hover:bg-red-700 transition text-sm shadow-xl">Logout</button>
            </div>
          </div>
        </div>
      )}
      {a2pTarget && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-pointer" onClick={() => setA2pTarget(null)}><div className="bg-[#222] rounded-2xl p-6 w-full max-w-sm shadow-2xl flex flex-col max-h-[70vh] border border-white/5 cursor-pointer" onClick={e => e.stopPropagation()}><h3 className="text-xl font-bold mb-4 uppercase tracking-widest italic">Add to Playlist</h3><button onClick={() => { setA2pTarget(null); setShowCreate(true); }} className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-white/10 text-white/40 hover:text-white mb-4 transition"><span className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-xl">+</span><span className="text-sm font-bold">New Playlist</span></button><div className="flex-1 overflow-y-auto cscr space-y-1">{userPls.map(p => (<button key={p.id} onClick={() => handleAddToPl(p.id, a2pTarget)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition text-left"><div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold" style={{ background: grad(p.id) }}>♪</div><div className="min-w-0 flex-1"><div className="text-sm font-bold truncate">{p.name}</div><div className="text-xs opacity-50">{p.songs.length} songs</div></div></button>))}</div><button onClick={() => setA2pTarget(null)} className="mt-4 py-3 rounded-xl bg-white/5 font-bold hover:bg-white/10 transition text-sm">Close</button></div></div>)}
      <div className="fixed bottom-24 right-4 flex flex-col gap-2 z-[110] pointer-events-none">{toasts.map(t => <div key={t.id} className="bg-red-600 text-white text-[10px] font-black py-2 px-4 rounded-full shadow-2xl animate-slide-up uppercase tracking-widest">{t.msg}</div>)}</div>
      <div id="yt-player-hidden" className="fixed -left-[9999px] top-0 w-0 h-0 opacity-0 pointer-events-none" />
      <style>{`button{cursor:pointer}.cscr::-webkit-scrollbar{width:6px}.cscr::-webkit-scrollbar-track{background:transparent}.cscr::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:9px} .line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden} .animate-slide-up{animation:su .3s ease-out} .animate-slide-in-right{animation:sir .28s ease-out} .glass-player{background:linear-gradient(120deg,rgba(255,255,255,.20),rgba(255,255,255,.11));box-shadow:0 24px 70px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.25)} .seek-slider,.volume-slider{-webkit-appearance:none;appearance:none;height:6px;border-radius:999px;background:rgba(255,255,255,.24);outline:none;cursor:pointer} .seek-slider::-webkit-slider-thumb,.volume-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #ef4444;box-shadow:0 2px 10px rgba(0,0,0,.4)} .seek-slider::-moz-range-thumb,.volume-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #ef4444} .seek-slider:disabled{opacity:.4;cursor:not-allowed} .animate-card-in{animation:cardIn .45s ease both} .shimmer{background:linear-gradient(90deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,.16) 50%,rgba(255,255,255,.06) 100%);background-size:200% 100%;animation:sh 1.4s infinite} @keyframes su{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}} @keyframes sir{from{opacity:0;transform:translateX(22px)}to{opacity:1;transform:translateX(0)}} @keyframes cardIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}} @keyframes sh{from{background-position:200% 0}to{background-position:-200% 0}}`}</style>
    </div>
  );
}

