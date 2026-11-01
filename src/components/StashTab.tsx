import type { GameState } from '../game/types';
import { CAR_CLASSES, CAR_SMUGGLE_BONUS, LOOT, LOOT_BY_ID, garageCap } from '../game/data/world';
import { SKILL_BY_ID } from '../game/data/skills';
import { bestCarClass, carSellValue, fmtMoney, lootSellValue, sellAllLoot, sellCar, sellLoot } from '../game/engine';

type Act = (fn: (d: GameState, now: number) => void) => void;

export function StashTab({ s, act }: { s: GameState; act: Act }) {
  const items = Object.entries(s.inventory).sort((a, b) => LOOT_BY_ID[b[0]].value - LOOT_BY_ID[a[0]].value);
  const total = items.reduce((sum, [id, n]) => sum + lootSellValue(s, id) * n, 0);
  const best = bestCarClass(s);
  return (
    <div className="stash">
      <div className="section-head">
        <h2>Loot</h2>
        <button className="btn small gold" disabled={!items.length} onClick={() => act((d) => sellAllLoot(d))}>
          Fence everything ({fmtMoney(total)})
        </button>
      </div>
      {items.length === 0 ? (
        <p className="dim">Nothing yet. Successful jobs sometimes drop loot — Big Scores double the odds.</p>
      ) : (
        <div className="table">
          {items.map(([id, n]) => {
            const def = LOOT_BY_ID[id];
            return (
              <div key={id} className="row">
                <span className={`rarity-${def.rarity}`}>{def.name}</span>
                <span className="dim">×{n}</span>
                <span>{fmtMoney(lootSellValue(s, id))}</span>
                <button className="btn tiny" onClick={() => act((d) => sellLoot(d, id, 1))}>
                  Sell 1
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-head">
        <h2>
          Garage <span className="dim small">{s.cars.length}/{garageCap(s.upgrades.garage ?? 0)}</span>
        </h2>
      </div>
      <p className="dim small">
        Your best car powers Smuggling runs: {best >= 0 ? `${CAR_CLASSES[best]} → +${Math.round(CAR_SMUGGLE_BONUS[best] * 100)}% Smuggling cash` : 'no cars yet'}.
      </p>
      {s.cars.length === 0 ? (
        <p className="dim">Steal some cars (Car Theft) to fill it up.</p>
      ) : (
        <div className="table">
          {[...s.cars]
            .sort((a, b) => b.value - a.value)
            .map((c) => (
              <div key={c.id} className="row">
                <span className={`car-cls-${c.cls}`}>{c.model}</span>
                <span className="dim">{CAR_CLASSES[c.cls]}</span>
                <span>{fmtMoney(carSellValue(s, c.value))}</span>
                <button className="btn tiny" onClick={() => act((d) => sellCar(d, c.id))}>
                  Sell
                </button>
              </div>
            ))}
        </div>
      )}

      <div className="section-head">
        <h2>
          Collection <span className="dim small">{s.discovered.length}/{LOOT.length}</span>
        </h2>
      </div>
      <div className="collection">
        {LOOT.map((l) => {
          const found = s.discovered.includes(l.id);
          return (
            <span key={l.id} className={`coll ${found ? `rarity-${l.rarity}` : 'unknown'}`} title={found ? `${SKILL_BY_ID[l.skill].name} · ${l.rarity}` : `??? (${SKILL_BY_ID[l.skill].short} Lv ${l.minLevel}+)`}>
              {found ? l.name : '???'}
            </span>
          );
        })}
      </div>
    </div>
  );
}
