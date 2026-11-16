// Every player action goes through this one interface (docs/design.md §11).
// Today `localApi` runs the game rules right here in the browser. Later a Supabase version makes the
// same calls to server functions (SECURITY DEFINER RPCs), which run the same rules on the server and
// send back the new state. The screens only ever talk to a GameApi, so they won't need rewriting.
//
// Planned server functions, one per method:
//   startAttempt → rpc('start_attempt')   stopAttempt → rpc('stop_attempt')
//   eat → rpc('eat_item')                  sell → rpc('sell_item')          drop → rpc('drop_item')
//   collectGrave → rpc('collect_grave')    savePos → rpc('save_position')
// Finishing an attempt (and NPCs catching you) happens in the game's tick; on the server that becomes
// rpc('finish_attempt'), called when the attempt's time is up.
import type { GameState } from './types';
import { collectGrave, dropItem, eat, sellItem, startJob, stopJob } from './engine';

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

type Act = (fn: (d: GameState, now: number) => void) => void;

/** The game rules running in this browser (single player, saved on this device). */
export function localApi(act: Act): GameApi {
  return {
    startAttempt: (crimeId, spotId, pos) =>
      act((d, t) => {
        d.player.pos = pos;
        if (d.player.job) stopJob(d);
        startJob(d, crimeId, t, spotId, pos);
      }),
    stopAttempt: () => act((d) => stopJob(d)),
    eat: (id) => act((d, t) => eat(d, id, t)),
    sell: (id) => act((d) => sellItem(d, id)),
    drop: (id) => act((d) => dropItem(d, id)),
    collectGrave: () => act((d, t) => collectGrave(d, t)),
    savePos: (pos) =>
      act((d) => {
        d.player.pos = pos;
      }),
  };
}
