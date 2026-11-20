// Prints a generated map migration: npx vite-node scripts/print-sql.ts 0048 > supabase/migrations/0048_street_props.sql
// (The generators only export their functions, since they import each other's helpers; vite-node doesn't tell a
// script whether it's the one being run.)
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void }; argv: string[] };
declare const require: (m: string) => any;
import { citySql } from './city-sql';
import { pipeSql } from './pipe-sql';
import { propsSql } from './props-sql';

const fs = require('node:fs');
const m = (f: string) => fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
const which = process.argv[process.argv.length - 1];
const a = () => [m('0038_aluminium.sql'), m('0040_beach.sql'), m('0041_bar_and_yard.sql')] as const;
const out: Record<string, () => string> = {
  '0043': () => citySql(...a()),
  '0047': () => pipeSql(...a(), m('0043_city_scale.sql')),
  '0048': () => propsSql(...a(), m('0043_city_scale.sql'), m('0047_pipe_dreams.sql')),
};
if (!out[which]) throw new Error(`which migration? one of ${Object.keys(out).join(', ')}`);
process.stdout.write(out[which]());
