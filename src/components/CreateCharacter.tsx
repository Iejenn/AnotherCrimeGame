import { useState } from 'react';
import { ORIGINS } from '../game/data/world';
import type { OriginId } from '../game/types';

export function CreateCharacter({ onCreate, onImport }: { onCreate: (name: string, origin: OriginId) => void; onImport: () => void }) {
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState<OriginId>('streetkid');
  return (
    <div className="create">
      <h1 className="logo">UNDERWORLD<span>IDLE</span></h1>
      <p className="tagline">A crime RPG for people with jobs. Plan the heist, close the tab, come back rich.</p>
      <label className="field">
        <span>Street name</span>
        <input value={name} maxLength={20} placeholder="e.g. Johnny Two-Times" onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <div className="field">
        <span>Where you come from</span>
        <div className="origins">
          {ORIGINS.map((o) => (
            <button key={o.id} className={`origin ${origin === o.id ? 'selected' : ''}`} onClick={() => setOrigin(o.id)}>
              <strong>{o.name}</strong>
              <small>{o.desc}</small>
            </button>
          ))}
        </div>
      </div>
      <button className="btn primary big" disabled={!name.trim()} onClick={() => onCreate(name, origin)}>
        Hit the streets →
      </button>
      <button className="btn link" onClick={onImport}>
        Import a save
      </button>
    </div>
  );
}
