const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/index.html?lokal=1');
  const res = await p.evaluate(async () => {
    const out = {};
    for (const name of Sfx.names) {
      const ctx = new OfflineAudioContext(1, 44100 * 3.2, 44100);
      Sfx.render(ctx, name, 0.01);
      const buf = await ctx.startRendering();
      const d = buf.getChannelData(0);
      let peak = 0, sum = 0, nan = 0, last = 0;
      for (let i = 0; i < d.length; i++) { const v = d[i]; if (!isFinite(v)) { nan++; continue; } const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; if (a > 0.003) last = i; }
      out[name] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), dur: +(last / 44100).toFixed(2), nan };
    }
    return out;
  });
  console.log(JSON.stringify({ res, errs }, null, 0));
  await b.close();
})();
