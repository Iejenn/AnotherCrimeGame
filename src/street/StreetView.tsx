// The Street: a small low-poly city you walk around RuneScape-style.
// Tap the ground to walk. Tap a tourist, a gym bag, a shelf… to walk up and try it (one tap = one
// attempt). NPCs live here too: Eddy in his store, players on the basketball court, and the people
// who catch you (clerks, the bartender, the guard). Drag to rotate the camera, pinch (or wheel) to zoom.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GameState, Look, Report } from '../game/types';
import { CATCH_SECONDS, CRIME_BY_ID } from '../game/data/crimes';
import { SKILL_BY_ID } from '../game/data/skills';
import { busyReason, canStart, emptyFor, fmtDuration, fmtMoney, skillLevel } from '../game/engine';
import type { GameApi } from '../game/api';
import { gameNow } from '../game/clock';
import { GUARD_HALF, GUARD_RANGE, angDiff, bartenderAt, guardAt, inBeam } from '../game/watchers';
import { ITEM_BY_ID } from '../game/data/items';
import { COURT, H, NODES, NPCS, ROOMS, SPAWN, W, buildBlocked, canStep, inRect, type Npc, type StreetNode } from './map';
import { animateCharacter, buildCharacter, randomLook, type Pose } from './character';
import { buildCity, updateFades } from './city';
import { BAG_COLORS, CAR_COLORS, buildCar, buildGrave, buildGymBag, buildMeter, buildShelf, setSpotEmpty } from './props';
import { MAP_EDGE, drawBag, drawGrave, drawWorld } from './mapArt';
import { WorldMap } from './WorldMap';
import { NpcDialog } from './NpcDialog';
import { findPath, neighbors } from './pathfind';
import { Hoops } from './hoops';
import { mulberry32 } from '../game/rng';

interface Msg {
  t: number;
  text: string;
}

const WALK_SPEED = 4; // tiles per second
const LABEL_RANGE = 5; // tiles
const NPC_LABEL_RANGE = 9; // NPC names show from further away

const MAX_LABELS = 6;
/** Turn angle `a` towards `goal` by at most `step` radians. */
const turnTowards = (a: number, goal: number, step: number) => a + Math.max(-step, Math.min(step, angDiff(goal, a)));
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
    case 'bag':
      return 'You crouch down by the bench and unzip a bag…';
    case 'shelf':
      return 'You browse the shelf, casually…';
    default:
      return `You eye the ${what}…`;
  }
}

/** Another player on the Street (online), as shared over the world channel (src/net/world.ts). */
export interface OtherPlayer {
  id: string;
  name: string;
  look: Look;
  /** Where their current walk started, the tiles they walk through, and when they set off (game time). */
  from: [number, number];
  path: [number, number][];
  at: number;
}
/** The shared world, online: who else is here, and how to tell them where you walk. */
export interface WorldLink {
  others: () => OtherPlayer[];
  move: (from: [number, number], path: [number, number][]) => void;
}

/** Where someone is `dist` tiles along a walk (from `from` through `path`), and which way they face. */
function along(from: [number, number], path: [number, number][], dist: number) {
  let x = from[0] + 0.5;
  let z = from[1] + 0.5;
  let facing: number | null = null;
  for (const [tx, ty] of path) {
    const nx = tx + 0.5;
    const nz = ty + 0.5;
    const seg = Math.hypot(nx - x, nz - z);
    facing = Math.atan2(nx - x, nz - z);
    if (dist < seg) return { x: x + ((nx - x) * dist) / seg, z: z + ((nz - z) * dist) / seg, moving: true, facing };
    dist -= seg;
    x = nx;
    z = nz;
  }
  return { x, z, moving: false, facing };
}

export function StreetView({ s, api, onReport, world }: { s: GameState; api: GameApi; onReport: (fn: (r: Report) => void) => () => void; world?: WorldLink }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const floatsRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const sRef = useRef(s);
  sRef.current = s;
  const apiRef = useRef(api);
  apiRef.current = api;
  const worldRef = useRef(world);
  worldRef.current = world;
  const zoomRef = useRef(15);
  const yawRef = useRef(0); // camera angle around you
  const pitchRef = useRef(1.16); // how steeply the camera looks down (radians)
  const [msgs, setMsgs] = useState<Msg[]>([{ t: gameNow(), text: 'Tap to walk. Tap a tourist in the park to pick their pocket. Drag to turn the camera, pinch to zoom.' }]);
  const sayRef = useRef((text: string) => setMsgs((m) => [...m.slice(-3), { t: gameNow(), text }]));
  // Which NPC you're talking to (opens the chat window). Set from the 3D scene when you reach them.
  const [talking, setTalking] = useState<Npc | null>(null);
  const setTalkingRef = useRef(setTalking);
  const talkingIdRef = useRef<string | null>(null);
  talkingIdRef.current = talking?.id ?? null;
  // The world map (opened from the button under the minimap), and how it makes you walk somewhere.
  const [mapOpen, setMapOpen] = useState(false);
  const walkRef = useRef<(x: number, y: number) => void>(() => {});
  /** Where you are, for the world map's "you are here". */
  const herePos = useRef<[number, number]>(SPAWN);

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
    // People are small and move, so each gets a bigger invisible tap area (easier on phones).
    const hitGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.9, 8); // up to just under their name label
    const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    geoms.push(hitGeo);
    disposables.push(hitMat);
    const addHitArea = (g: THREE.Group) => {
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.y = 0.95;
      g.add(hit);
    };
    const people = new Map<string, THREE.Group>();
    const seatedIds = new Set(NODES.filter((n) => n.seated).map((n) => n.id));
    for (const n of NODES) {
      let g: THREE.Group;
      const c = center(n.x, n.y);
      if (n.kind === 'person') {
        g = buildCharacter(randomLook(lookRng));
        addHitArea(g);
        people.set(n.id, g);
      } else if (n.kind === 'car') {
        g = buildCar(CAR_COLORS[(n.x + n.y) % CAR_COLORS.length]);
      } else if (n.kind === 'bag') {
        g = buildGymBag(BAG_COLORS[(n.x + n.y) % BAG_COLORS.length]);
      } else if (n.kind === 'meter') {
        g = buildMeter();
      } else {
        g = buildShelf([0xd9473a, 0xf0b13c, 0x3a6ea5, 0x4fa04a, 0xe07b39, 0xf2efe8, 0x8a5ab8, 0xe86aa0], n.x * 3 + n.y);
      }
      g.position.copy(c);
      if (n.seated) g.position.y = 0.06;
      if (n.facing !== undefined) g.rotation.y = n.facing;
      g.traverse((o) => (o.userData.nodeId = n.id));
      scene.add(g);
      pickables.push(g);
      nodeGroups.set(n.id, g);
    }

    // NPCs: Eddy stands in front of his store. Green apron, flat cap, faces the street.
    const npcGroups = new Map<string, THREE.Group>();
    /** Where each NPC is right now (Eddy strolls around his shop). */
    interface NpcState {
      pos: THREE.Vector3;
      target: THREE.Vector3;
      wait: number;
      moving: boolean;
      /** normal = their usual routine; rush = coming to hit you; hit = swinging; back = walking back. */
      mode: 'normal' | 'rush' | 'hit' | 'back';
      path: [number, number][];
      speed: number;
      /** When the hit lands (game time), or when the swing ends (performance.now() time). */
      until: number;
    }
    const npcWalk = new Map<string, NpcState>();
    const npcTile = (npc: Npc): [number, number] => {
      const w = npcWalk.get(npc.id)!;
      return tileOf(w.pos.x, w.pos.z);
    };
    const NPC_LOOKS: Record<string, [Parameters<typeof buildCharacter>[0], Parameters<typeof buildCharacter>[1]]> = {
      eddy: [{ skin: 1, hair: 4, hairColor: 1, top: 2, bottom: 2 }, { apron: 0xf2efe8 }], // flat cap, green top, white apron
      baller_0: [{ skin: 3, hair: 0, hairColor: 0, top: 4, bottom: 1 }, undefined],
      baller_1: [{ skin: 0, hair: 1, hairColor: 2, top: 1, bottom: 3 }, undefined],
      candy_clerk: [{ skin: 2, hair: 2, hairColor: 3, top: 5, bottom: 0 }, { apron: 0xff7ab8 }], // pink apron
      bartender: [{ skin: 1, hair: 0, hairColor: 0, top: 4, bottom: 0 }, { apron: 0x1e1b18 }], // white shirt, black apron
      guard: [{ skin: 3, hair: 4, hairColor: 0, top: 1, bottom: 0 }, undefined], // navy uniform and cap
      gas_clerk: [{ skin: 4, hair: 1, hairColor: 0, top: 0, bottom: 1 }, { apron: 0x2a4a7a }], // red shirt, blue apron
    };
    for (const npc of NPCS) {
      const [look, extra] = NPC_LOOKS[npc.id] ?? [randomLook(lookRng), undefined];
      const g = buildCharacter(look, extra);
      addHitArea(g);
      g.position.copy(center(npc.x, npc.y));
      npcWalk.set(npc.id, { pos: center(npc.x, npc.y), target: center(npc.x, npc.y), wait: 1 + Math.random() * 2, moving: false, mode: 'normal', path: [], speed: 1, until: 0 });
      g.traverse((o) => (o.userData.npcId = npc.id));
      scene.add(g);
      pickables.push(g);
      npcGroups.set(npc.id, g);
    }

    // Wandering tourists keep their own position.
    const walkers = new Map<string, { pos: THREE.Vector3; target: THREE.Vector3; wait: number; moving?: boolean }>();
    for (const n of NODES.filter((x) => x.wanders)) walkers.set(n.id, { pos: center(n.x, n.y), target: center(n.x, n.y), wait: Math.random() * 2 });
    /** A random free tile next to (tx, ty) inside `area` (for anyone who strolls around). */
    const strollStep = (tx: number, ty: number, area: { x0: number; y0: number; x1: number; y1: number }, avoid: [number, number][] = []) => {
      const opts = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
        .map(([dx, dy]) => [tx + dx, ty + dy] as [number, number])
        .filter(([x, y]) => inRect(area, x, y) && !blocked[y * W + x] && canStep(tx, ty, x, y) && !avoid.some(([ax, ay]) => ax === x && ay === y));
      return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
    };
    // The basketball game on the court.
    const hoops = new Hoops(scene, COURT);
    disposables.push(hoops);

    // ---------- getting caught (docs/design.md §4) ----------
    // The catcher yells, rushes over (fast enough to arrive just before the engine lands his hit),
    // swings, and walks back to where he was. You can't do anything until the hit lands.
    const yells = new Map<string, { text: string; until: number }>();
    const yell = (npcId: string, text: string) => yells.set(npcId, { text, until: performance.now() + 2200 });
    let lastCaught = 0;
    const startChase = (crimeId: string, at: number) => {
      const crime = CRIME_BY_ID[crimeId];
      const catchers = NPCS.filter((n) => n.catches?.includes(crimeId));
      if (!crime || !catchers.length) return;
      const npc = catchers.sort((a, b) => npcWalk.get(a.id)!.pos.distanceTo(me.pos) - npcWalk.get(b.id)!.pos.distanceTo(me.pos))[0];
      const w = npcWalk.get(npc.id)!;
      me.path = [];
      me.goal = null;
      me.goalNpc = null;
      me.attached = null;
      setTalkingRef.current(null);
      yell(npc.id, crime.yell ?? 'Hey!');
      const [px, py] = tileOf(me.pos.x, me.pos.z);
      const path = findPath(blocked, W, H, tileOf(w.pos.x, w.pos.z), neighbors(px, py), canStep) ?? [];
      const timeLeft = Math.max(0.4, CATCH_SECONDS - (gameNow() - at) / 1000 - 0.3);
      w.mode = 'rush';
      w.path = path;
      w.speed = Math.max(2.5, (path.length + 0.5) / timeLeft);
      w.until = at + CATCH_SECONDS * 1000;
    };

    // His flashlight beam on the ground: a soft cone that turns red when he sees you.
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.CircleGeometry(GUARD_RANGE, 20, -Math.PI / 2 - GUARD_HALF, GUARD_HALF * 2).rotateX(-Math.PI / 2), beamMat);
    beam.position.y = 0.1;
    beam.renderOrder = 2;
    scene.add(beam);
    geoms.push(beam.geometry);
    disposables.push(beamMat);
    /** The name over an NPC's head, and whether it's a warning (red) or safe (green). */
    const npcLabel = (npc: Npc): [string, string] => {
      if (npc.kind === 'bartender') return bartenderAt(gameNow()).watching ? [`${npc.name} · watching`, 'alert'] : [`${npc.name} · back turned`, 'safe'];
      return [npc.name, ''];
    };
    /** Move an NPC along its path; true when it has arrived. */
    const followPath = (w: NpcState, g: THREE.Group, dt: number) => {
      if (!w.path.length) return true;
      const next = center(...w.path[0]);
      const d = next.clone().sub(w.pos);
      const step = w.speed * dt;
      if (d.length() <= step) {
        w.pos.copy(next);
        w.path.shift();
      } else {
        w.pos.add(d.normalize().multiplyScalar(step));
        g.rotation.y = Math.atan2(d.x, d.z);
      }
      w.moving = true;
      return !w.path.length;
    };
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
      /** Walking to your grave to pick up your stuff. */
      goalGrave: false,
    };
    /** Remember the tile you're on in the save (so switching tabs or reloading keeps you here). */
    const savePos = () => {
      const t = tileOf(me.pos.x, me.pos.z);
      const cur = sRef.current.player.pos;
      if (cur && cur[0] === t[0] && cur[1] === t[1]) return;
      apiRef.current.savePos(t);
    };
    const findNodeFor = (crimeId: string) => NODES.find((n) => n.crimeId === crimeId && !n.wanders);
    const standSpot = (n: StreetNode) => {
      const [nx, ny] = nodeTile(n);
      return neighbors(nx, ny).find(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && !blocked[y * W + x]) ?? SPAWN;
    };
    // Back on the Street (after another tab, or a reload): stand where you were.
    const saved = sRef.current.player.pos;
    if (saved && saved[0] >= 0 && saved[1] >= 0 && saved[0] < W && saved[1] < H && !blocked[saved[1] * W + saved[0]]) me.pos = center(...saved);
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
    worldRef.current?.move(tileOf(me.pos.x, me.pos.z), []);

    // ---------- other players (online) ----------
    const others = new Map<string, { g: THREE.Group; facing: number }>();

    const walkTo = (goals: [number, number][], goal: StreetNode | null, npc: Npc | null = null) => {
      const path = findPath(blocked, W, H, tileOf(me.pos.x, me.pos.z), goals, canStep);
      if (!path) {
        say("You can't reach that.");
        return false;
      }
      me.path = path;
      worldRef.current?.move(tileOf(me.pos.x, me.pos.z), path);
      me.goal = goal;
      me.goalNpc = npc;
      me.goalGrave = false;
      if (!path.length) {
        // Already standing next to it.
        if (goal) arrive(goal);
        if (npc) setTalkingRef.current(npc);
        me.goal = null;
        me.goalNpc = null;
        savePos();
      }
      return true;
    };

    const arrive = (n: StreetNode) => {
      const st = sRef.current;
      const job = st.player.job;
      me.attached = n;
      me.attachedAt = performance.now();
      if (job && job.crimeId === n.crimeId) return;
      const busy = busyReason(st, gameNow());
      if (busy) return say(busy);
      const empty = emptyFor(st, n.id, gameNow());
      if (empty) return say(`It's empty. ${n.kind === 'meter' ? 'It fills up again' : "It's restocked"} in ${Math.ceil(empty)}s.`);
      if (me.lastSpot !== n.id) say(startLine(n));
      me.lastSpot = n.id;
      // One tap = one attempt. Where you stand matters: the guard checks it, and your grave goes there.
      apiRef.current.startAttempt(n.crimeId, n.id, tileOf(me.pos.x, me.pos.z));
    };

    // ---------- your grave (docs/design.md §5) ----------
    const grave = buildGrave();
    grave.visible = false;
    grave.traverse((o) => (o.userData.grave = true));
    scene.add(grave);
    pickables.push(grave);
    const openGrave = () => {
      const g = sRef.current.grave;
      if (!g) return;
      if (g.expiresAt <= gameNow()) return say('Your grave has crumbled. Your stuff is gone.');
      apiRef.current.collectGrave();
    };
    const graveTime = (ms: number) => {
      const sec = Math.max(0, Math.ceil(ms / 1000));
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };

    const stopWorking = () => {
      if (me.attached && sRef.current.player.job) {
        apiRef.current.stopAttempt();
        say('You stop what you were doing.');
      }
      me.attached = null;
    };

    const tap = (clientX: number, clientY: number) => {
      const st = sRef.current;
      if (st.player.caught) return say("You've been caught! Brace yourself…");
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickables.filter((o) => o.visible), true)[0];
      if (hit?.object.userData.grave) {
        const g = st.grave;
        if (!g) return;
        stopWorking();
        setTalkingRef.current(null);
        if (walkTo(neighbors(g.x, g.y).concat([[g.x, g.y]]), null)) {
          me.goalGrave = true;
          if (!me.path.length) {
            me.goalGrave = false;
            openGrave();
          }
        }
        return;
      }
      if (hit?.object.userData.npcId) {
        const npc = NPCS.find((x) => x.id === hit.object.userData.npcId)!;
        if (npc.kind === 'baller') return say("They're busy playing. Their bags on the bench aren't watched much…");
        if (npc.kind === 'clerk') return say(`The ${npc.name.toLowerCase()} keeps an eye on the shelves. Don't get caught.`);
        if (npc.kind === 'bartender') return say('The bartender keeps an eye on his guests. Wait until he turns his back.');
        if (npc.kind === 'guard') return say('The guard patrols the lot with his flashlight. Stay out of the light.');
        stopWorking();
        setTalkingRef.current(null);
        const [ex, ey] = npcTile(npc);
        if (walkTo(neighbors(ex, ey), null, npc)) {
          ring.position.set(ex + 0.5, 0.08, ey + 0.5);
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
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return say("That's the ocean. The island ends here, for now.");
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
    // Round, centred on you, and turned with the camera (what's ahead of you is up), like RuneScape.
    // The island is drawn once (mapArt.ts); every tenth of a second we draw the piece around you, then
    // spots, shops, NPCs, your grave and you on top. Tapping it walks you there. "N" marks north.
    const mini = miniRef.current!;
    const MINI_SIZE = 132; // CSS pixels across
    const MINI_TILE = 5.5; // CSS pixels per tile
    const BASE_PX = 12; // canvas pixels per tile in the pre-drawn island
    const dpr = Math.min(window.devicePixelRatio, 2);
    mini.width = MINI_SIZE * dpr;
    mini.height = MINI_SIZE * dpr;
    mini.style.width = `${MINI_SIZE}px`;
    mini.style.height = `${MINI_SIZE}px`;
    const base = drawWorld(BASE_PX);
    const drawMini = () => {
      const g = mini.getContext('2d')!;
      const R = MINI_SIZE / 2;
      const yaw = yawRef.current;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, MINI_SIZE, MINI_SIZE);
      g.save();
      g.beginPath();
      g.arc(R, R, R - 1, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = '#15303f';
      g.fillRect(0, 0, MINI_SIZE, MINI_SIZE);
      // World → minimap: centre on you, turn with the camera, scale.
      g.translate(R, R);
      g.rotate(yaw);
      g.scale(MINI_TILE, MINI_TILE);
      g.translate(-me.pos.x, -me.pos.z);
      g.drawImage(base, -MAP_EDGE, -MAP_EDGE, base.width / BASE_PX, base.height / BASE_PX);
      /** Draw something upright (not turned with the map) at world point (x, z), in CSS pixels. */
      const upright = (x: number, z: number, draw: () => void) => {
        g.save();
        g.translate(x, z);
        g.rotate(-yaw);
        g.scale(1 / MINI_TILE, 1 / MINI_TILE);
        draw();
        g.restore();
      };
      const dot = (x: number, z: number, r: number, fill: string, stroke?: string) =>
        upright(x, z, () => {
          g.beginPath();
          g.arc(0, 0, r, 0, Math.PI * 2);
          g.fillStyle = fill;
          g.fill();
          if (stroke) {
            g.lineWidth = 1;
            g.strokeStyle = stroke;
            g.stroke();
          }
        });
      const st = sRef.current;
      for (const n of NODES) {
        if (n.wanders) continue;
        dot(n.x + 0.5, n.y + 0.5, 2, canStart(st, n.crimeId) ? '#8b8378' : '#d9a441');
      }
      for (const [id, w] of walkers) {
        const n = NODES.find((x) => x.id === id)!;
        dot(w.pos.x, w.pos.z, 2, canStart(st, n.crimeId) ? '#8b8378' : '#d9a441');
      }
      for (const r of ROOMS.filter((x) => x.shop)) upright((r.x0 + r.x1 + 1) / 2, (r.y0 + r.y1 + 1) / 2, () => drawBag(g, 0, 0, 10));
      for (const e of others.values()) dot(e.g.position.x, e.g.position.z, 2.6, '#ffffff', '#141210');
      for (const npc of NPCS.filter((n) => n.named)) {
        const ep = npcWalk.get(npc.id)!.pos;
        dot(ep.x, ep.z, 2.2, '#f2d27a', '#141210');
      }
      if (st.grave) upright(st.grave.x + 0.5, st.grave.y + 0.5, () => drawGrave(g, 0, 0, 10));
      g.restore();
      // You, in the middle.
      g.beginPath();
      g.arc(R, R, 3.2, 0, Math.PI * 2);
      g.fillStyle = '#e2604c';
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = '#ffffff';
      g.stroke();
      // North marker on the rim.
      const nx = R + Math.sin(yaw) * (R - 9);
      const ny = R - Math.cos(yaw) * (R - 9);
      g.beginPath();
      g.arc(nx, ny, 7, 0, Math.PI * 2);
      g.fillStyle = '#141210';
      g.fill();
      g.fillStyle = '#e8e2d6';
      g.font = 'bold 9px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('N', nx, ny + 0.5);
    };
    const onMiniTap = (e: PointerEvent) => {
      e.stopPropagation();
      const r = mini.getBoundingClientRect();
      // Undo the minimap's turn and scale to find the tile you tapped.
      const dx = (e.clientX - r.left - r.width / 2) / MINI_TILE;
      const dy = (e.clientY - r.top - r.height / 2) / MINI_TILE;
      const yaw = yawRef.current;
      const wx = me.pos.x + dx * Math.cos(yaw) + dy * Math.sin(yaw);
      const wz = me.pos.z - dx * Math.sin(yaw) + dy * Math.cos(yaw);
      walkToTile(Math.floor(wx), Math.floor(wz));
    };
    mini.addEventListener('pointerup', onMiniTap);
    walkRef.current = (x, y) => walkToTile(x, y);
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

    const camTarget = me.pos.clone();
    // ---------- floating "+$5" over your head ----------
    const off = onReport((r) => {
      // One line per attempt (attempts come every second, so separate lines would pile up),
      // plus a second, bigger line for level-ups, big scores and stuns.
      const parts: [string, string][] = [];
      if (r.cash >= 1) parts.push([`+${fmtMoney(r.cash)}`, 'f-cash']);
      for (const [id, n] of Object.entries(r.items)) parts.push([`+${n} ${ITEM_BY_ID[id]?.name ?? id}`, 'f-cash']);
      const xp = Object.values(r.xp).reduce((a, b) => a + (b ?? 0), 0);
      if (xp) parts.push([`+${Math.round(xp).toLocaleString('en-US')} xp`, 'f-xp']);
      if (r.damage) parts.push([`-${r.damage} HP`, 'f-bust']);
      const big: [string, string][] = [];
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
      if (r.died) {
        // You wake up at the start. Your stuff is in your grave.
        me.pos.copy(center(...SPAWN));
        worldRef.current?.move(SPAWN, []);
        me.path = [];
        me.goal = null;
        me.goalNpc = null;
        me.goalGrave = false;
        me.attached = null;
        camTarget.copy(me.pos);
        setTalkingRef.current(null);
        say(sRef.current.grave ? 'You wake up at the start. Your stuff is in your grave: go and get it.' : 'You wake up at the start.');
        big.push(['You died!', 'f-bust']);
      } else if (r.hit) big.push(['Stunned!', 'f-bust']);
      line(big, 'float-big');
      if (r.hit) {
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
    camTarget.copy(me.pos);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = sRef.current;
      const meCrew = st.player;
      const job = meCrew?.job;

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
          if (!me.path.length && me.goalGrave) {
            me.goalGrave = false;
            openGrave();
          }
          if (!me.path.length) savePos();
          if (!me.path.length && me.goalNpc) {
            const npc = me.goalNpc;
            const ep = npcWalk.get(npc.id)!.pos;
            me.facing = Math.atan2(ep.x - me.pos.x, ep.z - me.pos.z);
            npcGroups.get(npc.id)!.rotation.y = Math.atan2(me.pos.x - ep.x, me.pos.z - ep.z);
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
      const working = !!(me.attached && job && !me.path.length);
      if (working && me.attached) {
        const [nx, ny] = nodeTile(me.attached);
        me.facing = Math.atan2(nx + 0.5 - me.pos.x, ny + 0.5 - me.pos.z);
      }
      if (st.player.caught) {
        const catcher = [...npcWalk.values()].find((w) => w.mode === 'rush' || w.mode === 'hit');
        if (catcher) me.facing = Math.atan2(catcher.pos.x - me.pos.x, catcher.pos.z - me.pos.z);
      }
      player.position.set(me.pos.x, 0.03, me.pos.z);
      const stunned = meCrew.stunnedUntil > gameNow();
      const pose: Pose = stunned ? 'stunned' : me.path.length ? 'walk' : working ? 'work' : 'idle';
      animateCharacter(player, pose, now);
      player.rotation.y = me.facing;

      // Tourists stroll (unless you're targeting or working one).
      for (const [id, w] of walkers) {
        const busy = me.goal?.id === id || me.attached?.id === id;
        if (!busy) {
          const d = w.target.clone().sub(w.pos);
          if (d.length() < 0.02) {
            w.wait -= dt;
            if (w.wait <= 0) {
              const n = NODES.find((x) => x.id === id)!;
              const next = strollStep(...tileOf(w.pos.x, w.pos.z), n.wanders!);
              if (next) w.target = center(...next);
              w.wait = 0.8 + Math.random() * 3;
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
        animateCharacter(g, seatedIds.has(id) ? 'sit' : w?.moving ? 'walk' : 'idle', now, k++ * 0.7);
        if (w) w.moving = false;
      }
      const caught = st.player.caught;
      if (caught && caught.at !== lastCaught) {
        lastCaught = caught.at;
        startChase(caught.crimeId, caught.at);
      }
      const talkingNow = talkingIdRef.current;
      for (const npc of NPCS) {
        const w = npcWalk.get(npc.id)!;
        const g = npcGroups.get(npc.id)!;
        const busy = me.goalNpc?.id === npc.id || talkingNow === npc.id;
        w.moving = false;
        if (w.mode !== 'normal') {
          if (w.mode === 'rush') {
            if (followPath(w, g, dt)) {
              g.rotation.y = Math.atan2(me.pos.x - w.pos.x, me.pos.z - w.pos.z);
              if (gameNow() >= w.until) {
                w.mode = 'hit';
                w.until = now + 450;
              }
            }
          } else if (w.mode === 'hit') {
            g.rotation.y = Math.atan2(me.pos.x - w.pos.x, me.pos.z - w.pos.z);
            if (now >= w.until) {
              w.mode = 'back';
              w.speed = 1.6;
              // Walk back to where his routine has him now (the bartender's spot, the guard's place on his route).
          const home: [number, number] =
            npc.kind === 'guard' ? tileOf(guardAt(gameNow()).x, guardAt(gameNow()).z) : npc.kind === 'bartender' ? [npc.area.x0 + bartenderAt(gameNow()).spot, npc.area.y0] : [npc.x, npc.y];
          w.path = findPath(blocked, W, H, tileOf(w.pos.x, w.pos.z), [home], canStep) ?? [];
            }
          } else if (followPath(w, g, dt)) {
            w.mode = 'normal';
            w.target.copy(w.pos);
          }
          g.position.set(w.pos.x, 0.03, w.pos.z);
          animateCharacter(g, w.mode === 'hit' ? 'work' : w.moving ? 'walk' : 'idle', now, 3.1);
          continue;
        }
        if (busy) {
          w.target.copy(center(...tileOf(w.pos.x, w.pos.z)));
          if (talkingNow === npc.id) g.rotation.y = Math.atan2(me.pos.x - w.pos.x, me.pos.z - w.pos.z);
        } else if (npc.kind === 'bartender') {
          // His routine is a fixed schedule (game/watchers.ts): watch the room, then turn his back and
          // polish the bottles at one of three spots. We only draw it; the game rules decide if he saw you.
          const b = bartenderAt(gameNow());
          if (!b.watching) w.target = center(npc.area.x0 + b.spot, npc.area.y0);
          const d = w.target.clone().sub(w.pos);
          if (d.length() > 0.02) {
            w.pos.add(d.clampLength(0, 1.6 * dt));
            g.rotation.y = Math.atan2(d.x, d.z);
            w.moving = true;
          } else {
            g.rotation.y = turnTowards(g.rotation.y, b.watching ? 0 : Math.PI, dt * 6);
          }
          g.position.set(w.pos.x, 0.03, w.pos.z);
          animateCharacter(g, w.moving ? 'walk' : b.watching ? 'idle' : 'work', now, 2.3);
          continue;
        } else if (npc.kind === 'guard') {
          // His patrol is a fixed schedule too (same route and timing for everyone). Catch up smoothly
          // if he's just walked back from hitting someone.
          const gs = guardAt(gameNow());
          const d = new THREE.Vector3(gs.x - w.pos.x, 0, gs.z - w.pos.z);
          w.pos.add(d.length() > 0.05 ? d.multiplyScalar(Math.min(1, dt * 4)) : d);
          w.moving = gs.moving;
          g.rotation.y = gs.yaw;
          g.position.set(w.pos.x, 0.03, w.pos.z);
          animateCharacter(g, w.moving ? 'walk' : 'idle', now, 4.2);
          continue;
        } else if (npc.kind === 'baller') {
          // Ballers are moved by the basketball game.
          const b = hoops.player(npc.id === 'baller_0' ? 0 : 1, now / 1000);
          const d = b.pos.clone().sub(w.pos);
          w.moving = d.length() > 0.01;
          w.pos.copy(b.pos);
          g.rotation.y = b.facing;
          g.position.set(w.pos.x, 0.03 + b.jump, w.pos.z);
          animateCharacter(g, b.shooting ? 'work' : w.moving ? 'walk' : 'idle', now, npc.id === 'baller_0' ? 0 : 1.7);
          continue;
        } else {
          const d = w.target.clone().sub(w.pos);
          if (d.length() < 0.02) {
            w.wait -= dt;
            if (w.wait <= 0) {
              // Next step: a random free tile next to them, inside their area.
              const next = strollStep(...tileOf(w.pos.x, w.pos.z), npc.area, npc.avoid);
              if (next) w.target = center(...next);
              w.wait = 0.8 + Math.random() * 2.5;
            }
          } else {
            w.pos.add(d.clampLength(0, 1.1 * dt));
            g.rotation.y = Math.atan2(d.x, d.z);
            w.moving = true;
          }
        }
        g.position.set(w.pos.x, 0.03, w.pos.z);
        animateCharacter(g, w.moving ? 'walk' : 'idle', now, 3.1);
      }
      hoops.update(now / 1000);
      {
        const gw = npcWalk.get('guard');
        const gg = npcGroups.get('guard');
        if (gw && gg) {
          beam.position.set(gw.pos.x, 0.1, gw.pos.z);
          beam.rotation.y = gg.rotation.y;
          beam.visible = gw.mode === 'normal';
          // Red while you're working inside his beam (he's about to catch you: the game rules decide that).
          const working = !!job && CRIME_BY_ID[job.crimeId]?.catcher === 'guard';
          const sees = inBeam(guardAt(gameNow()), me.pos.x, me.pos.z);
          beamMat.color.set(sees && working ? 0xff3a2a : 0xfff0b0);
          beamMat.opacity = sees && working ? 0.55 : 0.3;
        }
      }
      // Spots that were emptied (shelves, meters) look empty until they refill.
      for (const n of NODES) if (n.kind === 'shelf' || n.kind === 'meter') setSpotEmpty(nodeGroups.get(n.id)!, emptyFor(st, n.id, gameNow()) > 0);
      // Inside a room: fade its walls and lift the roof so you can see in.
      const myTile = tileOf(me.pos.x, me.pos.z);
      for (const r of ROOMS) city.rooms.get(r.id)!.force = inRect(r, ...myTile);

      // Other players: walk them along the route they shared.
      const list = worldRef.current?.others() ?? [];
      const here = new Set<string>();
      for (const o of list) {
        here.add(o.id);
        let e = others.get(o.id);
        if (!e) {
          const g = buildCharacter(o.look);
          scene.add(g);
          e = { g, facing: 0 };
          others.set(o.id, e);
        }
        const at = along(o.from, o.path, Math.max(0, ((gameNow() - o.at) / 1000) * WALK_SPEED));
        if (at.facing !== null && at.moving) e.facing = at.facing;
        e.g.position.set(at.x, 0.03, at.z);
        e.g.rotation.y = e.facing;
        animateCharacter(e.g, at.moving ? 'walk' : 'idle', now, o.id.charCodeAt(0) * 0.37);
      }
      for (const [id, e] of others)
        if (!here.has(id)) {
          scene.remove(e.g);
          others.delete(id);
        }

      // Your grave, if you have one.
      const gr = st.grave;
      grave.visible = !!gr;
      if (gr) grave.position.set(gr.x + 0.5, 0.03, gr.y + 0.5);
      herePos.current = tileOf(me.pos.x, me.pos.z);

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
        const p = working && job ? (gameNow() - job.startedAt) / (job.endsAt - job.startedAt) : 0;
        progressRef.current.style.width = `${Math.max(0, Math.min(1, p)) * 100}%`;
      }

      // Labels over nearby spots, and the floating text anchor over your head.
      // Nearest few only, and skip any that would overlap one already placed.
      const seen = new Set<string>();
      const placed: [number, number, number][] = [];
      // Other players' names (white), from far away.
      for (const [id, e] of others) {
        const o = list.find((x) => x.id === id);
        if (!o || e.g.position.distanceTo(me.pos) > NPC_LABEL_RANGE * 1.5) continue;
        const [x, y, depth] = project(e.g.position.clone().setY(1.55));
        if (depth > 1) continue;
        let el = labelEls.get(`player:${id}`);
        if (!el) {
          el = document.createElement('div');
          el.className = 'node-label player';
          labelLayer.appendChild(el);
          labelEls.set(`player:${id}`, el);
        }
        if (el.textContent !== o.name) el.textContent = o.name;
        seen.add(`player:${id}`);
        placed.push([x, y, o.name.length * 6 + 10]);
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
      // "Your grave · 4:31" over your grave (from further away than other labels).
      if (gr) {
        const [x, y, depth] = project(grave.position.clone().setY(0.95));
        if (depth <= 1 && grave.position.distanceTo(me.pos) < NPC_LABEL_RANGE * 1.5) {
          let el = labelEls.get('grave');
          if (!el) {
            el = document.createElement('div');
            el.className = 'node-label grave';
            labelLayer.appendChild(el);
            labelEls.set('grave', el);
          }
          const text = `Your grave · ${graveTime(gr.expiresAt - gameNow())}`;
          if (el.textContent !== text) el.textContent = text;
          seen.add('grave');
          placed.push([x, y, text.length * 6 + 10]);
          el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        }
      }
      // Yells ("Hey!") in a speech bubble over whoever is shouting.
      for (const [id, y] of yells) {
        const g = npcGroups.get(id)!;
        if (now > y.until) {
          yells.delete(id);
          continue;
        }
        const [x, yy, depth] = project(g.position.clone().setY(2.05));
        if (depth > 1) continue;
        let el = labelEls.get(`yell:${id}`);
        if (!el) {
          el = document.createElement('div');
          el.className = 'node-label yell';
          labelLayer.appendChild(el);
          labelEls.set(`yell:${id}`, el);
        }
        if (el.textContent !== y.text) el.textContent = y.text;
        seen.add(`yell:${id}`);
        el.style.transform = `translate(${x}px, ${yy}px) translate(-50%, -100%)`;
      }
      for (const npc of NPCS) {
        if (!npc.named) continue;
        const g = npcGroups.get(npc.id)!;
        let el = labelEls.get(`npc:${npc.id}`);
        const [x, y, depth] = project(g.position.clone().setY(1.55));
        if (g.position.distanceTo(me.pos) > NPC_LABEL_RANGE || depth > 1) continue;
        if (!el) {
          el = document.createElement('div');
          el.className = 'node-label npc';
          labelLayer.appendChild(el);
          labelEls.set(`npc:${npc.id}`, el);
        }
        const [text, tone] = npcLabel(npc);
        if (el.textContent !== text) el.textContent = text;
        if (el.dataset.tone !== tone) el.dataset.tone = tone;
        seen.add(`npc:${npc.id}`);
        placed.push([x, y, text.length * 6 + 10]);
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
        const empty = !locked && emptyFor(st, n.id, gameNow()) > 0;
        const text = locked ? `${n.label} · Lv ${crime.level}` : empty ? `${n.label} · empty` : n.label;
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
        el.classList.toggle('locked', locked || empty);
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
      savePos();
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
  const now = gameNow();
  const job = me.job;
  const crime = job ? CRIME_BY_ID[job.crimeId] : null;
  const recent: Msg[] = [...msgs, ...s.log.slice(0, 4).map((l) => ({ t: l.t, text: l.text }))].sort((a, b) => a.t - b.t).slice(-4);

  return (
    <div className="street" ref={hostRef}>
      <div className="street-labels" ref={labelsRef} />
      <div className="street-floats" ref={floatsRef} />
      <div className="minimap-wrap">
        <canvas className="minimap" ref={miniRef} aria-label="Minimap: tap to walk there" />
        <button className="map-btn" onClick={() => setMapOpen(true)} aria-label="Open the world map" title="World map">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6 L9 3.5 L15 6 L21 3.5 V18 L15 20.5 L9 18 L3 20.5 Z" fill="#e8dcc0" stroke="#141210" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M9 3.5 V18 M15 6 V20.5" stroke="#141210" strokeWidth="1.2" />
            <circle cx="12" cy="11" r="1.8" fill="#d9473a" />
          </svg>
        </button>
      </div>
      {mapOpen && (
        <WorldMap
          s={s}
          here={herePos.current}
          onClose={() => setMapOpen(false)}
          onWalk={(x, y) => {
            setMapOpen(false);
            walkRef.current(x, y);
          }}
        />
      )}
      <div className="street-status">
        {me.stunnedUntil > now ? (
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
      {talking && <NpcDialog npc={talking} s={s} api={api} onClose={() => setTalking(null)} />}
      <div className="chatbox" aria-live="polite">
        {recent.map((m, i) => (
          <div key={`${m.t}-${i}`}>{m.text}</div>
        ))}
      </div>
    </div>
  );
}
