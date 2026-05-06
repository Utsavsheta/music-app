import { useEffect, useRef, useState, useCallback } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

let apiLoaded = false;
let apiReady = false;
const readyCallbacks: (() => void)[] = [];

function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (apiReady) { resolve(); return; }
    readyCallbacks.push(resolve);
    if (!apiLoaded) {
      apiLoaded = true;
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const first = document.getElementsByTagName('script')[0];
      first.parentNode?.insertBefore(tag, first);
      window.onYouTubeIframeAPIReady = () => {
        apiReady = true;
        readyCallbacks.forEach((cb) => cb());
        readyCallbacks.length = 0;
      };
    }
  });
}

export interface YTPlayerControls {
  play: () => void;
  pause: () => void;
  mute: () => void;
  unMute: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (vol: number) => void;
  loadVideo: (videoId: string) => void;
  getDuration: () => number;
  getCurrentTime: () => number;
  getPlayerState: () => number | null;
  isReady: boolean;
}

/**
 * Uses refs for callbacks so the YT player never has stale closures.
 */
export function useYouTubePlayer(
  containerId: string,
  onStateChange: (state: number) => void,
  onError: (code: number) => void,
): YTPlayerControls {
  const playerRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  // Keep latest callbacks in refs to avoid stale closures
  const stateRef = useRef(onStateChange);
  const errorRef = useRef(onError);
  useEffect(() => { stateRef.current = onStateChange; }, [onStateChange]);
  useEffect(() => { errorRef.current = onError; }, [onError]);

  useEffect(() => {
    let destroyed = false;

    loadYouTubeAPI().then(() => {
      if (destroyed) return;

      let container = document.getElementById(containerId);
      if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        Object.assign(container.style, { position: 'absolute', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', overflow: 'hidden', left: '-9999px' });
        document.body.appendChild(container);
      }

      playerRef.current = new window.YT.Player(containerId, {
        height: '1',
        width: '1',
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, showinfo: 0, origin: window.location.origin },
        events: {
          onReady: () => { if (!destroyed) setIsReady(true); },
          onStateChange: (e: any) => { if (!destroyed) stateRef.current(e.data); },
          onError: (e: any) => { if (!destroyed) errorRef.current(e.data); },
        },
      });
    });

    return () => {
      destroyed = true;
      try { playerRef.current?.destroy?.(); } catch { /* */ }
    };
  }, [containerId]);

  const play = useCallback(() => { try { playerRef.current?.playVideo?.(); } catch { /* */ } }, []);
  const pause = useCallback(() => { try { playerRef.current?.pauseVideo?.(); } catch { /* */ } }, []);
  const mute = useCallback(() => { try { playerRef.current?.mute?.(); } catch { /* */ } }, []);
  const unMute = useCallback(() => { try { playerRef.current?.unMute?.(); } catch { /* */ } }, []);
  const seekTo = useCallback((s: number) => { try { playerRef.current?.seekTo?.(s, true); } catch { /* */ } }, []);
  const setVolume = useCallback((v: number) => { try { playerRef.current?.setVolume?.(v); } catch { /* */ } }, []);
  const loadVideo = useCallback((id: string) => { try { playerRef.current?.loadVideoById?.(id); } catch { /* */ } }, []);
  const getDuration = useCallback(() => { try { return playerRef.current?.getDuration?.() || 0; } catch { return 0; } }, []);
  const getCurrentTime = useCallback(() => { try { return playerRef.current?.getCurrentTime?.() || 0; } catch { return 0; } }, []);
  const getPlayerState = useCallback(() => {
    try {
      const state = playerRef.current?.getPlayerState?.();
      return typeof state === 'number' ? state : null;
    } catch {
      return null;
    }
  }, []);

  return { play, pause, mute, unMute, seekTo, setVolume, loadVideo, getDuration, getCurrentTime, getPlayerState, isReady };
}
