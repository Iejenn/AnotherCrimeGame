// Character creation: a name and a look, with a live 3D preview that slowly turns.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Look } from '../game/types';
import { BOTTOM_COLORS, DEFAULT_LOOK, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, TOP_COLORS, animateCharacter, buildCharacter, hex, randomLook } from '../street/character';
import { hasOldSave } from '../game/save';

function Preview({ look }: { look: Look }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb38a, 1.6));
    const sun = new THREE.DirectionalLight(0xffdcb0, 1.3);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.0, 3.4);
    camera.lookAt(0, 0.62, 0);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshLambertMaterial({ color: 0xd8d4cb }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // The model shares geometry and materials with the Street, so there's nothing to dispose per rebuild.
    let model: THREE.Group | null = null;
    let built = '';
    const rebuild = () => {
      const key = JSON.stringify(lookRef.current);
      if (key === built) return;
      built = key;
      if (model) scene.remove(model);
      model = buildCharacter(lookRef.current);
      scene.add(model);
    };

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      rebuild();
      if (model) {
        model.rotation.y = Math.sin(performance.now() / 1600) * 0.9;
        animateCharacter(model, 'idle', performance.now());
      }
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="char-preview" ref={hostRef} aria-label="Character preview" />;
}

function Swatches({ label, colors, value, onPick }: { label: string; colors: number[]; value: number; onPick: (i: number) => void }) {
  return (
    <div className="look-row">
      <span className="label">{label}</span>
      <div className="swatches">
        {colors.map((c, i) => (
          <button key={i} className={`swatch ${value === i ? 'selected' : ''}`} style={{ background: hex(c) }} aria-label={`${label} ${i + 1}`} onClick={() => onPick(i)} />
        ))}
      </div>
    </div>
  );
}

/** `onImport` is only offered offline; online, `error` shows why the server refused (e.g. name taken). */
export function CreateCharacter({ onCreate, onImport, error, busy = false }: { onCreate: (name: string, look: Look) => void; onImport?: () => void; error?: string; busy?: boolean }) {
  const [name, setName] = useState('');
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [oldSave] = useState(hasOldSave);
  const set = (k: keyof Look) => (i: number) => setLook((l) => ({ ...l, [k]: i }));

  return (
    <div className="create">
      <div className="kicker">A point-and-click crime RPG</div>
      <h1 className="title">
        Underworld
      </h1>
      <p className="deck">Every legend starts on a street corner.</p>
      {oldSave && (
        <p className="notice-old">
          The game has been rebuilt as an RPG with new skills, so characters from before can't come along. Make a new one below.
        </p>
      )}

      <label className="field">
        <span className="label">Street name</span>
        <input value={name} maxLength={20} placeholder="Johnny Two-Times" onChange={(e) => setName(e.target.value)} autoFocus />
      </label>

      <div className="field">
        <span className="label">Look</span>
        <div className="creator">
          <Preview look={look} />
          <div className="look-options">
            <Swatches label="Skin" colors={SKIN_TONES} value={look.skin} onPick={set('skin')} />
            <div className="look-row">
              <span className="label">Hair</span>
              <div className="hair-styles">
                {HAIR_STYLES.map((h, i) => (
                  <button key={h} className={`btn tiny ${look.hair === i ? 'primary' : ''}`} onClick={() => set('hair')(i)}>
                    {h}
                  </button>
                ))}
              </div>
            </div>
            <Swatches label={look.hair === 4 ? 'Cap' : 'Hair colour'} colors={HAIR_COLORS} value={look.hairColor} onPick={set('hairColor')} />
            <Swatches label="Top" colors={TOP_COLORS} value={look.top} onPick={set('top')} />
            <Swatches label="Trousers" colors={BOTTOM_COLORS} value={look.bottom} onPick={set('bottom')} />
            <button className="btn small" onClick={() => setLook(randomLook())}>
              Randomise
            </button>
          </div>
        </div>
      </div>

      {error && <p className="auth-error">{error}</p>}
      <button className="btn primary block" disabled={!name.trim() || busy} onClick={() => onCreate(name, look)}>
        Hit the streets
      </button>
      {onImport && (
        <button className="btn link" onClick={onImport}>
          I have a save code
        </button>
      )}
    </div>
  );
}
