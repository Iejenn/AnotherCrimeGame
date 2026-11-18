// Skills: every skill (levels 1–30 for now). Tap one for its guide: how to train it, and its list from the game data
// (v0.51: so the numbers never go stale): crimes (Street Crimes, Scrapping), enemies (Melee, Gunfire), recipes
// (Cooking) or crafts (Tinkering).
import type { GameState, SkillId } from '../game/types';
import { SKILLS, SKILL_BY_ID } from '../game/data/skills';
import { crimesForSkill } from '../game/data/crimes';
import { crimeStats, fmtDuration, maxHp, skillLevel, totalLevel } from '../game/engine';
import { myCombatLevel } from '../game/combat';
import { levelProgress } from '../game/xp';
import { Bar, pct } from './ui';
import { ITEM_BY_ID } from '../game/data/items';
import type { CrimeDef } from '../game/data/crimes';
import { NODES } from '../street/map';
import { EnemyGuide } from './EnemyGuide';
import { RECIPES, burnChance } from '../game/data/recipes';
import { CRAFTS } from '../game/data/metals';

/** Crimes that already have a place on the Street (v2 is built step by step). */
const PLACED = new Set(NODES.map((n) => n.crimeId));

/** "$1–3", or the food you get: "Candy Bar", "Sandwich or Candy Bar". */
function take(c: CrimeDef) {
  if (c.items?.length) return c.items.map((id) => ITEM_BY_ID[id]?.name ?? id).join(' or ');
  return `$${c.cashMin}–${c.cashMax}`;
}

/** What happens when it goes wrong. */
function risk(c: CrimeDef) {
  const hurt = `−${c.failDamage} HP, stunned ${c.failStun}s`;
  if (c.catcher === 'bartender') return `If the bartender sees you: ${hurt}`;
  if (c.catcher === 'guard') return c.baseChance >= 1 ? `If the guard sees you: ${hurt}` : `On a fail, or if the guard sees you: ${hurt}`;
  if (c.catcher === 'clerk') return `On a fail the clerk hits you: ${hurt}`;
  return `On a fail: ${hurt}`;
}

/** The skills in the bottom panel: a small grid (name and level); tap one for its guide (a popup). */
export function SkillsPanel({ s, onOpen }: { s: GameState; onOpen: (id: SkillId) => void }) {
  return (
    <div className="skills-panel">
      <div className="panel-head">
        <span className="panel-title">Skills</span>
        <span className="muted mono small">
          Total {totalLevel(s)} · Combat {myCombatLevel(s)}
        </span>
      </div>
      <div className="skill-grid mini">
        {SKILLS.map((sk) => {
          const p = levelProgress(s.skills[sk.id].xp);
          return (
            <button key={sk.id} className="skill-cell" onClick={() => onOpen(sk.id)}>
              <span className="code">{sk.code}</span>
              <span className="skill-cell-name">{sk.name}</span>
              <span className="num">{p.level}</span>
              <Bar pct={p.pct} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One skill's guide (the popup): your level and XP, how to train it, and its crimes or enemies. */
export function SkillGuide({ s, id }: { s: GameState; id: SkillId }) {
  const open = id;
  const def = SKILL_BY_ID[open];
  const lvl = skillLevel(s, open);
  const lp = levelProgress(s.skills[open].xp);
  const crimes = crimesForSkill(open);
  return (
    <div className="skills">
      <section className="skill-guide">
        <div className="kicker">Skill {def.code}</div>
        <h2 className="headline">
          {def.name} <span className="num">Lv {lvl}</span>
        </h2>
        <p className="deck">{def.blurb}</p>
        <Bar pct={lp.pct} label={lp.needed ? `${Math.floor(lp.into).toLocaleString('en-US')} / ${lp.needed.toLocaleString('en-US')} XP` : 'Max level (for now)'} />
        <p className="small">
          <span className="label">How to train</span> {def.howToTrain}
        </p>
        {(open === 'melee' || open === 'gunfire') && <EnemyGuide skill={open} />}
        {open === 'health' && <p className="small">Max health right now: {maxHp(s)} HP. Health also comes back on its own, 1 HP per minute.</p>}
        {open === 'cooking' && <RecipeList lvl={lvl} />}
        {open === 'tinkering' && <CraftList lvl={lvl} />}
        {crimes.length > 0 && (
          <ol className="ledger">
            {crimes.map((crime) => {
              const can = lvl >= crime.level;
              const st = crimeStats(s, crime);
              return (
                <li key={crime.id} className={`entry ${can ? '' : 'locked'}`}>
                  <div className="entry-main">
                    <div className="entry-title">
                      <span className="mono small lvl-col">{crime.level}</span>
                      <span className="entry-name">{crime.name}</span>
                    </div>
                    <dl className="entry-stats">
                      <div><dt>Where</dt><dd>{crime.spot.where}{PLACED.has(crime.id) ? '' : ' (coming soon)'}</dd></div>
                      <div><dt>Time</dt><dd>{fmtDuration(st.duration)}</dd></div>
                      {can && (
                        <>
                          <div><dt>Odds</dt><dd>{crime.baseChance >= 1 ? '100% if unseen' : pct(st.chance)}</dd></div>
                          <div><dt>XP</dt><dd>{st.xp}</dd></div>
                          <div><dt>Take</dt><dd className="money">{take(crime)}</dd></div>
                        </>
                      )}
                    </dl>
                    {can && <p className="muted small entry-risk">{risk(crime)}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

const itemName = (id: string) => ITEM_BY_ID[id]?.name ?? id;

/** Cooking: every recipe, its level and XP, and (once you can) your chance to burn it. */
function RecipeList({ lvl }: { lvl: number }) {
  const rows = [...RECIPES].sort((a, b) => a.level - b.level);
  return (
    <ol className="ledger">
      {rows.map((r) => {
        const can = lvl >= r.level;
        return (
          <li key={r.from} className={`entry ${can ? '' : 'locked'}`}>
            <div className="entry-main">
              <div className="entry-title">
                <span className="mono small lvl-col">{r.level}</span>
                <span className="entry-name">{itemName(r.to)}</span>
              </div>
              <dl className="entry-stats">
                <div><dt>From</dt><dd>{itemName(r.from)}</dd></div>
                <div><dt>XP</dt><dd>{r.xp}</dd></div>
                {can && <div><dt>Burn</dt><dd>{pct(burnChance(r, lvl))}</dd></div>}
                <div><dt>No burns</dt><dd>Lv {r.stopBurn}</dd></div>
              </dl>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Tinkering: every sheet and piece of gear, in level order, with what it takes and where you make it. */
function CraftList({ lvl }: { lvl: number }) {
  const rows = [...CRAFTS].sort((a, b) => a.level - b.level);
  return (
    <ol className="ledger">
      {rows.map((c) => {
        const can = lvl >= c.level;
        return (
          <li key={c.id} className={`entry ${can ? '' : 'locked'}`}>
            <div className="entry-main">
              <div className="entry-title">
                <span className="mono small lvl-col">{c.level}</span>
                <span className="entry-name">{itemName(c.id)}</span>
              </div>
              <dl className="entry-stats">
                <div><dt>Where</dt><dd>{c.station === 'press' ? 'A press' : 'A workbench'}</dd></div>
                <div><dt>Needs</dt><dd>{Object.entries(c.inputs).map(([id, n]) => `${n} × ${itemName(id)}`).join(', ')}</dd></div>
                <div><dt>XP</dt><dd>{c.xp}</dd></div>
              </dl>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
