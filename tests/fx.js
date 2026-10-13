const { chromium } = require('playwright');
const OUT = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const rm of ['no-preference', 'reduce']) {
    const ctx = await browser.newContext({ reducedMotion: rm });
    const host = await ctx.newPage(); const errs = []; host.on('pageerror', e => errs.push(e.message));
    await host.setViewportSize({ width: 1600, height: 900 });
    await host.goto('http://localhost:8765/index.html?lokal=1');
    await host.click('#setupForm button[type=submit]'); await host.waitForTimeout(300); await host.click('#lobbyStart'); await host.waitForTimeout(500);
    // registrer alle tal, der skrives i pengefelterne, og alle lyde
    await host.evaluate(() => {
      window.__seen = []; window.__snd = [];
      const orig = Sfx.play; Sfx.play = (n, d) => { window.__snd.push(n); return orig(n, d); };
      new MutationObserver(ms => ms.forEach(m => { const t = m.target.textContent || (m.target.parentNode && m.target.parentNode.textContent); if (t) window.__seen.push(t); }))
        .observe(document.getElementById('playersBox'), { subtree: true, characterData: true, childList: true });
    });
    // tre betalinger i træk (collectEach-agtigt), en fallit til kreditor
    await host.evaluate(() => { [1, 2, 3].forEach(k => { state.players[k].money -= 25; state.players[0].money += 25; }); broadcast(); });
    await host.waitForTimeout(150);
    await host.evaluate(() => { state.players[0].money += 200; broadcast(); });
    await host.waitForTimeout(1000);
    await host.screenshot({ path: `${OUT}/fx_${rm}.png` });
    await host.evaluate(() => { state.players[3].money = 40; bankrupt(state.players[3], state.players[1]); });
    await host.waitForTimeout(1200);
    const r = await host.evaluate(() => ({ snd: window.__snd, money: state.players.map(p => p.money), bad: window.__seen.filter(t => /-|\d{2}\.\d{3}\.\d{3}/.test(t.replace(/[^\d.\-]/g, '')) ).slice(0, 5), shown: [...document.querySelectorAll('#playersBox .money')].map(e => e.textContent) }));
    out[rm] = { ...r, errs };
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
