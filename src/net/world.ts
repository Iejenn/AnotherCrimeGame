// Seeing each other (docs/design.md §11). Everything about other players comes from the database:
//  - who's online, with their name and look: the server's "world" list (in game_state, every 10 seconds);
//  - where they walk: the public.walks table. Your route goes in through public.walk(), which knows who you
//    are and checks the route; Realtime tells every other phone the moment a row changes, and the row says
//    whose it is. So nobody can show up as someone else.
// Other phones animate the walk along the route, so one tap to walk is one message, not one per step.
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { supabase } from './supabase';
import type { WorldEntry } from './useOnlineGame';
import type { WorldLink } from '../street/StreetView';

interface WalkRow {
  player_id: string;
  from_x: number;
  from_y: number;
  path: [number, number][];
  started_at: string;
}

export function useWorld(userId: string, roster: MutableRefObject<WorldEntry[]>, refresh: () => void): WorldLink {
  /** Routes heard live (newer than the last roster), by player id. */
  const routes = useRef(new Map<string, { from: [number, number]; path: [number, number][]; at: number }>());

  useEffect(() => {
    const ch = supabase
      .channel('walks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walks' }, (msg) => {
        const r = msg.new as Partial<WalkRow>;
        if (!r?.player_id || r.player_id === userId) return;
        routes.current.set(r.player_id, { from: [r.from_x!, r.from_y!], path: r.path ?? [], at: Date.parse(r.started_at!) });
        // Someone we don't know yet: ask the server who it is.
        if (!roster.current.some((p) => p.id === r.player_id)) refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, roster, refresh]);

  const move = useCallback((from: [number, number], path: [number, number][]) => {
    // (A Supabase call only goes out once something waits for its answer, hence the .then.)
    supabase.rpc('walk', { p_from_x: from[0], p_from_y: from[1], p_path: path }).then(() => undefined);
  }, []);

  return useMemo(
    () => ({
      // Only players the server says are online, with the server's name and look; the newest route we know.
      others: () =>
        roster.current.map((p) => {
          const live = routes.current.get(p.id);
          const r = live && live.at >= p.at ? live : p;
          return { id: p.id, name: p.name, look: p.look, from: r.from, path: r.path, at: r.at };
        }),
      move,
    }),
    [roster, move],
  );
}
