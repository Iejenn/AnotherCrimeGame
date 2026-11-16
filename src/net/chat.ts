// The global chat (docs/design.md §11, supabase/migrations/0006_chat.sql). One channel for everyone for now.
// Messages come from the chat_messages table: the last 50 when you join, then new ones live (Realtime).
// Sending goes through public.send_chat(), which stamps your name from the database and limits the pace.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface ChatMsg {
  id: number;
  playerId: string;
  name: string;
  body: string;
  /** When it was said (ms). */
  at: number;
}

export interface ChatLink {
  /** Your own player id (your messages show over your own head). */
  myId: string;
  messages: ChatMsg[];
  /** Send a message; answers with a problem to show, or null if it went out. */
  send: (text: string) => Promise<string | null>;
}

interface Row {
  id: number;
  player_id: string;
  name: string;
  body: string;
  created_at: string;
}
const toMsg = (r: Row): ChatMsg => ({ id: r.id, playerId: r.player_id, name: r.name, body: r.body, at: Date.parse(r.created_at) });

const PROBLEMS: Record<string, string> = {
  empty: 'Type something first.',
  too_long: 'That message is too long (200 letters at most).',
  chat_too_fast: "You're chatting too fast. Wait a moment.",
};

export function useChat(myId: string): ChatLink {
  const [messages, setMessages] = useState<ChatMsg[]>([]);

  useEffect(() => {
    let live = true;
    const add = (list: ChatMsg[]) =>
      setMessages((m) => {
        const byId = new Map(m.map((x) => [x.id, x]));
        for (const x of list) byId.set(x.id, x);
        return [...byId.values()].sort((a, b) => a.id - b.id).slice(-100);
      });
    supabase
      .from('chat_messages')
      .select('id, player_id, name, body, created_at')
      .order('id', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (live && data) add((data as Row[]).map(toMsg));
      });
    const ch = supabase
      .channel('chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (msg) => add([toMsg(msg.new as Row)]))
      .subscribe();
    return () => {
      live = false;
      void supabase.removeChannel(ch);
    };
  }, []);

  const send = useCallback(async (text: string) => {
    const { data, error } = await supabase.rpc('send_chat', { p_body: text });
    if (error) return "Can't reach the server. Check your connection.";
    return data?.ok ? null : (PROBLEMS[data?.reason] ?? "Your message didn't go through.");
  }, []);

  return { myId, messages, send };
}
