// Little pictures for the bag: cash (a stack of dollar bills), the candy bar, the sandwich and brass knuckles.
// Hand-drawn SVG so they're sharp on any phone and match the game's muted dusk colours.

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

const CandyBar = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    {/* a wrapped bar, torn open at one end to show the chocolate */}
    <g transform="rotate(-20 20 20)">
      <rect x="6" y="15" width="22" height="11" rx="1.5" fill="#b8336a" stroke="#5a1430" strokeWidth="1.2" />
      <path d="M6 15 l-3 2 l2 1.5 l-2 1.5 l2 1.5 l-2 1.5 l3 2 z" fill="#b8336a" stroke="#5a1430" strokeWidth="1" />
      <rect x="27" y="15.5" width="9" height="10" rx="1" fill="#6a3a1e" stroke="#3a1e0e" strokeWidth="1.1" />
      <line x1="31.5" y1="15.5" x2="31.5" y2="25.5" stroke="#3a1e0e" strokeWidth="0.9" />
      <line x1="27" y1="20.5" x2="36" y2="20.5" stroke="#3a1e0e" strokeWidth="0.9" />
      <path d="M27 15 l1.5 2 l-1.5 2 l1.5 2 l-1.5 2 l1.5 2 l-1.5 1" fill="none" stroke="#5a1430" strokeWidth="1" />
      <rect x="10" y="18.5" width="13" height="4" rx="0.8" fill="#f0b13c" />
    </g>
  </svg>
);

const Sandwich = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    {/* a triangle sandwich: bread, lettuce, tomato, cheese */}
    <path d="M6 30 L20 8 L34 30 Z" fill="#e8c88a" stroke="#7a5a2a" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M9 27 L20 10.5 L31 27 Z" fill="#f2e2b8" />
    <path d="M7 31 Q11 28 14 31 T20 31 T26 31 T33 31" fill="none" stroke="#5aa04a" strokeWidth="2.4" strokeLinecap="round" />
    <rect x="8" y="31.5" width="25" height="2.4" rx="1" fill="#d9473a" />
    <path d="M10 34.5 L31 34.5 L29 36.5 L12 36.5 Z" fill="#f0b13c" />
    <rect x="6" y="36" width="28" height="2.5" rx="1" fill="#c89a5a" stroke="#7a5a2a" strokeWidth="1" />
  </svg>
);

const BrassKnuckles = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    {/* four finger rings over a curved grip, in brass */}
    <g transform="rotate(-10 20 20)">
      <path d="M7 22 Q20 34 33 22 L33 25 Q20 37 7 25 Z" fill="#b8902e" stroke="#5a4210" strokeWidth="1.1" />
      {[10, 16.5, 23, 29.5].map((x) => (
        <circle key={x} cx={x} cy="17" r="3.6" fill="none" stroke="#d8b04a" strokeWidth="2.6" />
      ))}
      {[10, 16.5, 23, 29.5].map((x) => (
        <circle key={`o${x}`} cx={x} cy="17" r="4.9" fill="none" stroke="#5a4210" strokeWidth="0.8" />
      ))}
      <path d="M8 21 H32" stroke="#f2d27a" strokeWidth="1" opacity="0.7" />
    </g>
  </svg>
);

const BaseballBat = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    {/* a wooden bat lying diagonally: black grip tape at the handle, the barrel thickening to the end */}
    <g transform="rotate(-40 20 20)">
      <path d="M4 19 L10 18.4 L34 16.5 Q37.5 16.6 37.5 20 Q37.5 23.4 34 23.5 L10 21.6 L4 21 Z" fill="#c08a4a" stroke="#5a3a1a" strokeWidth="1.1" strokeLinejoin="round" />
      <rect x="4" y="18.6" width="8" height="2.8" rx="0.8" fill="#2b2b2e" />
      <rect x="2.4" y="17.8" width="2" height="4.4" rx="0.8" fill="#8a5a2a" stroke="#5a3a1a" strokeWidth="0.8" />
      <path d="M16 18.6 L33 17.4" stroke="#e0b070" strokeWidth="0.9" opacity="0.8" />
    </g>
  </svg>
);

/** A drumstick: pink and pale when raw, brown when cooked. */
const BirdMeat = ({ cooked }: { cooked: boolean }) => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <g transform="rotate(-35 20 20)">
      <rect x="22" y="18" width="11" height="4" rx="2" fill="#f2e8d8" stroke="#8a7a62" strokeWidth="1" />
      <circle cx="33.5" cy="17.6" r="2.2" fill="#f2e8d8" stroke="#8a7a62" strokeWidth="1" />
      <circle cx="33.5" cy="22.4" r="2.2" fill="#f2e8d8" stroke="#8a7a62" strokeWidth="1" />
      <ellipse cx="14" cy="20" rx="10" ry="8" fill={cooked ? '#9a5426' : '#e8a0a0'} stroke={cooked ? '#4a240e' : '#a05a5a'} strokeWidth="1.2" />
      <ellipse cx="11" cy="17" rx="4" ry="2.2" fill={cooked ? '#c07a3a' : '#f6c8c8'} opacity="0.8" />
    </g>
  </svg>
);

const ICONS: Record<string, () => JSX.Element> = { raw_bird_meat: () => <BirdMeat cooked={false} />, cooked_bird_meat: () => <BirdMeat cooked />, cash: Cash, candy_bar: CandyBar, sandwich: Sandwich, brass_knuckles: BrassKnuckles, baseball_bat: BaseballBat };

/** The picture for an item id (or 'cash'); nothing for items without one yet. */
export function ItemIcon({ id, className = 'item-icon' }: { id: string; className?: string }) {
  const Icon = ICONS[id];
  return Icon ? (
    <span className={className}>
      <Icon />
    </span>
  ) : null;
}
