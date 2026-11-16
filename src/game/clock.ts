// The game clock. Today it's this device's clock; once there is a server (docs/design.md §11) it is
// corrected to the server's time, so everyone's bartender turns his back at the same moment and
// nobody can cheat by changing their phone's clock. Everything in the game reads time from here.
let offset = 0;

/** The current game time, in milliseconds (like Date.now()). */
export const gameNow = () => Date.now() + offset;

/**
 * Line the game clock up with the server's: `serverNow` is the server's time in a reply that was sent
 * at `sentAt` and arrived at `receivedAt` (both Date.now()). Assumes the trip took as long each way.
 */
let synced = false;
let bestTrip = Infinity;
export function syncClock(serverNow: number, sentAt: number, receivedAt: number) {
  const trip = receivedAt - sentAt;
  const sample = serverNow + trip / 2 - receivedAt;
  // The first answer (or one that's way off) sets the clock at once.
  if (!synced || Math.abs(sample - offset) > 2000) {
    offset = sample;
    synced = true;
    bestTrip = trip;
    return;
  }
  // After that, move gently towards each new answer, trusting quick ones (less guesswork) more. Jumping to every
  // answer made other players' positions wobble, because each answer is off by a slightly different amount.
  const weight = trip <= bestTrip * 1.5 ? 0.25 : 0.05;
  bestTrip = Math.min(bestTrip * 1.02, trip);
  offset += (sample - offset) * weight;
}
