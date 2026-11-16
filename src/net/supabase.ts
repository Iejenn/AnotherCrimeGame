// The connection to the Underworld database (docs/design.md §11, supabase/README.md).
// The URL and the publishable key are meant to be public: they only let the app call the game's
// functions, and the database's rules (RLS + SECURITY DEFINER functions) decide what's allowed.
// The secret service_role key never goes in the app.
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://bcvlhtfufkjprczxhlny.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_2AK2LlSg5weEHGvwPpGkHg_Re_ky0UT';

/**
 * This open game's session id, sent with every request (header x-game-session). One device at a time per account:
 * the server only accepts the session that claimed the account last (supabase/migrations/0009_one_device_at_a_time.sql).
 */
export const GAME_SESSION = crypto.randomUUID();

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { headers: { 'x-game-session': GAME_SESSION } },
});

/** Why the sign-in screen is showing (it tells the player once). */
export const LOGOUT_REASON = 'underworld-logout-reason';

/**
 * Log out on THIS device only. (A plain signOut() logs the account out everywhere, which would also throw out
 * the device that just took over.) `why` is shown on the sign-in screen.
 */
export function logOut(why?: 'idle' | 'replaced') {
  try {
    if (why) sessionStorage.setItem(LOGOUT_REASON, why);
  } catch {
    /* storage blocked: the sign-in screen just won't say why */
  }
  return supabase.auth.signOut({ scope: 'local' });
}

/** Where emails (confirm your account, reset your password) send you back to: this page. */
export const returnUrl = () => `${window.location.origin}${window.location.pathname}`;

/** What the server's error reasons mean, in words for the player. */
export const REASONS: Record<string, string> = {
  not_signed_in: 'You need to sign in first.',
  already_have_character: 'This account already has a character.',
  bad_name: 'Names are 3–16 letters, numbers, spaces or _.',
  name_taken: 'That name is taken. Try another one.',
  bad_look: "That look isn't allowed.",
  no_character: "You don't have a character yet.",
  import_closed: 'Bringing offline characters over has closed. Make a new character instead.',
  bad_save: "That offline character can't be brought over. Make a new one instead.",
};
