// The chat box at the bottom of the Street, OSRS-style: the game's messages (what you did, what happened)
// and the global chat in one list, with filters (All / Game / Chat) and a line to type in.
// It covers only the bottom part of the screen, and folds down to one line with the button on its right.
import { useEffect, useRef, useState } from 'react';
import type { ChatLink } from '../net/chat';

export interface GameLine {
  t: number;
  text: string;
}

type Filter = 'all' | 'game' | 'chat';

interface Line {
  key: string;
  t: number;
  kind: 'game' | 'chat';
  name?: string;
  text: string;
  mine?: boolean;
}

export function ChatBox({ game, chat, myName }: { game: GameLine[]; chat?: ChatLink; myName: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<GameLine | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const lines: Line[] = [
    ...game.map((g, i) => ({ key: `g${g.t}-${i}`, t: g.t, kind: 'game' as const, text: g.text })),
    ...(problem ? [{ key: `p${problem.t}`, t: problem.t, kind: 'game' as const, text: problem.text }] : []),
    ...(chat?.messages ?? []).map((m) => ({ key: `c${m.id}`, t: m.at, kind: 'chat' as const, name: m.name, text: m.body, mine: m.playerId === chat?.myId })),
  ]
    .filter((l) => filter === 'all' || l.kind === filter)
    .sort((a, b) => a.t - b.t)
    .slice(-60);

  // Keep the newest line in view, unless you've scrolled up to read older ones.
  const stick = useRef(true);
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });

  const send = async () => {
    const msg = text.trim();
    if (!msg || !chat || sending) return;
    setSending(true);
    const err = await chat.send(msg);
    setSending(false);
    if (err) setProblem({ t: Date.now(), text: err });
    else setText('');
  };

  return (
    <div className={`chat ${open ? 'open' : 'folded'}`} onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      {open && (
        <>
          <div className="chat-tabs" role="tablist">
            {(['all', 'game', 'chat'] as const).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'game' ? 'Game' : 'Chat'}
              </button>
            ))}
          </div>
          <div
            className="chat-lines"
            ref={listRef}
            aria-live="polite"
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
            }}
          >
            {lines.map((l) => (
              <div key={l.key} className={`chat-line from-${l.kind}`}>
                {l.name && <span className={`chat-name ${l.mine ? 'mine' : ''}`}>{l.name}: </span>}
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {!open && lines.length > 0 && (
        <div className="chat-line last">
          {lines[lines.length - 1].name && <span className="chat-name">{lines[lines.length - 1].name}: </span>}
          <span>{lines[lines.length - 1].text}</span>
        </div>
      )}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <span className="chat-name mine">{myName}:</span>
        <input
          value={text}
          maxLength={200}
          placeholder={chat ? 'Press Enter to chat…' : 'Chat is online only'}
          disabled={!chat}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint="send"
          aria-label="Chat message"
        />
        {text.trim() && (
          <button type="submit" className="chat-send" disabled={sending}>
            Send
          </button>
        )}
        <button type="button" className="chat-fold" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Fold the chat down' : 'Open the chat'}>
          {open ? '▾' : '▴'}
        </button>
      </form>
    </div>
  );
}
