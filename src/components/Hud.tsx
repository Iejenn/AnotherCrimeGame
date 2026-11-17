// The game's HUD (v0.44): the icon bar along the bottom, the popups that open over the street (like the world map),
// the settings, and the "worn" popup with your character in 3D wearing your gear.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { GameState } from '../game/types';
import type { GameApi } from '../game/api';
import { useInstall } from '../useInstall';
import { animateCharacter, buildCharacter } from '../street/character';
import { setGear } from '../street/props';
import { Equipment } from './InventoryTab';
import { CHANGELOG } from '../changelog';

export type Panel = 'chat' | 'bag' | 'skills';
export type PopupId = 'worn' | 'quests' | 'highscores' | 'settings';

/** A popup over the street, like the world map: a title, a close button, and its content (scrolls if it's long). */
export function Popup({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="popup-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`popup ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="popup-head">
          <h2 className="headline">{title}</h2>
          <button className="btn tiny" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="popup-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- the icon bar ----------
const ICONS: Record<Panel | PopupId, ReactNode> = {
  // A speech bubble.
  chat: <path d="M4 5 H20 V15 H11 L6 19 V15 H4 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />,
  // A backpack.
  bag: (
    <>
      <path d="M6 9 Q6 5.5 12 5.5 Q18 5.5 18 9 V19 H6 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.5 5.8 Q9.5 3.5 12 3.5 Q14.5 3.5 14.5 5.8 M8.5 13 H15.5 V16.5 H8.5 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </>
  ),
  // A graph going up.
  skills: <path d="M4 19 H20 M5 16 L10 11 L13 14 L19 7 M15.5 7 H19 V10.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />,
  // A shirt.
  worn: <path d="M8.5 4 L4 6.5 L5.8 10.5 L7.5 9.8 V20 H16.5 V9.8 L18.2 10.5 L20 6.5 L15.5 4 Q14.5 6.2 12 6.2 Q9.5 6.2 8.5 4 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  // A question mark.
  quests: (
    <>
      <path d="M8.5 9 Q8.5 5 12 5 Q15.5 5 15.5 8.3 Q15.5 10.5 13 11.6 Q12 12.2 12 14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="12" cy="18.2" r="1.3" fill="currentColor" />
    </>
  ),
  // A trophy.
  highscores: (
    <path
      d="M8 4.5 H16 V9.5 Q16 13.5 12 13.5 Q8 13.5 8 9.5 Z M8 6 H5 Q5 10 8.3 10.5 M16 6 H19 Q19 10 15.7 10.5 M12 13.5 V17 M8.5 19.5 H15.5 L14.5 17 H9.5 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  ),
  // A gear.
  settings: (
    <>
      <path
        d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
};
const LABELS: Record<Panel | PopupId, string> = {
  chat: 'Chat', bag: 'Bag', skills: 'Skills', worn: 'Worn gear', quests: 'Quests', highscores: 'Highscores', settings: 'Settings',
};

/** The buttons along the bottom: chat, bag and skills swap the bottom panel (tap the open one again to hide it); worn
 *  gear, quests, highscores and settings open a popup. */
export function IconBar({ panel, popup, bagFull, onPanel, onPopup }: { panel: Panel | null; popup: PopupId | null; bagFull: boolean; onPanel: (p: Panel) => void; onPopup: (p: PopupId) => void }) {
  const btn = (id: Panel | PopupId, active: boolean, onClick: () => void, dot = false) => (
    <button key={id} className={`hud-btn ${active ? 'active' : ''}`} onClick={onClick} aria-label={LABELS[id]} aria-pressed={active} title={LABELS[id]}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {ICONS[id]}
      </svg>
      {dot && <span className="hud-dot" />}
    </button>
  );
  return (
    <nav className="hud-bar" onPointerDown={(e) => e.stopPropagation()}>
      {(['chat', 'bag', 'skills'] as const).map((id) => btn(id, panel === id, () => onPanel(id), id === 'bag' && bagFull))}
      {(['worn', 'quests', 'highscores', 'settings'] as const).map((id) => btn(id, popup === id, () => onPopup(id)))}
    </nav>
  );
}

// ---------- worn gear: you in 3D, turning slowly, and what each piece does ----------
function CharacterPreview({ s }: { s: GameState }) {
  const host = useRef<HTMLDivElement>(null);
  const gear = useRef(s.equipment);
  gear.current = s.equipment;
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xd8e0f0, 0x3a3028, 1.6));
    const sun = new THREE.DirectionalLight(0xffd8a8, 1.6);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.0, 2.9);
    camera.lookAt(0, 0.68, 0);
    const me = buildCharacter(s.look);
    scene.add(me);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshLambertMaterial({ color: 0x2a2622 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const size = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = performance.now();
      setGear(me, gear.current);
      me.rotation.y = t / 2500;
      animateCharacter(me, 'idle', t);
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // The look doesn't change while you play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="char-preview" ref={host} />;
}

export function WornPopup({ s, api, onClose }: { s: GameState; api: GameApi; onClose: () => void }) {
  return (
    <Popup title="Worn gear" onClose={onClose}>
      <div className="worn">
        <CharacterPreview s={s} />
        <Equipment s={s} api={api} />
      </div>
    </Popup>
  );
}

// ---------- settings ----------
export function SettingsPopup({ account, onClose }: { account: { email: string; onSignOut: () => void }; onClose: () => void }) {
  const app = useInstall();
  const [iosHelp, setIosHelp] = useState(false);
  const latest = CHANGELOG[0];
  return (
    <Popup title="Settings" onClose={onClose}>
      <p className="muted small">Signed in as {account.email}. Your character is saved on the server, on every device you sign in on.</p>
      <div className="settings-btns">
        {app.mode === 'prompt' && (
          <button className="btn small primary" onClick={() => void app.install()}>
            Install app
          </button>
        )}
        {app.mode === 'ios' && (
          <button className="btn small primary" onClick={() => setIosHelp((v) => !v)}>
            Install app
          </button>
        )}
        <button className="btn small" onClick={account.onSignOut}>
          Log out
        </button>
      </div>
      {iosHelp && (
        <p className="small install-help">
          In Safari, tap <strong>Share</strong> (the square with an arrow), then <strong>Add to Home Screen</strong>.
        </p>
      )}
      <h3 className="rule-head">
        What's new · v{latest.version}
      </h3>
      <p className="small">
        <strong>{latest.title}</strong>
      </p>
      <ul className="small changes">
        {latest.items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </Popup>
  );
}
