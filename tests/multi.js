const { chromium } = require('playwright');
const OUT = process.argv[2];
const TURNS = +(process.argv[3] || 18);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const errors = [];
  const watch = (pg, name) => {
    pg.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
  };
  const host = await ctx.newPage(); watch(host, 'host');
  await host.setViewportSize({ width: 1600, height: 900 });
  await host.goto('http://localhost:8765/index.html?lokal=1');
  await host.click('[data-count="3"]');
  await host.click('#setupForm button[type=submit]');
  await host.waitForTimeout(300);
  const code = (await host.textContent('.join-code')).trim();
  const phones = [];
  for (let k = 0; k < 3; k++) {
    const pg = await ctx.newPage(); watch(pg, 'phone' + k);
    await pg.setViewportSize({ width: 390, height: 844 });
    await pg.goto(`http://localhost:8765/telefon.html?rum=${code}&lokal=1&cid=test${k}`);
    await pg.waitForSelector('[data-claim]', { timeout: 8000 });
    if (k === 0) await pg.screenshot({ path: OUT + '/p0_pick.png' });
    await pg.click(`[data-claim="${k}"]`);
    await pg.waitForTimeout(300);
    phones.push(pg);
  }
  await phones[0].screenshot({ path: OUT + '/p1_lobby.png' });
  await host.screenshot({ path: OUT + '/m0_lobby.png' });
  await host.click('#lobbyStart');
  await host.waitForTimeout(500);
  const shots = new Set();
  let actions = 0, turnsSeen = 0, lastRoundTurn = -1;
  const t0 = Date.now();
  while (Date.now() - t0 < 420000) {
    const phase = await host.evaluate(() => state.phase);
    if (phase === 'over') break;
    const st = await host.evaluate(() => ({ round: state.round, cur: state.current, quiz: !!state.quiz }));
    const key = st.round * 10 + st.cur;
    if (key !== lastRoundTurn) { lastRoundTurn = key; turnsSeen++; if (turnsSeen === TURNS) await host.evaluate(() => { state.maxRounds = state.round; }); }
    let acted = false;
    for (let k = 0; k < 3; k++) {
      const pg = phones[k];
      const info = await pg.evaluate(() => V && V.prompt ? { kind: V.prompt.kind, id: V.prompt.id } : null);
      if (!info) continue;
      const tag = info.kind;
      if (!shots.has(tag)) { shots.add(tag); await pg.waitForTimeout(250); await pg.screenshot({ path: OUT + `/p_${tag}.png` }); if (tag === 'quiz' || tag === 'card' || tag === 'buy') await host.screenshot({ path: OUT + `/m_${tag}.png` }); }
      if (tag === 'roll') { const b = await pg.$('#rollBtn:not(:disabled)'); if (b) { await b.click(); acted = true; } }
      else if (tag === 'quiz') { const bs = await pg.$$('[data-quiz]:not(:disabled)'); if (bs.length) { await bs[Math.floor(Math.random() * bs.length)].click(); acted = true; } }
      else if (tag === 'buy') { const b = await pg.$('[data-answer="buy"]:not(:disabled)') || await pg.$('[data-answer="pass"]'); if (b) { await b.click(); acted = true; } }
      else if (tag === 'end') {
        // prøv at bygge via ejendomsfanen
        await pg.click('[data-goto="props"]');
        await pg.waitForTimeout(150);
        if (!shots.has('props')) { shots.add('props'); await pg.screenshot({ path: OUT + '/p_props.png' }); }
        const bb = await pg.$('[data-manage="build"]:not(:disabled)');
        if (bb) { await bb.click(); await pg.waitForTimeout(150); }
        await pg.click('#tabs [data-tab="game"]');
        await pg.waitForTimeout(100);
        const e = await pg.$('[data-answer="end"]'); if (e) { await e.click(); acted = true; }
      }
      else if (tag === 'debt') {
        await pg.click('[data-goto="props"]'); await pg.waitForTimeout(150);
        const m = await pg.$('[data-manage="sell"]:not(:disabled)') || await pg.$('[data-manage="mortgage"]:not(:disabled)');
        if (m) { await m.click(); await pg.waitForTimeout(200); await pg.click('#tabs [data-tab="game"]'); acted = true; continue; }
        await pg.click('#tabs [data-tab="game"]'); await pg.waitForTimeout(100);
        const pay = await pg.$('[data-answer="pay"]:not(:disabled)') || await pg.$('[data-answer="bankrupt"]');
        if (pay) { await pay.click(); acted = true; }
      }
      else { const b = await pg.$('[data-answer]:not(:disabled)'); if (b) { await b.click(); acted = true; } }
      if (acted) actions++;
    }
    if (!shots.has('wait') && turnsSeen > 3) { shots.add('wait'); await phones[2].screenshot({ path: OUT + '/p_wait.png' }); }
    if (!shots.has('mid') && turnsSeen > 10) { shots.add('mid'); await host.screenshot({ path: OUT + '/m_mid.png' }); }
    await host.waitForTimeout(acted ? 150 : 250);
  }
  await host.waitForTimeout(800);
  await host.screenshot({ path: OUT + '/m_end.png' });
  await phones[1].screenshot({ path: OUT + '/p_end.png' });
  const summary = await host.evaluate(() => ({ phase: state.phase, round: state.round, players: state.players.map(p => [p.name, p.money, p.pos, p.bankrupt]),
    owned: Object.values(state.props).filter(p => p.owner !== null).length, levels: Object.values(state.props).reduce((a, p) => a + p.level, 0), feed: state.feed.slice(-6).map(f => f.html) }));
  console.log(JSON.stringify({ actions, turnsSeen, shots: [...shots], summary, errors }, null, 1));
  await browser.close();
})();
