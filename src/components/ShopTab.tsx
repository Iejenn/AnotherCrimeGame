import type { GameState } from '../game/types';
import { SKILL_BY_ID } from '../game/data/skills';
import { FRONTS, FRONT_CAP_HOURS, FRONT_MAX_LEVEL, GEAR, TRAITS, UPGRADES, frontCost } from '../game/data/world';
import { buyFront, buyGear, buyUpgrade, crewSlotInfo, fmtMoney, frontIncome, hireCrew, isUnlocked, skillLevel, totalLevel, upgradeCost } from '../game/engine';

type Act = (fn: (d: GameState, now: number) => void) => void;

export function ShopTab({ s, act }: { s: GameState; act: Act }) {
  const slot = crewSlotInfo(s);
  const total = totalLevel(s);
  return (
    <div className="shop">
      <h2>Crew</h2>
      <p className="dim">Every crew member runs their own job queue in parallel, using your skills. Random trait on hire.</p>
      <div className="cards">
        {s.crew.map((c) => (
          <div key={c.id} className="card mini">
            <strong>{c.isPlayer ? `${c.name} (you)` : c.name}</strong>
            <span className="dim small">{c.isPlayer ? 'The boss' : `${TRAITS[c.trait].name}: ${TRAITS[c.trait].desc}`}</span>
          </div>
        ))}
        {slot && (
          <div className="card mini">
            <strong>Recruit crew #{s.crew.length + 1}</strong>
            <span className="dim small">Needs Total Lv {slot.totalLevel}</span>
            <button className="btn small gold" disabled={s.cash < slot.cost || total < slot.totalLevel} onClick={() => act((d) => hireCrew(d))}>
              Hire {fmtMoney(slot.cost)}
            </button>
          </div>
        )}
      </div>

      <h2>Operations</h2>
      <div className="cards">
        {UPGRADES.map((u) => {
          const lvl = s.upgrades[u.id] ?? 0;
          const cost = upgradeCost(s, u.id);
          return (
            <div key={u.id} className="card mini">
              <strong>
                {u.name} <span className="dim small">{lvl}/{u.max}</span>
              </strong>
              <span className="small">{u.desc(lvl)}</span>
              {cost !== null ? (
                <>
                  <span className="dim small">Next: {u.desc(lvl + 1)}</span>
                  <button className="btn small gold" disabled={s.cash < cost} onClick={() => act((d) => buyUpgrade(d, u.id))}>
                    Upgrade {fmtMoney(cost)}
                  </button>
                </>
              ) : (
                <span className="dim">MAXED</span>
              )}
            </div>
          );
        })}
      </div>

      <h2>Fronts</h2>
      <p className="dim">Legit-looking businesses that earn while you sleep. Stores up to {FRONT_CAP_HOURS}h of income — collect from the top bar.</p>
      <div className="cards">
        {FRONTS.map((f) => {
          const lvl = s.fronts[f.id]?.level ?? 0;
          const locked = total < f.totalLevel;
          const cost = frontCost(f, lvl);
          return (
            <div key={f.id} className={`card mini ${locked ? 'locked' : ''}`}>
              <strong>
                {f.name} <span className="dim small">Lv {lvl}/{FRONT_MAX_LEVEL}</span>
              </strong>
              <span className="small">
                {fmtMoney(frontIncome(s, f.id))}/h → {fmtMoney((lvl + 1) * f.incomePerLevel)}/h
              </span>
              {locked ? (
                <span className="dim small">🔒 Total Lv {f.totalLevel}</span>
              ) : lvl >= FRONT_MAX_LEVEL ? (
                <span className="dim">MAXED</span>
              ) : (
                <button className="btn small gold" disabled={s.cash < cost} onClick={() => act((d, t) => buyFront(d, f.id, t))}>
                  {lvl ? 'Expand' : 'Buy'} {fmtMoney(cost)}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <h2>Gear</h2>
      <p className="dim">Your best piece per crime family applies to every job in that family.</p>
      <div className="cards">
        {GEAR.filter((g) => isUnlocked(s, g.skill)).map((g) => {
          const owned = s.gear.includes(g.id);
          const lvlOk = skillLevel(s, g.skill) >= g.level;
          return (
            <div key={g.id} className={`card mini ${owned ? 'owned' : ''}`}>
              <strong>{g.name}</strong>
              <span className="small">
                {SKILL_BY_ID[g.skill].icon} {SKILL_BY_ID[g.skill].short} Lv {g.level} · +{Math.round(g.success * 100)}% success, +{Math.round(g.cash * 100)}% cash
              </span>
              {owned ? (
                <span className="dim">✓ Owned</span>
              ) : (
                <button className="btn small gold" disabled={!lvlOk || s.cash < g.price} onClick={() => act((d) => buyGear(d, g.id))}>
                  {lvlOk ? `Buy ${fmtMoney(g.price)}` : `🔒 Lv ${g.level}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
