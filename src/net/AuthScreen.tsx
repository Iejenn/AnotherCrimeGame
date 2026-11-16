// Signing in to Underworld online: email + password (docs/design.md §11). Also: making an account,
// "forgot password" (Supabase emails a link), and setting a new password after following that link.
import { useState } from 'react';
import { LOGOUT_REASON, returnUrl, supabase } from './supabase';

type Mode = 'signin' | 'signup' | 'forgot' | 'newpass';

/** Supabase's error messages, said a bit more plainly. */
function plain(msg: string) {
  if (/invalid login/i.test(msg)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first: check your inbox for the link.';
  if (/already registered|already been registered/i.test(msg)) return 'There is already an account with this email. Sign in instead.';
  if (/password should be/i.test(msg)) return 'Your password needs at least 8 characters.';
  if (/rate limit/i.test(msg)) return 'Too many tries. Wait a minute and try again.';
  if (/failed to fetch|network/i.test(msg)) return "Can't reach the server. Check your internet connection and try again.";
  return msg;
}

export function AuthScreen({ recovering = false, onDone }: { recovering?: boolean; onDone?: () => void }) {
  const [mode, setMode] = useState<Mode>(recovering ? 'newpass' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // Logged out by the game (idle, or another device took over)? Say so once.
  const [why] = useState(() => {
    try {
      const reason = sessionStorage.getItem(LOGOUT_REASON);
      sessionStorage.removeItem(LOGOUT_REASON);
      return reason;
    } catch {
      return null;
    }
  });

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, success = '') => {
    setBusy(true);
    setError('');
    setInfo('');
    const { error: e } = await fn();
    setBusy(false);
    if (e) return setError(plain(e.message));
    if (success) setInfo(success);
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (mode === 'signin') return run(() => supabase.auth.signInWithPassword({ email, password }));
    if (mode === 'signup') {
      if (password.length < 8) return setError('Your password needs at least 8 characters.');
      return run(
        () => supabase.auth.signUp({ email, password, options: { emailRedirectTo: returnUrl() } }),
        'Almost there: we sent you an email. Tap the link in it to confirm your account, then sign in.',
      );
    }
    if (mode === 'forgot') return run(() => supabase.auth.resetPasswordForEmail(email, { redirectTo: returnUrl() }), 'If that email has an account, a reset link is on its way.');
    if (password.length < 8) return setError('Your password needs at least 8 characters.');
    return run(async () => {
      const r = await supabase.auth.updateUser({ password });
      if (!r.error) onDone?.();
      return r;
    });
  };

  const titles: Record<Mode, string> = { signin: 'Sign in', signup: 'Create an account', forgot: 'Forgot your password?', newpass: 'Choose a new password' };
  const buttons: Record<Mode, string> = { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link', newpass: 'Save new password' };

  return (
    <div className="create auth">
      <h1 className="title">Underworld</h1>
      <p className="kicker">A point-and-click crime RPG</p>
      <form className="auth-form" onSubmit={submit}>
        {why === 'idle' && mode === 'signin' && <p className="auth-notice">You were logged out after 5 minutes without activity. Sign in to carry on.</p>}
        {why === 'replaced' && mode === 'signin' && (
          <p className="auth-notice">You were logged out because this account started playing on another device. One device at a time.</p>
        )}
        <h2 className="headline">{titles[mode]}</h2>
        {mode !== 'newpass' && (
          <label className="field">
            <span className="label">Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        {mode !== 'forgot' && (
          <label className="field">
            <span className="label">{mode === 'newpass' ? 'New password' : 'Password'}</span>
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'signin' ? undefined : 8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {error && <p className="auth-error">{error}</p>}
        {info && <p className="auth-info">{info}</p>}
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? '…' : buttons[mode]}
        </button>
      </form>
      <div className="auth-links">
        {mode === 'signin' && (
          <>
            <button className="btn link" onClick={() => setMode('signup')}>New here? Create an account</button>
            <button className="btn link" onClick={() => setMode('forgot')}>Forgot your password?</button>
          </>
        )}
        {(mode === 'signup' || mode === 'forgot') && (
          <button className="btn link" onClick={() => setMode('signin')}>Back to sign in</button>
        )}
      </div>
    </div>
  );
}
