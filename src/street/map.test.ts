import { describe, expect, it } from 'vitest';
import zoneWestSql from '../../supabase/migrations/0026_zone_west.sql?raw';
import { GUS_TALK, WATER_MAIN, BAR_LEAK, GRID, gi, inGrid, LINKS, ENCLOSURES, FIXTURES, FLOOR_H, LOBBY, NODES, NPCS, PATROL, TOURIST_AREAS, inPark, SPAWN, STAIRS, WAKE, WARD, buildBlocked, canStep, floorY, inRect, isUpstairs } from './map';
import { findPath, neighbors } from './pathfind';
import { CRIMES } from '../game/data/crimes';
import { GUARD_ROUTE } from '../game/watchers';

/** Every Street Crime has a place on the map (design §4). */
const PLACED = CRIMES.map((c) => c.id);

it('every street spot and NPC is reachable from spawn', () => {
  const b = buildBlocked();
  expect(b[gi(...SPAWN)]).toBe(0);
  const bad = NODES.filter((n) => findPath(b, GRID, SPAWN, neighbors(n.x, n.y), canStep) === null).map((n) => n.id);
  expect(bad).toEqual([]);
  // (Splinter sits on his own spot against the sewer's wall: you walk up next to him from the foot of the ladder.)
  const ladderFoot = LINKS.find((l) => l.id === 'sewer_down')!.to;
  for (const npc of NPCS)
    expect(
      npc.kind === 'splinter'
        ? findPath(b, GRID, ladderFoot, neighbors(npc.x, npc.y), canStep)
        : // (v0.62: Gus stays behind his counter: you talk to him from in front of it.)
          findPath(b, GRID, SPAWN, npc.kind === 'plumber' ? GUS_TALK : [[npc.x, npc.y]], canStep),
      npc.id,
    ).not.toBeNull();
});

// v0.62 ("Pipe Dreams"): the water main is on the sidewalk you can walk round, the bar's leak on a floor tile, and
// Gus can't leave his corner (nor anyone get in behind the counter).
it("Pipe Dreams' places: the water main, the leak, Gus's corner", () => {
  const b = buildBlocked();
  expect(findPath(b, GRID, SPAWN, neighbors(...WATER_MAIN), canStep)).not.toBeNull();
  expect(b[gi(...BAR_LEAK)]).toBe(0);
  expect(findPath(b, GRID, SPAWN, [BAR_LEAK], canStep)).not.toBeNull();
  const gus = NPCS.find((n) => n.id === 'gus')!;
  expect(findPath(b, GRID, SPAWN, [[gus.x, gus.y]], canStep)).toBeNull();
});

it('every spot can be worked from its own side of a fence or wall (not reaching through it)', async () => {
  const { enclosureAt } = await import('./map');
  const b = buildBlocked();
  const bad = NODES.filter((n) => {
    const same = neighbors(n.x, n.y).filter(([x, y]) => enclosureAt(x, y) === enclosureAt(n.x, n.y));
    return findPath(b, GRID, SPAWN, same, canStep) === null;
  }).map((n) => n.id);
  expect(bad).toEqual([]);
});

it('every placed crime has spots, and nothing stands on a fixture', () => {
  expect([...new Set(NODES.map((n) => n.crimeId))].sort()).toEqual([...PLACED].sort());
  const fixtures = new Set(FIXTURES.map((f) => `${f.x},${f.y}`));
  for (const n of NODES) expect(fixtures.has(`${n.x},${n.y}`), n.id).toBe(false);
  for (const p of NPCS) expect(fixtures.has(`${p.x},${p.y}`), p.id).toBe(p.kind === 'splinter');
});

it('six tourists stroll inside the park, each in its own block (v0.54)', () => {
  const tourists = NODES.filter((n) => n.crimeId === 'pick_tourist');
  expect(tourists).toHaveLength(6);
  tourists.forEach((t, i) => {
    expect(t.wanders).toEqual(TOURIST_AREAS[i]);
    expect(inRect(t.wanders!, t.x, t.y)).toBe(true);
    expect(inPark(t.x, t.y)).toBe(true);
  });
});

it('walled and fenced places can only be entered through their openings', () => {
  const b = buildBlocked();
  for (const e of ENCLOSURES) {
    const inside = e.openings[0].inside;
    const path = findPath(b, GRID, SPAWN, [inside], canStep)!;
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
      const stands = neighbors(n.x, n.y).filter(([x, y]) => inGrid(x, y) && !b[gi(x, y)]);
      for (const [sx, sy] of stands) {
        if (!findPath(b, GRID, SPAWN, [[sx, sy]], canStep)) continue; // you can't stand there either
        expect(findPath(b, GRID, [npc.x, npc.y], neighbors(sx, sy), canStep), `${npc.id} → ${n.id} at ${sx},${sy}`).not.toBeNull();
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
      expect(b[gi(x, y)], `${x},${y} free`).toBe(0);
      expect(inRect(PATROL, x, y), `${x},${y} in patrol area`).toBe(true);
    }
  });
});

it('the Yard: you get in through the three gates, and you can reach every spot a thug stands on', async () => {
  const { THUG_TILES } = await import('../game/enemies');
  const { YARD, YARD_GATES } = await import('./map');
  const b = buildBlocked();
  expect(THUG_TILES.length).toBeGreaterThan(15);
  for (const [x, y] of THUG_TILES) {
    expect(inRect(YARD, x, y)).toBe(true);
    expect(findPath(b, GRID, SPAWN, neighbors(x, y).concat([[x, y]]), canStep), `${x},${y}`).not.toBeNull();
  }
  for (const [x, y] of YARD_GATES) expect(b[gi(x, y)], `gate ${x},${y} open`).toBe(0);
  // The rest of the fence row is closed.
  const closed = [];
  for (let x = YARD.x0; x <= YARD.x1; x++) if (b[gi(x, YARD.y1)]) closed.push(x);
  expect(closed.length).toBe(YARD.x1 - YARD.x0 + 1 - YARD_GATES.length);
});

describe('the hospital', () => {
  it('you wake up where the server puts you, and start where it starts you (0017; moved in 0026_zone_west.sql)', () => {
    expect(zoneWestSql).toContain(`p.pos_x := ${WAKE[0]}; p.pos_y := ${WAKE[1]};`);
    expect(zoneWestSql).toContain(`coalesce(p.pos_x, ${SPAWN[0]})`);
    expect(isUpstairs(...WAKE)).toBe(true);
  });
  it('the ward is only reachable by the stairs, and from the ward you get back out', () => {
    const b = buildBlocked();
    const out = findPath(b, GRID, WAKE, [SPAWN], canStep)!;
    expect(out).not.toBeNull();
    // Every step between the ward and the lobby is a stair, straight down.
    const route = [WAKE, ...out];
    for (let i = 1; i < route.length; i++) {
      const [ax, ay] = route[i - 1];
      const [bx, by] = route[i];
      if (isUpstairs(ax, ay) !== isUpstairs(bx, by)) expect(STAIRS.some((s) => s.x === ax && s.x === bx)).toBe(true);
    }
    // Walking along the back of the lobby, you can't step up into the ward.
    expect(canStep(LOBBY.x0 + 2, LOBBY.y0, LOBBY.x0 + 2, WARD.y1)).toBe(false);
    // You can't step onto the stairs from the side.
    expect(canStep(LOBBY.x0 + 1, LOBBY.y0, LOBBY.x0, LOBBY.y0)).toBe(false);
  });
  it('the floor rises up the stairs to the ward', () => {
    const s = STAIRS[0];
    expect(floorY(s.x + 0.5, s.bottom[1] + 1.5)).toBe(0);
    expect(floorY(s.x + 0.5, s.bottom[1] + 0.5)).toBeCloseTo(FLOOR_H / 4);
    expect(floorY(s.x + 0.5, WARD.y1 + 0.5)).toBe(FLOOR_H);
    expect(floorY(LOBBY.x0 + 2.5, LOBBY.y0 + 0.5)).toBe(0); // the lobby's back row, between the stairs
  });
});

describe('the sewer', () => {
  it('both ends of the ladder are reachable, and every rat patch from the ladder', async () => {
    const { LINKS, RAT_ZONES } = { ...(await import('./map')), ...(await import('../game/enemies')) };
    const b = buildBlocked();
    const [down, up] = LINKS;
    expect(findPath(b, GRID, SPAWN, neighbors(...down.at), canStep)).not.toBeNull();
    expect(findPath(b, GRID, SPAWN, [up.to], canStep)).not.toBeNull();
    expect(Math.max(Math.abs(up.to[0] - down.at[0]), Math.abs(up.to[1] - down.at[1]))).toBe(1); // you come up next to the pothole
    expect(Math.max(Math.abs(down.to[0] - up.at[0]), Math.abs(down.to[1] - up.at[1]))).toBe(1); // and arrive at the ladder's foot
    for (const zone of RAT_ZONES) {
      expect(zone.length).toBeGreaterThan(10);
      expect(findPath(b, GRID, down.to, [zone[0]], canStep)).not.toBeNull();
    }
    expect(RAT_ZONES).toHaveLength(10);
  });
});

it("the rats' patches are the ones the server has (0037: the sewer moved down with the bigger map)", async () => {
  const { RAT_ZONES } = await import('../game/enemies');
  const sewerSql = (await import('../../supabase/migrations/0037_bigger_map.sql?raw')).default;
  const tiles = RAT_ZONES.flat();
  expect(sewerSql).toContain(`px int[] := array[${tiles.map((p) => p[0]).join(',')}];`);
  expect(sewerSql).toContain(`py int[] := array[${tiles.map((p) => p[1]).join(',')}];`);
});

it("the server has the same cooking stations (0037; the Yard's barrel: 0040, moved in 0041)", async () => {
  const { STATIONS } = await import('./map');
  const sql = (await import('../../supabase/migrations/0037_bigger_map.sql?raw')).default + (await import('../../supabase/migrations/0040_beach.sql?raw')).default;
  const turf = (await import('../../supabase/migrations/0041_bar_and_yard.sql?raw')).default;
  for (const s of STATIONS)
    if (s.id === 'barrel_1') expect(turf).toContain(`update public.stations set x = ${s.x}, y = ${s.y} where id = 'barrel_1';`);
    else expect(sql).toContain(`('${s.id}', '${s.kind}', ${s.x}, ${s.y})`);
});

it('every cooking spot, press and workbench can be reached from the spawn (the Factory through its lot)', async () => {
  const { STATIONS, FACTORY, FACTORY_LOT, FACTORY_LOT_GATE, inSewer } = await import('./map');
  const b = buildBlocked();
  for (const st of STATIONS.filter((x) => !inSewer(x.x, x.y))) expect(findPath(b, GRID, SPAWN, neighbors(st.x, st.y), canStep), st.id).not.toBeNull();
  // The way into the Factory goes through the lot's opening and then the roll-up door.
  const route = findPath(b, GRID, SPAWN, [[FACTORY.x0 + 5, FACTORY.y0 + 5]], canStep)!;
  const firstLot = route.findIndex(([x, y]) => inRect(FACTORY_LOT, x, y));
  expect(FACTORY_LOT_GATE.some(([x, y]) => x === route[firstLot][0] && y === route[firstLot][1])).toBe(true);
});
