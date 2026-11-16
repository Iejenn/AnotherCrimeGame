// Everyone on the same build (docs/design.md §11): every minute, and whenever you come back to the tab, the
// game checks version.json (written by each build, see vite.config.ts). If a newer build is out, it says so
// and reloads itself, so nobody keeps playing an old version against the server.
import { useEffect, useState } from 'react';

declare const __BUILD_ID__: string;

/** True once a newer version is out (the game then reloads a few seconds later). */
export function useUpdateCheck(): boolean {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return; // there's no version.json while developing
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (build && build !== __BUILD_ID__ && !stopped) {
          stopped = true;
          setOutdated(true);
          // Reload to an address tagged with the new build (?v=…): browsers and GitHub Pages may keep the old page
          // cached for a few minutes, and a tagged address skips that. Already tried that build? Don't loop.
          const url = new URL(window.location.href);
          if (url.searchParams.get('v') === build) return;
          url.searchParams.set('v', build);
          setTimeout(() => window.location.replace(url.toString()), 3000);
        }
      } catch {
        /* offline for a moment: try again next time */
      }
    };
    const id = setInterval(check, 60_000);
    const onShow = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onShow);
    void check();
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, []);
  return outdated;
}
