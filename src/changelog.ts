// Shown on the start-up screen. Add new entries at the TOP; the first entry is the current version.
export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.24.0',
    date: '2026-11-16',
    title: 'Living dangerously',
    items: [
      'You can do crimes on any health now. But careful: on low health the next hit can kill you, and your stuff ends up in your grave.',
      'A health bar shows over your head when you get hit, and stays there while your health is low.',
    ],
  },
  {
    version: '0.23.0',
    date: '2026-11-16',
    title: 'Chat',
    items: [
      'Talk to everyone on the island: the box at the bottom of the Street is now a chat too. Type and press Enter.',
      'What you say also pops up over your head for a few seconds.',
      'Filter the box to just the game messages or just the chat, or fold it down with the arrow.',
      'New gear button (top right): see which account you are on, and log out.',
      'After 5 minutes without touching the game you are logged out automatically.',
      'The tabs are now Street, Inventory, Skills, Quests, Highscores.',
    ],
  },
  {
    version: '0.22.0',
    date: '2026-11-16',
    title: 'Underworld is online',
    items: [
      'The game is online only now: sign in (or make an account) and play on the same island as everyone else.',
      'Played offline before? Sign in on the same phone or computer and you can bring that character along.',
    ],
  },
  {
    version: '0.21.0',
    date: '2026-11-16',
    title: 'Fair play',
    items: [
      "Other players' names and looks now come straight from the server, so nobody can pretend to be someone else.",
      'Random encounters and their boosts (old-timer tips, lucky streaks…) are gone.',
    ],
  },
  {
    version: '0.20.0',
    date: '2026-11-16',
    title: 'Online: play together',
    items: [
      'Online play: make an account and play on the server. Your character is saved to your account, on every device.',
      'See your friends: other players walk around the island with their name over their head (and as white dots on the minimap).',
      'Played offline before? When you first sign in, you can bring that character along.',
      'New Highscores tab: a table for every skill. Can you get to the top?',
    ],
  },
  {
    version: '0.19.0',
    date: '2026-11-16',
    title: 'Groundwork for multiplayer',
    items: [
      'The bartender and the parking lot guard now follow fixed routines: every 8.5 seconds the bartender watches, then turns his back; the guard walks the same patrol route around the lot. Learn their timing!',
      'Behind the scenes: every action now goes through one place, and the game has one clock, so it can move to a server later without cheating.',
    ],
  },
  {
    version: '0.18.0',
    date: '2026-11-16',
    title: 'Graves, a world map, and a bigger park',
    items: [
      'The game is now called Underworld.',
      'Dying: at 0 HP your cash and items drop into a grave where you fell, and you wake up at the start with half health. Walk back and tap the grave within 5 minutes to get it all back.',
      'Switching tabs (or reloading) no longer sends you back to the start: you stay where you were.',
      'The minimap is round now, follows you and turns with the camera. Tap the map button under it for the world map: tap a place to see its crimes and who is there, and walk there.',
      'Central Park is twice as big again (four blocks), with a pond, more paths and lamps, and three tourists instead of two.',
      'Cash, candy bars and sandwiches have pictures in your bag.',
    ],
  },
  {
    version: '0.17.0',
    date: '2026-11-16',
    title: 'The gas station and the cars',
    items: [
      'Shoplift Gas Station (level 25): a gas station at the edge of town, with pumps under a canopy. It shares one big area with the parking lot: no road in between. Steal a sandwich (+2 HP) or a candy bar from the shelves. 40% odds; mess up and the clerk comes for you (−2 HP).',
      'Steal From Cars (level 30): four cars are parked on the lot. 35% odds, $30–60. A failed attempt sets off the alarm, and the guard comes running (−3 HP, stunned 4s). He can also just see you in his flashlight beam.',
      'That completes the new Street Crimes: seven crimes, each with its own place in town.',
    ],
  },
  {
    version: '0.16.0',
    date: '2026-11-16',
    title: 'The parking lot',
    items: [
      'Pry Open Parking Meters (level 20): a parking lot at the east edge of town with five meters. Prying one open always works ($15–30); an emptied meter turns red and fills up again after 15 seconds.',
      'A guard patrols the lot with a flashlight. Stay out of the beam: if he catches you at a meter, he yells "I saw that!" and whacks you (−3 HP, stunned 4s).',
    ],
  },
  {
    version: '0.15.0',
    date: '2026-11-16',
    title: 'The bar',
    items: [
      'Pickpocket Drunks (level 15): a new bar above the basketball court, with three drunks on stools. Picking their pockets always works ($10–20)…',
      '…but the bartender watches the room. Every few seconds he turns his back to polish the bottles: his name turns green. Time it right.',
      'If he sees you, he yells "Leave my guests alone!", comes round the counter and punches you (−2 HP, stunned 3s).',
    ],
  },
  {
    version: '0.14.0',
    date: '2026-11-16',
    title: 'The candy store',
    items: [
      'Shoplift Candy Store (level 10): a new candy store north of the park. Walk in, tap a shelf, and walk out with a candy bar (eat it for +1 HP). 40% odds.',
      'A shelf you stole from is bare until it is restocked, 10 seconds later.',
      'Watch the clerk: if you mess up he yells "Hey!", comes over and shoves you (−1 HP, stunned).',
      'The candy store has a shopping-bag icon on the minimap.',
    ],
  },
  {
    version: '0.13.0',
    date: '2026-11-16',
    title: 'The big park and the basketball court',
    items: [
      'Street Crimes v2 has started. Crimes now have their own places: level 1 and 5 are open, the rest follow one by one.',
      'Pickpocket Tourists (level 1): the park below where you start is twice as big, with a fountain, benches, hedges, flowerbeds and paths. Two tourists stroll around in it. 65%, $1–3.',
      'Raid Gym Bags (level 5): a new basketball court left of the park. Two players shoot hoops while their bags sit on the bench. 55%, $2–6.',
      'The Skills tab shows where each crime is, what it pays (dollars or food), and what happens when it goes wrong.',
    ],
  },
  {
    version: '0.12.0',
    date: '2026-11-16',
    title: 'Dollars, food, and an island in the ocean',
    items: [
      'Money is dollars now. Crimes pay cash straight away; no more random item drops (old loot was turned into cash for you).',
      'Food: candy bars and sandwiches stack in your bag. Tap one in your Inventory and eat it to heal (takes half a second). The shops that stock them are coming next.',
      'Heat, jail and bail are gone. Soon, getting caught will mean an angry clerk, bartender or guard instead.',
      'The city is now an island: a sandy beach with rocks, and the open ocean all around.',
    ],
  },
  {
    version: '0.11.0',
    date: '2026-11-16',
    title: 'Street Crimes rebalanced',
    items: [
      'Every crime now starts at 65% success when you unlock it, and gets 0.5% better for every Street Crimes level above that.',
      'A failed attempt gives no XP any more.',
      'XP rebalanced: every skill uses one XP curve where each level needs a bit more than the last. 150 successful pickpockets take you to level 10, and each new crime earns about 30% more XP per hour.',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-11-16',
    title: "Step inside Eddy's",
    items: [
      "You can walk into Eddy's General Store through its front door. Inside, the roof lifts so you can see the shop.",
      'Shelves full of goods, a glowing drinks fridge, a counter with a cash register.',
      'Eddy wanders around his shop now. Tap him to talk, like before.',
      'The store has a shopping-bag icon on the minimap.',
      'People are easier to tap on a phone.',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-11-15',
    title: 'A brand new look',
    items: [
      'The city got a full makeover in a chunky low-poly style, at dusk: brick and concrete buildings with lit windows, rooftop air-cons, shop awnings, lane lines and zebra crossings, round trees, dumpsters and trash bags.',
      'Orange street lamps throw pools of light on the pavement. Long evening shadows, fog in the distance, a dark river around the island.',
      'New rounded characters for everyone, with walk, pickpocket and stunned animations. Eddy wears an apron now.',
      'Buildings between the camera and you fade out, so you are never hidden.',
      'Chunky cars, a proper card table, and shop doors with glass.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-11-15',
    title: 'Street Crimes 1–30, a minimap, and a city that looks like a city',
    items: [
      'Street Crimes now goes to level 30, with a new crime every 5 levels: Lift a Wallet, Shoplift, Strip a Parked Car, Run a Shell Game, Burgle a House, Rob a Corner Store and Mug a Banker.',
      'Each level needs 20% more XP than the last. About 16 hours of play to reach 30.',
      'One tap = one attempt. Picking a pocket takes 4 ticks (2 seconds); tap the tourist again for the next one.',
      'A failed attempt shakes the screen and stuns you for 2 seconds.',
      'Only active play counts now. Nothing happens while the app is closed or hidden.',
      'Minimap in the top-right corner. Tap it to walk there.',
      'Buildings now come in different sizes and heights, with alleys you can walk through.',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-11-15',
    title: 'A fresh start: the RPG begins',
    items: [
      'Five skills, all starting at level 1 with a max of 10 for now: Street Crimes, Melee, Defense, Gunfire and Health.',
      'Street Crimes has 9 crimes from Lift a Wallet (level 1) to Mug a Banker (level 9), all around where you start. The other skills come later.',
      'New character creator: pick your skin, hair and clothes, with a live 3D preview. You walk the Street as that character.',
      'The city is now an island with a river all the way around it.',
      'Removed: perks, the 8 old crime families, cars and origins. Because every skill is new, old characters start over.',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-11-15',
    title: "Eddy's General Store",
    items: [
      "Eddy has opened a General Store just north of where you start. NPC names are yellow: tap him to talk.",
      'Sell: tap an item to hear what Eddy pays, tap it again to sell one. He takes car keys too.',
      'Buy: his shelves are empty for now. A delivery is coming.',
      'The currency is now gold, and earnings are much lower: a picked pocket pays 1–3 gold. Older saves had their gold scaled down to match.',
      'New: health. A failed job costs a little HP, and it comes back at 1 per minute. At 0 you stop working until you have rested.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-11-15',
    title: 'Back to the streets',
    items: [
      'The game is now all about the Street: four tabs, Street, Inventory, Quests and Skills.',
      'Drag to turn the camera, pinch to zoom. No more blue flash when you tap.',
      'New Inventory: 28 slots with your cash, loot and car keys. Selling comes back with a store on the Street.',
      'Skills shows every crime per skill: what level you need, where to find it on the map, and your mastery.',
      'Quests are coming soon.',
      'Removed: the Jobs list, hiring crew, the shop (gear, upgrades, fronts), Intel and contracts, the collection, the log and the guide.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-11-15',
    title: 'The Street (test version)',
    items: [
      'New Street tab: walk a 3D city. Tap the ground to walk, tap a tourist, car or door to work it.',
      'Your character keeps working a spot until you walk away, and it keeps going while the app is closed.',
      'Every crime has its own spot. Heavier crimes are further from the centre, and locked ones tell you what level you need.',
      'Your crew stand at the spots they are working.',
      'Fixed a few log lines that started with a small letter.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-11-01',
    title: 'A guide for new players, and short save codes',
    items: [
      'New Guide tab: 10 getting-started steps that tick off as you play, plus a "how it works" page for every system.',
      'A "next step" card under your crew shows new players what to do next. Hide it any time.',
      'Save codes are about 30× shorter (around 1,000 characters instead of 27,000), with a Copy button. Old codes still work.',
      'Importing a save now asks before it replaces your current character.',
    ],
  },
  {
    version: '0.2.1',
    date: '2026-11-01',
    title: 'Fixes',
    items: [
      'Numbers always use a comma for thousands ($3,210). Dutch phones were showing $3.210.',
      'TIP tags no longer overlap other crime families on phones.',
      '"Give them a job" now picks that crew member and jumps to the job list.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-11-01',
    title: 'New look, new front door',
    items: [
      'Fresh case-file look: ledger rows, newspaper headlines, rubber-stamp ranks.',
      'Start-up screen with your character file, what your crew did while you were gone, and what changed.',
      'The game now lives on GitHub Pages.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-11-01',
    title: 'Opening night',
    items: [
      '8 crime skills, 56 crimes, levels 1–99.',
      'Queue a shift, close the tab: jobs keep running while you are away.',
      'Crew, perks, mastery, gear, fronts, Street Intel and daily contracts.',
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;

// Which version this browser has already seen, so new entries get a "NEW" stamp.
const SEEN_KEY = 'underworld-idle-seen-version';
export function getSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
export function markVersionSeen() {
  try {
    localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
  } catch {
    /* ignore */
  }
}
