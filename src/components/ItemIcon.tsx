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

const ICONS: Record<string, () => JSX.Element> = { cash: Cash, candy_bar: CandyBar, sandwich: Sandwich, brass_knuckles: BrassKnuckles };

/** The picture for an item id (or 'cash'); nothing for items without one yet. */
export function ItemIcon({ id, className = 'item-icon' }: { id: string; className?: string }) {
  const Icon = ICONS[id];
  return Icon ? (
    <span className={className}>
      <Icon />
    </span>
  ) : null;
}
