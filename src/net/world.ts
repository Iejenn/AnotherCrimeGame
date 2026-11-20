// Seeing each other (docs/design.md §11). Everything about other players comes from the database:
//  - who's online, with their name and look: the server's "world" list (in game_state, every 10 seconds);
//  - where they walk: the public.walks table. Your route goes in through public.walk(), which knows who you
//    are and checks the route; Realtime tells every other phone the moment a row changes, and the row says
//    whose it is. So nobody can show up as someone else.
// Other phones animate the walk along the route, so one tap to walk is one message, not one per step.
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { supabase } from './supabase';
import type { EnemyState, FightEvent, WorldEntry } from './useOnlineGame';
import type { OtherStatus, WorldLink } from '../street/StreetView';

interface StatusRow {
  player_id: string;
  job_spot: string | null;
  job_ends_at: string | null;
  stunned_until: string | null;
  fight_enemy: string | null;
  hp: number | string;
  hp_at: string;
  max_hp: number;
}
const ms = (t: string | null) => (t ? Date.parse(t) : 0);
const toStatus = (r: StatusRow): OtherStatus => ({
  spot: r.job_spot,
  jobEndsAt: ms(r.job_ends_at),
  stunnedUntil: ms(r.stunned_until),
  fightEnemy: r.fight_enemy,
  hp: Number(r.hp),
  hpAt: ms(r.hp_at),
  maxHp: r.max_hp,
});

interface WalkRow {
  player_id: string;
  from_x: number;
  from_y: number;
  path: [number, number][];
  started_at: string;
  /** v0.60: running this route. */
  run?: boolean;
}

export function useWorld(
  userId: string,
  roster: MutableRefObject<WorldEntry[]>,
  refresh: () => void,
  enemies: MutableRefObject<EnemyState[]>,
  onFight: (fn: (events: FightEvent[]) => void) => () => void,
): WorldLink {
  /** Routes heard live (newer than the last roster), by player id. */
  const routes = useRef(new Map<string, { from: [number, number]; path: [number, number][]; at: number; run?: boolean }>());
  /** What everyone is doing (working, stunned, fighting) and their health: public.player_status, kept live. */
  const status = useRef(new Map<string, OtherStatus>());

  useEffect(() => {
    // Everyone's current status once, then every change live (the server's trigger writes it; nobody else can).
    void supabase
      .from('player_status')
      .select('*')
      .then(({ data }) => {
        for (const r of (data ?? []) as StatusRow[]) if (!status.current.has(r.player_id)) status.current.set(r.player_id, toStatus(r));
      });
    const ch = supabase
      .channel('player_status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_status' }, (msg) => {
        const r = msg.new as StatusRow;
        if (r?.player_id) status.current.set(r.player_id, toStatus(r));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel('walks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walks' }, (msg) => {
        const r = msg.new as Partial<WalkRow>;
        if (!r?.player_id || r.player_id === userId) return;
        routes.current.set(r.player_id, { from: [r.from_x!, r.from_y!], path: r.path ?? [], at: Date.parse(r.started_at!), run: !!r.run });
        // Someone we don't know yet: ask the server who it is.
        if (!roster.current.some((p) => p.id === r.player_id)) refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, roster, refresh]);

  const move = useCallback((from: [number, number], path: [number, number][], run = false) => {
    // (A Supabase call only goes out once something waits for its answer, hence the .then.)
    // (v0.60: walk_to, with whether you run it, so the others see you run.)
    supabase.rpc('walk_to', { p_from_x: from[0], p_from_y: from[1], p_path: path, p_run: run }).then(() => undefined);
  }, []);

  return useMemo(
    () => ({
      // Only players the server says are online, with the server's name and look; the newest route we know.
      others: () =>
        roster.current.map((p) => {
          const live = routes.current.get(p.id);
          const r = live && live.at >= p.at ? live : p;
          return { id: p.id, name: p.name, look: p.look, from: r.from, path: r.path, at: r.at, run: !!r.run, equipment: p.equipment, style: p.style, combat: p.combat, status: status.current.get(p.id) };
        }),
      move,
      myId: userId,
      // The shared enemies (kept fresh by Realtime in useOnlineGame) and your fight's swings.
      enemies: () => enemies.current,
      onFight,
    }),
    [roster, move, userId, enemies, onFight],
  );
}
