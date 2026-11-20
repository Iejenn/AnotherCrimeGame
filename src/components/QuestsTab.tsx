// The quest log (docs/design.md §16): every quest, whether you started it, and what to do next.
import type { GameState } from '../game/types';
import { QUESTS, questLog, questStep } from '../game/data/quests';
import { SKILL_BY_ID } from '../game/data/skills';
import { myCombatLevel } from '../game/combat';
import { levelFromXp } from '../game/xp';

export function QuestsTab({ s }: { s: GameState }) {
  return (
    <div className="quests">
      <div className="section-head">
        <h2 className="headline">Quests</h2>
        <span className="muted mono small">
          {QUESTS.filter((q) => questStep(s, q.id) >= q.done).length}/{QUESTS.length} done
        </span>
      </div>
      <ul className="quest-list">
        {QUESTS.map((q) => {
          const step = questStep(s, q.id);
          const done = step >= q.done;
          const status = done ? 'Complete' : step > 0 ? 'In progress' : 'Not started';
          return (
            <li key={q.id} className={`quest ${done ? 'done' : step > 0 ? 'active' : ''}`}>
              <div className="quest-head">
                <strong>{q.name}</strong>
                <span className="quest-status small">{status}</span>
              </div>
              <p className="small">{step > 0 ? questLog(s, q) : q.start}</p>
              {/* v0.62: advised levels, green when you have them, amber when you're below (never required). */}
              {!done && q.advised?.length ? (
                <p className="small quest-advice">
                  Advised:{' '}
                  {q.advised.map((a, i) => {
                    const have = a.skill === 'combat' ? myCombatLevel(s) : levelFromXp(s.skills[a.skill]?.xp ?? 0);
                    const name = a.skill === 'combat' ? 'Combat' : SKILL_BY_ID[a.skill].name;
                    return (
                      <span key={a.skill} className={have >= a.level ? 'ok' : 'low'}>
                        {i > 0 ? ', ' : ''}
                        {name} level {a.level}
                      </span>
                    );
                  })}
                </p>
              ) : null}
              {done && <p className="muted small">Reward: {q.reward}</p>}
            </li>
          );
        })}
      </ul>
      <p className="muted small">More quests are coming: people around the city who need things done.</p>
    </div>
  );
}
