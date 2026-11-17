// The quest log (docs/design.md §16): every quest, whether you started it, and what to do next.
import type { GameState } from '../game/types';
import { QUESTS, questLog, questStep } from '../game/data/quests';

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
              {done && <p className="muted small">Reward: {q.reward}</p>}
            </li>
          );
        })}
      </ul>
      <p className="muted small">More quests are coming: people around the city who need things done.</p>
    </div>
  );
}
