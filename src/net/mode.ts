// Kept apart from supabase.ts so checking the switch doesn't download the Supabase library.
// ---------- the online test switch ----------
// Online play isn't finished yet, so it's hidden: open the game with ?online to switch it on for this
// browser (it stays on), and ?offline to switch it off again. Players who don't do this see nothing new.
const KEY = 'underworld-online';
export function onlineMode(): boolean {
  const q = new URLSearchParams(window.location.search);
  try {
    if (q.has('online')) localStorage.setItem(KEY, '1');
    if (q.has('offline')) localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch {
    return q.has('online');
  }
}
