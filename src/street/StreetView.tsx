// The Street: a small low-poly city you walk around RuneScape-style.
// Tap the ground to walk. Tap a tourist, a gym bag, a shelf… to walk up and try it (one tap = one
// attempt). NPCs live here too: Eddy in his store, players on the basketball court, and the people
// who catch you (clerks, the bartender, the guard). Drag to rotate the camera, pinch (or wheel) to zoom.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { GameState, Look, Report } from '../game/types';
import { CATCH_SECONDS, CRIME_BY_ID } from '../game/data/crimes';
import { SKILL_BY_ID } from '../game/data/skills';
import { busyReason, canStart, emptyFor, fmtDuration, fmtMoney, hpAt, maxHp, skillLevel } from '../game/engine';
import type { GameApi } from '../game/api';
import { gameNow } from '../game/clock';
import { GUARD_HALF, GUARD_RANGE, angDiff, bartenderAt, guardAt, inBeam } from '../game/watchers';
import { ITEM_BY_ID, plural } from '../game/data/items';
import { COOK_TICKS } from '../game/data/recipes';
import { BAR_FACING, barSpot, GRID, gi, inGrid, CLUB, NEST_GATE, BANK_COUNTER_Y, COURT, enclosureAt, FLOOR_H, LINKS, NODES, NPCS, ROOMS, SEWER_DEPTH, SPAWN, STAIRS, STATIONS, WAKE, WARD, buildBlocked, canStep, floorY, inRect, inSewer, isUpstairs, onMap, type Npc, type StreetNode } from './map';
import { THROW_RELEASE, WALK_PACE, animateCharacter, buildCharacter, randomLook, type Pose } from './character';
import { clearShot, routeMs, routePoint } from './sight';
import { rangedWeapon } from '../game/combat';
import { buildCity, updateFades } from './city';
import { BAG_COLORS, CAR_COLORS, METAL_COLORS, buildThrowingKnife, animatePigeon, animateRat, buildDog, buildGiantRat, buildGrave, buildRat, buildScrapDumpster, buildGymBag, buildMeter, buildPigeon, buildShelf, setGear, setSpotEmpty } from './props';
import { ENEMY_KINDS, enemyAt as scheduleAt } from '../game/enemies';
import { buildBigCar, buildGroundItem } from './streetLife';
import { CookDialog } from './CookDialog';
import { TinkerDialog } from './TinkerDialog';
import { BankDialog } from './BankDialog';
import { CRAFT_BY_ID } from '../game/data/metals';
import { QuickEat } from './QuickEat';
import { StyleToggle } from './StyleToggle';
import { RETURN_MS, type EnemyState, type FightEvent } from '../net/useOnlineGame';
import { MAP_EDGE, drawBag, drawGrave, drawWorld } from './mapArt';
import { WorldMap } from './WorldMap';
import { NpcDialog } from './NpcDialog';
import { QuestDialog, isQuestNpc } from './QuestDialog';
import { findPath, neighbors } from './pathfind';
import { getPrefs } from '../game/prefs';
import { BALL_COLOR, Hoops } from './hoops';
import { ChatBox } from './ChatBox';
import type { ChatLink } from '../net/chat';
import { mulberry32 } from '../game/rng';

interface Msg {
  t: number;
  text: string;
}

/** How each kind of enemy looks: a Pigeon, or (thugs) a person in a dark hoodie with the hood up and a knife. */
const THUG_LOOKS: Look[] = [
  { skin: 2, hair: 0, hairColor: 0, top: 3, bottom: 0 },
  { skin: 3, hair: 0, hairColor: 0, top: 3, bottom: 3 },
  { skin: 1, hair: 0, hairColor: 0, top: 3, bottom: 1 },
];
/** The bikers: open black leather vests over white, red or grey T-shirts, dark jeans; copper knuckles. */
const BIKER_LOOKS: Look[] = [
  { skin: 1, hair: 3, hairColor: 0, top: 4, bottom: 0 },
  { skin: 2, hair: 1, hairColor: 1, top: 0, bottom: 0 },
  { skin: 0, hair: 3, hairColor: 2, top: 4, bottom: 3 },
];
let thugCount = 0;
let bikerCount = 0;
function buildEnemy(kind: string): THREE.Group {
  if (kind === 'pigeon') return buildPigeon();
  if (kind === 'rat') return buildRat();
  if (kind === 'giant_rat') return buildGiantRat();
  if (kind === 'dog') return buildDog();
  if (kind === 'biker') {
    const b = buildCharacter(BIKER_LOOKS[bikerCount++ % BIKER_LOOKS.length], { vest: 0x1e1b18 });
    setGear(b, { weapon: 'copper_knuckles' });
    return b;
  }
  const g = buildCharacter(THUG_LOOKS[thugCount++ % THUG_LOOKS.length], { hood: 0x4a4d52 });
  setGear(g, { weapon: 'tin_knife' });
  return g;
}
/** Animate an enemy: idle ('peck'), walking, flying (pigeons), attacking, or going down ('dead'). */
function animateEnemy(kind: string, g: THREE.Group, mode: 'peck' | 'walk' | 'fly' | 'attack' | 'dead', now: number, phase: number) {
  if (kind === 'pigeon') return animatePigeon(g, mode, now, phase);
  if (kind === 'rat' || kind === 'giant_rat' || kind === 'dog') return animateRat(g, mode, now, phase);
  animateCharacter(g, mode === 'dead' ? 'stunned' : mode === 'attack' ? 'work' : mode === 'walk' ? 'walk' : 'idle', now, phase);
}

/** How a weapon's swing looks (see ItemDef.gear.anim). */
const weaponAnim = (id: string | undefined): 'punch' | 'swing' | 'stab' | 'throw' => (id ? ITEM_BY_ID[id]?.gear?.anim : undefined) ?? 'punch';
/** What someone holds and how they attack: their throwing knives in Marksman style (v0.51), else their melee weapon. */
const heldWeapon = (equipment: GameState['equipment'], style: string | undefined, hasKnives = true) =>
  style === 'marksman' && equipment?.marksman && hasKnives ? equipment.marksman : equipment?.weapon;
/** How long each attack takes, and how far into it the blow lands (so it lands as the hitsplat shows). A throw lets go
 *  at THROW_RELEASE and the knife then flies (THROW_SPEED): its hitsplat waits for the knife. */
const ATTACK_TIMING = { punch: { ms: 420, lead: 160 }, stab: { ms: 520, lead: 230 }, swing: { ms: 900, lead: 380 }, throw: { ms: 640, lead: 640 * THROW_RELEASE } } as const;
/** How fast a thrown knife flies (tiles a second). */
const THROW_SPEED = 16;
// Tiles per second (v0.49: 4 → 2.5, a walk rather than a jog; the steps match it, see WALK_PACE). The server allows up
// to 5 (game.can_reach), so this needs no server change.
const WALK_SPEED = WALK_PACE;
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
    case 'dumpster':
      return 'You dig through the dumpster…';
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
  equipment?: Partial<Record<string, string>>;
  /** Melee or Marksman (v0.51): with Marksman they hold and throw their knives. */
  style?: string;
  /** Their combat level (shown next to their name). */
  combat?: number;
  /** What they're doing right now, and their health (from the server, live). */
  status?: OtherStatus;
}
/** What another player is doing (public.player_status), so everyone sees it. Times in ms. */
export interface OtherStatus {
  /** The spot they're working (crime attempt), until jobEndsAt. */
  spot: string | null;
  jobEndsAt: number;
  stunnedUntil: number;
  fightEnemy: string | null;
  hp: number;
  hpAt: number;
  maxHp: number;
}
/** The shared world, online: who else is here, and how to tell them where you walk. */
export interface WorldLink {
  others: () => OtherPlayer[];
  move: (from: [number, number], path: [number, number][]) => void;
  /** Your own player id. */
  myId: string;
  /** The enemies (shared by everyone), and the swings of your fight as the server rolls them. */
  enemies: () => EnemyState[];
  onFight: (fn: (events: FightEvent[]) => void) => () => void;
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

/** The HUD around the street (v0.44): which bottom panel is open (null: hidden), its content, and the icon bar. */
export interface Hud {
  panel: 'chat' | 'bag' | 'skills' | null;
  content: ReactNode;
  bar: ReactNode;
}

export function StreetView({ s, api, onReport, world, chat, hud }: { s: GameState; api: GameApi; onReport: (fn: (r: Report) => void) => () => void; world?: WorldLink; chat?: ChatLink; hud?: Hud }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const floatsRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const eatRingRef = useRef<HTMLButtonElement>(null);
  const sRef = useRef(s);
  sRef.current = s;
  const apiRef = useRef(api);
  apiRef.current = api;
  const worldRef = useRef(world);
  worldRef.current = world;
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const zoomRef = useRef(15);
  const yawRef = useRef(0); // camera angle around you
  const pitchRef = useRef(1.16); // how steeply the camera looks down (radians)
  // The log always starts with the welcome (time 0, so it sorts above everything else), then the how-to line.
  const [msgs, setMsgs] = useState<Msg[]>([
    { t: 0, text: 'Welcome to Underworld.' },
    // v0.51: the how-to covers more than pickpocketing now (fighting, talking, cooking) and points to the Skills guides.
    { t: 1, text: 'Tap to walk. Tap people and things to act on them: pick a pocket, fight, talk, cook. Drag to turn the camera, pinch or scroll to zoom.' },
    { t: 2, text: 'New here? Pick tourists\' pockets in the park or fight the Pigeons. Tap a skill in Skills to see how to train it.' },
  ]);
  const sayRef = useRef((text: string) => setMsgs((m) => [...m.slice(-20), { t: gameNow(), text }]));
  // Which NPC you're talking to (opens the chat window). Set from the 3D scene when you reach them.
  const [talking, setTalking] = useState<Npc | null>(null);
  const setTalkingRef = useRef(setTalking);
  // The cooking screen (opened when you reach the barbecue): where you stand, or null when closed.
  const [cookAt, setCookAt] = useState<[number, number] | null>(null);
  // The Tinkering screen (a press or a workbench in the Factory): where you stand and which kind, or null when closed.
  const [tinkerAt, setTinkerAt] = useState<{ pos: [number, number]; kind: 'press' | 'bench' } | null>(null);
  const setTinkerAtRef = useRef(setTinkerAt);
  // The bank screen (after talking to a banker): where you stand, or null when closed.
  const [bankAt, setBankAt] = useState<[number, number] | null>(null);
  const setBankAtRef = useRef(setBankAt);
  const setCookAtRef = useRef(setCookAt);
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
    /** A point `h` above the floor at v (the street, or the hospital's ward upstairs): for labels over heads. */
    /** How far something is from you along the ground (ignoring height: things in the ward or the sewer are drawn a
     *  storey up or deep down, while your own position stays at height 0). */
    const flat = (v: THREE.Vector3) => Math.hypot(v.x - me.pos.x, v.z - me.pos.z);
    const lift = (v: THREE.Vector3, h: number) => new THREE.Vector3(v.x, floorY(v.x, v.z) + h, v.z);

    // ---------- renderer / scene: dusk, long soft shadows, fog (docs/design.md §7b) ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    // (Dev only: the previews read the triangle and draw-call counts from here.)
    if (import.meta.env.DEV) Object.assign(window, { __street: { renderer, scene, openCook: (x: number, y: number) => setCookAtRef.current([x, y]), talkTo: (id: string) => setTalkingRef.current(NPCS.find((n) => n.id === id) ?? null) } });
    const SKY = 0x1c2230;
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 22, 60);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 220);
    // Cool blue sky light from above, warm low sun from the side.
    const SKY_INTENSITY = 1.25;
    const SUN_INTENSITY = 1.8;
    const sky = new THREE.HemisphereLight(0x8fa3c7, 0x2a2420, SKY_INTENSITY);
    scene.add(sky);
    let wasUnder = false;
    const sun = new THREE.DirectionalLight(0xffa864, SUN_INTENSITY);
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
    // The shadow box follows you, but only in whole shadow-map pixels (measured across the sun's view): sliding it by
    // fractions made every shadow edge (the trees on the park's grass) shimmer while you walked or turned the camera.
    const SUN_TEXEL = (sc.right - sc.left) / sun.shadow.mapSize.x;
    const sunZ = SUN_OFFSET.clone().normalize();
    const sunX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunZ).normalize();
    const sunY = new THREE.Vector3().crossVectors(sunZ, sunX);
    const sunSnap = (p: THREE.Vector3) => {
      const snap = (v: number) => Math.round(v / SUN_TEXEL) * SUN_TEXEL;
      return new THREE.Vector3()
        .addScaledVector(sunX, snap(p.dot(sunX)))
        .addScaledVector(sunY, snap(p.dot(sunY)))
        .addScaledVector(sunZ, p.dot(sunZ));
    };

    const geoms: THREE.BufferGeometry[] = [];
    const disposables: { dispose: () => void }[] = [];
    const city = buildCity(scene);
    disposables.push(city);

    // ---------- tappable spots ----------
    const pickables: THREE.Object3D[] = [];
    // The hospital's stairs: tap them to go up (or down).
    pickables.push(...city.stairs);
    if (city.gate) pickables.push(city.gate);
    // The pothole and the sewer's ladder: tap to climb down or up.
    pickables.push(...city.links);
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
      hit.position.y = 1.05 / 0.9; // (inside the person's 90% scale: about 1.05 up)
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
        // A car at person scale, filling its bay (two tiles deep: the spot's tile and the one behind it).
        g = buildBigCar(CAR_COLORS[(n.x + n.y) % CAR_COLORS.length]);
        g.scale.setScalar(0.72);
      } else if (n.kind === 'bag') {
        g = buildGymBag(BAG_COLORS[(n.x + n.y) % BAG_COLORS.length]);
      } else if (n.kind === 'meter') {
        g = buildMeter();
      } else if (n.kind === 'dumpster') {
        // (v0.56: each yard's own paint and junk.)
        g = buildScrapDumpster(n.crimeId === 'copper_salvage' ? 'copper' : n.crimeId === 'aluminium_salvage' ? 'aluminium' : 'tin');
      } else {
        g = buildShelf([0xd9473a, 0xf0b13c, 0x3a6ea5, 0x4fa04a, 0xe07b39, 0xf2efe8, 0x8a5ab8, 0xe86aa0], n.x * 3 + n.y);
      }
      g.position.copy(c);
      if (n.kind === 'car' && n.facing !== undefined) g.position.add(new THREE.Vector3(-Math.cos(n.facing), 0, Math.sin(n.facing)).multiplyScalar(0.45));
      if (n.seated) g.position.y = -0.05; // (on the bar stool's seat, v0.45 body)
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
      /** When they last moved at walking speed (performance.now()): keeps the walk pose steady between frames. */
      lastMove?: number;
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
      eddy: [{ skin: 1, hair: 4, hairColor: 1, top: 2, bottom: 2 }, { apron: 0xe8e2d4 }], // flat cap, green top, white apron
      baller_0: [{ skin: 3, hair: 0, hairColor: 0, top: 4, bottom: 1 }, undefined],
      baller_1: [{ skin: 0, hair: 1, hairColor: 2, top: 1, bottom: 3 }, undefined],
      candy_clerk: [{ skin: 2, hair: 2, hairColor: 3, top: 5, bottom: 0 }, { apron: 0xff7ab8 }], // pink apron
      bartender: [{ skin: 1, hair: 0, hairColor: 0, top: 4, bottom: 0 }, { apron: 0x1e1b18 }], // white shirt, black apron
      guard: [{ skin: 3, hair: 4, hairColor: 0, top: 1, bottom: 0 }, { uniform: true }], // navy uniform and cap
      gas_clerk: [{ skin: 4, hair: 1, hairColor: 0, top: 0, bottom: 1 }, { apron: 0x2a4a7a }], // red shirt, blue apron
      receptionist: [{ skin: 1, hair: 2, hairColor: 2, top: 1, bottom: 0 }, undefined], // blue blouse, long hair
      doctor_0: [{ skin: 1, hair: 2, hairColor: 1, top: 4, bottom: 0 }, { scrubs: 0x2f6b4a, coat: true }], // green scrubs, white coat
      // The bankers: dark suits over white shirts, with ties; the bank's guard in a grey uniform.
      banker_0: [{ skin: 1, hair: 1, hairColor: 0, top: 3, bottom: 0 }, { suit: 0xf2efe8 }],
      banker_1: [{ skin: 3, hair: 2, hairColor: 0, top: 3, bottom: 0 }, { suit: 0xf2efe8 }],
      banker_2: [{ skin: 0, hair: 4, hairColor: 5, top: 3, bottom: 0 }, { suit: 0xf2efe8 }],
      bank_guard: [{ skin: 4, hair: 4, hairColor: 0, top: 4, bottom: 3 }, { uniform: true }],
      doctor_1: [{ skin: 2, hair: 1, hairColor: 0, top: 4, bottom: 0 }, { scrubs: 0x7ab0d8, coat: true }], // light blue scrubs, white coat
      // Splinter: a filthy old army jacket, a cap, a beard (sits against the sewer wall).
      splinter: [{ skin: 1, hair: 4, hairColor: 1, top: 2, bottom: 3 }, { jacket: 0x4e5236 }],
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
        .filter(([x, y]) => inRect(area, x, y) && !blocked[gi(x, y)] && canStep(tx, ty, x, y) && !avoid.some(([ax, ay]) => ax === x && ay === y));
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
      const path = findPath(blocked, GRID, tileOf(w.pos.x, w.pos.z), neighbors(px, py), canStep) ?? [];
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
      /** Walking up to an enemy to attack it. */
      goalEnemy: null as string | null,
      /** Walking to pick something up from the ground, or to a cooking station. */
      goalGround: null as number | null,
      goalStation: null as string | null,
      /** Walking to the pothole or the ladder, to climb. */
      goalLink: null as string | null,
      goalGate: false,
      /** Throwing a punch (pose) until this time. */
      punchUntil: 0,
      /** When the current swing started (performance.now()), for weapons that swing (a one-off move). */
      punchAt: 0,
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
      return neighbors(nx, ny).find(([x, y]) => inGrid(x, y) && !blocked[gi(x, y)]) ?? SPAWN;
    };
    // Back on the Street (after another tab, or a reload): stand where you were.
    const saved = sRef.current.player.pos;
    if (saved && inGrid(saved[0], saved[1]) && !blocked[gi(saved[0], saved[1])]) me.pos = center(...saved);
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

    // ---------- enemies (combat, docs/design.md §12) ----------
    // Shared by everyone: where they are comes from their schedule (pigeonAt), or where they stand still while
    // someone fights them. Tap one to walk up and fight it; the server rolls every swing.
    // route: the tiles it's walking along when it follows someone or walks back (around walls, like you do), and
    // routeKey: what that route was worked out for (redone when the target moves to another tile).
    const enemyViews = new Map<
      string,
      { g: THREE.Group; pos: THREE.Vector3 | null; peckUntil: number; dyingUntil: number; lastHp: number | null; wasDead: boolean; route: [number, number][]; routeKey: string }
    >();
    /**
     * Walk enemy view `v` towards `goal` along a path around buildings, walls and fences (findPath, the same rules as
     * yours). `beside`: stop on a tile next to the goal (following someone). Moves at most `speed` tiles/s; returns
     * how far it still has to go (tiles), so the caller can set the speed to arrive in time.
     */
    const walkEnemy = (v: { pos: THREE.Vector3 | null; route: [number, number][]; routeKey: string }, goal: [number, number], beside: boolean, speed: number, dt: number) => {
      const pos = v.pos!;
      const from = tileOf(pos.x, pos.z);
      const key = `${goal[0]},${goal[1]},${beside}`;
      if (v.routeKey !== key) {
        v.routeKey = key;
        v.route = findPath(blocked, GRID, from, beside ? neighbors(...goal) : [goal], canStep) ?? [];
      }
      let budget = speed * dt;
      while (v.route.length && budget > 0) {
        const c = center(...v.route[0]);
        const gap = c.sub(pos).setY(0);
        if (gap.length() <= budget) {
          pos.add(gap);
          budget -= gap.length();
          v.route.shift();
        } else {
          pos.add(gap.setLength(budget));
          budget = 0;
        }
      }
      return v.route.length;
    };
    const enemyAt = (e: EnemyState) => {
      if (e.fightPos) return { x: e.fightPos[0] + 0.5, z: e.fightPos[1] + 0.5, flying: false };
      return scheduleAt(e.kind, e.index, gameNow());
    };
    /** Walk up to an enemy (and attack it when you get there). */
    const goFight = (id: string) => {
      const e = worldRef.current?.enemies().find((x) => x.id === id);
      if (!e || e.deadUntil) return;
      const w = worldRef.current!;
      if (e.returning && !e.fighter && gameNow() < e.returning.at + RETURN_MS) return say("It's heading back to its spot. Give it a moment.");
      if (e.fighter && e.fighter !== w.myId) return say(`Someone else is fighting that ${ENEMY_KINDS[e.kind]?.name.toLowerCase() ?? 'thing'}.`);
      const at = enemyAt(e);
      const [ex, ey] = tileOf(at.x, at.z);
      // Throwing knives (v0.51): walk only as far as a tile you can throw from (in range, nothing in the way), the
      // nearest one; if you're on one already, throw right away.
      const rw = rangedWeapon(sRef.current);
      if (rw) {
        if (rw.left <= 0) return say(`You have no ${plural(ITEM_BY_ID[rw.id].name).toLowerCase()} left.`);
        const goals: [number, number][] = [];
        for (let dy = -rw.range; dy <= rw.range; dy++)
          for (let dx = -rw.range; dx <= rw.range; dx++) {
            const [tx, ty] = [ex + dx, ey + dy];
            if (inGrid(tx, ty) && !blocked[gi(tx, ty)] && canThrowFrom([tx, ty], at, rw.range)) goals.push([tx, ty]);
          }
        if (!goals.length) return say("You can't get a clear throw at that.");
        if (walkTo(goals, null)) {
          me.goalEnemy = id;
          if (!me.path.length) reachEnemy();
        }
        return;
      }
      if (walkTo(beside(ex, ey), null)) {
        me.goalEnemy = id;
        if (!me.path.length) reachEnemy();
      }
    };
    /** Can you throw from tile `from` at something at (at.x, at.z)? Close enough for the weapon, and a clear line
     *  (the same checks as the server's attack(): up to range + ½ tile, walls and fences block however close). */
    const canThrowFrom = (from: [number, number], at: { x: number; z: number }, range: number) => {
      const d = Math.hypot(from[0] + 0.5 - at.x, from[1] + 0.5 - at.z);
      return d <= range && clearShot(from[0], from[1], Math.floor(at.x), Math.floor(at.z));
    };
    /** Arrived next to it: attack, or follow it if it flew off meanwhile. */
    let chases = 0;
    const reachEnemy = () => {
      const id = me.goalEnemy;
      me.goalEnemy = null;
      if (!id) return;
      const e = worldRef.current?.enemies().find((x) => x.id === id);
      if (!e || e.deadUntil) return;
      const at = enemyAt(e);
      const rw = rangedWeapon(sRef.current);
      if (rw ? !canThrowFrom(tileOf(me.pos.x, me.pos.z), at, rw.range) : Math.hypot(at.x - me.pos.x, at.z - me.pos.z) > 1.8) {
        // It moved while you walked: follow it a few times, then give up (instead of a swing the server refuses).
        if (chases++ < 6) return goFight(id);
        chases = 0;
        return say(`The ${ENEMY_KINDS[e.kind]?.name.toLowerCase() ?? 'enemy'} keeps getting away. Try again.`);
      }
      chases = 0;
      apiRef.current.attack(id, tileOf(me.pos.x, me.pos.z));
    };
    // Your fight's swings, as the server rolled them: play them out (punches, pecks and hitsplats).
    const offFight = worldRef.current?.onFight((events) => {
      const first = events[0]?.at ?? 0;
      const target = sRef.current.fight?.enemy ?? lastFoe;
      for (const ev of events) {
        const delay = Math.min(1200, Math.max(0, ev.at - first));
        setTimeout(() => {
          const view = target ? enemyViews.get(target) : undefined;
          if (ev.killed) return; // the fall starts when the enemy's row says it's dead (the same for everyone)
          if (ev.by === 'you') {
            const anim = rangedWeapon(sRef.current) ? 'throw' : weaponAnim(sRef.current.equipment?.weapon);
            if (anim === 'throw') {
              // A throw (v0.51): wind up, let go, and the knife flies to it; the hitsplat shows as it lands.
              const t = ATTACK_TIMING.throw;
              me.punchAt = performance.now();
              me.punchUntil = me.punchAt + t.ms;
              if (view) throwKnife(sRef.current.equipment?.marksman ?? '', view.g.position, me.punchAt + t.lead, ev.dmg ?? 0);
              return;
            }
            // Each move lands as the hitsplat shows: a bat swing winds up longest, a knife draws back, a fist is quickest.
            const t = ATTACK_TIMING[anim];
            me.punchAt = performance.now() - t.lead;
            me.punchUntil = me.punchAt + t.ms;
            if (view) hitsplat(view.g.position, ev.dmg ?? 0);
          } else {
            if (view) view.peckUntil = performance.now() + 350;
            hitsplat(me.pos, ev.dmg ?? 0);
          }
        }, delay);
      }
    });
    /** Knives in the air (v0.51): each flies from your hand to where the target stands, spinning, then its hitsplat. */
    const knivesInAir: { g: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; t0: number; t1: number; dmg: number }[] = [];
    const throwKnife = (weapon: string, target: THREE.Vector3, release: number, dmg: number) => {
      const g = buildThrowingKnife(METAL_COLORS[weapon.split('_')[0]] ?? 0xb8bcc2);
      g.visible = false;
      scene.add(g);
      const to = target.clone();
      to.y = floorY(to.x, to.z) + 0.55;
      const fromPos = me.pos.clone();
      fromPos.y = floorY(fromPos.x, fromPos.z) + 1.45;
      const ms = (Math.max(0.6, fromPos.distanceTo(to)) / THROW_SPEED) * 1000;
      knivesInAir.push({ g, from: fromPos, to, t0: release, t1: release + ms, dmg });
    };
    const updateFlying = (now: number) => {
      for (let i = knivesInAir.length - 1; i >= 0; i--) {
        const f = knivesInAir[i];
        if (now < f.t0) continue;
        const k = Math.min(1, (now - f.t0) / (f.t1 - f.t0));
        f.g.visible = true;
        f.g.position.lerpVectors(f.from, f.to, k);
        f.g.position.y += Math.sin(k * Math.PI) * 0.25; // a slight arc
        // Point along the flight (the knife's +y), tumbling end over end.
        f.g.lookAt(f.to);
        f.g.rotateX(Math.PI / 2 + k * Math.PI * 4);
        if (k >= 1) {
          hitsplat(f.to, f.dmg);
          scene.remove(f.g);
          knivesInAir.splice(i, 1);
        }
      }
    };
    let lastFoe: string | null = null;
    /** The biker club: when you last asked to be jumped, and who jumped you. */
    let lastJump = 0;
    let jumpedBy: string | null = null;

    // ---------- things on the ground (loot), and cooking stations (docs/design.md §13) ----------
    const groundViews = new Map<number, THREE.Group>();
    const reachGround = () => {
      const id = me.goalGround;
      me.goalGround = null;
      if (id === null) return;
      apiRef.current.pickUp(id, tileOf(me.pos.x, me.pos.z));
    };
    // ---------- climbing between the street and the sewer ----------
    // The screen dips to black with "You climb down into the sewer", you're moved while it's dark, then it comes back.
    // The server checks you stand at the link and moves you (climb); if it says no, you stay where you are.
    const reachLink = () => {
      const link = LINKS.find((l) => l.id === me.goalLink);
      me.goalLink = null;
      if (!link) return;
      const from = tileOf(me.pos.x, me.pos.z);
      passOut.querySelector('span')!.textContent = link.text;
      passOut.classList.add('on', 'quick');
      passOutUntil = performance.now() + 1800;
      const shown = new Promise((r) => setTimeout(r, 700));
      void Promise.all([apiRef.current.climb(link.id, from), shown]).then(([ok]) => {
        if (ok) {
          say(`${link.text}.`);
          me.pos.copy(center(...link.to));
          me.path = [];
          worldRef.current?.move(link.to, []);
          camTarget.copy(me.pos);
          camLift = floorY(me.pos.x, me.pos.z);
        }
        setTimeout(() => {
          passOut.classList.remove('on');
          passOutUntil = 0;
          setTimeout(() => passOut.classList.remove('quick'), 900);
        }, 300);
      });
    };
    /** At the Rat Nest's gate: open it with the key, or it's locked. */
    const reachGate = () => {
      me.goalGate = false;
      me.facing = Math.PI / 2;
      const st = sRef.current;
      if (st.unlocked?.includes('rat_nest')) return;
      if ((st.inventory.sewer_key ?? 0) > 0) apiRef.current.unlockGate('rat_nest', tileOf(me.pos.x, me.pos.z));
      else say("The gate is locked. There's a sturdy padlock on it.");
    };
    const reachStation = () => {
      const id = me.goalStation;
      me.goalStation = null;
      const st = STATIONS.find((x) => x.id === id);
      if (!st) return;
      me.facing = Math.atan2(st.x + 0.5 - me.pos.x, st.y + 0.5 - me.pos.z);
      if (st.kind === 'bbq') setCookAtRef.current(tileOf(me.pos.x, me.pos.z));
      else setTinkerAtRef.current({ pos: tileOf(me.pos.x, me.pos.z), kind: st.kind });
    };
    // The barbecue is tappable: an invisible box over it.
    for (const st of STATIONS) {
      const hitBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 1.1), hitMat);
      hitBox.position.set(st.x + 0.5, floorY(st.x + 0.5, st.y + 0.5) + 0.6, st.y + 0.5);
      hitBox.userData.stationId = st.id;
      scene.add(hitBox);
      pickables.push(hitBox);
    }

    // ---------- other players (online) ----------
    /** Other players: their model, where we draw them (smoothed), and which way they face. */
    const others = new Map<
      string,
      // hpBar: their health bar (shown for a while after they get hurt, and while low, like yours); lastHp: to
      // notice damage (a hitsplat over them).
      { g: THREE.Group; pos: THREE.Vector3 | null; facing: number; hpBar: HTMLDivElement | null; hpBarUntil: number; lastHp: number | null }
    >();
    /** Chat over heads: who said what, until when; and the newest message already handled. */
    const said = new Map<string, { text: string; until: number }>();
    let lastSaid = Math.max(0, ...(chatRef.current?.messages ?? []).map((m) => m.id));

    /** The tiles next to (x, y) on the same side of a wall or fence: you work a dumpster in a fenced yard from inside
     *  the yard, not from the street reaching through the fence. */
    const beside = (x: number, y: number) => neighbors(x, y).filter(([nx, ny]) => enclosureAt(nx, ny) === enclosureAt(x, y));
    const walkTo = (goals: [number, number][], goal: StreetNode | null, npc: Npc | null = null) => {
      const path = findPath(blocked, GRID, tileOf(me.pos.x, me.pos.z), goals, canStep);
      if (!path) {
        say("You can't reach that.");
        return false;
      }
      me.path = path;
      worldRef.current?.move(tileOf(me.pos.x, me.pos.z), path);
      me.goal = goal;
      me.goalNpc = npc;
      me.goalGrave = false;
      me.goalEnemy = null;
      me.goalGround = null;
      me.goalStation = null;
      me.goalLink = null;
      me.goalGate = false;
      setCookAtRef.current(null);
      setTinkerAtRef.current(null);
      setBankAtRef.current(null);
      if (!path.length) {
        // Already standing next to it.
        if (goal) arrive(goal);
        if (npc) meetNpc(npc);
        me.goal = null;
        me.goalNpc = null;
        savePos();
      }
      return true;
    };

    /** You reached an NPC: a banker opens your bank, everyone else talks to you. */
    const meetNpc = (npc: Npc) => {
      if (npc.kind === 'banker') setBankAtRef.current(tileOf(me.pos.x, me.pos.z));
      else setTalkingRef.current(npc);
    };
    const arrive = (n: StreetNode) => {
      const st = sRef.current;
      const job = st.player.job;
      me.attached = n;
      me.attachedAt = performance.now();
      if (job && job.crimeId === n.crimeId && job.endsAt > gameNow()) return; // mid-attempt (one that has ended counts as done)
      const busy = busyReason(st, gameNow());
      if (busy) return say(busy);
      const empty = emptyFor(st, n.id, gameNow());
      if (empty) return say(n.kind === 'dumpster' ? "It's empty." : `It's empty. ${n.kind === 'meter' ? 'It fills up again' : "It's restocked"} in ${Math.ceil(empty)}s.`);
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
      if (sRef.current.cook) {
        apiRef.current.stopCook();
        say('You stop cooking.');
      }
      if (sRef.current.make) {
        apiRef.current.stopMake();
        say('You stop working.');
      }
      if (sRef.current.fight) {
        apiRef.current.stopFight();
        say('You walk away from the fight.');
        lastJump = performance.now();
      }
    };

    const tap = (clientX: number, clientY: number) => {
      if (performance.now() < passOutUntil) return;
      const st = sRef.current;
      if (st.player.caught) return say("You've been caught! Brace yourself…");
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickables.filter((o) => o.visible), true)[0];
      if (hit?.object.userData.linkId) {
        // The pothole (climb down) or the sewer's ladder (climb up): walk next to it, then climb.
        const link = LINKS.find((l) => l.id === hit.object.userData.linkId)!;
        stopWorking();
        setTalkingRef.current(null);
        const [ax, ay] = link.at;
        if (walkTo(neighbors(ax, ay), null)) {
          me.goalLink = link.id;
          if (!me.path.length) {
            savePos();
            reachLink();
          }
        }
        return;
      }
      if (hit?.object.userData.gateId) {
        // The Rat Nest's gate: walk up to it; with the Sewer Key in your bag it unlocks (for you).
        stopWorking();
        setTalkingRef.current(null);
        const before: [number, number] = [NEST_GATE[0] - 1, NEST_GATE[1]];
        if (walkTo([before], null)) {
          me.goalGate = true;
          if (!me.path.length) reachGate();
        }
        return;
      }
      if (hit?.object.userData.stairsId) {
        // The stairs: from downstairs, walk up to the ward; from the ward, walk down to the lobby.
        const s = STAIRS.find((x) => x.id === hit.object.userData.stairsId)!;
        const up = !isUpstairs(...tileOf(me.pos.x, me.pos.z));
        const goal: [number, number] = up ? [s.x, WARD.y1] : [s.x, s.bottom[1] + 1];
        stopWorking();
        setTalkingRef.current(null);
        if (walkTo([goal], null)) say(up ? 'You take the stairs up to the ward.' : 'You take the stairs down to the lobby.');
        return;
      }
      if (hit?.object.userData.groundId !== undefined) {
        // Something on the ground: walk onto it (or next to it) and pick it up.
        const g = sRef.current.ground?.find((x) => x.id === hit.object.userData.groundId);
        if (!g) return;
        stopWorking();
        setTalkingRef.current(null);
        if (walkTo([[g.x, g.y], ...neighbors(g.x, g.y)], null)) {
          me.goalGround = g.id;
          if (!me.path.length) reachGround();
        }
        return;
      }
      if (hit?.object.userData.stationId) {
        // The barbecue: walk next to it, then the cooking screen opens.
        const st = STATIONS.find((x) => x.id === hit.object.userData.stationId);
        if (!st) return;
        stopWorking();
        setTalkingRef.current(null);
        if (walkTo(beside(st.x, st.y), null)) {
          me.goalStation = st.id;
          if (!me.path.length) reachStation();
        }
        return;
      }
      if (hit?.object.userData.enemyId) {
        setTalkingRef.current(null);
        if (me.attached && sRef.current.player.job) stopWorking();
        chases = 0;
        const ev = enemyViews.get(hit.object.userData.enemyId);
        if (ev) {
          // The tap ring under the pigeon (red: an attack), like the yellow one when you walk.
          ring.position.set(ev.g.position.x, 0.08, ev.g.position.z);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.9;
          (ring.material as THREE.MeshBasicMaterial).color.set(0xe0473a);
        }
        goFight(hit.object.userData.enemyId);
        return;
      }
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
        if (npc.kind === 'receptionist') return say('"You\'re all patched up, hon. Try not to come back too soon."');
        if (npc.kind === 'doorman') return say('The guard nods at you. "Keep it civil in here."');
        stopWorking();
        setTalkingRef.current(null);
        const [ex, ey] = npcTile(npc);
        // A banker stands behind the counter: you talk to them from the row in front of it.
        const goals: [number, number][] = npc.kind === 'banker' ? [[ex, BANK_COUNTER_Y + 1], [ex - 1, BANK_COUNTER_Y + 1], [ex + 1, BANK_COUNTER_Y + 1]] : beside(ex, ey);
        if (walkTo(goals, null, npc)) {
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
        if (walkTo(beside(nx, ny), n)) {
          ring.position.set(nx + 0.5, 0.08, ny + 0.5);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.9;
          (ring.material as THREE.MeshBasicMaterial).color.set(0xd9a441);
        }
        return;
      }
      const p = new THREE.Vector3();
      // Upstairs in the hospital, a tap on the ward's floor walks you there (its floor is a storey up).
      if (isUpstairs(...tileOf(me.pos.x, me.pos.z)) && ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_H), p) && isUpstairs(...tileOf(p.x, p.z)))
        return walkToTile(...tileOf(p.x, p.z));
      // In the sewer, taps land on its floor (deep under the street).
      const groundY = inSewer(...tileOf(me.pos.x, me.pos.z)) ? -SEWER_DEPTH : 0;
      if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY), p)) return;
      walkToTile(...tileOf(p.x, p.z));
    };

    const walkToTile = (tx: number, ty: number) => {
      if (!onMap(tx, ty) && !inSewer(...tileOf(me.pos.x, me.pos.z))) return say("That's the ocean. The island ends here, for now.");
      stopWorking();
      setTalkingRef.current(null); // walking away ends the conversation
      // Tapped a building: head for the nearest street tiles around it instead.
      let goals: [number, number][] = [[tx, ty]];
      // From downstairs, the ward's tiles count as building (you'd only get there by the stairs, on purpose).
      const upHere = isUpstairs(...tileOf(me.pos.x, me.pos.z));
      const below = inSewer(...tileOf(me.pos.x, me.pos.z));
      const solid = (x: number, y: number) => !onMap(x, y) || !inGrid(x, y) || !!blocked[gi(x, y)] || (!upHere && isUpstairs(x, y)) || inSewer(x, y) !== below;
      for (let r = 1; (!onMap(tx, ty) || solid(tx, ty)) && r <= 6; r++) {
        goals = [];
        for (let y = ty - r; y <= ty + r; y++)
          for (let x = tx - r; x <= tx + r; x++)
            if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) === r && inGrid(x, y) && !solid(x, y)) goals.push([x, y]);
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
    // CSS pixels per tile: 5.5 in the standard view, less when zoomed out in the settings (v0.57: up to 300%).
    const miniTile = () => 5.5 / getPrefs().minimapZoom;
    const BASE_PX = 12; // canvas pixels per tile in the pre-drawn island
    const dpr = Math.min(window.devicePixelRatio, 2);
    mini.width = MINI_SIZE * dpr;
    mini.height = MINI_SIZE * dpr;
    mini.style.width = `${MINI_SIZE}px`;
    mini.style.height = `${MINI_SIZE}px`;
    // Two pictures (v0.57): the surface with its whole beach and shallows round it, and underground (the sewer).
    const SURFACE_EDGE = 10;
    const surface = drawWorld(BASE_PX, false, SURFACE_EDGE);
    const underground = drawWorld(BASE_PX, true);
    const drawMini = () => {
      const g = mini.getContext('2d')!;
      const R = MINI_SIZE / 2;
      const yaw = yawRef.current;
      const MINI_TILE = miniTile();
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
      const below = inSewer(Math.floor(me.pos.x), Math.floor(me.pos.z));
      const base = below ? underground : surface;
      const edge = below ? MAP_EDGE : SURFACE_EDGE;
      g.drawImage(base, -edge, -edge, base.width / BASE_PX, base.height / BASE_PX);
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
      for (const v of enemyViews.values()) if (v.g.visible) dot(v.g.position.x, v.g.position.z, 1.8, '#e8d84a');
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
      const dx = (e.clientX - r.left - r.width / 2) / miniTile();
      const dy = (e.clientY - r.top - r.height / 2) / miniTile();
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
    /** How high the camera looks (the floor you're on). */
    let camLift = floorY(me.pos.x, me.pos.z);
    // ---------- your health bar over your head (OSRS-style) ----------
    // Shows for a few seconds after you get hit, and stays while your health is low (30% or less).
    const hpBar = document.createElement('div');
    hpBar.className = 'hp-bar';
    const hpFill = document.createElement('div');
    hpBar.appendChild(hpFill);
    labelLayer.appendChild(hpBar);
    let hpBarUntil = 0;
    // ---------- passing out (0 HP): the screen fades to black, then you wake up in the hospital ----------
    const passOut = document.createElement('div');
    passOut.className = 'passout';
    passOut.innerHTML = '<span>You passed out</span>';
    host.appendChild(passOut);
    /** Taps do nothing while the screen is black; you're still groggy (lying down, then getting up) after. */
    let passOutUntil = 0;
    let wakeUntil = 0;
    // ---------- the cooking bar over your head: fills up while the next piece cooks ----------
    const cookBar = document.createElement('div');
    cookBar.className = 'cook-bar';
    const cookFill = document.createElement('div');
    cookBar.appendChild(cookFill);
    labelLayer.appendChild(cookBar);
    // ---------- floating "+$5" over your head ----------
    // ---------- caught at the gym bags: a baller yells "Stop that!" and throws the ball at you ----------
    // The server has already decided the hit; we play the throw and show the hit when the ball lands.
    const thrown = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshLambertMaterial({ color: BALL_COLOR }));
    thrown.castShadow = true;
    thrown.visible = false;
    scene.add(thrown);
    geoms.push(thrown.geometry);
    disposables.push(thrown.material as THREE.Material);
    const THROW_MS = 600;
    let toss: { from: THREE.Vector3; to: THREE.Vector3; t0: number; baller: string } | null = null;
    const throwAtMe = () => {
      const ballers = NPCS.filter((n) => n.kind === 'baller');
      const baller = ballers.sort((a, b) => npcWalk.get(a.id)!.pos.distanceTo(me.pos) - npcWalk.get(b.id)!.pos.distanceTo(me.pos))[0];
      if (!baller) return;
      const from = npcWalk.get(baller.id)!.pos.clone().setY(1.0);
      yell(baller.id, 'Stop that!');
      toss = { from, to: me.pos.clone().setY(1.0), t0: performance.now(), baller: baller.id };
    };

    /** A hitsplat over someone: a red splat with the damage, or a blue one for a miss (0), like OSRS. */
    const hitsplat = (where: THREE.Vector3, dmg: number) => {
      const [x, y] = project(lift(where, 0.9));
      const el = document.createElement('div');
      el.className = `hitsplat ${dmg > 0 ? 'hit' : 'miss'}`;
      el.textContent = String(dmg);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      host.appendChild(el);
      setTimeout(() => el.remove(), 900);
    };

    const off = onReport((r) => {
      // Scrapping: found nothing this time? Keep digging in the same dumpster (unless you walked off or are busy).
      if (r.jobs && r.fails && !r.damage && me.attached && CRIME_BY_ID[me.attached.crimeId]?.skill === 'scrapping') {
        const n = me.attached;
        // (The game's state reaches this view a moment later, so the attempt that just ended may still look busy: an
        // attempt that's past its end counts as done.)
        setTimeout(() => {
          const j = sRef.current.player.job;
          if (me.attached?.id === n.id && !me.path.length && (!j || j.endsAt <= gameNow())) arrive(n);
        }, 0);
      }
      // A failed grab at the gym bags: the throw first, the hit when the ball lands.
      if (r.hit && me.lastSpot.startsWith('bag_')) {
        throwAtMe();
        setTimeout(() => showReport(r), THROW_MS);
        return;
      }
      showReport(r);
    });
    const showReport = (r: Report) => {
      // One line per attempt (attempts come every second, so separate lines would pile up),
      // plus a second, bigger line for level-ups, big scores and stuns.
      const parts: [string, string][] = [];
      if (r.cash >= 1) parts.push([`+${fmtMoney(r.cash)}`, 'f-cash']);
      for (const [id, n] of Object.entries(r.items)) parts.push([`+${n} ${ITEM_BY_ID[id]?.name ?? id}`, 'f-cash']);
      const xp = Object.values(r.xp).reduce((a, b) => a + (b ?? 0), 0);
      if (xp) parts.push([`+${Math.round(xp).toLocaleString('en-US')} xp`, 'f-xp']);
      if (r.damage && !r.combat) parts.push([`-${r.damage} HP`, 'f-bust']);
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
      if (r.damage) hpBarUntil = performance.now() + 6000;
      if (r.died) {
        // You pass out: the screen fades to black ("You passed out"), and you wake up in the hospital's ward (where
        // the server put you too). Your stuff is in your grave.
        me.path = [];
        me.goal = null;
        me.goalNpc = null;
        me.goalGrave = false;
        me.goalEnemy = null;
        me.attached = null;
        setTalkingRef.current(null);
        passOut.querySelector('span')!.textContent = 'You passed out';
        passOut.classList.add('on');
        passOutUntil = performance.now() + 2600;
        setTimeout(() => {
          me.pos.copy(center(...WAKE));
          me.path = [];
          worldRef.current?.move(WAKE, []);
          camTarget.copy(me.pos);
          camLift = floorY(me.pos.x, me.pos.z);
          wakeUntil = performance.now() + 2600;
        }, 900);
        setTimeout(() => {
          passOut.classList.remove('on');
          say(sRef.current.grave ? 'You wake up in the hospital. Your stuff is in your grave: go and get it.' : 'You wake up in the hospital.');
        }, 2600);
      } else if (r.hit) big.push(['Stunned!', 'f-bust']);
      line(big, 'float-big');
      if (r.hit) {
        host.classList.remove('shake');
        void host.offsetWidth; // restart the animation
        host.classList.add('shake');
      }
    };

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
    /** Walk along the path (dt in seconds). */
    const walkStep = (dt: number) => {
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
        if (!me.path.length && me.goalEnemy) {
          savePos();
          reachEnemy();
        }
        if (!me.path.length && me.goalGround !== null) {
          savePos();
          reachGround();
        }
        if (!me.path.length && me.goalStation) {
          savePos();
          reachStation();
        }
        if (!me.path.length && me.goalLink) {
          savePos();
          reachLink();
        }
        if (!me.path.length && me.goalGate) {
          savePos();
          reachGate();
        }
        if (!me.path.length) savePos();
        if (!me.path.length && me.goalNpc) {
          const npc = me.goalNpc;
          const ep = npcWalk.get(npc.id)!.pos;
          me.facing = Math.atan2(ep.x - me.pos.x, ep.z - me.pos.z);
          npcGroups.get(npc.id)!.rotation.y = Math.atan2(me.pos.x - ep.x, me.pos.z - ep.z);
          meetNpc(npc);
          me.goalNpc = null;
        }
      } else {
        me.pos.add(d.normalize().multiplyScalar(step));
        me.facing = Math.atan2(d.x, d.z);
      }
    }
    };
    // v0.58: a hidden tab (another tab, a minimised browser) gets no animation frames, so you'd stop mid-walk. It's an
    // online game: keep walking on a timer while hidden (the browser still runs it, if only about once a second), in
    // the same small steps as on screen, and nothing is drawn.
    const background = window.setInterval(() => {
      if (!document.hidden) return;
      const now = performance.now();
      let left = Math.min(120, (now - last) / 1000);
      last = now;
      while (left > 0 && me.path.length) {
        walkStep(Math.min(0.05, left));
        left -= 0.05;
      }
    }, 250);
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
      walkStep(dt);
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
      // The Rat Nest's gate: open (and walkable) only for you, once you unlocked it.
      const gateOpen = !!st.unlocked?.includes('rat_nest');
      blocked[gi(...NEST_GATE)] = gateOpen ? 0 : 1;
      city.setGateOpen(gateOpen);
      // The Biker Club: while you're inside and not fighting, a biker jumps you (the server picks a free one). Walk out
      // the door and the fight ends: they don't follow you outside.
      {
        const tile = tileOf(me.pos.x, me.pos.z);
        const inClub = inRect(CLUB, ...tile);
        const fightingBiker = !!st.fight && st.fight.enemy.startsWith('biker_');
        if (fightingBiker && !inClub) {
          apiRef.current.stopFight();
          lastJump = now;
          say('You get out of the club. The biker lets you go.');
        } else if (inClub && !st.fight && now - lastJump > 2500 && performance.now() > passOutUntil) {
          lastJump = now;
          apiRef.current.jumpMe(tile);
        }
        // Jumped while walking in: you stop and face him.
        if (fightingBiker && inClub && st.fight!.enemy !== jumpedBy) {
          jumpedBy = st.fight!.enemy;
          if (!me.goalEnemy) me.path = [];
        }
        if (!st.fight) jumpedBy = null;
      }
      // In a fight: face your foe.
      const foe = st.fight?.enemy;
      if (foe) lastFoe = foe;
      const foeView = foe ? enemyViews.get(foe) : undefined;
      if (foeView && !me.path.length) me.facing = Math.atan2(foeView.g.position.x - me.pos.x, foeView.g.position.z - me.pos.z);
      const myRanged = rangedWeapon(st);
      setGear(player, { ...st.equipment, weapon: myRanged ? myRanged.id : st.equipment?.weapon });
      player.position.set(me.pos.x, floorY(me.pos.x, me.pos.z) + 0.03, me.pos.z);
      const stunned = meCrew.stunnedUntil > gameNow();
      // Cooking: face the barbecue and work it.
      const cooking = (!!st.cook || !!st.make) && !me.path.length;
      if (cooking) {
        const near = STATIONS.find((x) => Math.abs(x.x + 0.5 - me.pos.x) < 2 && Math.abs(x.y + 0.5 - me.pos.z) < 2);
        if (near) me.facing = Math.atan2(near.x + 0.5 - me.pos.x, near.y + 0.5 - me.pos.z);
      }
      const attacking = now < me.punchUntil ? (myRanged ? 'throw' : weaponAnim(st.equipment?.weapon)) : null;
      const pose: Pose = stunned || (now < wakeUntil && !me.path.length) ? 'stunned' : me.path.length ? 'walk' : attacking ?? (working || cooking ? 'work' : 'idle');
      animateCharacter(player, pose, now, 0, pose === 'walk' ? WALK_SPEED : (now - me.punchAt) / (me.punchUntil - me.punchAt));
      // A thrown knife has left your hand (it's in the air); and with none left there's nothing to hold.
      const held = player.getObjectByName('weapon');
      if (held) {
        held.visible = !(pose === 'throw' && (now - me.punchAt) / (me.punchUntil - me.punchAt) > THROW_RELEASE);
      }
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
            npc.kind === 'guard' ? tileOf(guardAt(gameNow()).x, guardAt(gameNow()).z) : npc.kind === 'bartender' ? barSpot(bartenderAt(gameNow()).spot) : [npc.x, npc.y];
          w.path = findPath(blocked, GRID, tileOf(w.pos.x, w.pos.z), [home], canStep) ?? [];
            }
          } else if (followPath(w, g, dt)) {
            w.mode = 'normal';
            w.target.copy(w.pos);
          }
          g.position.set(w.pos.x, floorY(w.pos.x, w.pos.z) + 0.03, w.pos.z);
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
          if (!b.watching) w.target = center(...barSpot(b.spot)); // (v0.58: along his aisle, which runs north–south)
          const d = w.target.clone().sub(w.pos);
          if (d.length() > 0.02) {
            w.pos.add(d.clampLength(0, 1.6 * dt));
            g.rotation.y = Math.atan2(d.x, d.z);
            w.moving = true;
          } else {
            g.rotation.y = turnTowards(g.rotation.y, b.watching ? BAR_FACING.watch : BAR_FACING.polish, dt * 6);
          }
          g.position.set(w.pos.x, floorY(w.pos.x, w.pos.z) + 0.03, w.pos.z);
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
          g.position.set(w.pos.x, floorY(w.pos.x, w.pos.z) + 0.03, w.pos.z);
          animateCharacter(g, w.moving ? 'walk' : 'idle', now, 4.2);
          continue;
        } else if (npc.kind === 'baller') {
          // Ballers are moved by the basketball game (except the one throwing a ball at you).
          const b = hoops.player(npc.id === 'baller_0' ? 0 : 1, now / 1000);
          // Walking or not by SPEED, held for a moment: per frame the distance is tiny on a fast (144 Hz) screen, so a
          // per-frame check flipped between walk and idle every frame (legs and arms glitching).
          const d = b.pos.clone().sub(w.pos);
          if (d.length() / Math.max(dt, 0.001) > 0.3) w.lastMove = now;
          w.moving = now - (w.lastMove ?? 0) < 200;
          w.pos.copy(b.pos);
          const throwing = toss?.baller === npc.id && now - toss.t0 < THROW_MS;
          g.rotation.y = throwing ? Math.atan2(me.pos.x - w.pos.x, me.pos.z - w.pos.z) : b.facing;
          g.position.set(w.pos.x, 0.03 + b.jump, w.pos.z);
          animateCharacter(g, throwing || b.shooting ? 'work' : w.moving ? 'walk' : 'idle', now, npc.id === 'baller_0' ? 0 : 1.7);
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
        g.position.set(w.pos.x, floorY(w.pos.x, w.pos.z) + 0.03, w.pos.z);
        // Splinter sits on the floor against the wall, his back to it (he can't feel his legs).
        if (npc.kind === 'splinter') {
          g.position.z -= 0.2;
          g.rotation.y = 0;
          g.rotation.x = -0.2; // leaning back against the wall
          animateCharacter(g, 'sitFloor', now, 1.1);
        } else animateCharacter(g, w.moving ? 'walk' : 'idle', now, 3.1);
      }
      hoops.update(now / 1000);
      // The thrown ball: an arc from the baller's hands to your head, then it bounces off and drops.
      if (toss) {
        const u = (now - toss.t0) / THROW_MS;
        thrown.visible = true;
        if (u < 1) {
          thrown.position.copy(toss.from).lerp(toss.to, u);
          thrown.position.y += 0.6 * 4 * u * (1 - u);
        } else if (u < 1.8) {
          const k = (u - 1) / 0.8;
          const away = toss.to.clone().sub(toss.from).setY(0).normalize();
          thrown.position.copy(toss.to).addScaledVector(away, -0.9 * k);
          thrown.position.y = 1.0 * (1 - k) + Math.abs(Math.sin(k * Math.PI * 1.5)) * 0.35 * (1 - k) + 0.09;
        } else {
          thrown.visible = false;
          toss = null;
        }
      }
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
      for (const n of NODES) if (n.kind === 'shelf' || n.kind === 'meter' || n.kind === 'dumpster') setSpotEmpty(nodeGroups.get(n.id)!, emptyFor(st, n.id, gameNow()) > 0);
      // Inside a room: fade its walls and lift the roof so you can see in.
      const myTile = tileOf(me.pos.x, me.pos.z);
      for (const r of ROOMS) city.rooms.get(r.id)!.force = inRect(r, ...myTile) || (r.id === 'hospital' && isUpstairs(...myTile));
      // The tap ring sits on the floor it was tapped on (the ward is a storey up).
      ring.position.y = floorY(ring.position.x, ring.position.z) + 0.08;

      // Things on the ground: add new ones, remove picked-up or rotted ones, a gentle bob so they catch the eye.
      {
        const here = new Set<number>();
        for (const it of st.ground ?? []) {
          here.add(it.id);
          let v = groundViews.get(it.id);
          if (!v) {
            v = buildGroundItem(it.item);
            // A tap area bigger than the item (they're small).
            const tapBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), hitMat);
            tapBox.position.y = 0.2;
            v.add(tapBox);
            v.traverse((o) => (o.userData.groundId = it.id));
            v.position.set(it.x + 0.5 + ((it.id * 37) % 7) / 20 - 0.15, 0.07, it.y + 0.5 + ((it.id * 53) % 7) / 20 - 0.15);
            v.rotation.y = (it.id * 1.7) % 6.28;
            scene.add(v);
            pickables.push(v);
            groundViews.set(it.id, v);
          }
          v.position.y = floorY(v.position.x, v.position.z) + 0.07 + Math.sin(now / 400 + it.id) * 0.015;
        }
        for (const [id, v] of groundViews)
          if (!here.has(id)) {
            scene.remove(v);
            const i = pickables.indexOf(v);
            if (i >= 0) pickables.splice(i, 1);
            groundViews.delete(id);
          }
      }

      updateFlying(now);
      // Enemies: where their schedule (or their fight) puts them, gliding smoothly; hidden while dead.
      for (const e of worldRef.current?.enemies() ?? []) {
        let v = enemyViews.get(e.id);
        // Someone else hit it: show the damage too (your own fight shows every swing, misses included).
        if (v && e.fighter && e.fighter !== worldRef.current?.myId && v.lastHp !== null && e.hp < v.lastHp && v.g.visible) hitsplat(v.g.position, v.lastHp - e.hp);
        if (v) v.lastHp = e.hp;
        if (!v) {
          const g = buildEnemy(e.kind);
          g.traverse((o) => (o.userData.enemyId = e.id));
          // A bigger invisible tap area (pigeons are small).
          const tall = e.kind !== 'pigeon';
          const hitArea = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, tall ? 1.4 : 0.8, 8), hitMat);
          hitArea.position.y = tall ? 0.7 : 0.3;
          hitArea.userData.enemyId = e.id;
          g.add(hitArea);
          scene.add(g);
          pickables.push(g);
          v = { g, pos: null, peckUntil: 0, dyingUntil: 0, lastHp: e.hp, wasDead: !!e.deadUntil, route: [], routeKey: '' };
          enemyViews.set(e.id, v);
        }
        // Just died (killed by anyone): play the fall before hiding it.
        const deadNow = !!e.deadUntil && e.deadUntil > gameNow();
        if (deadNow && !v.wasDead && now >= v.dyingUntil) v.dyingUntil = now + 700;
        v.wasDead = deadNow;
        const dying = now < v.dyingUntil;
        const dead = deadNow && !dying;
        v.g.visible = !dead;
        if (dead) {
          v.pos = null;
          continue;
        }
        // Dying: it falls where it was hit, it doesn't fly back to its spot first.
        if (dying && v.pos) {
          v.g.position.set(v.pos.x, floorY(v.pos.x, v.pos.z) + 0.03, v.pos.z);
          animateEnemy(e.kind, v.g, 'dead', now, e.index * 1.3);
          continue;
        }
        const at = enemyAt(e);
        const t = gameNow();
        const ret = e.returning && !e.fighter && t < e.returning.at + RETURN_MS ? e.returning : null;
        if (!v.pos) v.pos = ret ? new THREE.Vector3(ret.from[0] + 0.5, 0, ret.from[1] + 0.5) : new THREE.Vector3(at.x, 0, at.z);
        const before = v.pos.clone();
        let flying = at.flying;
        if (ret) {
          // Walked away from: it follows that player for 5 s (keeping a step away), then walks back to where its
          // routine has it now, arriving as the 10 s run out. Walking, not flying or teleporting.
          flying = false;
          const who = ret.by === worldRef.current?.myId ? me.pos : others.get(ret.by)?.pos;
          const following = t - ret.at < RETURN_MS / 2 && who && who.distanceTo(v.pos) < 10;
          // Both along a path around walls and fences (they used to go straight, through buildings).
          if (following) {
            walkEnemy(v, tileOf(who.x, who.z), true, 2.2, dt);
          } else {
            const left = Math.max(0.05, (ret.at + RETURN_MS - t) / 1000);
            const goal = tileOf(at.x, at.z);
            const tilesLeft = v.route.length && v.routeKey.startsWith(`${goal[0]},${goal[1]},false`) ? v.route.length : Math.hypot(at.x - v.pos.x, at.z - v.pos.z);
            if (walkEnemy(v, goal, false, Math.max(1.5, (tilesLeft + 0.5) / left), dt) === 0) {
              // On its spot's tile: the last bit straight to where its routine has it.
              const gap = new THREE.Vector3(at.x - v.pos.x, 0, at.z - v.pos.z);
              v.pos.add(gap.clampLength(0, Math.max(1.5, gap.length() / left) * dt));
            }
          }
        } else if (e.approach && e.fightPos && t < e.approach.arriveAt) {
          // Hit from a distance (v0.51): it walks the server's route (the real way round: over a bridge, through a gate)
          // up to its fighter, arriving when the server says.
          const route = e.approach.route?.length ? e.approach.route : [e.fightPos];
          const dur = routeMs(e.approach.from, route);
          const p = routePoint(e.approach.from, route, dur > 0 ? 1 - (e.approach.arriveAt - t) / dur : 1);
          v.routeKey = '';
          v.pos.lerp(new THREE.Vector3(p.x, 0, p.z), Math.min(1, dt * 12));
          flying = false;
        } else {
          v.routeKey = '';
          v.pos.lerp(new THREE.Vector3(at.x, 0, at.z), Math.min(1, dt * 12));
        }
        const d = v.pos.clone().sub(before).setY(0);
        const walking = d.length() / Math.max(dt, 0.001) > 0.3;
        if (d.length() > 0.002) v.g.rotation.y = Math.atan2(d.x, d.z);
        if (e.fighter && foe === e.id) v.g.rotation.y = Math.atan2(me.pos.x - v.pos.x, me.pos.z - v.pos.z);
        v.g.position.set(v.pos.x, floorY(v.pos.x, v.pos.z) + 0.03 + (flying ? 0.45 + Math.sin(now / 160) * 0.05 : 0), v.pos.z);
        animateEnemy(e.kind, v.g, flying ? 'fly' : now < v.peckUntil ? 'attack' : walking && (ret || e.kind !== 'pigeon') ? 'walk' : 'peck', now, e.index * 1.3);
      }

      // Other players: walk them along the route they shared.
      const list = worldRef.current?.others() ?? [];
      const here = new Set<string>();
      for (const o of list) {
        here.add(o.id);
        let e = others.get(o.id);
        if (!e) {
          const g = buildCharacter(o.look);
          scene.add(g);
          e = { g, pos: null, facing: 0, hpBar: null, hpBarUntil: 0, lastHp: null };
          others.set(o.id, e);
        }
        // Where their route says they are now. We don't jump there: we glide (a bit faster than walking, so we
        // catch up), so a new route that starts from the middle of a tile, or a small clock correction, doesn't
        // make them hop. Only a big gap (they died and woke up at the start) snaps straight there.
        const at = along(o.from, o.path, Math.max(0, ((gameNow() - o.at) / 1000) * WALK_SPEED));
        const goal = new THREE.Vector3(at.x, 0, at.z);
        if (!e.pos || e.pos.distanceTo(goal) > 4) e.pos = goal.clone();
        const gap = goal.clone().sub(e.pos);
        const gliding = gap.length() > 0.03;
        if (gliding) {
          e.pos.add(gap.clone().clampLength(0, WALK_SPEED * 1.35 * dt));
          e.facing = Math.atan2(gap.x, gap.z);
        } else if (at.facing !== null && at.moving) e.facing = at.facing;
        // What they're doing (public.player_status): stunned, working a spot (facing it), or fighting (facing the enemy).
        const os = o.status;
        const t = gameNow();
        const moving = at.moving || gliding;
        let pose: Pose = moving ? 'walk' : 'idle';
        if (os && !moving) {
          if (os.stunnedUntil > t) pose = 'stunned';
          else if (os.fightEnemy) {
            const v = enemyViews.get(os.fightEnemy);
            if (v?.g.visible) {
              e.facing = Math.atan2(v.g.position.x - e.pos.x, v.g.position.z - e.pos.z);
              pose = weaponAnim(heldWeapon(o.equipment, o.style));
            }
          } else if (os.spot && os.jobEndsAt > t) {
            const n = NODES.find((x) => x.id === os.spot);
            if (n) {
              const [nx, ny] = nodeTile(n);
              if (Math.hypot(nx + 0.5 - e.pos.x, ny + 0.5 - e.pos.z) > 0.2) e.facing = Math.atan2(nx + 0.5 - e.pos.x, ny + 0.5 - e.pos.z);
            }
            pose = 'work';
          }
        }
        // Their health: a hitsplat when it drops, and the health bar for a while (everyone sees it, like your own).
        if (os) {
          const hpNow = Math.min(os.maxHp, os.hp + Math.floor(Math.max(0, t - os.hpAt) / 60000)); // whole points, +1 a full minute
          if (e.lastHp !== null && os.hp < e.lastHp - 0.001) {
            hitsplat(e.pos, Math.round(e.lastHp - os.hp));
            e.hpBarUntil = now + 6000;
          }
          e.lastHp = os.hp;
          const show = now < e.hpBarUntil || hpNow / os.maxHp <= 0.3;
          if (show && !e.hpBar) {
            e.hpBar = document.createElement('div');
            e.hpBar.className = 'hp-bar';
            e.hpBar.appendChild(document.createElement('div'));
            labelLayer.appendChild(e.hpBar);
          }
          if (e.hpBar) {
            e.hpBar.style.display = show ? 'block' : 'none';
            if (show) {
              // Above their name label (which sits at 1.55), not on top of it.
              const [bx, by, depth] = project(lift(e.pos, 1.55));
              e.hpBar.style.transform = `translate(${bx}px, ${by - 20}px) translate(-50%, -100%)`;
              e.hpBar.style.visibility = depth > 1 ? 'hidden' : 'visible';
              (e.hpBar.firstChild as HTMLElement).style.width = `${Math.max(0, Math.min(1, hpNow / os.maxHp)) * 100}%`;
              e.hpBar.classList.toggle('low', hpNow / os.maxHp <= 0.3);
            }
          }
        }
        e.g.position.set(e.pos.x, floorY(e.pos.x, e.pos.z) + 0.03, e.pos.z);
        e.g.rotation.y = e.facing;
        setGear(e.g, { ...o.equipment, weapon: heldWeapon(o.equipment, o.style) });
        // Someone else fighting: their swings, stabs or punches loop at the weapon's speed (we don't see their exact timing).
        const swingMs = (ITEM_BY_ID[heldWeapon(o.equipment, o.style) ?? '']?.gear?.speed ?? 4) * 500;
        const attack = pose === 'swing' || pose === 'stab' || pose === 'punch' || pose === 'throw';
        animateCharacter(e.g, pose, now, o.id.charCodeAt(0) * 0.37, pose === 'walk' ? WALK_SPEED : attack ? ((now + o.id.charCodeAt(1) * 97) % swingMs) / Math.min(swingMs, ATTACK_TIMING[pose as keyof typeof ATTACK_TIMING].ms) : 0);
      }
      for (const [id, e] of others)
        if (!here.has(id)) {
          scene.remove(e.g);
          e.hpBar?.remove();
          others.delete(id);
        }

      // Your grave, if you have one.
      const gr = st.grave;
      grave.visible = !!gr;
      if (gr) grave.position.set(gr.x + 0.5, floorY(gr.x + 0.5, gr.y + 0.5) + 0.03, gr.y + 0.5);
      herePos.current = tileOf(me.pos.x, me.pos.z);

      // Tap ring fades out.
      const rm = ring.material as THREE.MeshBasicMaterial;
      rm.opacity = Math.max(0, rm.opacity - dt * 0.8);

      // Camera orbits you: yaw = angle around you, pitch = how steeply it looks down.
      camTarget.lerp(me.pos, 1 - Math.pow(0.001, dt));
      // Upstairs (or on the stairs) the camera rises with you.
      camLift += (floorY(me.pos.x, me.pos.z) - camLift) * Math.min(1, dt * 6);
      const r = zoomRef.current * 1.25;
      const yaw = yawRef.current;
      const pitch = pitchRef.current;
      camera.position.set(
        camTarget.x + Math.sin(yaw) * r * Math.cos(pitch),
        r * Math.sin(pitch) + camLift,
        camTarget.z + Math.cos(yaw) * r * Math.cos(pitch),
      );
      camera.lookAt(camTarget.x, camLift, camTarget.z);
      // The sun and its shadows follow you down to the floor you're on.
      {
        const at = sunSnap(camTarget.clone().setY(camLift));
        sun.target.position.copy(at);
        sun.position.copy(at).add(SUN_OFFSET);
      }
      // Underground (the sewer): hardly any sky light, near-black around; the lanterns light it.
      {
        const under = camLift < -1;
        const k = Math.min(1, dt * 4);
        sun.intensity += ((under ? 0.12 : SUN_INTENSITY) - sun.intensity) * k;
        sky.intensity += ((under ? 0.8 : SKY_INTENSITY) - sky.intensity) * k;
        if (under !== wasUnder) {
          wasUnder = under;
          (scene.background as THREE.Color).set(under ? 0x050706 : SKY);
          scene.fog!.color.set(under ? 0x050706 : SKY);
        }
      }
      updateFades(city.fadeables, camera, lift(me.pos, 0), dt);
      city.animate(now);

      // Progress bar for the current action.
      if (progressRef.current) {
        const p = working && job ? (gameNow() - job.startedAt) / (job.endsAt - job.startedAt) : 0;
        progressRef.current.style.width = `${Math.max(0, Math.min(1, p)) * 100}%`;
      }

      // Labels over nearby spots, and the floating text anchor over your head.
      // Nearest few only, and skip any that would overlap one already placed.
      const seen = new Set<string>();
      const placed: [number, number, number][] = [];
      // Things on the ground, nearby: their name (cash: the amount).
      for (const it of st.ground ?? []) {
        const v = groundViews.get(it.id);
        if (!v || flat(v.position) > LABEL_RANGE) continue;
        const [x, y, depth] = project(lift(v.position, 0.35));
        if (depth > 1 || placed.some(([px, py, w]) => Math.abs(px - x) < w / 2 + 30 && Math.abs(py - y) < 14)) continue;
        const key = `ground:${it.id}`;
        let el = labelEls.get(key);
        if (!el) {
          el = document.createElement('div');
          el.className = 'node-label ground';
          labelLayer.appendChild(el);
          labelEls.set(key, el);
        }
        const text = it.item === 'cash' ? fmtMoney(it.amount) : ITEM_BY_ID[it.item]?.name ?? it.item;
        if (el.textContent !== text) el.textContent = text;
        seen.add(key);
        placed.push([x, y, text.length * 6 + 10]);
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
      // Enemies: "Pigeon (level 1)" nearby, and a health bar while hurt or in a fight.
      for (const e of worldRef.current?.enemies() ?? []) {
        const v = enemyViews.get(e.id);
        const k = ENEMY_KINDS[e.kind];
        if (!v || !v.g.visible || !k || flat(v.g.position) > LABEL_RANGE + 2) continue;
        const [x, y, depth] = project(lift(v.g.position, e.kind === 'pigeon' ? 0.75 : 1.6));
        if (depth > 1) continue;
        let el = labelEls.get(`enemy:${e.id}`);
        if (!el) {
          el = document.createElement('div');
          el.className = 'node-label enemy';
          el.innerHTML = '<span class="enemy-name"></span><span class="enemy-hp"><span></span></span>';
          labelLayer.appendChild(el);
          labelEls.set(`enemy:${e.id}`, el);
        }
        const name = el.firstChild as HTMLElement;
        const text = `${k.name} (level ${k.level})`;
        if (name.textContent !== text) name.textContent = text;
        const bar = el.lastChild as HTMLElement;
        const showBar = e.hp < k.hp || !!e.fighter;
        bar.style.display = showBar ? 'block' : 'none';
        (bar.firstChild as HTMLElement).style.width = `${(Math.max(0, e.hp) / k.hp) * 100}%`;
        seen.add(`enemy:${e.id}`);
        placed.push([x, y, text.length * 6 + 10]);
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
      // Other players' names (white), from far away.
      for (const [id, e] of others) {
        const o = list.find((x) => x.id === id);
        if (!o || flat(e.g.position) > NPC_LABEL_RANGE * 1.5) continue;
        const [x, y, depth] = project(lift(e.g.position, 1.55));
        if (depth > 1) continue;
        let el = labelEls.get(`player:${id}`);
        if (!el) {
          el = document.createElement('div');
          el.className = 'node-label player';
          labelLayer.appendChild(el);
          labelEls.set(`player:${id}`, el);
        }
        const tag = o.combat ? `${o.name} (level ${o.combat})` : o.name;
        if (el.textContent !== tag) el.textContent = tag;
        seen.add(`player:${id}`);
        placed.push([x, y, tag.length * 6 + 10]);
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
      // "Your grave · 4:31" over your grave (from further away than other labels).
      if (gr) {
        const [x, y, depth] = project(lift(grave.position, 0.95));
        if (depth <= 1 && flat(grave.position) < NPC_LABEL_RANGE * 1.5) {
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
      // What people say in the chat shows over their head for a few seconds (yellow, like OSRS).
      const ch = chatRef.current;
      if (ch) {
        for (const m of ch.messages) {
          if (m.id <= lastSaid) continue;
          lastSaid = m.id;
          if (m.at > gameNow() - 6000) said.set(m.playerId, { text: m.body, until: now + 5000 });
        }
        for (const [pid, sp] of said) {
          if (now > sp.until) {
            said.delete(pid);
            continue;
          }
          const pos = pid === ch.myId ? me.pos : others.get(pid)?.g.position;
          if (!pos) continue;
          const [x, y, depth] = project(lift(pos, 1.95));
          if (depth > 1) continue;
          let el = labelEls.get(`say:${pid}`);
          if (!el) {
            el = document.createElement('div');
            el.className = 'node-label say';
            labelLayer.appendChild(el);
            labelEls.set(`say:${pid}`, el);
          }
          if (el.textContent !== sp.text) el.textContent = sp.text;
          seen.add(`say:${pid}`);
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
        const [x, yy, depth] = project(lift(g.position, 2.05));
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
        const [x, y, depth] = project(lift(g.position, 1.55));
        if (flat(g.position) > NPC_LABEL_RANGE || depth > 1) continue;
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
        const [x, y, depth] = project(lift(g.position, n.kind === 'person' ? 1.45 : 1.2));
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
      {
        const hpNow = hpAt(st, gameNow());
        const hpMax = maxHp(st);
        const show = now < hpBarUntil || hpNow / hpMax <= 0.3;
        hpBar.style.display = show ? 'block' : 'none';
        if (show) {
          const [bx, by, depth] = project(lift(me.pos, 1.72));
          hpBar.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -100%)`;
          hpBar.style.visibility = depth > 1 ? 'hidden' : 'visible';
          hpFill.style.width = `${Math.max(0, Math.min(1, hpNow / hpMax)) * 100}%`;
          hpBar.classList.toggle('low', hpNow / hpMax <= 0.3);
        }
      }
      {
        // Cooking: a bar that fills from dark brown to clay while the current piece cooks (one every COOK_TICKS ticks).
        // Also while you dig through a dumpster (Scrapping): the attempt's progress.
        // And while you make something at the Factory (Tinkering): the current one.
        const ck = st.cook;
        const mk = st.make;
        const dig = job && CRIME_BY_ID[job.crimeId]?.skill === 'scrapping' ? job : null;
        const show = (!!ck || !!mk || !!dig) && !me.path.length;
        cookBar.style.display = show ? 'block' : 'none';
        if (show) {
          const p = dig
            ? Math.max(0, Math.min(1, (gameNow() - dig.startedAt) / Math.max(1, dig.endsAt - dig.startedAt)))
            : mk
              ? Math.max(0, Math.min(1, 1 - (mk.next - gameNow()) / ((CRAFT_BY_ID[mk.craft]?.ticks ?? 4) * 500)))
              : Math.max(0, Math.min(1, 1 - (ck!.next - gameNow()) / (COOK_TICKS * 500)));
          const hpShown = hpBar.style.display === 'block';
          const [bx, by, depth] = project(lift(me.pos, 1.72));
          cookBar.style.transform = `translate(${bx}px, ${by - (hpShown ? 10 : 0)}px) translate(-50%, -100%)`;
          cookBar.style.visibility = depth > 1 ? 'hidden' : 'visible';
          cookFill.style.width = `${p * 100}%`;
          // From burnt-sugar brown to a warm clay as it cooks.
          const mix = (a: number, b: number) => Math.round(a + (b - a) * p);
          cookFill.style.background = `rgb(${mix(92, 196)}, ${mix(58, 112)}, ${mix(34, 64)})`;
        }
      }
      // The quick-eat button's ring: how much of the current bite is left (1.5 s in a fight, 0.5 s otherwise).
      if (eatRingRef.current) {
        const left = st.player.eatingUntil - gameNow();
        eatRingRef.current.style.setProperty('--eat', String(left > 0 ? Math.min(1, left / (st.fight ? 1500 : 500)) : 0));
      }
      const [hx, hy] = project(lift(me.pos, 1.5));
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
      clearInterval(background);
      off();
      offFight?.();
      ro.disconnect();
      mini.removeEventListener('pointerup', onMiniTap);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      for (const el of labelEls.values()) el.remove();
      hpBar.remove();
      cookBar.remove();
      geoms.forEach((g) => g.dispose());
      disposables.forEach((d) => d.dispose());
      (ring.material as THREE.Material).dispose();
      renderer.dispose();
      passOut.remove();
      renderer.domElement.remove();
    };
  }, [onReport]);

  // ---------- overlay ----------
  const me = s.player;
  const now = gameNow();
  const job = me.job;
  const crime = job ? CRIME_BY_ID[job.crimeId] : null;
  // The game's messages for the chat box: what the Street tells you, and your log.
  const gameLines: Msg[] = [...msgs, ...s.log.slice(0, 40).map((l) => ({ t: l.t, text: l.text }))];

  // Your health on the minimap: a whole number, the same as the server's (v0.48: health is whole points).
  const hp = Math.max(0, Math.floor(hpAt(s, now)));
  const hpMax = maxHp(s);
  const chatBox = hud ? null : <ChatBox game={gameLines} chat={chat} myName={s.name} />;

  const street = (
    <div className="street" ref={hostRef}>
      <div className="street-labels" ref={labelsRef} />
      <div className="street-floats" ref={floatsRef} />
      <div className="minimap-wrap">
        <div className={`hp-heart ${hp <= Math.max(3, hpMax * 0.3) ? 'low' : ''}`} title={`Health ${hp}/${hpMax}. Food heals; it also comes back on its own, 1 per minute.`} aria-label={`Health ${hp} of ${hpMax}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21 C5 15.5 2 12.3 2 8.3 C2 5.4 4.3 3.2 7 3.2 C9 3.2 10.9 4.4 12 6.2 C13.1 4.4 15 3.2 17 3.2 C19.7 3.2 22 5.4 22 8.3 C22 12.3 19 15.5 12 21 Z" />
          </svg>
          <span className="mono">{hp}</span>
        </div>
        <canvas className="minimap" ref={miniRef} aria-label="Minimap: tap to walk there" />
        <StyleToggle s={s} api={api} say={(t) => sayRef.current(t)} />
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
      {talking &&
        (isQuestNpc(talking) ? (
          <QuestDialog npc={talking} api={api} pos={herePos.current} onClose={() => setTalking(null)} />
        ) : (
          <NpcDialog npc={talking} s={s} api={api} onClose={() => setTalking(null)} />
        ))}
      {cookAt && <CookDialog s={s} api={api} pos={cookAt} onClose={() => setCookAt(null)} />}
      {bankAt && <BankDialog s={s} api={api} pos={bankAt} onClose={() => setBankAt(null)} />}
      {tinkerAt && <TinkerDialog s={s} api={api} pos={tinkerAt.pos} kind={tinkerAt.kind} onClose={() => setTinkerAt(null)} />}
      <QuickEat s={s} api={api} say={(t) => sayRef.current(t)} ringRef={eatRingRef} />
      {chatBox}
      {/* With the HUD: the last two lines of the log stay in view over the street, unless the full chat is open. */}
      {hud && hud.panel !== 'chat' && <ChatBox game={gameLines} chat={chat} myName={s.name} strip />}
    </div>
  );
  if (!hud) return street;
  return (
    // (v0.56: the panel and the icon bar float over the street; the street is always the whole screen.)
    <div className={`game-view ${hud.panel ? 'panel-open' : ''}`}>
      {street}
      {hud.panel && (
        <div className={`hud-panel panel-${hud.panel}`} onPointerDown={(e) => e.stopPropagation()}>
          {hud.panel === 'chat' ? <ChatBox game={gameLines} chat={chat} myName={s.name} fixed /> : hud.content}
        </div>
      )}
      {hud.bar}
    </div>
  );
}
