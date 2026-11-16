// Seeing each other (docs/design.md §11): everyone online is on one Supabase Realtime channel, "world".
// Each player shares, with Presence, who they are and their walking route: where they started, the tiles of
// the path, and when they set off. Other phones animate the walk along that route, so a tap to walk is one
// message, not one per step. The channel is private: only signed-in players can join it
// (supabase/migrations/0004_world_channel.sql).
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Look } from '../game/types';
import { gameNow } from '../game/clock';
import { supabase } from './supabase';
import type { OtherPlayer, WorldLink } from '../street/StreetView';

interface Shared {
  name: string;
  look: Look;
  from: [number, number];
  path: [number, number][];
  at: number;
}

export function useWorld(userId: string, name: string, look: Look): WorldLink {
  const others = useRef(new Map<string, OtherPlayer>());
  const channel = useRef<RealtimeChannel | null>(null);
  const joined = useRef(false);
  const mine = useRef<Shared>({ name, look, from: [18, 22], path: [], at: gameNow() });

  useEffect(() => {
    const ch = supabase.channel('world', { config: { private: true, presence: { key: userId } } });
    ch.on('presence', { event: 'sync' }, () => {
      const m = new Map<string, OtherPlayer>();
      for (const [key, metas] of Object.entries(ch.presenceState<Shared>())) {
        if (key === userId || !metas.length) continue;
        const p = metas[metas.length - 1];
        m.set(key, { id: key, name: p.name, look: p.look, from: p.from, path: p.path ?? [], at: p.at });
      }
      others.current = m;
    });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        joined.current = true;
        void ch.track(mine.current);
      }
    });
    channel.current = ch;
    return () => {
      joined.current = false;
      channel.current = null;
      void supabase.removeChannel(ch);
    };
  }, [userId]);

  const move = useCallback((from: [number, number], path: [number, number][]) => {
    mine.current = { ...mine.current, from, path, at: gameNow() };
    if (joined.current) void channel.current?.track(mine.current);
  }, []);

  return useMemo(() => ({ others: () => [...others.current.values()], move }), [move]);
}
