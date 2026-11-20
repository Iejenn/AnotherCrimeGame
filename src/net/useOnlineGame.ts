// Online play (docs/design.md §11): the same game screen, but every rule runs on the server.
// This hook mirrors your character from the server's answers (supabase/migrations/0003_online_play.sql)
// and offers the GameApi (src/game/api.ts) the screens use.
//
// - Every action is a server function call. Calls run one at a time, in order (so "I'm standing here"
//   always reaches the server before "collect my grave").
// - When an attempt's time is up the app asks the server to finish it. If the app's own copy of the watchers'
//   schedules says you were seen, it asks early, so the catch starts at once; the server decides either way.
// - A catcher's punch or an expired grave: the app asks the server to bring things up to date.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { GameState, LogEntry, Report, Toast } from '../game/types';
import { emptyReport } from '../game/types';
import type { GameApi } from '../game/api';
import { gameNow, syncClock } from '../game/clock';
import { CATCH_SECONDS, CRIME_BY_ID } from '../game/data/crimes';
import { SKILL_BY_ID, SKILL_IDS } from '../game/data/skills';
import { levelFromXp } from '../game/xp';
import { firstSeen } from '../game/watchers';
import { supabase } from './supabase';

/** What every server function answers (game.respond in the SQL). */
export interface ServerAnswer {
  ok: boolean;
  reason?: string | null;
  server_now?: number;
  player?: {
    name: string;
    look: GameState['look'];
    createdAt: number;
    lastOnline?: number | null;
    cash: number;
    hp: number;
    hpAt: number;
    skills: GameState['skills'];
    job: (GameState['player']['job'] & object) | null;
    stunnedUntil: number;
    eatingUntil: number;
    caught: GameState['player']['caught'];
    pos: [number, number] | null;
    inventory: Record<string, number>;
    stats: GameState['stats'];
    equipment?: GameState['equipment'];
    marksmanCount?: number;
    fightStyle?: string;
    fight?: GameState['fight'];
    cook?: GameState['cook'];
    make?: GameState['make'];
    bank?: GameState['bank'];
    bankCash?: number;
    quests?: Record<string, number>;
    unlocked?: string[];
  };
  /** Items on the ground you can see (game.ground_json). */
  ground?: GameState['ground'];
  grave?: GameState['grave'];
  spots?: Record<string, number>;
  report?: Partial<Report>;
  log?: string[];
  /** Who else is on the island (game_state only): name and look from the database. */
  world?: WorldEntry[];
  /** The enemies, shared by everyone (game.enemies_json). */
  enemies?: EnemyState[];
  /** Fight swings the server just rolled (fight_step), to animate. */
  events?: FightEvent[];
}

/** How long an enemy you walked away from takes to follow you (first half) and walk back (second half). */
export const RETURN_MS = 10_000;

/** An enemy as the server describes it. */
export interface EnemyState {
  id: string;
  kind: string;
  index: number;
  hp: number;
  /** Dead until this time (ms), or null when alive. */
  deadUntil: number | null;
  /** Who's fighting it, and where it stands still meanwhile. */
  fighter: string | null;
  fightPos: [number, number] | null;
  /** A fight just ended without it dying: it follows `by` for 5 s from `from`, then walks back (10 s in all). */
  returning?: { by: string; from: [number, number]; at: number } | null;
  /** v0.51: hit from a distance, it walks from `from` along `route` (the real way round, ending next to you: fightPos),
   *  arriving at `arriveAt` (game.enemies_json). */
  approach?: { from: [number, number]; arriveAt: number; route?: [number, number][] | null } | null;
}

/** One swing in a fight: yours or the enemy's, how much damage (0 = miss), or the enemy dying. */
export interface FightEvent {
  at: number;
  by: 'you' | 'enemy';
  dmg?: number;
  killed?: boolean;
}

/** Another player, as the server describes them (game.world in the SQL). */
export interface WorldEntry {
  id: string;
  name: string;
  look: GameState['look'];
  equipment?: GameState['equipment'];
  /** v0.51: whether they fight with their melee weapon or throw (their Marksman slot). */
  style?: 'melee' | 'marksman';
  /** Their combat level (shown next to their name). */
  combat?: number;
  from: [number, number];
  path: [number, number][];
  at: number;
  /** v0.60: they're running this route (twice walking speed). */
  run?: boolean;
}

/** Server reasons that the game explains itself already (or that need no message). */
const QUIET = new Set(['not_yet', 'no_attempt', 'no_fight', 'fight_over', 'too_far', 'no_cooking', 'no_making', 'no_one', 'not_in_club']);
/** What the server's "no" means, in words. */
const SAY: Record<string, string> = {
  enemy_busy: 'Someone else is already fighting that.',
  enemy_dead: "It's gone. It'll be back soon.",
  enemy_returning: "It's heading back to its spot. Give it a moment.",
  cant_equip: "You can't wear that.",
  bag_full: 'Your bag is full.',
  not_enough_cash: "You don't have enough cash.",
  not_in_shop: 'You need to be in the shop to buy that.',
  too_far: "You're too far away.",
  no_ammo: "You've got nothing left to throw.",
  no_line_of_sight: "You can't get a clear throw from here.",
  no_route: "It couldn't get to you from there. Find another spot.",
  too_fast: 'The server lost track of where you are. Walk there again.',
  empty: "It's empty. Come back in a bit.",
  stunned: "You're still stunned.",
  eating: "You're still eating.",
  too_hurt: "You're too hurt to work. Eat something, or wait.",
  level_too_low: "Your level is too low for that.",
  caught: "You've been caught!",
  full_health: "You're already at full health.",
  too_far_away: "You're too far away. Walk up to it first.",
  gone: "It's gone: someone else got there first, or it rotted away.",
  not_at_link: 'You need to stand right next to it to climb.',
  not_near_station: 'You need to stand next to a fire to cook.',
  not_at_station: 'Stand next to it to work.',
  not_in_bank: 'You need to be in the bank.',
  bank_full: 'Your bank is full.',
  locked: "It's locked. You need a key.",
  quest_item: "You can't drop that: you need it for a quest.",
  nothing_happens: 'Nothing interesting happens.',
  no_materials: "You don't have the materials for that.",
  unknown_craft: "You can't make that here.",
  cant_cook: "You can't cook that.",
  nothing_to_cook: "You don't have any of that to cook.",
  busy: "You're busy. Finish what you're doing first.",
  not_at_store: "Sell weapons to Ray at Ray's Arms, everything else to Eddy at the General Store.",
  nothing_to_sell: "They won't buy that.",
  no_grave: 'Your grave is gone.',
};

function fromServer(a: ServerAnswer, log: LogEntry[]): GameState {
  const p = a.player!;
  return {
    version: 2,
    name: p.name,
    look: p.look,
    createdAt: p.createdAt,
    lastOnline: p.lastOnline ?? null,
    cash: Number(p.cash),
    hp: Number(p.hp),
    hpAt: p.hpAt,
    // Every skill the game knows, at 0 XP if the server doesn't send it (yet).
    // (v0.51: Gunfire became Marksman; an older server still calls it 'gunfire'.)
    skills: Object.fromEntries(SKILL_IDS.map((k) => [k, { xp: Number(((p.skills as Record<string, { xp: number } | undefined>)[k] ?? (k === 'marksman' ? (p.skills as Record<string, { xp: number } | undefined>).gunfire : undefined))?.xp ?? 0) }])) as GameState['skills'],
    // v0.60: stamina comes with Fitness (the server works it out on every move).
    stamina: (() => {
      const d = (p.skills as Record<string, { stamina?: number; staminaAt?: number } | undefined>).dexterity;
      return d?.stamina !== undefined ? { value: Number(d.stamina), at: Number(d.staminaAt ?? 0) } : undefined;
    })(),
    player: {
      job: p.job ? { ...p.job, pos: p.job.pos } : null,
      stunnedUntil: p.stunnedUntil,
      eatingUntil: p.eatingUntil,
      caught: p.caught,
      emptySpots: a.spots ?? {},
      pos: p.pos,
    },
    inventory: p.inventory ?? {},
    equipment: p.equipment ?? {},
    marksmanCount: Number(p.marksmanCount ?? 0),
    fightStyle: p.fightStyle === 'marksman' ? 'marksman' : 'melee',
    fight: p.fight ?? null,
    cook: p.cook ?? null,
    make: p.make ?? null,
    bank: p.bank ?? [],
    bankCash: p.bankCash ?? 0,
    quests: p.quests ?? {},
    unlocked: p.unlocked ?? [],
    ground: a.ground ?? [],
    grave: a.grave ?? null,
    stats: p.stats,
    log,
    nextId: 1,
  };
}

export function useOnlineGame(first: ServerAnswer, onReplaced: () => void) {
  const ref = useRef<GameState>(fromServer(first, []));
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [welcome, setWelcome] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(1);
  const replacedRef = useRef(onReplaced);
  replacedRef.current = onReplaced;
  const listeners = useRef(new Set<(r: Report) => void>());
  /** The chain of server calls (one at a time, in order). */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  /** A finish/refresh call is on its way: don't send another. */
  const busy = useRef(false);
  const retryAt = useRef(0);
  /** Who else is online, as the server last told us. */
  const roster = useRef<WorldEntry[]>(first.world ?? []);
  /** The enemies (shared), from the server's answers and live updates. */
  const enemies = useRef<EnemyState[]>(first.enemies ?? []);
  /** Who wants to hear about fight swings (the Street, to animate them). */
  const fightListeners = useRef(new Set<(events: FightEvent[]) => void>());
  const lastFightStep = useRef(0);

  const toast = useCallback((items: Omit<Toast, 'id'>[]) => {
    if (!items.length) return;
    const list = items.map((t) => ({ ...t, id: toastId.current++ }));
    setToasts((t) => [...t, ...list].slice(-4));
    const ids = list.map((x) => x.id);
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.includes(x.id))), 3000);
  }, []);

  /** Take in a server answer: new state, log lines, floating text, toasts. */
  const apply = useCallback(
    (a: ServerAnswer | null, sentAt: number) => {
      if (!a) return;
      if (a.server_now) syncClock(a.server_now, sentAt, Date.now());
      if (a.world) roster.current = a.world;
      if (a.enemies) enemies.current = a.enemies;
      if (a.events?.length) fightListeners.current.forEach((fn) => fn(a.events!));
      if (!a.ok && a.reason && !QUIET.has(a.reason)) toast([{ text: SAY[a.reason] ?? 'The server said no.', kind: 'event' }]);
      if (!a.player) return;
      const t = gameNow();
      const lines: LogEntry[] = (a.log ?? []).map((text) => ({ t, text, kind: /stunned|died|saw you|spotted|alarm/i.test(text) ? 'fail' : 'success' }));
      // v0.60: Fitness levels up as you move (the server adds the XP on every move, not in an action's report).
      const dexBefore = levelFromXp(ref.current.skills.dexterity?.xp ?? 0);
      const dexAfter = levelFromXp(Number((a.player.skills as Record<string, { xp: number } | undefined>).dexterity?.xp ?? 0));
      if (dexAfter > dexBefore && ref.current.skills.dexterity) {
        lines.unshift({ t, text: `Fitness reached level ${dexAfter}!`, kind: 'success' });
        a.report = { ...(a.report ?? {}), levelUps: [...((a.report?.levelUps as Report['levelUps']) ?? []), { skill: 'dexterity', level: dexAfter }] } as typeof a.report;
      }
      ref.current = fromServer(a, [...lines.reverse(), ...ref.current.log].slice(0, 150));
      const report: Report = { ...emptyReport(), ...a.report } as Report;
      // A peck in a fight is not a stun: no screen shake or "Stunned!" (fight answers carry `events`). The damage
      // still counts, so your health bar shows.
      if (a.events) {
        report.hit = false;
        report.combat = true;
      }
      // Anything to show over your head: also XP on its own (cooking gives XP but no cash or items).
      const worthShowing = report.jobs || report.events.length || report.hit || report.died || report.damage || Object.keys(report.items).length;
      if (worthShowing || Object.values(report.xp ?? {}).some((x) => (x ?? 0) > 0) || report.levelUps.length) listeners.current.forEach((fn) => fn(report));
      toast([
        ...report.levelUps.map((l) => ({ text: `${SKILL_BY_ID[l.skill].name} → Lv ${l.level}`, kind: 'level' as const })),
        ...report.events.map((e) => ({ text: e, kind: 'event' as const })),
      ]);
      rerender();
    },
    [toast],
  );

  /** Call a server function (queued behind the others). */
  const call = useCallback(
    (fn: string, args?: Record<string, unknown>) => {
      const run = async () => {
        const sentAt = Date.now();
        const { data, error } = await supabase.rpc(fn, args);
        // The account was taken over by another device: this one stops here.
        if (error && /session_replaced/.test(error.message)) {
          replacedRef.current();
          return null;
        }
        if (error) {
          toast([{ text: "Can't reach the server. Check your connection.", kind: 'event' }]);
          return null;
        }
        apply(data as ServerAnswer, sentAt);
        return data as ServerAnswer;
      };
      const p = queue.current.then(run, run);
      queue.current = p;
      return p;
    },
    [apply, toast],
  );

  /** Ask the server to finish the attempt / bring things up to date, once at a time. */
  const settle = useCallback(
    async (fn: 'finish_attempt' | 'game_state' | 'fight_step' | 'cook_step' | 'make_step') => {
      busy.current = true;
      const a = await call(fn);
      busy.current = false;
      // Too early (clocks a little apart), or no connection: try again shortly.
      if (!a || a.reason === 'not_yet') retryAt.current = gameNow() + (a ? 150 : 1500);
    },
    [call],
  );

  // The heartbeat: refresh timers, and notice when the server has something to decide.
  useEffect(() => {
    let lastRefresh = Date.now();
    const id = setInterval(() => {
      const s = ref.current;
      const now = gameNow();
      if (!busy.current && now >= retryAt.current) {
        const j = s.player.job;
        const caught = s.player.caught;
        if (s.fight && Date.now() - lastFightStep.current > 600) {
          // In a fight: ask the server to roll the swings that are due (about every 0.6 s).
          lastFightStep.current = Date.now();
          settle('fight_step');
        } else if (s.cook && now >= s.cook.next) {
          // Cooking: the next one is done, ask the server how it came out (it times and rolls every one).
          settle('cook_step');
        } else if (s.make && now >= s.make.next) {
          // Tinkering: the next sheet or piece is done.
          settle('make_step');
        } else if (j) {
          const w = CRIME_BY_ID[j.crimeId]?.catcher;
          const seen = w === 'bartender' || w === 'guard' ? firstSeen(w, j.pos, j.startedAt, Math.min(now, j.endsAt)) : null;
          if (now >= j.endsAt + 50 || seen !== null) settle('finish_attempt');
        } else if (caught && now >= caught.at + CATCH_SECONDS * 1000 + 50) settle('game_state');
        else if (s.grave && now >= s.grave.expiresAt) settle('game_state');
        else if (Date.now() - lastRefresh > 10_000) {
          // Every 10s: pick up shelves and meters other players emptied.
          lastRefresh = Date.now();
          settle('game_state');
        }
      }
      rerender();
    }, 250);
    // (v0.58: switching to another tab no longer stops your attempt: it's an online game, everything carries on.)
    return () => clearInterval(id);
  }, [call, settle]);

  const api: GameApi = useMemo(
    () => ({
      startAttempt: (_crimeId, spotId, pos) => void call('start_attempt', { p_spot: spotId, p_x: pos[0], p_y: pos[1] }),
      stopAttempt: () => void call('stop_attempt'),
      eat: (id) => void call('eat_item', { p_item: id }),
      sell: (id) => void call('sell_item', { p_item: id }),
      drop: (id) => void call('drop_item', { p_item: id }),
      collectGrave: () => void call('collect_grave'),
      savePos: (pos) => {
        ref.current.player.pos = pos;
        void call('save_position', { p_x: pos[0], p_y: pos[1] });
      },
      attack: (enemyId, pos) => {
        lastFightStep.current = Date.now();
        void call('attack', { p_enemy: enemyId, p_x: pos[0], p_y: pos[1] });
      },
      stopFight: () => void call('stop_fight'),
      equip: (id) => void call('equip_item', { p_item: id }),
      unequip: (slot) => void call('unequip_item', { p_slot: slot }),
      setFightStyle: (style) => void call('set_fight_style', { p_style: style }),
      buy: (id) => void call('buy_item', { p_item: id }),
      pickUp: (groundId, pos) => void call('pick_up', { p_id: groundId, p_x: pos[0], p_y: pos[1] }),
      cook: (item, pos) => void call('start_cook', { p_item: item, p_x: pos[0], p_y: pos[1] }),
      stopCook: () => void call('stop_cook'),
      make: (craftId, pos) => void call('start_make', { p_craft: craftId, p_x: pos[0], p_y: pos[1] }),
      stopMake: () => void call('stop_make'),
      bankDeposit: (itemId, n, pos) => void call('bank_deposit', { p_item: itemId, p_n: n, p_x: pos[0], p_y: pos[1] }),
      bankWithdraw: (itemId, n, pos) => void call('bank_withdraw', { p_item: itemId, p_n: n, p_x: pos[0], p_y: pos[1] }),
      bankDepositAll: (pos) => void call('bank_deposit_all', { p_x: pos[0], p_y: pos[1] }),
      questTalk: (npcId, choice, pos) =>
        call('quest_talk', { p_npc: npcId, p_choice: choice, p_x: pos[0], p_y: pos[1] }).then((d) => (d?.ok ? d.reason ?? null : null)),
      useItem: (itemId, onId) => void call('use_item', { p_item: itemId, p_on: onId }),
      unlockGate: (gateId, pos) => void call('unlock_gate', { p_gate: gateId, p_x: pos[0], p_y: pos[1] }),
      jumpMe: (pos) => {
        lastFightStep.current = Date.now();
        void call('jump_me', { p_x: pos[0], p_y: pos[1] });
      },
      climb: (linkId, pos) => call('climb', { p_link: linkId, p_x: pos[0], p_y: pos[1] }).then((d) => !!d?.ok),
    }),
    [call],
  );

  const onReport = useCallback((fn: (r: Report) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  /** Ask the server who's around now (e.g. when someone new starts walking). */
  const refresh = useCallback(() => {
    if (!busy.current) void settle('game_state');
  }, [settle]);

  // Enemies change when anyone fights them: hear about it live (their rows say what changed).
  useEffect(() => {
    const ch = supabase
      .channel('enemies')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'enemies' }, (msg) => {
        const r = msg.new as {
          id: string; kind: string; idx: number; hp: number; dead_until: string | null; fighter: string | null;
          fight_x: number | null; fight_y: number | null; fight_seen: string | null;
          left_at: string | null; left_by: string | null; left_x: number | null; left_y: number | null;
          arrive_at?: string | null; from_x?: number | null; from_y?: number | null; route?: [number, number][] | null;
        };
        const now = gameNow();
        const dead = r.dead_until ? Date.parse(r.dead_until) : 0;
        const fighting = !!r.fighter && !!r.fight_seen && Date.parse(r.fight_seen) > now - 5000;
        const next: EnemyState = {
          id: r.id,
          kind: r.kind,
          index: r.idx,
          hp: dead > now ? 0 : r.hp,
          deadUntil: dead > now ? dead : null,
          fighter: fighting ? r.fighter : null,
          fightPos: fighting && r.fight_x !== null && r.fight_y !== null ? [r.fight_x, r.fight_y] : null,
          returning:
            r.left_at && r.left_by && r.left_x !== null && r.left_y !== null && dead <= now && Date.parse(r.left_at) > now - RETURN_MS
              ? { by: r.left_by, from: [r.left_x, r.left_y], at: Date.parse(r.left_at) }
              : null,
          approach:
            fighting && r.arrive_at && r.from_x != null && r.from_y != null && Date.parse(r.arrive_at) > now
              ? { from: [r.from_x, r.from_y], arriveAt: Date.parse(r.arrive_at), route: r.route ?? [] }
              : null,
        };
        enemies.current = [...enemies.current.filter((e) => e.id !== r.id), next];
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  const onFight = useCallback((fn: (events: FightEvent[]) => void) => {
    fightListeners.current.add(fn);
    return () => {
      fightListeners.current.delete(fn);
    };
  }, []);

  return { state: ref.current, api, onReport, welcome, dismissWelcome: () => setWelcome(false), toasts, roster, refresh, enemies, onFight };
}
