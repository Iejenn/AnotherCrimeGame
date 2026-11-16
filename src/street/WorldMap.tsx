// The world map: the whole island, with an icon for every place. Tap an icon to see what's there
// (crimes and their level, who lives there) and walk to it. Opened from the button under the minimap.
// As the map grows, new places only need an entry in AREAS (map.ts).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../game/types';
import { CRIME_BY_ID } from '../game/data/crimes';
import { ITEM_BY_ID } from '../game/data/items';
import { canStart, crimeStats, fmtMoney, skillLevel } from '../game/engine';
import { pct } from '../components/ui';
import { AREAS, H, NPCS, ROOMS, W, type Area, type AreaIcon } from './map';
import { MAP_EDGE, drawWorld } from './mapArt';

const PX = 8; // canvas pixels per tile

/** Little pictures for the places, as SVG paths in a 24×24 box. */
const ICON_ART: Record<AreaIcon, JSX.Element> = {
  park: (
    <>
      <circle cx="12" cy="9" r="6" fill="#4f8a44" />
      <rect x="11" y="13" width="2" height="7" fill="#6b4a2e" />
    </>
  ),
  court: (
    <>
      <circle cx="12" cy="12" r="7" fill="#e0782a" />
      <path d="M5 12 H19 M12 5 V19 M7 7 Q12 12 7 17 M17 7 Q12 12 17 17" stroke="#3a1e0e" strokeWidth="1.2" fill="none" />
    </>
  ),
  shop: (
    <>
      <rect x="6" y="9" width="12" height="10" rx="1" fill="#f2d27a" />
      <path d="M9 9 V7 A3 3 0 0 1 15 7 V9" stroke="#f2d27a" strokeWidth="1.6" fill="none" />
    </>
  ),
  candy: (
    <>
      <circle cx="12" cy="9" r="5" fill="#ff7ab8" />
      <path d="M12 4 A5 5 0 0 1 12 14 A2.5 2.5 0 0 1 12 9 A2.5 2.5 0 0 0 12 4" fill="#ffe6f0" />
      <rect x="11.2" y="13.5" width="1.6" height="7" fill="#e8e2d0" />
    </>
  ),
  bar: (
    <>
      <path d="M7 6 H17 L16 18 H8 Z" fill="#e0a030" />
      <path d="M7 6 H17 V9 H7 Z" fill="#f2ece0" />
      <path d="M17 9 H19.5 V14 H16.5" stroke="#e0a030" strokeWidth="1.6" fill="none" />
    </>
  ),
  gas: (
    <>
      <rect x="6" y="5" width="9" height="15" rx="1" fill="#d9473a" />
      <rect x="8" y="7" width="5" height="4" fill="#d8f0ff" />
      <path d="M15 9 H17 V16 A1.5 1.5 0 0 0 20 16 V10 L18 8" stroke="#e8e2d0" strokeWidth="1.4" fill="none" />
    </>
  ),
  lot: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" fill="#2a5a9a" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="#ffffff" fontFamily="Arial, sans-serif">
        P
      </text>
    </>
  ),
};

/** The tile to walk to for an area: a room's door, otherwise its middle. */
function walkTarget(a: Area): [number, number] {
  const room = ROOMS.find((r) => r.id === a.id);
  if (room) return [room.door[0], room.door[1] + 1];
  return [Math.floor((a.rect.x0 + a.rect.x1) / 2), Math.floor((a.rect.y0 + a.rect.y1) / 2)];
}

export function WorldMap({ s, here, onClose, onWalk }: { s: GameState; here: [number, number]; onClose: () => void; onWalk: (x: number, y: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sel, setSel] = useState<Area | null>(null);
  const world = useMemo(() => drawWorld(PX), []);
  useEffect(() => {
    const c = canvasRef.current!;
    c.width = world.width;
    c.height = world.height;
    c.getContext('2d')!.drawImage(world, 0, 0);
  }, [world]);

  // Positions as percentages of the map, so the icons stay put however big the map is drawn.
  const fullW = W + MAP_EDGE * 2;
  const fullH = H + MAP_EDGE * 2;
  const at = (x: number, y: number) => ({ left: `${((x + MAP_EDGE) / fullW) * 100}%`, top: `${((y + MAP_EDGE) / fullH) * 100}%` });
  const lvl = skillLevel(s, 'street');

  return (
    <div className="worldmap-backdrop" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="World map">
      <div className="worldmap">
        <div className="worldmap-head">
          <h2 className="headline">The island</h2>
          <button className="btn tiny" onClick={onClose} aria-label="Close the map">
            ×
          </button>
        </div>
        <div className="worldmap-canvas" style={{ aspectRatio: `${fullW} / ${fullH}` }}>
          <canvas ref={canvasRef} />
          {AREAS.map((a) => {
            const locked = a.crimes.length > 0 && a.crimes.every((id) => canStart(s, id));
            return (
              <button
                key={a.id}
                className={`map-icon ${sel?.id === a.id ? 'active' : ''} ${locked ? 'locked' : ''}`}
                style={at((a.rect.x0 + a.rect.x1 + 1) / 2, (a.rect.y0 + a.rect.y1 + 1) / 2)}
                onClick={() => setSel(a)}
                aria-label={a.name}
                title={a.name}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {ICON_ART[a.icon]}
                </svg>
              </button>
            );
          })}
          {s.grave && <span className="map-marker grave" style={at(s.grave.x + 0.5, s.grave.y + 0.5)} title="Your grave" />}
          <span className="map-marker you" style={at(here[0] + 0.5, here[1] + 0.5)} title="You are here" />
        </div>

        {sel ? (
          <section className="worldmap-info">
            <h3 className="rule-head">{sel.name}</h3>
            <p className="small">{sel.blurb}</p>
            {sel.crimes.length > 0 && (
              <ul className="plain small map-crimes">
                {sel.crimes.map((id) => {
                  const c = CRIME_BY_ID[id];
                  const can = !canStart(s, id);
                  const odds = c.baseChance >= 1 ? '100% if unseen' : pct(crimeStats(s, c).chance);
                  const take = c.items?.length ? c.items.map((i) => ITEM_BY_ID[i]?.name ?? i).join(' or ') : `${fmtMoney(c.cashMin)}–${fmtMoney(c.cashMax)}`;
                  return (
                    <li key={id} className={can ? '' : 'locked'}>
                      <span className="mono">Lv {c.level}</span> <strong>{c.name}</strong>{' '}
                      <span className="muted">{can ? `· ${odds} · ${take}` : `· you're level ${lvl}`}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {sel.npcs.length > 0 && (
              <p className="small">
                <span className="label">Who's here</span> {sel.npcs.map((id) => NPCS.find((n) => n.id === id)?.name ?? id).join(', ')}
              </p>
            )}
            <button className="btn small primary" onClick={() => onWalk(...walkTarget(sel))}>
              Walk there
            </button>
          </section>
        ) : (
          <p className="muted small worldmap-hint">Tap a place to see what's there.</p>
        )}
      </div>
    </div>
  );
}
