// v0.60: the two basketball players never walk into each other (they used to overlap, jittering with flailing arms).
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { Hoops } from './hoops';
import { COURT } from './map';

test('the ballers keep apart: ten minutes of play, never closer than 0.8', () => {
  const h = new Hoops(new THREE.Scene(), COURT);
  let min = Infinity;
  for (let t = 0; t < 600; t += 1 / 60) {
    h.update(t);
    if (t > 1) min = Math.min(min, h.player(0, t).pos.distanceTo(h.player(1, t).pos));
  }
  expect(min).toBeGreaterThan(0.8);
});
