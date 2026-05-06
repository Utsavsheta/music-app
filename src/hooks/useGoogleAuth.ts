import { useCallback, useEffect, useState } from 'react';
import type { AppUser } from '../types';
import { fetchUserProfile, upsertUserProfile } from '../services/db';

declare global {
  interface Window {
    google?: any;
  }
}

const STORAGE_KEY = 'music_user';
const TOKEN_KEY = 'google_access_token';

export function useGoogleAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tokenClient, setTokenClient] = useState<any>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const cachedUser = JSON.parse(raw) as AppUser;
      setUser(cachedUser);
      fetchUserProfile(cachedUser.id)
        .then((dbUser) => {
          if (!dbUser) return;
          const normalized: AppUser = {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            picture: dbUser.picture,
          };
          setUser(normalized);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        })
        .catch(() => {
          // keep cached user if API is temporarily unavailable
        });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const login = useCallback(() => {
    if (!tokenClient) {
      setAuthError('Google login is not ready yet.');
      return;
    }
    setAuthError(null);
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }, [tokenClient]);

  const logout = useCallback(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && globalThis.window?.google?.accounts?.oauth2?.revoke) {
      globalThis.window.google.accounts.oauth2.revoke(token);
    }
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }, []);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId || !globalThis.window?.google?.accounts?.oauth2) {
        setAuthError('Google SDK failed to initialize.');
        return;
      }
      const nextClient = globalThis.window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'openid profile email',
        callback: async (res: any) => {
          if (!res?.access_token) {
            setAuthError('Google login was cancelled.');
            return;
          }
          try {
            const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${res.access_token}` },
            });
            if (!profileRes.ok) throw new Error('Failed to fetch profile');
            const profile = await profileRes.json();
            const nextUser: AppUser = {
              id: profile.sub || profile.email || String(Date.now()),
              name: profile.name || 'User',
              email: profile.email || '',
              picture: profile.picture || '',
            };
            const dbUser = await upsertUserProfile(nextUser);
            const normalized: AppUser = {
              id: dbUser.id,
              name: dbUser.name,
              email: dbUser.email,
              picture: dbUser.picture,
            };
            setUser(normalized);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
            localStorage.setItem(TOKEN_KEY, res.access_token);
            setAuthError(null);
          } catch {
            setAuthError('Could not fetch Google profile.');
          }
        },
        error_callback: () => {
          setAuthError('Google popup blocked or closed.');
        },
      });
      setTokenClient(nextClient);
      setAuthReady(true);
    };
    script.onerror = () => setAuthError('Could not load Google SDK.');
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  return { user, login, logout, authReady, authError };
}
