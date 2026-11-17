// Using one item on another (docs/design.md §16): tap an item in your bag, "Use", then tap the other one. Each combo is
// a row here and the same row in public.combos on the server (use_item), which does it.
export interface Combo {
  /** The two items (either order works), and what they make (one of each is used up). */
  a: string;
  b: string;
  result: string;
  text: string;
}
export const COMBOS: Combo[] = [
  { a: 'rat_antidote', b: 'cooked_rat_meat', result: 'cooked_rat_antidote', text: 'You drip the antidote over the cooked rat meat.' },
];
export const findCombo = (x: string, y: string) => COMBOS.find((c) => (c.a === x && c.b === y) || (c.a === y && c.b === x));
