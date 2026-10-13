const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const errors = [];
  const watch = (pg, n) => pg.on('pageerror', e => errors.push(n + ': ' + e.message));
  const host = await ctx.newPage(); watch(host, 'host');
  await host.goto('http://localhost:8765/index.html?lokal=1');
  await host.click('[data-count="3"]'); await host.click('#setupForm button[type=submit]'); await host.waitForTimeout(300);
  const code = (await host.textContent('.join-code')).trim();
  const phones = [];
  for (let k = 0; k < 3; k++) { const pg = await ctx.newPage(); watch(pg, 'p' + k); await pg.goto(`http://localhost:8765/telefon.html?rum=${code}&lokal=1&cid=c${k}`); await pg.waitForSelector('[data-claim]'); await pg.click(`[data-claim="${k}"]`); phones.push(pg); }
  await host.click('#lobbyStart'); await host.waitForTimeout(400);
  // spiller 0 kaster
  await phones[0].click('#rollBtn'); await host.waitForTimeout(3500);
  // telefon 0 genindlæses
  await phones[0].reload(); await phones[0].waitForTimeout(3500);
  const youAfterReload = await phones[0].evaluate(() => V && V.you);
  // svar hvad der end står
  for (let r = 0; r < 6; r++) { for (const pg of phones) { const b = await pg.$('#rollBtn:not(:disabled), [data-answer]:not(:disabled), [data-quiz]:not(:disabled)'); if (b) { await b.click(); await host.waitForTimeout(2500); } } }
  const before = await host.evaluate(() => ({ round: state.round, cur: state.current, money: state.players.map(p => p.money), owned: Object.values(state.props).filter(p => p.owner !== null).length }));
  // computeren genstartes
  await host.evaluate(() => { save(); state.phase = 'setup'; });
  await host.reload(); await host.waitForTimeout(500);
  const hasResume = !!(await host.$('#resumeBtn'));
  await host.click("#resumeBtn"); await host.waitForTimeout(7000);
  const lobbyText = await host.textContent('#lobbyStart');
  await host.click('#lobbyStart'); await host.waitForTimeout(800);
  const after = await host.evaluate(() => ({ round: state.round, cur: state.current, money: state.players.map(p => p.money), owned: Object.values(state.props).filter(p => p.owner !== null).length, online: state.players.map(p => isOnline(p.pid)), prompt: state.prompt && state.prompt.kind }));
  const phonePrompt = await phones[after.cur].evaluate(() => V && V.prompt && V.prompt.kind);
  console.log(JSON.stringify({ youAfterReload, hasResume, lobbyText, before, after, phonePrompt, errors }, null, 1));
  await browser.close();
})();
