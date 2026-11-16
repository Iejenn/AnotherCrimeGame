// Highscores: one table per skill, read from the server (public, like RuneScape's hiscores).
// Shows the top 50 by XP, highlights you, and shows your own rank if you're further down.
import { useEffect, useState } from 'react';
import type { SkillId } from '../game/types';
import { SKILLS } from '../game/data/skills';
import { supabase } from '../net/supabase';

interface Row {
  rank: number;
  name: string;
  level: number;
  xp: number;
}

export function HighscoresTab({ online, myName }: { online: boolean; myName: string }) {
  const [skill, setSkill] = useState<SkillId>('street');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [me, setMe] = useState<Row | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setRows(null);
    setError('');
    supabase.rpc('get_highscores', { p_skill: skill, p_limit: 50 }).then(({ data, error: e }) => {
      if (!live) return;
      if (e || !data?.ok) return setError("Couldn't load the highscores. Check your connection.");
      setRows(data.rows as Row[]);
      setMe((data.me as Row) ?? null);
    });
    return () => {
      live = false;
    };
  }, [skill]);

  const mine = (r: Row) => online && r.name === myName;
  return (
    <div className="highscores">
      <h2 className="headline">Highscores</h2>
      <div className="hs-skills" role="tablist">
        {SKILLS.map((sk) => (
          <button key={sk.id} role="tab" aria-selected={skill === sk.id} className={`btn tiny ${skill === sk.id ? 'primary' : ''}`} onClick={() => setSkill(sk.id)}>
            {sk.name}
          </button>
        ))}
      </div>
      {!online && <p className="muted small">These are the online players. Your offline character isn't on the list: play online (open the game with ?online) to join it.</p>}
      {error && <p className="auth-error">{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="muted">Nobody on the list yet. Be the first!</p>}
      {rows && rows.length > 0 && (
        <table className="hs-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Name</th>
              <th>Level</th>
              <th>XP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.rank}-${r.name}`} className={mine(r) ? 'me' : ''}>
                <td className="mono">{r.rank}</td>
                <td>{r.name}</td>
                <td className="mono">{r.level}</td>
                <td className="mono">{Number(r.xp).toLocaleString('en-US')}</td>
              </tr>
            ))}
            {online && me && !rows.some(mine) && (
              <tr className="me">
                <td className="mono">{me.rank}</td>
                <td>{me.name}</td>
                <td className="mono">{me.level}</td>
                <td className="mono">{Number(me.xp).toLocaleString('en-US')}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
