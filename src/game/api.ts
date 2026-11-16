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
}
