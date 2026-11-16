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
import { SKILL_BY_ID } from '../game/data/skills';
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
    fight?: GameState['fight'];
  };
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
  /** Their combat level (shown next to their name). */
  combat?: number;
  from: [number, number];
  path: [number, number][];
  at: number;
}

/** Server reasons that the game explains itself already (or that need no message). */
const QUIET = new Set(['not_yet', 'no_attempt', 'no_fight', 'fight_over', 'too_far']);
/** What the server's "no" means, in words. */
const SAY: Record<string, string> = {
  enemy_busy: 'Someone else is already fighting that.',
  enemy_dead: "It's gone. It'll be back soon.",
  cant_equip: "You can't wear that.",
  bag_full: 'Your bag is full.',
  not_enough_cash: "You don't have enough cash.",
  not_in_shop: 'You need to be in the shop to buy that.',
  too_far: "You're too far away.",
  too_fast: 'The server lost track of where you are. Walk there again.',
  empty: "It's empty. Come back in a bit.",
  stunned: "You're still stunned.",
  eating: "You're still eating.",
  too_hurt: "You're too hurt to work. Eat something, or wait.",
  level_too_low: "Your level is too low for that.",
  caught: "You've been caught!",
  full_health: "You're already at full health.",
  not_at_store: 'You need to be in the store to sell.',
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
    skills: Object.fromEntries(Object.entries(p.skills).map(([k, v]) => [k, { xp: Number(v.xp) }])) as GameState['skills'],
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
    fight: p.fight ?? null,
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
      ref.current = fromServer(a, [...lines.reverse(), ...ref.current.log].slice(0, 150));
      const report: Report = { ...emptyReport(), ...a.report } as Report;
      if (report.jobs || report.events.length || report.hit || report.died || Object.keys(report.items).length) listeners.current.forEach((fn) => fn(report));
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
    async (fn: 'finish_attempt' | 'game_state' | 'fight_step') => {
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
    // Leaving the game stops your attempt (only active play counts).
    const onHide = () => {
      if (document.visibilityState === 'hidden' && ref.current.player.job) call('stop_attempt');
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
    };
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
      buy: (id) => void call('buy_item', { p_item: id }),
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
        const r = msg.new as { id: string; kind: string; idx: number; hp: number; dead_until: string | null; fighter: string | null; fight_x: number | null; fight_y: number | null; fight_seen: string | null };
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
