// Every player action goes through this one interface (docs/design.md §11). The online version
// (src/net/useOnlineGame.ts) turns each method into a server function call:
//   startAttempt → rpc('start_attempt')   stopAttempt → rpc('stop_attempt')
//   eat → rpc('eat_item')                  sell → rpc('sell_item')          drop → rpc('drop_item')
//   collectGrave → rpc('collect_grave')    savePos → rpc('save_position')
// Finishing an attempt (and NPCs catching you) is asked for by the game's heartbeat: rpc('finish_attempt').

export interface GameApi {
  /** Start one attempt at a crime spot, standing on tile `pos`. */
  startAttempt(crimeId: string, spotId: string, pos: [number, number]): void;
  /** Stop the current attempt (walking away). */
  stopAttempt(): void;
  /** Eat one food item. */
  eat(itemId: string): void;
  /** Sell one item to Eddy. */
  sell(itemId: string): void;
  /** Throw away a whole stack. */
  drop(itemId: string): void;
  /** Take your stuff back from your grave (stand next to it). */
  collectGrave(): void;
  /** Remember where you're standing on the Street. */
  savePos(pos: [number, number]): void;
  /** Attack an enemy, standing on tile `pos` next to it (combat, docs/design.md §12). */
  attack(enemyId: string, pos: [number, number]): void;
  /** Walk away from a fight. */
  stopFight(): void;
  /** Wield or wear an item from your bag; take off what's in a slot. */
  equip(itemId: string): void;
  unequip(slot: string): void;
  /** Fight with your melee weapon or throw from your Marksman slot (v0.51). */
  setFightStyle(style: 'melee' | 'marksman'): void;
  /** Buy one item from the shop you're in. */
  buy(itemId: string): void;
  /** Pick up something lying on the ground (standing on it or next to it). */
  pickUp(groundId: number, pos: [number, number]): void;
  /** Start cooking all of an item at the barbecue (standing next to it); stops when you walk away. */
  cook(itemId: string, pos: [number, number]): void;
  stopCook(): void;
  /** Start making something at a press or workbench (Tinkering): as many as your materials allow, one after another. */
  make(craftId: string, pos: [number, number]): void;
  stopMake(): void;
  /** The bank (stand in it): put n of an item (or 'cash', in dollars) in, take n out, or put your whole bag in. */
  bankDeposit(itemId: string, n: number, pos: [number, number]): void;
  bankWithdraw(itemId: string, n: number, pos: [number, number]): void;
  bankDepositAll(pos: [number, number]): void;
  /** Talk to a quest's person (Splinter, Elliot), with your answer if they asked you something ('accept' / 'decline').
   *  Resolves to the id of the line they say (QUEST_LINES), or null. */
  questTalk(npcId: string, choice: string | null, pos: [number, number]): Promise<string | null>;
  /** Use one item on another (the Rat Antidote on cooked rat meat). */
  useItem(itemId: string, onId: string): void;
  /** Open a gate with its key, standing next to it. */
  unlockGate(gateId: string, pos: [number, number]): void;
  /** In the biker club: let a biker jump you if one is free (the game asks every couple of seconds while you're in). */
  jumpMe(pos: [number, number]): void;
  /** Climb down the pothole into the sewer, or up its ladder (a link in map.ts), standing on tile `pos` next to it.
   *  True when the server moved you. */
  climb(linkId: string, pos: [number, number]): Promise<boolean>;
}
