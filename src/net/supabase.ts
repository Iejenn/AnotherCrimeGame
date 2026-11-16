// The connection to the Underworld database (docs/design.md §11, supabase/README.md).
// The URL and the publishable key are meant to be public: they only let the app call the game's
// functions, and the database's rules (RLS + SECURITY DEFINER functions) decide what's allowed.
// The secret service_role key never goes in the app.
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://bcvlhtfufkjprczxhlny.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_2AK2LlSg5weEHGvwPpGkHg_Re_ky0UT';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Where emails (confirm your account, reset your password) send you back to: this page, in online mode. */
export const returnUrl = () => `${window.location.origin}${window.location.pathname}?online`;

/** What the server's error reasons mean, in words for the player. */
export const REASONS: Record<string, string> = {
  not_signed_in: 'You need to sign in first.',
  already_have_character: 'This account already has a character.',
  bad_name: 'Names are 3–16 letters, numbers, spaces or _.',
  name_taken: 'That name is taken. Try another one.',
  bad_look: "That look isn't allowed.",
  no_character: "You don't have a character yet.",
};
