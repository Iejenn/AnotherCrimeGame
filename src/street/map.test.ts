import { expect, it } from 'vitest';
import { ENCLOSURES, FIXTURES, NODES, NPCS, PARK, PATROL, SPAWN, W, H, buildBlocked, canStep, inRect } from './map';
import { findPath, neighbors } from './pathfind';
import { CRIMES } from '../game/data/crimes';
import { GUARD_ROUTE } from '../game/watchers';

/** Every Street Crime has a place on the map (design §4). */
const PLACED = CRIMES.map((c) => c.id);

it('every street spot and NPC is reachable from spawn', () => {
  const b = buildBlocked();
  expect(b[SPAWN[1] * W + SPAWN[0]]).toBe(0);
  const bad = NODES.filter((n) => findPath(b, W, H, SPAWN, neighbors(n.x, n.y), canStep) === null).map((n) => n.id);
  expect(bad).toEqual([]);
  for (const npc of NPCS) expect(findPath(b, W, H, SPAWN, [[npc.x, npc.y]], canStep), npc.id).not.toBeNull();
});

it('every placed crime has spots, and nothing stands on a fixture', () => {
  expect([...new Set(NODES.map((n) => n.crimeId))].sort()).toEqual([...PLACED].sort());
  const fixtures = new Set(FIXTURES.map((f) => `${f.x},${f.y}`));
  for (const n of NODES) expect(fixtures.has(`${n.x},${n.y}`), n.id).toBe(false);
  for (const p of NPCS) expect(fixtures.has(`${p.x},${p.y}`), p.id).toBe(false);
});

it('the three tourists stroll inside the park', () => {
  const tourists = NODES.filter((n) => n.crimeId === 'pick_tourist');
  expect(tourists).toHaveLength(3);
  for (const t of tourists) {
    expect(t.wanders).toEqual(PARK);
    expect(inRect(PARK, t.x, t.y)).toBe(true);
  }
});

it('walled and fenced places can only be entered through their openings', () => {
  const b = buildBlocked();
  for (const e of ENCLOSURES) {
    const inside = e.openings[0].inside;
    const path = findPath(b, W, H, SPAWN, [inside], canStep)!;
    expect(path, e.id).not.toBeNull();
    const entry = path.findIndex(([x, y]) => inRect(e.rect, x, y));
    const at = path[entry];
    const before = path[entry - 1];
    expect(e.openings.some((o) => o.inside.join() === at.join() && o.outside.join() === before.join()), e.id).toBe(true);
  }
  // No stepping through the store's wall next to its door, or diagonally through the door.
  const store = ENCLOSURES.find((e) => e.id === 'store')!;
  const [dx, dy] = store.openings[0].inside;
  expect(canStep(dx - 1, dy, dx - 1, dy + 1)).toBe(false);
  expect(canStep(dx, dy, dx + 1, dy + 1)).toBe(false);
  expect(canStep(dx, dy, dx, dy + 1)).toBe(true);
});

it('every catcher can walk over to wherever you stand at the crimes he watches', () => {
  const b = buildBlocked();
  for (const npc of NPCS.filter((n) => n.catches?.length)) {
    for (const n of NODES.filter((x) => npc.catches!.includes(x.crimeId))) {
      // Every free tile next to the spot where you could stand.
      const stands = neighbors(n.x, n.y).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && !b[y * W + x]);
      for (const [sx, sy] of stands) {
        if (!findPath(b, W, H, SPAWN, [[sx, sy]], canStep)) continue; // you can't stand there either
        expect(findPath(b, W, H, [npc.x, npc.y], neighbors(sx, sy), canStep), `${npc.id} → ${n.id} at ${sx},${sy}`).not.toBeNull();
      }
    }
  }
});

it("the guard's patrol route is walkable, straight, and stays in his patrol area", () => {
  const b = buildBlocked();
  GUARD_ROUTE.forEach(([x0, y0], i) => {
    const [x1, y1] = GUARD_ROUTE[(i + 1) % GUARD_ROUTE.length];
    expect(x0 === x1 || y0 === y1, `leg ${i} is straight`).toBe(true);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) {
      const x = x0 + Math.sign(x1 - x0) * k;
      const y = y0 + Math.sign(y1 - y0) * k;
      expect(b[y * W + x], `${x},${y} free`).toBe(0);
      expect(inRect(PATROL, x, y), `${x},${y} in patrol area`).toBe(true);
    }
  });
});

it('the Yard: you get in through the two gates, and you can reach every spot a thug stands on', async () => {
  const { THUG_TILES } = await import('../game/enemies');
  const { YARD, YARD_GATES } = await import('./map');
  const b = buildBlocked();
  expect(THUG_TILES.length).toBeGreaterThan(15);
  for (const [x, y] of THUG_TILES) {
    expect(inRect(YARD, x, y)).toBe(true);
    expect(findPath(b, W, H, SPAWN, neighbors(x, y).concat([[x, y]]), canStep), `${x},${y}`).not.toBeNull();
  }
  for (const [x, y] of YARD_GATES) expect(b[y * W + x], `gate ${x},${y} open`).toBe(0);
  // The rest of the fence row is closed.
  const closed = [];
  for (let x = YARD.x0; x <= YARD.x1; x++) if (b[YARD.y1 * W + x]) closed.push(x);
  expect(closed.length).toBe(YARD.x1 - YARD.x0 + 1 - YARD_GATES.length);
});
