// The combat style button (v0.51): a round button on the minimap's bottom-left (mirroring the health bubble), shown
// while you have throwing knives readied. A knife: you fight Melee (your weapon, or fists); a gun: Marksman (you throw
// the knives in your Marksman slot). One tap switches, also mid-fight; the server keeps the style (set_fight_style)
// and switches you back to melee itself when the knives run out.
import type { GameApi } from '../game/api';
import type { GameState } from '../game/types';
import { marksmanSlot } from '../game/combat';

export function StyleToggle({ s, api, say }: { s: GameState; api: GameApi; say: (text: string) => void }) {
  if (!marksmanSlot(s)) return null;
  const throwing = s.fightStyle === 'marksman';
  const next = throwing ? 'melee' : 'marksman';
  const label = throwing ? 'Combat style: Marksman. Tap for Melee.' : 'Combat style: Melee. Tap for Marksman.';
  return (
    <button
      className={`style-btn ${throwing ? 'marksman' : ''}`}
      onClick={() => {
        api.setFightStyle(next);
        say(`Combat style changed to ${next === 'marksman' ? 'Marksman' : 'Melee'}.`);
      }}
      aria-label={label}
      title={label}
    >
      {throwing ? (
        // A pistol, side on.
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 7 H20 V11 H11 L10 13 H8 L7 20 H3.5 L5 11 H3 Z" fill="#d8d2c6" stroke="#141210" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M11 11 Q11.5 13.5 9.5 14" fill="none" stroke="#141210" strokeWidth="1.1" />
          <rect x="17" y="5.5" width="1.6" height="1.6" fill="#141210" />
        </svg>
      ) : (
        // A knife, point up and to the right.
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <g transform="rotate(-45 12 12)">
            <path d="M11 3 Q13.5 6 13 13 H11 Z" fill="#d8d2c6" stroke="#141210" strokeWidth="1.1" strokeLinejoin="round" />
            <rect x="9" y="13" width="6" height="1.6" rx="0.5" fill="#8a8f96" stroke="#141210" strokeWidth="0.8" />
            <rect x="10.8" y="14.6" width="2.4" height="6" rx="0.8" fill="#5a3a22" stroke="#141210" strokeWidth="0.9" />
          </g>
        </svg>
      )}
    </button>
  );
}
