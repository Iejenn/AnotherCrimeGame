// The game itself (v0.44): the street fills the screen; along the bottom an icon bar. Chat, bag and skills swap the
// bottom panel (tap the open one again to hide it: the street gets the whole screen, the last two log lines stay);
// worn gear, quests, highscores and settings open a popup over the street. Your health is the heart by the minimap.
// Every rule runs on the server (useOnlineGame); this screen only shows the game and passes on what you do.
import { useEffect, useState } from 'react';
import { useCurrentBagHandler } from './bagHandler';
import type { GameState, Report, SkillId, Toast } from '../game/types';
import type { GameApi } from '../game/api';
import { INVENTORY_SLOTS, slotsUsed } from '../game/engine';
import { BagPanel } from './InventoryTab';
import { QuestsTab } from './QuestsTab';
import { SkillGuide, SkillsPanel } from './SkillsTab';
import { StartScreen } from './StartScreen';
import { StreetView, type WorldLink } from '../street/StreetView';
import type { ChatLink } from '../net/chat';
import { HighscoresTab } from './HighscoresTab';
import { IconBar, Popup, SettingsPopup, WornPopup, type Panel, type PopupId } from './Hud';
import { SKILL_BY_ID } from '../game/data/skills';

export interface GameScreenProps {
  state: GameState;
  api: GameApi;
  onReport: (fn: (r: Report) => void) => () => void;
  welcome: boolean;
  dismissWelcome: () => void;
  toasts: Toast[];
  /** Your account, and the shared world (other players). */
  account: { email: string; onSignOut: () => void };
  world: WorldLink;
  chat: ChatLink;
}

export function GameScreen(p: GameScreenProps) {
  const { state } = p;
  // (?panel= / ?popup= in the URL open one at the start: for previews and screenshots.)
  const q = new URLSearchParams(location.search);
  const [panel, setPanel] = useState<Panel | null>(() => (q.get('panel') === 'none' ? null : ((q.get('panel') as Panel) ?? 'chat')));
  const [popup, setPopup] = useState<PopupId | null>(() => q.get('popup') as PopupId | null);
  const [skill, setSkill] = useState<SkillId | null>(null);
  const bagFull = slotsUsed(state) >= INVENTORY_SLOTS;
  const close = () => setPopup(null);
  // A shop's Sell screen or the bank opened: show your bag at the bottom, that's where you pick from.
  const bagHandler = useCurrentBagHandler();
  useEffect(() => {
    if (bagHandler) setPanel('bag');
  }, [bagHandler !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const bar = (
    <IconBar
      panel={panel}
      popup={popup}
      bagFull={bagFull}
      onPanel={(id) => setPanel((cur) => (cur === id ? null : id))}
      onPopup={(id) => setPopup((cur) => (cur === id ? null : id))}
    />
  );
  const content = panel === 'bag' ? <BagPanel s={state} api={p.api} /> : panel === 'skills' ? <SkillsPanel s={state} onOpen={setSkill} /> : null;

  return (
    <div className="game-app">
      <StreetView s={state} api={p.api} onReport={p.onReport} world={p.world} chat={p.chat} hud={{ panel, content, bar }} />

      {popup === 'worn' && <WornPopup s={state} api={p.api} onClose={close} />}
      {popup === 'quests' && (
        <Popup title="Quests" onClose={close}>
          <QuestsTab s={state} />
        </Popup>
      )}
      {popup === 'highscores' && (
        <Popup title="Highscores" onClose={close} wide>
          <HighscoresTab myName={state.name} />
        </Popup>
      )}
      {popup === 'settings' && <SettingsPopup account={p.account} onClose={close} />}
      {skill && (
        <Popup title={SKILL_BY_ID[skill].name} onClose={() => setSkill(null)}>
          <SkillGuide s={state} id={skill} />
        </Popup>
      )}

      {p.welcome && <StartScreen s={state} onClose={p.dismissWelcome} />}

      <div className="toasts">
        {p.toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
