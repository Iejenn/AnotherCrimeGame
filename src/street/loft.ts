// Low-poly creatures from cross-sections (docs/design.md §18): a body is a few rings along its length, each with its own
// width, height and height off the ground, joined by flat faces. Rings of 6 points give the regular, faceted look of
// old-school RuneScape; every ring is one line of numbers, so a shape is easy to tune. Faces facing down get the
// belly colour (two-tone fur for free).
import * as THREE from 'three';

/** One ring: where along the length (z), half its width (w) and half its height (h), its centre's height (y) and
 *  sideways offset (x, for a tail that curves). */
export interface Ring {
  z: number;
  w: number;
  h: number;
  y: number;
  x?: number;
}

/** A closed tube through the rings (ends capped), flat-shaded, coloured `top`, faces turned down coloured `under`. */
export function loft(rings: Ring[], sides: number, top: number, under = top, emissive = 0): THREE.Mesh {
  const pts: THREE.Vector3[][] = rings.map((r) =>
    Array.from({ length: sides }, (_, i) => {
      // Start half a step round, so a 6-sided ring has a flat top and bottom.
      const a = ((i + 0.5) / sides) * Math.PI * 2;
      return new THREE.Vector3((r.x ?? 0) + Math.sin(a) * r.w, r.y + Math.cos(a) * r.h, r.z);
    }),
  );
  const tris: THREE.Vector3[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => tris.push(a, b, c);
  for (let k = 0; k < rings.length - 1; k++)
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const [a, b, c, d] = [pts[k][i], pts[k][j], pts[k + 1][i], pts[k + 1][j]];
      // Wound so the faces point outwards whichever way the rings run.
      if (rings[k + 1].z > rings[k].z) tri(a, c, b), tri(b, c, d);
      else tri(a, b, c), tri(b, d, c);
    }
  // End caps (a fan round each end ring's centre).
  for (const [k, flip] of [[0, true], [rings.length - 1, false]] as const) {
    const r = rings[k];
    const c = new THREE.Vector3(r.x ?? 0, r.y, r.z);
    const fwd = (rings[rings.length - 1].z > rings[0].z) !== flip;
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      if (fwd) tri(c, pts[k][i], pts[k][j]);
      else tri(c, pts[k][j], pts[k][i]);
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(tris);
  geo.computeVertexNormals(); // (unindexed: one normal per face, so it's flat-shaded)
  const n = geo.getAttribute('normal');
  const colors = new Float32Array(tris.length * 3);
  const cTop = new THREE.Color(top);
  const cUnder = new THREE.Color(under);
  for (let t = 0; t < tris.length; t += 3) {
    const c = n.getY(t) < -0.35 ? cUnder : cTop;
    for (let v = 0; v < 3; v++) c.toArray(colors, (t + v) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: emissive ? new THREE.Color(emissive) : undefined });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A straight limb between two points: a 4-sided (or `sides`) tapering prism, flat-shaded. */
export function limb(from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, color: number, sides = 4): THREE.Mesh {
  const dir = to.clone().sub(from);
  const geo = new THREE.CylinderGeometry(r1, r0, dir.length(), sides, 1).toNonIndexed();
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  return m;
}

/** Spikes: each a thin 3-sided pyramid from a base point to a tip (fur tufts, claws). */
export function spikes(list: [THREE.Vector3, THREE.Vector3, number][], color: number): THREE.Mesh {
  const tris: THREE.Vector3[] = [];
  for (const [base, tip, r] of list) {
    const d = tip.clone().sub(base).normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(d);
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
    u.normalize();
    const v = d.clone().cross(u).normalize();
    const b = [0, 1, 2].map((i) => {
      const a = (i / 3) * Math.PI * 2;
      return base.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
    });
    for (let i = 0; i < 3; i++) tris.push(b[i], b[(i + 1) % 3], tip);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(tris);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}
