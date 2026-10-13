const { chromium } = require('playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 260 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/kreditering.html'); // samme oprindelse
  await p.setContent(`<html><head><link rel="stylesheet" href="http://localhost:8765/css/common.css"></head>
    <body style="background:#e2edf7;margin:0;display:flex;gap:40px;padding:40px">
    <div id="a" style="--ds:110px"></div><div id="b" style="--ds:110px"></div></body></html>`);
  await p.addScriptTag({ url: 'http://localhost:8765/js/dice.js' });
  await p.evaluate(() => { window.da = Dice.create(document.getElementById('a')); window.db = Dice.create(document.getElementById('b')); da.show([3, 5]); db.show([6, 1]); });
  await p.waitForTimeout(200);
  await p.evaluate(() => { da.wiggle(); db.wiggle(); });
  const shots = [];
  for (let k = 0; k < 4; k++) { await p.waitForTimeout(130 + k * 37); await p.screenshot({ path: `${OUT}/d_spin${k}.png` }); }
  await p.evaluate(() => { da.land([4, 2]); db.land([6, 6]); });
  for (let k = 0; k < 4; k++) { await p.waitForTimeout(220); await p.screenshot({ path: `${OUT}/d_land${k}.png` }); }
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/d_final.png` });
  console.log(JSON.stringify(errs));
  await b.close();
})();
