// Renders the bag icons of the items that use a 3D model on the ground (the Food Kit food), from that same model, into
// public/icons/items/<id>.png (128×128, transparent). Run with the dev server up on :5180: node scripts/render-icons.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const IDS = ['raw_bird_meat', 'cooked_bird_meat', 'raw_rat_meat', 'cooked_rat_meat', 'raw_giant_rat_meat', 'cooked_giant_rat_meat', 'candy_bar', 'sandwich', 'cooked_rat_antidote'];
(async () => {
  const out = path.join(__dirname, '..', 'public', 'icons', 'items');
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 });
  for (const id of IDS) {
    await p.goto(`http://localhost:5180/scripts/preview/icon.html?id=${id}`);
    await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
    await p.screenshot({ path: path.join(out, `${id}.png`), omitBackground: true });
    console.log('icon', id);
  }
  await b.close();
})();
