// Tinkering at the Factory (docs/design.md §14): at a plate press you press salvage into sheets, at a workbench you make
// weapons and armour from sheets. Tap one to make as many as your materials allow, one after another (the server times
// every one). Walking away stops it. Recipes you're not high enough for are shown with their level, greyed out.
import type { GameState } from '../game/types';
import type { GameApi } from '../game/api';
import { ITEM_BY_ID, plural } from '../game/data/items';
import { CRAFTS, type Craft } from '../game/data/metals';
import { skillLevel } from '../game/engine';
import { ItemIcon } from '../components/ItemIcon';

/** How many of a craft your bag has the materials for. */
const canMake = (s: GameState, c: Craft) => Math.min(...Object.entries(c.inputs).map(([id, n]) => Math.floor((s.inventory[id] ?? 0) / n)));

export function TinkerDialog({ s, api, pos, kind, onClose }: { s: GameState; api: GameApi; pos: [number, number]; kind: 'press' | 'bench'; onClose: () => void }) {
  const level = skillLevel(s, 'tinkering');
  // In the order they unlock (v0.51: throwing knives unlock at the metal's first level, before the knuckles).
  const crafts = CRAFTS.filter((c) => c.station === kind).sort((a, b) => a.level - b.level);
  return (
    <div className="npc-dialog" role="dialog" aria-label={kind === 'press' ? 'The plate press' : 'The workbench'} onPointerDown={(e) => e.stopPropagation()}>
      <div className="npc-head">
        <span className="npc-name">{kind === 'press' ? 'Plate press' : 'Workbench'}</span>
        <span className="muted small">Tinkering level {level}</span>
        <button className="btn tiny npc-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <ul className="craft-list">
        {crafts.map((c) => {
          const n = canMake(s, c);
          const locked = level < c.level;
          const inputs = Object.entries(c.inputs).map(([id, k]) => `${k} ${ITEM_BY_ID[id]?.name ?? id}${k > 1 ? 's' : ''}`).join(', ');
          return (
            <li key={c.id}>
              <button
                className={`craft-row ${locked ? 'locked' : ''}`}
                disabled={locked || n === 0}
                onClick={() => {
                  api.make(c.id, pos);
                  onClose();
                }}
              >
                <span className="craft-icon">
                  <ItemIcon id={c.id} className="item-icon inline" />
                </span>
                <span className="craft-name">
                  {c.amount ? `${c.amount} ${plural(ITEM_BY_ID[c.id]?.name ?? c.id)}` : ITEM_BY_ID[c.id]?.name}
                  <span className="muted small">{locked ? `Level ${c.level}` : `${inputs} · +${c.xp} XP`}</span>
                </span>
                <span className="mono small">{locked ? '' : `×${n}`}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
