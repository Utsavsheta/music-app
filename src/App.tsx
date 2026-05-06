import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import type { YTVideo, YTPlaylist, RepeatMode, ViewMode } from './types';
import { searchVideos, searchPlaylists, fetchPlaylistItems, fetchTrendingMusic, fetchPopularPlaylists } from './api/youtube';
import { useYouTubePlayer } from './hooks/useYouTubePlayer';
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
  const [view, setView] = useState<ViewMode>('home');
  const [query, setQuery] = useState('');
  const [stab, setStab] = useState<'v' | 'p'>('v');
  const [collapsed, setCollapsed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [showLiked, setShowLiked] = useState(false);
  const [a2pTarget, setA2pTarget] = useState<YTVideo | null>(null);
  const [viewUPL, setViewUPL] = useState<DB.UserPlaylist | null>(null);
  const [trending, setTrending] = useState<YTVideo[]>([]);
  const [popPls, setPopPls] = useState<YTPlaylist[]>([]);
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
  const seekPct = dur > 0 ? Math.min(100, Math.max(0, (time / dur) * 100)) : 0;
  const volPct = Math.min(100, Math.max(0, vol));
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
    toast(`Playback error (${code})`);
    (goNext as any)(false);
  });
 
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
      const [l, p] = await Promise.all([DB.fetchLikedSongs(), DB.fetchPlaylists()]);
      setLikedSongs(l); setUserPls(p);
      setLoading(true);
      try {
        const [t, pl] = await Promise.all([fetchTrendingMusic(12), fetchPopularPlaylists()]);
        setTrending(t.videos); setTkTrend(t.nextPageToken); setPopPls(pl);
      } catch (err: any) {
        if (err.message === 'ADD_MORE_TOKENS') toast('Error: Add more API key tokens');
        else toast('Load failed');
      }
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
 
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
    } catch (err: any) {
      if (err.message === 'ADD_MORE_TOKENS') toast('Error: Add more API key tokens');
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
    const up = await DB.toggleLike(v); setLikedSongs(up); toast(up.some(s => s.videoId === v.videoId) ? 'Liked ❤️' : 'Removed');
  };
  const handleCreatePl = async () => {
    if (!newName.trim()) return;
    await DB.createPlaylist(newName.trim()); setUserPls(await DB.fetchPlaylists());
    setNewName(''); setShowCreate(false); toast('Created');
  };
  const handleAddToPl = async (plId: string, v: YTVideo) => {
    const up = await DB.addSongToPlaylist(plId, v);
    setUserPls(up); setA2pTarget(null); toast('Added');
    if (viewUPL?.id === plId) setViewUPL(up.find(p => p.id === plId) || null);
  };
  const handleRemoveFromPl = async (plId: string, vId: string) => {
    const up = await DB.removeSongFromPlaylist(plId, vId);
    setUserPls(up); if (viewUPL?.id === plId) setViewUPL(up.find(p => p.id === plId) || null);
  };
 
  const navHome = () => { setView('home'); setShowLiked(false); setYtPl(null); setViewUPL(null); setQuery(''); };
  const navLiked = () => { setShowLiked(true); setView('playlist'); setYtPl(null); setViewUPL(null); };
  const navUPL = (pl: DB.UserPlaylist) => { setViewUPL(pl); setView('playlist'); setYtPl(null); setShowLiked(false); };
 
  const doSearch = (q: string) => {
    setQuery(q); setView('search'); setLoading(true);
    setTimeout(async () => {
      try { const [v, p] = await Promise.all([searchVideos(q, 12), searchPlaylists(q, 8)]); setSrVids(v.videos); setTkSrV(v.nextPageToken); setSrPls(p.playlists); setTkSrP(p.nextPageToken); }
      catch (err: any) { if (err.message === 'ADD_MORE_TOKENS') toast('Error: Add more API key tokens'); else toast('Search failed'); }
      setLoading(false);
    }, 500);
  };
 
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
 
  const openYTPl = async (pl: YTPlaylist) => {
    setYtPl(pl); setView('playlist'); setShowLiked(false); setViewUPL(null); setLoadPl(true);
    try {
      const r = await fetchPlaylistItems(pl.id, 20);
      setPlVids(r.videos); setTkPl(r.nextPageToken);
    } catch { toast('Fail'); }
    setLoadPl(false);
  };
 
  const curPlSongs = showLiked ? likedSongs : viewUPL ? (viewUPL.songs || []) : plVids;
  const curPlTitle = showLiked ? 'Liked Songs' : viewUPL ? viewUPL.name : ytPl?.title || '';
  const curPlGrad = showLiked ? '#e74' : grad(viewUPL?.id || ytPl?.id || 'x');
 
  return (
    <div className="flex h-screen bg-[#121212] text-white font-sans select-none overflow-hidden relative">
      <aside className={`${collapsed ? 'w-[72px]' : 'w-[280px]'} bg-black flex flex-col transition-all border-r border-white/5`}>
        <div className="p-6 flex items-center gap-3"><div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center shadow-lg flex-shrink-0"><svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z" /></svg></div>{!collapsed && <span className="text-xl font-black italic tracking-tighter uppercase">Music</span>}</div>
        <nav className="flex flex-col gap-1 px-2">
          <SBtn on={view === 'home' && !showLiked && !viewUPL} click={navHome} ico={<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />} label={collapsed ? '' : 'Home'} />
          <SBtn on={view === 'search'} click={() => { setView('search'); setShowLiked(false); setViewUPL(null); }} ico={<path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />} label={collapsed ? '' : 'Explore'} />
          <button onClick={navLiked} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition ${showLiked ? 'bg-red-500/20 text-red-400' : 'text-white/40 hover:text-white'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>{!collapsed && <span className="flex-1 flex justify-between">Liked <span className="opacity-40">{likedSongs.length}</span></span>}</button>
        </nav>
        {!collapsed && (
          <div className="mt-6 flex-1 flex flex-col border-t border-white/5 overflow-hidden">
            <div className="px-5 py-3 flex items-center justify-between"><span className="text-xs font-bold text-white/40 uppercase tracking-widest">Playlists</span><button onClick={() => setShowCreate(true)} className="text-white/40 hover:text-white text-xl leading-none">+</button></div>
            <div className="flex-1 overflow-y-auto cscr px-2 pb-4 space-y-0.5">{userPls.map(p => (<div key={p.id} className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition ${viewUPL?.id === p.id ? 'bg-white/10 text-white shadow-sm' : 'text-white/60 hover:bg-white/5'}`}><button onClick={() => navUPL(p)} className="flex-1 text-left text-sm truncate">♪ {p.name}</button><button onClick={(e) => { e.stopPropagation(); DB.deletePlaylist(p.id).then(u => setUserPls(u)); if (viewUPL?.id === p.id) navHome(); }} className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-500 transition text-xs">✕</button></div>))}</div>
          </div>
        )}
        <button onClick={() => setCollapsed(s => !s)} className="p-4 text-xs text-white/30 hover:text-white/60 text-center">{collapsed ? '→' : '← Collapse'}</button>
      </aside>
 
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center gap-4 px-6 py-3 bg-black/40 backdrop-blur-md border-b border-white/5 flex-shrink-0 z-10"><div className="flex-1 max-w-xl relative"><input type="text" placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { (e.target as any).blur(); doSearch((e.target as any).value); } }} className="w-full bg-white/5 hover:bg-white/10 focus:bg-white/15 text-white rounded-full px-5 py-2 text-sm outline-none transition border border-transparent focus:border-white/10" /></div>{player.isReady ? <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-1 rounded">READY</span> : <Spin />}</header>
        <main className="flex-1 overflow-y-auto cscr pb-32">
          {view === 'home' && !showLiked && !viewUPL && (<div className="p-6"><h1 className="text-3xl font-black mb-8 italic uppercase tracking-tighter">Home</h1>{loading && !trending.length && <SongCardLoader count={12} />}<section className="mb-12"><h2 className="text-xl font-bold mb-4 flex justify-between">Trending <button onClick={() => { if (trending.length) playAll(trending); }} className="text-xs bg-white text-black px-4 py-1.5 rounded-full font-bold uppercase tracking-widest">Play All</button></h2><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">{trending.map((v, i) => (<div key={v.videoId} className={`group bg-white/5 p-3 rounded-2xl hover:bg-white/10 transition cursor-pointer animate-card-in ${completedSet.has(v.videoId) ? 'ring-1 ring-emerald-400/40' : ''}`} onClick={() => playSongFromList(trending, i)}><div className="aspect-square relative overflow-hidden rounded-xl mb-4 shadow-lg">{v.thumbnail ? <img src={v.thumbnailHigh || v.thumbnail} className="w-full h-full object-cover group-hover:scale-110 transition duration-500" alt="" /> : <div className="w-full h-full" style={{ background: grad(v.videoId) }} />}<div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center"><div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition shadow-xl">{playing && currentTrackId === v.videoId ? <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg> : <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}</div></div><span className="absolute bottom-2 right-2 bg-black/80 text-[10px] font-black px-1.5 py-0.5 rounded-md">{v.durationFormatted}</span>{completedSet.has(v.videoId) && <span className="absolute top-2 left-2 bg-emerald-500/90 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Played</span>}</div><div className="min-w-0 relative"><h3 className="text-sm font-bold truncate pr-6 mb-1">{v.title}</h3><p className="text-xs text-white/40 truncate">{v.channelTitle}</p><div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 flex flex-col gap-2 transition"><button onClick={e => { e.stopPropagation(); handleLike(v); }} className="text-white hover:text-red-500"><Hart on={likedSet.has(v.videoId)} sz={16} /></button><button onClick={e => { e.stopPropagation(); setA2pTarget(v); }} className="text-white/40 hover:text-white"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" /></svg></button></div></div></div>))}</div></section><section><h2 className="text-xl font-bold mb-4">Popular Playlists</h2><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">{popPls.map(p => (<div key={p.id} className="group bg-white/5 p-4 rounded-2xl hover:bg-white/10 transition cursor-pointer animate-card-in" onClick={() => openYTPl(p)}><div className="aspect-square relative overflow-hidden rounded-xl mb-4 shadow-xl">{p.thumbnail ? <img src={p.thumbnailHigh || p.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition duration-700" alt="" /> : <div className="w-full h-full" style={{ background: grad(p.id) }} />}<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition"><div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-xl"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></div></div><div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{p.itemCount} SONGS</div></div><h3 className="text-sm font-bold truncate mb-1 uppercase tracking-tighter italic">{p.title}</h3><p className="text-[10px] font-black text-white/30 tracking-widest uppercase truncate">{p.channelTitle}</p></div>))}</div></section></div>)}
          {view === 'search' && (<div className="p-6"><div className="flex gap-4 mb-8"><button onClick={() => setStab('v')} className={`px-6 py-2 rounded-full text-xs font-black transition ${stab === 'v' ? 'bg-white text-black' : 'bg-white/5 text-white/40'}`}>Songs</button><button onClick={() => setStab('p')} className={`px-6 py-2 rounded-full text-xs font-black transition ${stab === 'p' ? 'bg-white text-black' : 'bg-white/5 text-white/40'}`}>Playlists</button></div>{loading ? <Spin /> : stab === 'v' ? (<div className="space-y-1">{srVids.map((v, i) => (<div key={v.videoId + i} onClick={() => playSongFromList(srVids, i)} className={`grid grid-cols-[40px_1fr_1fr_140px] gap-4 items-center px-4 py-3 rounded-xl cursor-pointer group transition duration-200 ${currentTrackId === v.videoId ? 'bg-white/10 shadow-md border border-white/5' : 'hover:bg-white/5 border border-transparent'}`}><div className="flex items-center justify-center">{currentTrackId === v.videoId && playing ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <span className="text-xs font-black text-white/20 group-hover:hidden">{i + 1}</span>}<svg className="hidden group-hover:block" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></div><div className="flex items-center gap-4 min-w-0"><div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 shadow-md">{v.thumbnail ? <img src={v.thumbnail} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full" style={{ background: grad(v.videoId) }} />}</div><div className="min-w-0"><div className={`text-sm font-bold truncate ${currentTrackId === v.videoId ? 'text-red-400' : 'text-white'}`}>{v.title}</div><div className="text-[10px] font-bold text-white/30 tracking-wider uppercase truncate">{v.channelTitle}</div></div></div><div className="text-xs font-medium text-white/30 truncate hidden md:block">{v.channelTitle}</div><div className="flex items-center justify-end gap-3" onClick={e => e.stopPropagation()}><button onClick={() => handleLike(v)} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-500 transition"><Hart on={likedSet.has(v.videoId)} sz={16} /></button><button onClick={() => setA2pTarget(v)} className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white transition"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" /></svg></button><span className="text-[10px] font-mono font-bold text-white/20 w-10 text-right">{v.durationFormatted}</span></div></div>))}</div>) : (<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">{srPls.map(p => (<div key={p.id} className="group bg-white/5 p-4 rounded-2xl hover:bg-white/10 transition cursor-pointer" onClick={() => openYTPl(p)}><div className="aspect-square relative overflow-hidden rounded-xl mb-4 shadow-xl">{p.thumbnail ? <img src={p.thumbnailHigh || p.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition duration-700" alt="" /> : <div className="w-full h-full" style={{ background: grad(p.id) }} />}<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition"><div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-xl"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></div></div><div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{p.itemCount} SONGS</div></div><h3 className="text-sm font-bold truncate mb-1 uppercase tracking-tighter italic">{p.title}</h3><p className="text-[10px] font-black text-white/30 tracking-widest uppercase truncate">{p.channelTitle}</p></div>))}</div>)}</div>)}
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
 
      {showCreate && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowCreate(false)}><div className="bg-[#222] rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-white/5" onClick={e => e.stopPropagation()}><h3 className="text-xl font-bold mb-6 uppercase tracking-widest italic">Create Playlist</h3><input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Playlist Name" autoFocus onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') handleCreatePl(); }} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500 mb-6 transition" /><div className="flex gap-3"><button onClick={() => setShowCreate(false)} className="flex-1 py-3 rounded-full font-bold hover:bg-white/5 transition text-sm">Cancel</button><button onClick={handleCreatePl} disabled={!newName.trim()} className="flex-1 py-3 rounded-full bg-red-600 font-bold hover:bg-red-700 disabled:opacity-30 transition text-sm shadow-xl">Create</button></div></div></div>)}
      {a2pTarget && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setA2pTarget(null)}><div className="bg-[#222] rounded-2xl p-6 w-full max-w-sm shadow-2xl flex flex-col max-h-[70vh] border border-white/5" onClick={e => e.stopPropagation()}><h3 className="text-xl font-bold mb-4 uppercase tracking-widest italic">Add to Playlist</h3><button onClick={() => { setA2pTarget(null); setShowCreate(true); }} className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-white/10 text-white/40 hover:text-white mb-4 transition"><span className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-xl">+</span><span className="text-sm font-bold">New Playlist</span></button><div className="flex-1 overflow-y-auto cscr space-y-1">{userPls.map(p => (<button key={p.id} onClick={() => handleAddToPl(p.id, a2pTarget)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition text-left"><div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold" style={{ background: grad(p.id) }}>♪</div><div className="min-w-0 flex-1"><div className="text-sm font-bold truncate">{p.name}</div><div className="text-xs opacity-50">{p.songs.length} songs</div></div></button>))}</div><button onClick={() => setA2pTarget(null)} className="mt-4 py-3 rounded-xl bg-white/5 font-bold hover:bg-white/10 transition text-sm">Close</button></div></div>)}
      <div className="fixed bottom-24 right-4 flex flex-col gap-2 z-[110] pointer-events-none">{toasts.map(t => <div key={t.id} className="bg-red-600 text-white text-[10px] font-black py-2 px-4 rounded-full shadow-2xl animate-slide-up uppercase tracking-widest">{t.msg}</div>)}</div>
      <div id="yt-player-hidden" className="fixed -left-[9999px] top-0 w-0 h-0 opacity-0 pointer-events-none" />
      <style>{`.cscr::-webkit-scrollbar{width:6px}.cscr::-webkit-scrollbar-track{background:transparent}.cscr::-webkit-scrollbar-thumb{background:rgba(255,255,255,.05);border-radius:9px} .line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden} .animate-slide-up{animation:su .3s ease-out} .glass-player{background:linear-gradient(120deg,rgba(255,255,255,.14),rgba(255,255,255,.08));box-shadow:0 24px 70px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.15)} .seek-slider,.volume-slider{-webkit-appearance:none;appearance:none;height:5px;border-radius:999px;background:rgba(255,255,255,.18);outline:none;cursor:pointer} .seek-slider::-webkit-slider-thumb,.volume-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #ef4444;box-shadow:0 2px 10px rgba(0,0,0,.4)} .seek-slider::-moz-range-thumb,.volume-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #ef4444} .seek-slider:disabled{opacity:.4;cursor:not-allowed} .animate-card-in{animation:cardIn .45s ease both} .shimmer{background:linear-gradient(90deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,.16) 50%,rgba(255,255,255,.06) 100%);background-size:200% 100%;animation:sh 1.4s infinite} @keyframes su{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}} @keyframes cardIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}} @keyframes sh{from{background-position:200% 0}to{background-position:-200% 0}}`}</style>
    </div>
  );
}
 
 