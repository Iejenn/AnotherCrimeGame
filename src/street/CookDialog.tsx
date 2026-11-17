// Cooking at the barbecue (docs/design.md §13): your bag at the bottom opens; tap something raw in it to cook all of it,
// one after another (the server times and rolls each one). Walking away stops it. (v0.48.1: the bag at the bottom, like
// selling and the bank, not a second bag in this window.)
import { useCallback, useMemo, useRef, useState } from 'react';
import type { GameState } from '../game/types';
import type { GameApi } from '../game/api';
import { ITEM_BY_ID } from '../game/data/items';
import { RECIPE_BY_ITEM, myBurnChance } from '../game/data/recipes';
import { skillLevel } from '../game/engine';
import { pct } from '../components/ui';
import { bagSlots, slotKey } from '../components/Bag';
import { useBagHandler } from '../components/bagHandler';

export function CookDialog({ s, api, pos, onClose }: { s: GameState; api: GameApi; pos: [number, number]; onClose: () => void }) {
  const [line, setLine] = useState('Tap something raw to cook it. You cook all of it, one after another.');
  const level = skillLevel(s, 'cooking');
  // (The bag calls `pick` later: read the latest state from a ref, so the handler can stay the same between renders.)
  const latest = useRef({ s, level, pos, onClose });
  latest.current = { s, level, pos, onClose };
  const pick = useCallback((key: string) => {
    const { s, level, pos, onClose } = latest.current;
    const slot = bagSlots(s).find((sl) => slotKey(sl) === key);
    if (!slot || slot.kind === 'cash') return setLine("You can't cook cash.");
    const r = RECIPE_BY_ITEM[slot.id];
    const name = ITEM_BY_ID[slot.id]?.name ?? slot.id;
    if (!r) return setLine(`You can't cook the ${name.toLowerCase()}.`);
    if (level < r.level) return setLine(`You need Cooking level ${r.level} to cook that.`);
    api.cook(slot.id, pos);
    onClose();
  }, [api]);
  const raw = Object.keys(s.inventory).filter((id) => RECIPE_BY_ITEM[id]);
  const nothing = 'You have nothing raw to cook. Pigeons in the park drop raw bird meat.';
  useBagHandler(useMemo(() => ({ line: raw.length ? line : nothing, selected: null, pick }), [raw.length > 0, line, pick])); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="npc-dialog" role="dialog" aria-label="Cooking at the barbecue" onPointerDown={(e) => e.stopPropagation()}>
      <div className="npc-head">
        <span className="npc-name">The barbecue</span>
        <span className="muted small">Cooking level {level}</span>
        <button className="btn tiny npc-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {/* (What to do, and why something can't be cooked, is the bag's top line at the bottom.) */}
      {!raw.length && <p className="npc-line">{nothing}</p>}
      {raw.map((id) => (
        <p key={id} className="muted small">
          {ITEM_BY_ID[id].name}: {s.inventory[id]} in your bag · {pct(myBurnChance(s, RECIPE_BY_ITEM[id]))} chance to burn · +{RECIPE_BY_ITEM[id].xp} XP each
        </p>
      ))}
    </div>
  );
}
