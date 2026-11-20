// The Yard's hangout props (v0.58) stay within the triangle budgets of docs/design.md §18: a prop 300, a vehicle 800.
import * as THREE from 'three';
import * as SL from './streetLife';
import { expect, test } from 'vitest';
import { buildCrane, buildCrate, buildFlowerbed, buildLilyPad, buildMuck, buildPour, buildReeds, buildBarbecue, buildFire, buildBurstPipe, buildContainer, buildDiceCrate, buildFittingsShelf, buildLookout, buildPipeElbow, buildPipeRack, buildPlumbBench, buildRubble, buildRuinWall, buildShelf, buildShopCounter, buildStringLights, buildStrippedCar, buildToolbox, buildWaterHeater, buildWaterMain } from './props';

const tris = (o: THREE.Object3D) => {
  let n = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
};

test('the hangout props are within budget', () => {
  const props: [string, THREE.Object3D, number][] = [
    ['container', buildContainer(4), 300],
    ['ruin wall', buildRuinWall(3), 300],
    ['rubble', buildRubble(), 300],
    ['dice crate', buildDiceCrate(), 300],
    ['lookout', buildLookout(), 300],
    ['string lights', buildStringLights(new THREE.Vector3(), new THREE.Vector3(8, 0, 0)), 300],
    ['stripped car', buildStrippedCar(), 800],
    ['candy shelf', buildShelf('candy', 3), 300],
    ['gas station shelf', buildShelf('gas', 3), 300],
    // v0.62: Hotline's inside and the quest "Pipe Dreams".
    ['water main', buildWaterMain(), 300],
    ['burst pipe', buildBurstPipe(), 300],
    ['fittings shelf', buildFittingsShelf(), 300],
    ['water heater', buildWaterHeater(), 300],
    ['hot-water tank', buildWaterHeater(true), 300],
    ['shop counter', buildShopCounter(3, true), 300],
    ['plumbing bench', buildPlumbBench(), 300],
    ['pipe rack', buildPipeRack(2), 300],
    ['toolbox', buildToolbox(), 300],
    ['pipe elbow', buildPipeElbow(), 300],
    // v0.62: the quality bar (docs/design.md §18).
    ['fire', buildFire(), 300],
    ['barbecue', buildBarbecue(), 300],
    ['pour (sewer outflow)', buildPour({ reach: 0.4, drop: 0.42, pipe: true, core: false, bits: 5 }), 300],
    ['pour (with core)', buildPour({ reach: 0.9, drop: 1.3, bits: 6 }), 300],
    ['lily pad', buildLilyPad(0.13, true), 300],
    ['reeds', buildReeds(1), 300],
    ['muck', buildMuck(3), 300],
    ['flowerbed', buildFlowerbed(1), 300],
    ['crate', buildCrate(), 300],
    ['crane (a vehicle)', buildCrane(), 800],
    ['street lamp', SL.buildStreetLamp(), 300],
    ['hydrant', SL.buildHydrant(), 300],
    ['mailbox', SL.buildMailbox(), 300],
    ['bin (full)', SL.buildBin(true), 300],
    ['bin', SL.buildBin(), 300],
    ['newspaper boxes', SL.buildNewsBoxes(), 300],
    ['bench', SL.buildBench(), 300],
    ['dumpster', SL.buildDumpster(), 300],
  ];
  for (const [name, o, max] of props) expect(tris(o), name).toBeLessThanOrEqual(max);
});

test("the container's doors hang on its corners (not floating)", () => {
  const c = buildContainer(4);
  c.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(c);
  // The doors swing out past the open end, but stay close to it, and the whole thing stands on the floor.
  expect(box.max.x).toBeGreaterThan(1.9);
  expect(box.max.x).toBeLessThan(2.9);
  expect(box.min.y).toBeGreaterThanOrEqual(0);
});
