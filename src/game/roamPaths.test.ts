// The server walks the same detours as the game (v0.54; since v0.58 it works them out itself, see below).
import { expect, test } from 'vitest';
import { enemyAt, THUG_TILES } from './enemies';
import { allDetours, walkPoint } from './roamPaths';

// v0.58: the server works the walks out itself (0041, game.roam_bends: the same algorithm, ported). Checked against the
// game for every pair of tiles of every place with scripts/roam-parity.ts (18,838 pairs, all the same); the migration's
// own check compares enemies caught mid-detour, two of every roaming kind.
test("0041's check catches every roaming kind mid-detour", async () => {
  const { detourSamples } = await import('../../scripts/turf-sql');
  const kinds = new Set(detourSamples().map((p) => p.kind));
  expect([...kinds].sort()).toEqual(['biker', 'dog', 'giant_rat', 'rat', 'thug']);
  expect(allDetours().size).toBeGreaterThan(0);
});

test('a thug walks round the barrel, not through it', async () => {
  // The Yard's barrel (v0.58: in its second quarter), with open tiles either side.
  const { STATIONS } = await import('../street/map');
  const b = STATIONS.find((s) => s.id === 'barrel_1')!;
  for (let f = 0; f <= 1; f += 0.05) {
    const p = walkPoint([b.x - 1, b.y], [b.x + 1, b.y], f);
    expect(Math.floor(p.x) === b.x && Math.floor(p.z) === b.y).toBe(false);
  }
});

test('no roaming enemy is ever on a solid tile mid-walk', () => {
  const solid = new Set(THUG_TILES.map(([x, y]) => `${x},${y}`));
  const t0 = 1763000000000; // (a real clock time: the schedule only works from the epoch on, far from 0)
  for (let t = t0; t < t0 + 600000; t += 137) for (let i = 0; i < 8; i++) {
    const p = enemyAt('thug', i, t);
    expect(solid.has(`${Math.floor(p.x)},${Math.floor(p.z)}`)).toBe(true);
  }
});
