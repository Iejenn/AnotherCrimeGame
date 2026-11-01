import { useState } from 'react';
import { ORIGINS } from '../game/data/world';
import type { OriginId } from '../game/types';

export function CreateCharacter({ onCreate, onImport }: { onCreate: (name: string, origin: OriginId) => void; onImport: () => void }) {
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState<OriginId>('streetkid');
  return (
    <div className="create">
      <div className="kicker">A crime RPG for people with day jobs</div>
      <h1 className="title">
        Underworld <em>Idle</em>
      </h1>
      <p className="deck">Plan the job. Close the tab. Come back richer — or in a cell.</p>

      <label className="field">
        <span className="label">Street name</span>
        <input value={name} maxLength={20} placeholder="Johnny Two-Times" onChange={(e) => setName(e.target.value)} autoFocus />
      </label>

      <fieldset className="field">
        <legend className="label">Where you come from</legend>
        <div className="origins">
          {ORIGINS.map((o) => (
            <label key={o.id} className={`origin ${origin === o.id ? 'selected' : ''}`}>
              <input type="radio" name="origin" checked={origin === o.id} onChange={() => setOrigin(o.id)} />
              <span>
                <strong>{o.name}</strong>
                <span className="muted">{o.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <button className="btn primary block" disabled={!name.trim()} onClick={() => onCreate(name, origin)}>
        Open the file
      </button>
      <button className="btn link" onClick={onImport}>
        I have a save code
      </button>
    </div>
  );
}
