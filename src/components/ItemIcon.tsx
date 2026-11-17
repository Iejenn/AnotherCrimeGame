// Little pictures for the bag: cash (a stack of dollar bills), every metal's salvage, sheet, weapons and armour (drawn in
// the metal's colours) and the quest items, hand-drawn SVG; food, rendered from its 3D model (see MODEL_ICONS).

const Cash = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    {/* three bills, fanned */}
    <rect x="5" y="15" width="28" height="15" rx="1.5" fill="#3d6b43" stroke="#1d3a22" strokeWidth="1.2" transform="rotate(-12 19 22)" />
    <rect x="7" y="14" width="28" height="15" rx="1.5" fill="#4f8455" stroke="#1d3a22" strokeWidth="1.2" transform="rotate(-4 21 21)" />
    <rect x="8" y="15" width="28" height="15" rx="1.5" fill="#6a9e68" stroke="#1d3a22" strokeWidth="1.2" />
    <rect x="10.5" y="17.5" width="23" height="10" rx="1" fill="none" stroke="#2f5a34" strokeWidth="0.9" />
    <circle cx="22" cy="22.5" r="4.2" fill="#8fbf86" stroke="#2f5a34" strokeWidth="0.9" />
    <text x="22" y="25.6" textAnchor="middle" fontSize="8" fontWeight="700" fontFamily="Georgia, serif" fill="#1d3a22">$</text>
  </svg>
);



/** A metal's colours for its icons: main, dark (outlines), light (shine). */
type Tone = [string, string, string];
const TONES: Record<string, Tone> = {
  tin: ['#b8bcc2', '#4a4e54', '#e8ecf0'], copper: ['#c07040', '#5a2e14', '#e8a070'], aluminium: ['#d8dde2', '#6a7078', '#ffffff'],
  brass: ['#d8b04a', '#5a4210', '#f2d27a'], bronze: ['#b0703a', '#4a2a10', '#d8a060'], iron: ['#6a6e74', '#2a2c30', '#9aa0a6'],
  steel: ['#9aa4ae', '#3a424a', '#d0d8e0'], hardened: ['#5a6878', '#222a34', '#8a98a8'], titanium: ['#c8ccd8', '#5a5e6a', '#f0f2f8'],
  tungsten: ['#4a4e58', '#1a1c22', '#7a7e88'],
};

const Knuckles = ({ t }: { t: Tone }) => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    {/* four finger rings over a curved grip, in the metal */}
    <g transform="rotate(-10 20 20)">
      <path d="M7 22 Q20 34 33 22 L33 25 Q20 37 7 25 Z" fill={t[0]} stroke={t[1]} strokeWidth="1.1" />
      {[10, 16.5, 23, 29.5].map((x) => (
        <circle key={x} cx={x} cy="17" r="3.6" fill="none" stroke={t[0]} strokeWidth="2.6" />
      ))}
      {[10, 16.5, 23, 29.5].map((x) => (
        <circle key={`o${x}`} cx={x} cy="17" r="4.9" fill="none" stroke={t[1]} strokeWidth="0.8" />
      ))}
      <path d="M8 21 H32" stroke={t[2]} strokeWidth="1" opacity="0.7" />
    </g>
  </svg>
);

const Bat = ({ t }: { t: Tone }) => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    {/* a metal bat lying diagonally: black grip tape at the handle, the barrel thickening to the end */}
    <g transform="rotate(-40 20 20)">
      <path d="M4 19 L10 18.4 L34 16.5 Q37.5 16.6 37.5 20 Q37.5 23.4 34 23.5 L10 21.6 L4 21 Z" fill={t[0]} stroke={t[1]} strokeWidth="1.1" strokeLinejoin="round" />
      <rect x="4" y="18.6" width="8" height="2.8" rx="0.8" fill="#2b2b2e" />
      <rect x="2.4" y="17.8" width="2" height="4.4" rx="0.8" fill={t[1]} stroke={t[1]} strokeWidth="0.8" />
      <path d="M16 18.6 L33 17.4" stroke={t[2]} strokeWidth="0.9" opacity="0.8" />
    </g>
  </svg>
);

/** A drumstick: pink and pale when raw, brown when cooked. */

/** Rat meat: a skinny haunch on a thin bone, with the tail still curling off it (darker than bird meat). */

/** Tin salvage: a little heap of crushed and dented tin cans. */
const TinSalvage = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <path d="M6 30 L14 22 L20 26 L12 34 Z" fill="#9aa0a6" stroke="#4a4e54" strokeWidth="1" strokeLinejoin="round" />
    <rect x="18" y="12" width="9" height="16" rx="1.5" fill="#c8ccd2" stroke="#4a4e54" strokeWidth="1" transform="rotate(14 22 20)" />
    <path d="M19 16 L27 17.5 M18.5 21 L26.5 22.5" stroke="#8a8e94" strokeWidth="1" transform="rotate(14 22 20)" />
    <path d="M24 30 L33 26 L35 31 L27 35 Z" fill="#b0b4ba" stroke="#4a4e54" strokeWidth="1" strokeLinejoin="round" />
    <path d="M9 29 L14 25" stroke="#d8dce2" strokeWidth="0.9" />
  </svg>
);

const Knife = ({ t }: { t: Tone }) => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    {/* a knife lying diagonally: a blade of the metal with a bright edge, a guard, a dark wooden handle */}
    <g transform="rotate(-40 20 20)">
      <path d="M17 17.5 L35 18 Q37 20 35 21.5 L17 22 Z" fill={t[0]} stroke={t[1]} strokeWidth="1" strokeLinejoin="round" />
      <path d="M18 21 L34.5 20.6" stroke={t[2]} strokeWidth="0.8" opacity="0.8" />
      <rect x="15.5" y="15.8" width="2.2" height="8.4" rx="0.8" fill="#8a8f96" stroke="#3a3d42" strokeWidth="0.8" />
      <rect x="5" y="17.6" width="10.8" height="4.8" rx="2" fill="#5a3a22" stroke="#2a1a0e" strokeWidth="0.9" />
      <circle cx="8" cy="20" r="0.8" fill="#c8b07a" />
      <circle cx="12" cy="20" r="0.8" fill="#c8b07a" />
    </g>
  </svg>
);

/** A flat sheet of metal, slightly bent at a corner. */
const Sheet = ({ t }: { t: Tone }) => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <path d="M6 14 L30 9 L35 24 L11 30 Z" fill={t[0]} stroke={t[1]} strokeWidth="1.1" strokeLinejoin="round" />
    <path d="M8 16 L29 11.5" stroke={t[2]} strokeWidth="1" opacity="0.8" />
    <path d="M31 24.5 L35 24 L33 20 Z" fill={t[1]} opacity="0.6" />
  </svg>
);
/** A dented helmet with a brim. */
const Helmet = ({ t }: { t: Tone }) => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <path d="M7 25 Q7 9 20 9 Q33 9 33 25 Z" fill={t[0]} stroke={t[1]} strokeWidth="1.2" />
    <rect x="4" y="24" width="32" height="4" rx="1.5" fill={t[0]} stroke={t[1]} strokeWidth="1.1" />
    <path d="M12 15 Q16 11 21 11" stroke={t[2]} strokeWidth="1.4" fill="none" />
    <circle cx="20" cy="9.5" r="1.4" fill={t[1]} />
  </svg>
);
/** Leg guards: two plates with knee pieces and straps. */
const LegGuards = ({ t }: { t: Tone }) => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    {[9, 22].map((x) => (
      <g key={x}>
        <rect x={x} y="6" width="9" height="16" rx="2" fill={t[0]} stroke={t[1]} strokeWidth="1.1" />
        <ellipse cx={x + 4.5} cy="25" rx="4.5" ry="3.2" fill={t[0]} stroke={t[1]} strokeWidth="1.1" />
        <rect x={x + 0.5} y="28" width="8" height="7" rx="1.5" fill={t[0]} stroke={t[1]} strokeWidth="1" />
        <path d={`M${x} 11 H${x + 9} M${x} 17 H${x + 9}`} stroke="#4a3a2e" strokeWidth="1.2" />
      </g>
    ))}
  </svg>
);
/** A plate vest: a chest plate with straps over the shoulders and rivets. */
const Vest = ({ t }: { t: Tone }) => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <path d="M10 8 L15 6 Q20 10 25 6 L30 8 L32 32 Q20 36 8 32 Z" fill={t[0]} stroke={t[1]} strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M12 7 L13 14 M28 7 L27 14" stroke="#4a3a2e" strokeWidth="2" />
    <path d="M10 20 Q20 23 30 20 M9.5 26 Q20 29 30.5 26" stroke={t[1]} strokeWidth="1" fill="none" />
    {[14, 20, 26].map((x) => (
      <circle key={x} cx={x} cy="16" r="0.9" fill={t[1]} />
    ))}
    <path d="M14 11 Q18 13 22 11" stroke={t[2]} strokeWidth="1.2" fill="none" />
  </svg>
);

/** Copper salvage: offcuts of copper pipe and a coil of wire. */
const CopperSalvage = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <rect x="6" y="20" width="20" height="5" rx="2" fill="#c07040" stroke="#5a2e14" strokeWidth="1" transform="rotate(-20 16 22)" />
    <rect x="12" y="26" width="18" height="5" rx="2" fill="#d88a50" stroke="#5a2e14" strokeWidth="1" transform="rotate(10 21 28)" />
    <ellipse cx="28" cy="15" rx="7" ry="5" fill="none" stroke="#c07040" strokeWidth="2.2" />
    <ellipse cx="28" cy="15" rx="4" ry="2.6" fill="none" stroke="#e8a070" strokeWidth="1.6" />
    <path d="M8 19 L24 13" stroke="#e8a070" strokeWidth="0.9" />
  </svg>
);
/** A little glass vial of green antidote with a cork. */
const Antidote = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <rect x="16" y="5" width="8" height="5" rx="1" fill="#a8784a" stroke="#5a3a1a" strokeWidth="1" />
    <path d="M15 10 H25 V15 Q31 19 31 26 Q31 35 20 35 Q9 35 9 26 Q9 19 15 15 Z" fill="#d8eef2" fillOpacity="0.5" stroke="#4a6a72" strokeWidth="1.2" />
    <path d="M10.5 25 Q20 22 29.5 25 Q30 34 20 34 Q10 34 10.5 25 Z" fill="#6ad84a" />
    <circle cx="16" cy="28" r="1.4" fill="#c8ffb8" />
    <path d="M13 17 Q12 21 12 24" stroke="#ffffff" strokeWidth="1.2" fill="none" opacity="0.7" />
  </svg>
);
/** The sewer key: a big old iron key. */
const SewerKey = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="11" cy="20" r="6.5" fill="none" stroke="#5a5e64" strokeWidth="3" />
    <rect x="17" y="18.4" width="17" height="3.2" rx="1" fill="#6a6e74" stroke="#2a2c30" strokeWidth="0.8" />
    <rect x="28" y="21" width="2.6" height="6" fill="#6a6e74" stroke="#2a2c30" strokeWidth="0.8" />
    <rect x="32" y="21" width="2.6" height="4" fill="#6a6e74" stroke="#2a2c30" strokeWidth="0.8" />
    <path d="M7 17 Q9 15 12 15" stroke="#a8acb2" strokeWidth="1" fill="none" />
  </svg>
);

const ICONS: Record<string, () => JSX.Element> = { rat_antidote: Antidote, sewer_key: SewerKey, cash: Cash };
/** Food is pictured from the very model it is on the ground (v0.49): rendered by scripts/render-icons.cjs into
 *  public/icons/items/, so the bag and the street always show the same thing. */
const MODEL_ICONS = new Set(['raw_bird_meat', 'cooked_bird_meat', 'raw_rat_meat', 'cooked_rat_meat', 'raw_giant_rat_meat', 'cooked_giant_rat_meat', 'candy_bar', 'sandwich', 'cooked_rat_antidote']);
for (const id of MODEL_ICONS) ICONS[id] = () => <img src={`${import.meta.env.BASE_URL}icons/items/${id}.png`} alt="" draggable={false} />;
// Every metal's items (docs/design.md §14), drawn in the metal's colours. Salvage: tin cans for tin (later metals get
// their own scrap pictures).
for (const [metal, t] of Object.entries(TONES)) {
  ICONS[`${metal}_salvage`] = metal === 'copper' ? CopperSalvage : TinSalvage;
  ICONS[`${metal}_sheet`] = () => <Sheet t={t} />;
  ICONS[`${metal}_knuckles`] = () => <Knuckles t={t} />;
  ICONS[`${metal}_bat`] = () => <Bat t={t} />;
  ICONS[`${metal}_knife`] = () => <Knife t={t} />;
  ICONS[`${metal}_helmet`] = () => <Helmet t={t} />;
  ICONS[`${metal}_legs`] = () => <LegGuards t={t} />;
  ICONS[`${metal}_vest`] = () => <Vest t={t} />;
}

/** The picture for an item id (or 'cash'); nothing for items without one yet. */
export function ItemIcon({ id, className = 'item-icon' }: { id: string; className?: string }) {
  const Icon = ICONS[id];
  return Icon ? (
    <span className={className}>
      <Icon />
    </span>
  ) : null;
}
