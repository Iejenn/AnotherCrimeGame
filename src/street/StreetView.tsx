// The Street: a small low-poly city you walk around RuneScape-style.
// Tap the ground to walk. Tap a person, car or door to walk up and work it:
// that starts the same job queue the Jobs tab uses, so it keeps running offline.
// Walking away stops the job. Drag to rotate the camera, pinch (or mouse wheel) to zoom.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GameState, Report } from '../game/types';
import { CRIME_BY_ID } from '../game/data/crimes';
import { SKILL_BY_ID } from '../game/data/skills';
import { bail, bailCost, busyReason, canStart, fmtDuration, fmtMoney, skillLevel, startJob, stopJob } from '../game/engine';
import { BLOCK, BLOCKS, BUILDINGS, H, NODES, NPCS, SPAWN, W, buildBlocked, isRoad, type Npc, type StreetNode } from './map';
import { animateCharacter, buildCharacter, randomLook, type Pose } from './character';
import { buildCity, updateFades } from './city';
import { CAR_COLORS, buildCar, buildCardTable, buildCrate, buildDoor } from './props';
import { NpcDialog } from './NpcDialog';
import { findPath, neighbors } from './pathfind';
import { mulberry32 } from '../game/rng';

type Act = (fn: (d: GameState, now: number) => void) => void;
interface Msg {
  t: number;
  text: string;
}

const WALK_SPEED = 4; // tiles per second
const LABEL_RANGE = 5; // tiles
const NPC_LABEL_RANGE = 9; // NPC names show from further away

const MAX_LABELS = 6;
function lockMessage(s: GameState, crimeId: string) {
  const crime = CRIME_BY_ID[crimeId];
  const skill = SKILL_BY_ID[crime.skill];
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
  const miniRef = useRef<HTMLCanvasElement>(null);
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
  const sayRef = useRef((text: string) => setMsgs((m) => [...m.slice(-3), { t: Date.now(), text }]));
  // Which NPC you're talking to (opens the chat window). Set from the 3D scene when you reach them.
  const [talking, setTalking] = useState<Npc | null>(null);
  const setTalkingRef = useRef(setTalking);

  useEffect(() => {
    const host = hostRef.current!;
    const labelLayer = labelsRef.current!;
    const floatLayer = floatsRef.current!;
    const say = sayRef.current;
    const blocked = buildBlocked();
    const tileOf = (x: number, z: number): [number, number] => [Math.floor(x), Math.floor(z)];
    const center = (tx: number, ty: number) => new THREE.Vector3(tx + 0.5, 0, ty + 0.5);

    // ---------- renderer / scene: dusk, long soft shadows, fog (docs/design.md §7b) ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const SKY = 0x1c2230;
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 22, 60);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 220);
    // Cool blue sky light from above, warm low sun from the side.
    scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x2a2420, 1.25));
    const sun = new THREE.DirectionalLight(0xffa864, 1.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -16;
    sc.right = 16;
    sc.top = 16;
    sc.bottom = -16;
    sc.near = 1;
    sc.far = 80;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    const SUN_OFFSET = new THREE.Vector3(-24, 13, 8); // low sun = long shadows

    const geoms: THREE.BufferGeometry[] = [];
    const disposables: { dispose: () => void }[] = [];
    const city = buildCity(scene);
    disposables.push(city);

    // ---------- tappable spots ----------
    const pickables: THREE.Object3D[] = [];
    const nodeGroups = new Map<string, THREE.Group>();
    // People on the street use the same model as your character, with a random (but fixed) look.
    const lookRng = mulberry32(99);
    const people = new Map<string, THREE.Group>();
    for (const n of NODES) {
      let g: THREE.Group;
      const c = center(n.x, n.y);
      if (n.kind === 'person') {
        g = buildCharacter(randomLook(lookRng));
        people.set(n.id, g);
      } else if (n.kind === 'car') {
        g = buildCar(CAR_COLORS[(n.x + n.y) % CAR_COLORS.length]);
      } else if (n.kind === 'crate') {
        g = buildCrate();
      } else if (n.kind === 'table') {
        g = buildCardTable();
      } else {
        // A door on the building face, on the side of this tile that touches the building.
        const dir = neighbors(n.x, n.y).find(([x, y]) => !isRoad(x, y) && blocked[y * W + x]);
        g = buildDoor(dir ? dir[0] - n.x : 0, dir ? dir[1] - n.y : -1);
      }
      g.position.copy(c);
      g.traverse((o) => (o.userData.nodeId = n.id));
      scene.add(g);
      pickables.push(g);
      nodeGroups.set(n.id, g);
    }

    // NPCs: Eddy stands in front of his store. Green apron, flat cap, faces the street.
    const npcGroups = new Map<string, THREE.Group>();
    for (const npc of NPCS) {
      // Eddy: flat cap, green top, white apron.
      const g = buildCharacter({ skin: 1, hair: 4, hairColor: 1, top: 2, bottom: 2 }, { apron: 0xf2efe8 });
      g.position.copy(center(npc.x, npc.y));
      g.traverse((o) => (o.userData.npcId = npc.id));
      scene.add(g);
      pickables.push(g);
      npcGroups.set(npc.id, g);
    }

    // Wandering tourists keep their own position.
    const walkers = new Map<string, { pos: THREE.Vector3; target: THREE.Vector3; wait: number; moving?: boolean }>();
    for (const n of NODES.filter((x) => x.wanders)) walkers.set(n.id, { pos: center(n.x, n.y), target: center(n.x, n.y), wait: Math.random() * 2 });
    const nodeTile = (n: StreetNode): [number, number] => {
      const w = walkers.get(n.id);
      return w ? tileOf(w.pos.x, w.pos.z) : [n.x, n.y];
    };

    // ---------- player and crew ----------
    const player = buildCharacter(sRef.current.look);
    scene.add(player);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    scene.add(ring);
    geoms.push(ring.geometry);

    const me = {
      pos: center(...SPAWN),
      path: [] as [number, number][],
      goal: null as StreetNode | null,
      goalNpc: null as Npc | null,
      attached: null as StreetNode | null,
      attachedAt: 0,
      /** The spot you last worked, so "You size up the tourist…" only shows the first time. */
      lastSpot: '' as string,
      facing: 0,
    };
    const findNodeFor = (crimeId: string) => NODES.find((n) => n.crimeId === crimeId && !n.wanders);
    const standSpot = (n: StreetNode) => {
      const [nx, ny] = nodeTile(n);
      return neighbors(nx, ny).find(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && !blocked[y * W + x]) ?? SPAWN;
    };
    // Coming back to the Street mid-job: stand where that job happens.
    const myJob = sRef.current.player.job;
    if (myJob) {
      const n = findNodeFor(myJob.crimeId);
      if (n) {
        me.pos = center(...standSpot(n));
        me.attached = n;
        me.attachedAt = performance.now();
      }
    }
    player.position.copy(me.pos);

    const walkTo = (goals: [number, number][], goal: StreetNode | null, npc: Npc | null = null) => {
      const path = findPath(blocked, W, H, tileOf(me.pos.x, me.pos.z), goals);
      if (!path) {
        say("You can't reach that.");
        return false;
      }
      me.path = path;
      me.goal = goal;
      me.goalNpc = npc;
      if (!path.length) {
        // Already standing next to it.
        if (goal) arrive(goal);
        if (npc) setTalkingRef.current(npc);
        me.goal = null;
        me.goalNpc = null;
      }
      return true;
    };

    const arrive = (n: StreetNode) => {
      const st = sRef.current;
      const job = st.player.job;
      me.attached = n;
      me.attachedAt = performance.now();
      if (job && job.crimeId === n.crimeId) return;
      const busy = busyReason(st, Date.now());
      if (busy) return say(busy);
      if (me.lastSpot !== n.id) say(startLine(n));
      me.lastSpot = n.id;
      actRef.current((d, t) => {
        if (d.player.job) stopJob(d);
        startJob(d, n.crimeId, t); // one tap = one attempt
      });
    };

    const stopWorking = () => {
      if (me.attached && sRef.current.player.job) {
        actRef.current((d) => stopJob(d));
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
      if (st.player.jailedUntil > Date.now()) {
        say(`You're in a cell for another ${fmtDuration((st.player.jailedUntil - Date.now()) / 1000)}. Post bail at the top of the map.`);
        return;
      }
      const hit = ray.intersectObjects(pickables, true)[0];
      if (hit?.object.userData.npcId) {
        const npc = NPCS.find((x) => x.id === hit.object.userData.npcId)!;
        stopWorking();
        setTalkingRef.current(null);
        if (walkTo(neighbors(npc.x, npc.y), null, npc)) {
          ring.position.set(npc.x + 0.5, 0.08, npc.y + 0.5);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.9;
          (ring.material as THREE.MeshBasicMaterial).color.set(0xf2d27a);
        }
        return;
      }
      if (hit) {
        setTalkingRef.current(null);
        const n = NODES.find((x) => x.id === hit.object.userData.nodeId)!;
        if (canStart(st, n.crimeId)) return say(lockMessage(st, n.crimeId));
        if (me.attached?.id === n.id && st.player.job?.crimeId === n.crimeId) return; // mid-attempt: ignore extra taps
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
      walkToTile(...tileOf(p.x, p.z));
    };

    const walkToTile = (tx: number, ty: number) => {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return say("That's the river. The city ends here, for now.");
      stopWorking();
      setTalkingRef.current(null); // walking away ends the conversation
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

    // ---------- minimap (top-right) ----------
    // The static map (river, roads, buildings, parks, store) is drawn once; you, Eddy and the
    // crime spots are drawn on top a few times a second. Tapping it walks you there.
    const mini = miniRef.current!;
    const MINI_PX = 3; // CSS pixels per tile
    const MINI_EDGE = 2; // tiles of river shown around the city
    const miniW = (W + MINI_EDGE * 2) * MINI_PX;
    const miniH = (H + MINI_EDGE * 2) * MINI_PX;
    const dpr = Math.min(window.devicePixelRatio, 2);
    mini.width = miniW * dpr;
    mini.height = miniH * dpr;
    mini.style.width = `${miniW}px`;
    mini.style.height = `${miniH}px`;
    const base = document.createElement('canvas');
    base.width = mini.width;
    base.height = mini.height;
    {
      const g = base.getContext('2d')!;
      g.scale(dpr, dpr);
      const tile = (x: number, y: number, w: number, h: number, c: string) => {
        g.fillStyle = c;
        g.fillRect((x + MINI_EDGE) * MINI_PX, (y + MINI_EDGE) * MINI_PX, w * MINI_PX, h * MINI_PX);
      };
      g.fillStyle = '#1f4558';
      g.fillRect(0, 0, miniW, miniH);
      tile(0, 0, W, H, '#55585e');
      for (const [key, kind] of BLOCKS) {
        const [bx, by] = key.split(',').map(Number);
        if (kind.type === 'park') tile(bx * BLOCK + 2, by * BLOCK + 2, 5, 5, '#45663a');
        if (kind.type === 'store') tile(bx * BLOCK + 2, by * BLOCK + 2, 5, 5, '#2f7a46');
      }
      for (const b of BUILDINGS) tile(b.x, b.y, b.w, b.h, '#8a7f70');
    }
    const drawMini = () => {
      const g = mini.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(base, 0, 0);
      g.scale(dpr, dpr);
      const dot = (x: number, y: number, r: number, fill: string, stroke?: string) => {
        g.beginPath();
        g.arc((x + MINI_EDGE) * MINI_PX, (y + MINI_EDGE) * MINI_PX, r, 0, Math.PI * 2);
        g.fillStyle = fill;
        g.fill();
        if (stroke) {
          g.lineWidth = 1;
          g.strokeStyle = stroke;
          g.stroke();
        }
      };
      const st = sRef.current;
      for (const n of NODES) {
        if (n.wanders) continue;
        dot(n.x + 0.5, n.y + 0.5, 2.2, canStart(st, n.crimeId) ? '#8b8378' : '#d9a441');
      }
      for (const npc of NPCS) dot(npc.x + 0.5, npc.y + 0.5, 2.6, '#f2d27a', '#141210');
      // You: a red dot with a tick showing which way the camera looks.
      const px = me.pos.x;
      const pz = me.pos.z;
      g.beginPath();
      g.moveTo((px + MINI_EDGE) * MINI_PX, (pz + MINI_EDGE) * MINI_PX);
      g.lineTo((px + MINI_EDGE - Math.sin(yawRef.current) * 3) * MINI_PX, (pz + MINI_EDGE - Math.cos(yawRef.current) * 3) * MINI_PX);
      g.strokeStyle = 'rgba(235, 228, 214, 0.8)';
      g.lineWidth = 1.5;
      g.stroke();
      dot(px, pz, 3, '#e2604c', '#ffffff');
    };
    const onMiniTap = (e: PointerEvent) => {
      e.stopPropagation();
      const r = mini.getBoundingClientRect();
      const tx = Math.floor((e.clientX - r.left) / (r.width / (W + MINI_EDGE * 2))) - MINI_EDGE;
      const ty = Math.floor((e.clientY - r.top) / (r.height / (H + MINI_EDGE * 2))) - MINI_EDGE;
      walkToTile(tx, ty);
    };
    mini.addEventListener('pointerup', onMiniTap);
    let lastMini = 0;

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
      // One line per attempt (attempts come every second, so separate lines would pile up),
      // plus a second, bigger line for level-ups, big scores and busts.
      const parts: [string, string][] = [];
      if (r.cash >= 1) parts.push([`+${fmtMoney(r.cash)}`, 'f-cash']);
      const xp = Object.values(r.xp).reduce((a, b) => a + (b ?? 0), 0);
      if (xp) parts.push([`+${Math.round(xp).toLocaleString('en-US')} xp`, 'f-xp']);
      if (r.damage) parts.push([`-${r.damage} HP`, 'f-bust']);
      const big: [string, string][] = [];
      if (r.busts) big.push(['Busted!', 'f-bust']);
      if (r.bigScores) big.push(['Big score!', 'f-level']);
      for (const l of r.levelUps) big.push([`${SKILL_BY_ID[l.skill].name} level ${l.level}!`, 'f-level']);
      const line = (items: [string, string][], cls: string) => {
        if (!items.length) return;
        const el = document.createElement('div');
        el.className = `float ${cls}`;
        for (const [text, c] of items) {
          const span = document.createElement('span');
          span.className = c;
          span.textContent = text;
          el.appendChild(span);
        }
        floatLayer.appendChild(el);
        setTimeout(() => el.remove(), 1300);
      };
      line(parts, '');
      if (r.fails) big.push(['Stunned!', 'f-bust']);
      line(big, 'float-big');
      if (r.fails || r.busts) {
        host.classList.remove('shake');
        void host.offsetWidth; // restart the animation
        host.classList.add('shake');
      }
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
      const meCrew = st.player;
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
          if (!me.path.length && me.goalNpc) {
            const npc = me.goalNpc;
            me.facing = Math.atan2(npc.x + 0.5 - me.pos.x, npc.y + 0.5 - me.pos.z);
            npcGroups.get(npc.id)!.rotation.y = Math.atan2(me.pos.x - npc.x - 0.5, me.pos.z - npc.y - 0.5);
            setTalkingRef.current(npc);
            me.goalNpc = null;
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
      player.position.set(me.pos.x, 0.03, me.pos.z);
      const stunned = meCrew.stunnedUntil > Date.now();
      const pose: Pose = stunned ? 'stunned' : me.path.length ? 'walk' : working ? 'work' : 'idle';
      animateCharacter(player, pose, now);
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
            w.moving = true;
          }
        }
        nodeGroups.get(id)!.position.copy(w.pos);
      }
      // Everyone breathes, tourists walk; Eddy idles.
      let k = 0;
      for (const [id, g] of people) {
        const w = walkers.get(id);
        animateCharacter(g, w?.moving ? 'walk' : 'idle', now, k++ * 0.7);
        if (w) w.moving = false;
      }
      for (const g of npcGroups.values()) animateCharacter(g, 'idle', now, 3.1);

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
      sun.position.copy(camTarget).add(SUN_OFFSET);
      sun.target.position.copy(camTarget);
      updateFades(city.fadeables, camera, me.pos, dt);

      // Progress bar for the current action.
      if (progressRef.current) {
        const p = working && job ? (Date.now() - job.startedAt) / (job.endsAt - job.startedAt) : 0;
        progressRef.current.style.width = `${Math.max(0, Math.min(1, p)) * 100}%`;
      }

      // Labels over nearby spots, and the floating text anchor over your head.
      // Nearest few only, and skip any that would overlap one already placed.
      const seen = new Set<string>();
      const placed: [number, number, number][] = [];
      for (const npc of NPCS) {
        const g = npcGroups.get(npc.id)!;
        let el = labelEls.get(`npc:${npc.id}`);
        const [x, y, depth] = project(g.position.clone().setY(1.55));
        if (g.position.distanceTo(me.pos) > NPC_LABEL_RANGE || depth > 1) continue;
        if (!el) {
          el = document.createElement('div');
          el.className = 'node-label npc';
          el.textContent = npc.name;
          labelLayer.appendChild(el);
          labelEls.set(`npc:${npc.id}`, el);
        }
        seen.add(`npc:${npc.id}`);
        placed.push([x, y, npc.name.length * 6 + 10]);
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
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
        const text = locked ? `${n.label} · Lv ${crime.level}` : n.label;
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

      if (now - lastMini > 100) {
        lastMini = now;
        drawMini();
      }
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      off();
      ro.disconnect();
      mini.removeEventListener('pointerup', onMiniTap);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      for (const el of labelEls.values()) el.remove();
      geoms.forEach((g) => g.dispose());
      disposables.forEach((d) => d.dispose());
      (ring.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onReport]);

  // ---------- overlay ----------
  const me = s.player;
  const now = Date.now();
  const jailed = me.jailedUntil > now;
  const job = me.job;
  const crime = job ? CRIME_BY_ID[job.crimeId] : null;
  const recent: Msg[] = [...msgs, ...s.log.slice(0, 4).map((l) => ({ t: l.t, text: l.text }))].sort((a, b) => a.t - b.t).slice(-4);

  return (
    <div className="street" ref={hostRef}>
      <div className="street-labels" ref={labelsRef} />
      <div className="street-floats" ref={floatsRef} />
      <canvas className="minimap" ref={miniRef} aria-label="Minimap: tap to walk there" />
      <div className="street-status">
        {jailed ? (
          <>
            <span className="alert">In a cell · {fmtDuration((me.jailedUntil - now) / 1000)}</span>
            <button className="btn tiny" disabled={s.cash < bailCost(me, now)} onClick={() => act((d, t) => bail(d, t))}>
              Bail · {fmtMoney(bailCost(me, now))}
            </button>
          </>
        ) : me.stunnedUntil > now ? (
          <span className="alert">Stunned · {fmtDuration(Math.max(0.1, (me.stunnedUntil - now) / 1000))}</span>
        ) : crime && job ? (
          <>
            <span>{crime.name}</span>
            <div className="bar bar-job">
              <div className="bar-fill" ref={progressRef} />
            </div>
          </>
        ) : (
          <span className="muted">Tap something to work it</span>
        )}
      </div>
      {talking && <NpcDialog npc={talking} s={s} act={act} onClose={() => setTalking(null)} />}
      <div className="chatbox" aria-live="polite">
        {recent.map((m, i) => (
          <div key={`${m.t}-${i}`}>{m.text}</div>
        ))}
      </div>
    </div>
  );
}
