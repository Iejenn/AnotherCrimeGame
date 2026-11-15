// The Street: a small low-poly city you walk around RuneScape-style.
// Tap the ground to walk. Tap a person, car or door to walk up and work it:
// that starts the same job queue the Jobs tab uses, so it keeps running offline.
// Walking away stops the job. Drag to rotate the camera, pinch (or mouse wheel) to zoom.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GameState, Report, SkillId } from '../game/types';
import { CRIME_BY_ID } from '../game/data/crimes';
import { SKILL_BY_ID } from '../game/data/skills';
import { bail, bailCost, canStart, fmtDuration, fmtMoney, isUnlocked, skillLevel, startJob, stopJob } from '../game/engine';
import { BLOCK, BLOCKS, COLS, H, NODES, ROWS, SPAWN, W, buildBlocked, isRoad, type StreetNode } from './map';
import { findPath, neighbors } from './pathfind';
import { mulberry32 } from '../game/rng';

type Act = (fn: (d: GameState, now: number) => void) => void;
interface Msg {
  t: number;
  text: string;
}

const WALK_SPEED = 4; // tiles per second
const LABEL_RANGE = 5; // tiles
const MAX_LABELS = 6;
const SKILL_COLORS: Record<SkillId, number> = {
  petty: 0x8a6f4d, auto: 0x4f5d6b, burglary: 0x5c4b5e, muscle: 0x6b3f36,
  fraud: 0x3f5b57, smuggling: 0x5e5a3c, robbery: 0x6e2f28, heist: 0x7a6332,
};

function lockMessage(s: GameState, crimeId: string) {
  const crime = CRIME_BY_ID[crimeId];
  const skill = SKILL_BY_ID[crime.skill];
  if (!isUnlocked(s, crime.skill)) {
    const u = skill.unlock;
    const parts = Object.entries(u.skill ?? {}).map(([k, v]) => `${SKILL_BY_ID[k as SkillId].name} ${v}`);
    if (u.total) parts.push(`total level ${u.total}`);
    return `You don't know the first thing about ${skill.name} yet. (Needs ${parts.join(' and ')}.)`;
  }
  return `You need ${skill.name} level ${crime.level} to do that. You're level ${skillLevel(s, crime.skill)}.`;
}

function startLine(n: StreetNode) {
  const what = n.label.toLowerCase();
  switch (n.kind) {
    case 'person':
      return `You size up the ${what}…`;
    case 'car':
      return `You try the doors of the ${what}…`;
    case 'crate':
      return `You check the ${what}…`;
    default:
      return `You case the ${what}…`;
  }
}

export function StreetView({ s, act, onReport }: { s: GameState; act: Act; onReport: (fn: (r: Report) => void) => () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const floatsRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const sRef = useRef(s);
  sRef.current = s;
  const actRef = useRef(act);
  actRef.current = act;
  const zoomRef = useRef(15);
  const yawRef = useRef(0); // camera angle around you
  const pitchRef = useRef(1.16); // how steeply the camera looks down (radians)
  const [msgs, setMsgs] = useState<Msg[]>([{ t: Date.now(), text: 'Tap to walk, tap a person, car or door to work it. Drag to turn the camera, pinch to zoom.' }]);
  const sayRef = useRef((text: string) => setMsgs((m) => [...m.slice(-5), { t: Date.now(), text }]));

  useEffect(() => {
    const host = hostRef.current!;
    const labelLayer = labelsRef.current!;
    const floatLayer = floatsRef.current!;
    const say = sayRef.current;
    const blocked = buildBlocked();
    const tileOf = (x: number, z: number): [number, number] => [Math.floor(x), Math.floor(z)];
    const center = (tx: number, ty: number) => new THREE.Vector3(tx + 0.5, 0, ty + 0.5);

    // ---------- renderer / scene ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x141210);
    scene.fog = new THREE.Fog(0x141210, 18, 42);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    scene.add(new THREE.HemisphereLight(0xfff1dc, 0x1b1916, 1.25));
    const sun = new THREE.DirectionalLight(0xffdcb0, 1.4);
    sun.position.set(-20, 40, 15);
    scene.add(sun);

    const mats = new Map<number, THREE.MeshLambertMaterial>();
    const mat = (c: number) => {
      if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c }));
      return mats.get(c)!;
    };
    const geoms: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number) => {
      const g = new THREE.BoxGeometry(w, h, d);
      geoms.push(g);
      return g;
    };

    // Water around the city, then the road surface.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, H + 80), mat(0x1a2730));
    water.rotation.x = -Math.PI / 2;
    water.position.set(W / 2, -0.05, H / 2);
    scene.add(water);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat(0x2d2a26));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(W / 2, 0, H / 2);
    scene.add(ground);
    geoms.push(water.geometry, ground.geometry);

    // Sidewalk rings around each block, buildings, parks.
    const rng = mulberry32(11);
    for (let bx = 0; bx < COLS; bx++)
      for (let by = 0; by < ROWS; by++) {
        const kind = BLOCKS.get(`${bx},${by}`)!;
        const cx = bx * BLOCK + 2 + 2.5;
        const cz = by * BLOCK + 2 + 2.5;
        const walk = new THREE.Mesh(box(6.6, 0.06, 6.6), mat(0x3a3631));
        walk.position.set(cx, 0.03, cz);
        scene.add(walk);
        if (kind.type === 'park') {
          const grass = new THREE.Mesh(box(5, 0.1, 5), mat(0x2f4a2c));
          grass.position.set(cx, 0.06, cz);
          scene.add(grass);
          for (let i = 0; i < 4; i++) {
            const tx = cx - 1.8 + rng() * 3.6;
            const tz = cz - 1.8 + rng() * 3.6;
            const trunk = new THREE.Mesh(box(0.15, 0.6, 0.15), mat(0x4a3726));
            trunk.position.set(tx, 0.4, tz);
            const top = new THREE.Mesh(box(0.8, 0.8, 0.8), mat(0x3d6b37));
            top.position.set(tx, 1.0, tz);
            scene.add(trunk, top);
          }
          continue;
        }
        const skillBlock = kind.type === 'skill';
        const h = skillBlock ? 1.1 + rng() * 0.5 : 0.9 + rng() * 1.6; // kept low so they don't hide you
        const color = skillBlock ? SKILL_COLORS[kind.skill] : [0x37322d, 0x3f3a33, 0x332f2b][Math.floor(rng() * 3)];
        const b = new THREE.Mesh(box(5, h, 5), mat(color));
        b.position.set(cx, h / 2, cz);
        scene.add(b);
        const roof = new THREE.Mesh(box(5.1, 0.12, 5.1), mat(skillBlock ? new THREE.Color(color).multiplyScalar(1.35).getHex() : 0x2a2622));
        roof.position.set(cx, h + 0.06, cz);
        scene.add(roof);
      }

    // ---------- tappable spots ----------
    const pickables: THREE.Object3D[] = [];
    const nodeGroups = new Map<string, THREE.Group>();
    const personMesh = (body: number, head = 0xd9b99a) => {
      const g = new THREE.Group();
      const torso = new THREE.Mesh(box(0.42, 0.6, 0.3), mat(body));
      torso.position.y = 0.55;
      const legs = new THREE.Mesh(box(0.36, 0.3, 0.26), mat(0x23201c));
      legs.position.y = 0.15;
      const headM = new THREE.Mesh(box(0.3, 0.3, 0.3), mat(head));
      headM.position.y = 1.0;
      g.add(torso, legs, headM);
      return g;
    };
    for (const n of NODES) {
      let g: THREE.Group;
      const c = center(n.x, n.y);
      if (n.kind === 'person') {
        g = personMesh(n.wanders ? 0x6d86a3 : 0x7d5a8a);
      } else if (n.kind === 'car') {
        g = new THREE.Group();
        const body = new THREE.Mesh(box(0.85, 0.35, 0.55), mat(n.crimeId === 'armored' ? 0x55616a : 0x8a3a2f + (n.x % 3) * 0x101008));
        body.position.y = 0.28;
        const cabin = new THREE.Mesh(box(0.5, 0.25, 0.48), mat(0x1f2730));
        cabin.position.set(-0.05, 0.57, 0);
        g.add(body, cabin);
      } else if (n.kind === 'crate') {
        g = new THREE.Group();
        const cr = new THREE.Mesh(box(0.7, 0.55, 0.7), mat(0x7a5b36));
        cr.position.y = 0.28;
        g.add(cr);
      } else if (n.kind === 'table') {
        g = new THREE.Group();
        const top = new THREE.Mesh(box(0.8, 0.08, 0.5), mat(0x6b4a2e));
        top.position.y = 0.5;
        const leg = new THREE.Mesh(box(0.1, 0.5, 0.1), mat(0x3a2a1c));
        leg.position.y = 0.25;
        g.add(top, leg);
      } else {
        // A door: lit doorway on the building face, on the side of this tile that touches the building.
        g = new THREE.Group();
        const dir = neighbors(n.x, n.y).find(([x, y]) => !isRoad(x, y) && blocked[y * W + x] && BLOCKS.get(`${Math.floor(x / BLOCK)},${Math.floor(y / BLOCK)}`)?.type === 'skill');
        const dx = dir ? dir[0] - n.x : 0;
        const dz = dir ? dir[1] - n.y : -1;
        const door = new THREE.Mesh(box(dx ? 0.08 : 0.6, 0.95, dz ? 0.08 : 0.6), mat(0xd9a441));
        door.position.set(dx * 0.48, 0.48, dz * 0.48);
        const mat2 = new THREE.Mesh(box(0.7, 0.03, 0.7), mat(0x5a2620));
        mat2.position.y = 0.02;
        g.add(door, mat2);
      }
      g.position.copy(c);
      g.traverse((o) => (o.userData.nodeId = n.id));
      scene.add(g);
      pickables.push(g);
      nodeGroups.set(n.id, g);
    }

    // Wandering tourists keep their own position.
    const walkers = new Map<string, { pos: THREE.Vector3; target: THREE.Vector3; wait: number }>();
    for (const n of NODES.filter((x) => x.wanders)) walkers.set(n.id, { pos: center(n.x, n.y), target: center(n.x, n.y), wait: Math.random() * 2 });
    const nodeTile = (n: StreetNode): [number, number] => {
      const w = walkers.get(n.id);
      return w ? tileOf(w.pos.x, w.pos.z) : [n.x, n.y];
    };

    // ---------- player and crew ----------
    const player = personMesh(0xc8412f);
    scene.add(player);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 24), new THREE.MeshBasicMaterial({ color: 0xebe4d6, transparent: true, opacity: 0 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    scene.add(ring);
    geoms.push(ring.geometry);

    const me = {
      pos: center(...SPAWN),
      path: [] as [number, number][],
      goal: null as StreetNode | null,
      attached: null as StreetNode | null,
      attachedAt: 0,
      facing: 0,
    };
    const findNodeFor = (crimeId: string) => NODES.find((n) => n.crimeId === crimeId && !n.wanders);
    const standSpot = (n: StreetNode) => {
      const [nx, ny] = nodeTile(n);
      return neighbors(nx, ny).find(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && !blocked[y * W + x]) ?? SPAWN;
    };
    // Coming back to the Street mid-job: stand where that job happens.
    const myJob = sRef.current.crew[0]?.job;
    if (myJob) {
      const n = findNodeFor(myJob.crimeId);
      if (n) {
        me.pos = center(...standSpot(n));
        me.attached = n;
        me.attachedAt = performance.now();
      }
    }
    player.position.copy(me.pos);

    const walkTo = (goals: [number, number][], goal: StreetNode | null) => {
      const path = findPath(blocked, W, H, tileOf(me.pos.x, me.pos.z), goals);
      if (!path) {
        say("You can't reach that.");
        return false;
      }
      me.path = path;
      me.goal = goal;
      return true;
    };

    const arrive = (n: StreetNode) => {
      const st = sRef.current;
      const job = st.crew[0]?.job;
      me.attached = n;
      me.attachedAt = performance.now();
      if (job && job.crimeId === n.crimeId) return;
      say(startLine(n));
      actRef.current((d, t) => {
        if (d.crew[0].job) stopJob(d, 'you');
        startJob(d, 'you', n.crimeId, 99999, t); // keep going until you walk away (capped by your shift length)
      });
    };

    const stopWorking = () => {
      if (me.attached && sRef.current.crew[0]?.job) {
        actRef.current((d) => stopJob(d, 'you'));
        say('You stop what you were doing.');
      }
      me.attached = null;
    };

    const tap = (clientX: number, clientY: number) => {
      const st = sRef.current;
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      if (st.crew[0].jailedUntil > Date.now()) {
        say(`You're in a cell for another ${fmtDuration((st.crew[0].jailedUntil - Date.now()) / 1000)}. Post bail at the top of the map.`);
        return;
      }
      const hit = ray.intersectObjects(pickables, true)[0];
      if (hit) {
        const n = NODES.find((x) => x.id === hit.object.userData.nodeId)!;
        if (canStart(st, n.crimeId)) return say(lockMessage(st, n.crimeId));
        if (me.attached?.id === n.id && st.crew[0].job?.crimeId === n.crimeId) return say("You're already on it.");
        stopWorking();
        const [nx, ny] = nodeTile(n);
        if (walkTo(neighbors(nx, ny), n)) {
          ring.position.set(nx + 0.5, 0.08, ny + 0.5);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.9;
          (ring.material as THREE.MeshBasicMaterial).color.set(0xd9a441);
        }
        return;
      }
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return;
      const [tx, ty] = tileOf(p.x, p.z);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
      stopWorking();
      // Tapped a building: head for the nearest street tiles around it instead.
      let goals: [number, number][] = [[tx, ty]];
      for (let r = 1; blocked[ty * W + tx] && r <= 6; r++) {
        goals = [];
        for (let y = ty - r; y <= ty + r; y++)
          for (let x = tx - r; x <= tx + r; x++)
            if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) === r && x >= 0 && y >= 0 && x < W && y < H && !blocked[y * W + x]) goals.push([x, y]);
        if (goals.length) break;
      }
      if (walkTo(goals, null)) {
        ring.position.set(tx + 0.5, 0.08, ty + 0.5);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.9;
        (ring.material as THREE.MeshBasicMaterial).color.set(0xebe4d6);
      }
    };

    // Gestures: a short press without moving = tap (walk / work). One finger dragging = rotate the
    // camera around you (sideways) and tilt it (up/down). Two fingers = pinch to zoom.
    const MIN_ZOOM = 7;
    const MAX_ZOOM = 24;
    const pointers = new Map<number, { x: number; y: number }>();
    let tapStart: { x: number; y: number; t: number } | null = null;
    let pinch: { dist: number; zoom: number } | null = null;
    const fingerGap = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onDown = (e: PointerEvent) => {
      renderer.domElement.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (pointers.size === 2) {
        tapStart = null;
        pinch = { dist: fingerGap(), zoom: zoomRef.current };
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        zoomRef.current = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (pinch.zoom * pinch.dist) / Math.max(10, fingerGap())));
        return;
      }
      if (pointers.size !== 1) return;
      if (tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 8) tapStart = null; // it's a drag, not a tap
      if (!tapStart) {
        yawRef.current -= dx * 0.008;
        pitchRef.current = Math.min(1.45, Math.max(0.75, pitchRef.current + dy * 0.004));
      }
    };
    const onUp = (e: PointerEvent) => {
      if (tapStart && pointers.size === 1 && performance.now() - tapStart.t < 600) tap(e.clientX, e.clientY);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) tapStart = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current + Math.sign(e.deltaY)));
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', onUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // ---------- floating "+$5" over your head ----------
    const off = onReport((r) => {
      const bits: [string, string][] = [];
      if (r.busts) bits.push(['Busted!', 'f-bust']);
      if (r.cash >= 1) bits.push([`+${fmtMoney(r.cash)}`, 'f-cash']);
      const xp = Object.values(r.xp).reduce((a, b) => a + (b ?? 0), 0);
      if (xp) bits.push([`+${Math.round(xp).toLocaleString('en-US')} xp`, 'f-xp']);
      for (const l of r.levelUps) bits.push([`${SKILL_BY_ID[l.skill].short} level ${l.level}!`, 'f-level']);
      if (r.bigScores) bits.push(['Big score!', 'f-level']);
      bits.forEach(([text, cls], i) => {
        const el = document.createElement('div');
        el.className = `float ${cls}`;
        el.textContent = text;
        el.style.animationDelay = `${i * 120}ms`;
        floatLayer.appendChild(el);
        setTimeout(() => el.remove(), 1600 + i * 120);
      });
    });

    // ---------- labels for nearby spots ----------
    const labelEls = new Map<string, HTMLDivElement>();
    const project = (v: THREE.Vector3) => {
      const p = v.clone().project(camera);
      return [((p.x + 1) / 2) * host.clientWidth, ((1 - p.y) / 2) * host.clientHeight, p.z] as const;
    };

    // ---------- resize ----------
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

    // ---------- main loop ----------
    let last = performance.now();
    let raf = 0;
    const camTarget = me.pos.clone();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = sRef.current;
      const meCrew = st.crew[0];
      const job = meCrew?.job;
      const jailed = meCrew.jailedUntil > Date.now();

      // Walk along the path.
      if (me.path.length) {
        const next = center(...me.path[0]);
        const d = next.clone().sub(me.pos);
        const step = WALK_SPEED * dt;
        if (d.length() <= step) {
          me.pos.copy(next);
          me.path.shift();
          if (!me.path.length && me.goal) {
            arrive(me.goal);
            me.goal = null;
          }
        } else {
          me.pos.add(d.normalize().multiplyScalar(step));
          me.facing = Math.atan2(d.x, d.z);
        }
      }
      // Job finished or stopped elsewhere (e.g. the crew card's Stop button). The grace period covers the
      // moment right after arriving, before the new job has reached this view.
      if (me.attached && !job && !me.path.length && now - me.attachedAt > 1500) me.attached = null;
      if (me.attached && job && job.crimeId !== me.attached.crimeId) me.attached = findNodeFor(job.crimeId) ?? null;

      // Face what you're working and do a little "working" bob.
      const working = !!(me.attached && job && !me.path.length && !jailed);
      if (working && me.attached) {
        const [nx, ny] = nodeTile(me.attached);
        me.facing = Math.atan2(nx + 0.5 - me.pos.x, ny + 0.5 - me.pos.z);
      }
      player.position.set(me.pos.x, working ? Math.abs(Math.sin(now / 160)) * 0.06 : me.path.length ? Math.abs(Math.sin(now / 90)) * 0.05 : 0, me.pos.z);
      player.rotation.y = me.facing;
      player.visible = !jailed;

      // Tourists stroll (unless you're targeting or working one).
      for (const [id, w] of walkers) {
        const busy = me.goal?.id === id || me.attached?.id === id;
        if (!busy) {
          const d = w.target.clone().sub(w.pos);
          if (d.length() < 0.02) {
            w.wait -= dt;
            if (w.wait <= 0) {
              const [tx, ty] = tileOf(w.pos.x, w.pos.z);
              const opts = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
                .map(([dx, dy]) => [tx + dx, ty + dy] as [number, number])
                .filter(([x, y]) => x > 0 && y > 0 && x < W - 1 && y < H - 1 && isRoad(x, y) && !blocked[y * W + x]);
              if (opts.length) w.target = center(...opts[Math.floor(Math.random() * opts.length)]);
              w.wait = 0.5 + Math.random() * 2.5;
            }
          } else {
            w.pos.add(d.clampLength(0, 1.4 * dt));
            nodeGroups.get(id)!.rotation.y = Math.atan2(d.x, d.z);
          }
        }
        nodeGroups.get(id)!.position.copy(w.pos);
      }

      // Tap ring fades out.
      const rm = ring.material as THREE.MeshBasicMaterial;
      rm.opacity = Math.max(0, rm.opacity - dt * 0.8);

      // Camera orbits you: yaw = angle around you, pitch = how steeply it looks down.
      camTarget.lerp(me.pos, 1 - Math.pow(0.001, dt));
      const r = zoomRef.current * 1.25;
      const yaw = yawRef.current;
      const pitch = pitchRef.current;
      camera.position.set(
        camTarget.x + Math.sin(yaw) * r * Math.cos(pitch),
        r * Math.sin(pitch),
        camTarget.z + Math.cos(yaw) * r * Math.cos(pitch),
      );
      camera.lookAt(camTarget.x, 0, camTarget.z);

      // Progress bar for the current action.
      if (progressRef.current) {
        const p = working && job ? (Date.now() - job.startedAt) / (job.endsAt - job.startedAt) : 0;
        progressRef.current.style.width = `${Math.max(0, Math.min(1, p)) * 100}%`;
      }

      // Labels over nearby spots, and the floating text anchor over your head.
      // Nearest few only, and skip any that would overlap one already placed.
      const seen = new Set<string>();
      const placed: [number, number, number][] = [];
      const nearby = NODES.map((n) => ({ n, d: nodeGroups.get(n.id)!.position.distanceTo(me.pos) }))
        .filter((x) => x.d <= LABEL_RANGE)
        // Things you can do right now first, then nearest.
        .sort((a, b) => Number(!!canStart(st, a.n.crimeId)) - Number(!!canStart(st, b.n.crimeId)) || a.d - b.d)
        .slice(0, MAX_LABELS);
      for (const { n } of nearby) {
        const g = nodeGroups.get(n.id)!;
        const [x, y, depth] = project(g.position.clone().setY(n.kind === 'person' ? 1.45 : 1.2));
        if (depth > 1) continue;
        seen.add(n.id);
        let el = labelEls.get(n.id);
        if (!el) {
          el = document.createElement('div');
          el.className = 'node-label';
          labelLayer.appendChild(el);
          labelEls.set(n.id, el);
        }
        const crime = CRIME_BY_ID[n.crimeId];
        const locked = !!canStart(st, n.crimeId);
        const text = locked ? `${n.label} · ${SKILL_BY_ID[crime.skill].short} ${crime.level}` : n.label;
        if (el.textContent !== text) el.textContent = text;
        const wpx = text.length * 6 + 10;
        // If it would overlap a label already placed, stack it higher (up to 3 rows), else skip it.
        const clash = (yy: number) => placed.some(([px, py, pw]) => Math.abs(px - x) < (pw + wpx) / 2 && Math.abs(py - yy) < 18);
        const row = [0, 1, 2].find((r) => !clash(y - r * 19));
        if (row === undefined) {
          seen.delete(n.id);
          el.remove();
          labelEls.delete(n.id);
          continue;
        }
        placed.push([x, y - row * 19, wpx]);
        el.classList.toggle('locked', locked);
        el.style.transform = `translate(${x}px, ${placed[placed.length - 1][1]}px) translate(-50%, -100%)`;
      }
      for (const [id, el] of labelEls)
        if (!seen.has(id)) {
          el.remove();
          labelEls.delete(id);
        }
      const [hx, hy] = project(me.pos.clone().setY(1.5));
      floatLayer.style.transform = `translate(${hx}px, ${hy}px)`;

      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      off();
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      for (const el of labelEls.values()) el.remove();
      geoms.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      (ring.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onReport]);

  // ---------- overlay ----------
  const me = s.crew[0];
  const now = Date.now();
  const jailed = me.jailedUntil > now;
  const job = me.job;
  const crime = job ? CRIME_BY_ID[job.crimeId] : null;
  const recent: Msg[] = [...msgs, ...s.log.slice(0, 4).map((l) => ({ t: l.t, text: l.text }))].sort((a, b) => a.t - b.t).slice(-5);

  return (
    <div className="street" ref={hostRef}>
      <div className="street-labels" ref={labelsRef} />
      <div className="street-floats" ref={floatsRef} />
      <div className="street-status">
        {jailed ? (
          <>
            <span className="alert">In a cell · {fmtDuration((me.jailedUntil - now) / 1000)}</span>
            <button className="btn tiny" disabled={s.cash < bailCost(s, me, now)} onClick={() => act((d, t) => bail(d, 'you', t))}>
              Bail · {fmtMoney(bailCost(s, me, now))}
            </button>
          </>
        ) : crime && job ? (
          <>
            <span>
              {crime.name} <span className="muted mono">#{job.repsDone + 1}</span>
            </span>
            <div className="bar bar-job">
              <div className="bar-fill" ref={progressRef} />
            </div>
          </>
        ) : (
          <span className="muted">Idle — tap something</span>
        )}
      </div>
      <div className="chatbox" aria-live="polite">
        {recent.map((m, i) => (
          <div key={`${m.t}-${i}`}>{m.text}</div>
        ))}
      </div>
    </div>
  );
}
