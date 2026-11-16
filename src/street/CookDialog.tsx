// Cooking at the barbecue (docs/design.md §13): your bag opens; tap something raw to cook all of it, one after
// another (the server times and rolls each one). Walking away stops it.
import { useState } from 'react';
import type { GameState } from '../game/types';
import type { GameApi } from '../game/api';
import { ITEM_BY_ID } from '../game/data/items';
import { RECIPE_BY_ITEM, myBurnChance } from '../game/data/recipes';
import { skillLevel } from '../game/engine';
import { pct } from '../components/ui';
import { Bag, bagSlots, slotKey } from '../components/Bag';

export function CookDialog({ s, api, pos, onClose }: { s: GameState; api: GameApi; pos: [number, number]; onClose: () => void }) {
  const [line, setLine] = useState('Tap something raw to cook it. You cook all of it, one after another.');
  const level = skillLevel(s, 'cooking');
  const pick = (key: string) => {
    const slot = bagSlots(s).find((sl) => slotKey(sl) === key);
    if (!slot || slot.kind === 'cash') return setLine("You can't cook cash.");
    const r = RECIPE_BY_ITEM[slot.id];
    const name = ITEM_BY_ID[slot.id]?.name ?? slot.id;
    if (!r) return setLine(`You can't cook the ${name.toLowerCase()}.`);
    if (level < r.level) return setLine(`You need Cooking level ${r.level} to cook that.`);
    api.cook(slot.id, pos);
    onClose();
  };
  const raw = Object.keys(s.inventory).filter((id) => RECIPE_BY_ITEM[id]);
  return (
    <div className="npc-dialog" role="dialog" aria-label="Cooking at the barbecue" onPointerDown={(e) => e.stopPropagation()}>
      <div className="npc-head">
        <span className="npc-name">The barbecue</span>
        <span className="muted small">Cooking level {level}</span>
        <button className="btn tiny npc-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <p className="npc-line">{raw.length ? line : 'You have nothing raw to cook. Pigeons in the park drop raw bird meat.'}</p>
      {raw.map((id) => (
        <p key={id} className="muted small">
          {ITEM_BY_ID[id].name}: {s.inventory[id]} in your bag · {pct(myBurnChance(s, RECIPE_BY_ITEM[id]))} chance to burn · +{RECIPE_BY_ITEM[id].xp} XP each
        </p>
      ))}
      <Bag s={s} selected={null} onSelect={pick} compact />
    </div>
  );
}
