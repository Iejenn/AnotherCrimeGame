// Talking to a quest's person (docs/design.md §16): Splinter in the sewer, JD and Elliot in the hospital's ward. The
// server decides what happens (quest_talk) and answers with the line they say; when they ask you something, you answer
// with the buttons. JD is always too busy (no server needed).
import { useEffect, useState } from 'react';
import type { GameApi } from '../game/api';
import type { Npc } from './map';
import { QUEST_LINES } from '../game/data/quests';

/** Which quest person an NPC is (for quest_talk). */
const TALK_ID: Record<string, string> = { splinter: 'splinter', doctor_1: 'elliot' };
export const isQuestNpc = (npc: Npc) => npc.id === 'splinter' || npc.kind === 'doctor';

export function QuestDialog({ npc, api, pos, onClose }: { npc: Npc; api: GameApi; pos: [number, number]; onClose: () => void }) {
  const [line, setLine] = useState<string | null>(TALK_ID[npc.id] ? null : 'jd');
  const [page, setPage] = useState(0);
  const ask = (choice: string | null) => {
    const id = TALK_ID[npc.id];
    if (!id) return;
    void api.questTalk(id, choice, pos).then((l) => {
      setPage(0);
      if (l) setLine(l);
      else onClose();
    });
  };
  // Opening the dialog asks the server what they say.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => ask(null), [npc.id]);

  const said = line ? QUEST_LINES[line] : null;
  const last = said ? page >= said.text.length - 1 : true;
  return (
    <div className="npc-dialog" role="dialog" aria-label={`Talking to ${npc.name}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="npc-head">
        <span className="npc-name">{npc.name}</span>
        <span className="muted small">{npc.role}</span>
        <button className="btn tiny npc-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <p className="npc-line">{said ? said.text[page] : '…'}</p>
      <ol className="npc-options">
        {said && !last && (
          <li>
            <button onClick={() => setPage(page + 1)}>Continue</button>
          </li>
        )}
        {said && last && line === 'sp_offer' && (
          <>
            <li>
              <button onClick={() => ask('accept')}>I'll help you. (Start the quest "Sewer Problems")</button>
            </li>
            <li>
              <button onClick={() => ask('decline')}>Not now.</button>
            </li>
          </>
        )}
        {said && last && line !== 'sp_offer' && (
          <li>
            <button onClick={onClose}>Goodbye</button>
          </li>
        )}
      </ol>
    </div>
  );
}
