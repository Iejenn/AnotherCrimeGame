// The fighting style toggle (v0.51): Melee (your weapon, or fists) or Marksman (the throwing knives in your Marksman
// slot). Next to the quick-eat button, shown while you have knives readied. One tap switches, also mid-fight; the
// server keeps the style (set_fight_style) and switches you back to melee itself when the knives run out.
import type { GameApi } from '../game/api';
import type { GameState } from '../game/types';
import { ITEM_BY_ID } from '../game/data/items';
import { marksmanSlot } from '../game/combat';
import { ItemIcon } from '../components/ItemIcon';

export function StyleToggle({ s, api }: { s: GameState; api: GameApi }) {
  const knives = marksmanSlot(s);
  if (!knives) return null;
  const throwing = s.fightStyle === 'marksman';
  const melee = s.equipment?.weapon;
  const showing = throwing ? knives.id : melee;
  const label = throwing
    ? `Throwing ${ITEM_BY_ID[knives.id]?.name ?? ''} (${knives.left} left). Tap to fight melee.`
    : `Fighting melee with ${melee ? ITEM_BY_ID[melee]?.name : 'your fists'}. Tap to throw knives.`;
  return (
    <button
      className={`style-toggle ${throwing ? 'throwing' : ''}`}
      onClick={() => api.setFightStyle(throwing ? 'melee' : 'marksman')}
      aria-label={label}
      title={label}
    >
      {showing ? <ItemIcon id={showing} /> : <span className="style-fist">✊</span>}
      <span className="style-name">{throwing ? 'Throw' : 'Melee'}</span>
      {throwing && <span className="style-count">{knives.left}</span>}
    </button>
  );
}
