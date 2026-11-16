// "Install app" (PWA). Chrome, Edge and Android offer an install prompt we can show from a button; iPhone/iPad
// Safari has no prompt, so there we explain "Share → Add to Home Screen". Nothing to offer once it's installed.
import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The prompt can fire before React mounts: catch it as early as possible.
let saved: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    saved = e as InstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    saved = null;
    listeners.forEach((fn) => fn());
  });
}

const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function useInstall() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  const installed = standalone();
  return {
    /** 'prompt': we can show the browser's install dialog; 'ios': explain Add to Home Screen; null: nothing to do. */
    mode: installed ? null : saved ? ('prompt' as const) : isIos() ? ('ios' as const) : null,
    install: async () => {
      if (!saved) return;
      await saved.prompt();
      await saved.userChoice;
      saved = null;
      setTick((t) => t + 1);
    },
  };
}
