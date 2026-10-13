/* =====================================================================
   Lyde til den store skærm, lavet med Web Audio (ingen lydfiler).
   Sfx.play("dice"); Sfx.toggle(); Sfx.unlock() kaldes ved første klik.
   Alle lyde kan også tegnes i en OfflineAudioContext til test:
   Sfx.render(ctx, navn, tid)
   ===================================================================== */
"use strict";

const Sfx = (() => {
  const KEY = "polis-lyd";
  let ctx = null, master = null, enabled = true;
  try { enabled = localStorage.getItem(KEY) !== "0"; } catch (e) { /* standard: til */ }

  /* ---------- Byggeklodser ---------- */
  function noiseBuffer(c) {
    if (c._noise) return c._noise;
    const len = Math.floor(c.sampleRate * 1.0);
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed / 0x3fffffff - 1; }
    c._noise = b;
    return b;
  }
  // Én tone med blød start og eksponentiel hale
  function tone(c, out, t, { f, type = "sine", dur = 0.4, vol = 0.3, attack = 0.004, glideTo = null, glide = 0.1 }) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + glide);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  // Klokke: grundtone plus lidt uharmoniske overtoner
  function bell(c, out, t, f, vol = 0.22, dur = 0.9) {
    [[1, 1], [2.0, 0.35], [2.76, 0.22], [5.4, 0.08]].forEach(([m, a], k) =>
      tone(c, out, t, { f: f * m, dur: dur * (k ? 0.55 : 1), vol: vol * a, attack: 0.003 }));
  }
  // Kort støjstød gennem et båndpasfilter (klik, klak, papir)
  function burst(c, out, t, { freq = 2500, q = 1.5, dur = 0.05, vol = 0.3, sweepTo = null }) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = q;
    bp.frequency.setValueAtTime(freq, t);
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }
  const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, E6: 1318.5, G6: 1568, C4: 261.63, E4: 329.63, G4: 392, A4: 440, F4: 349.23, D4: 293.66 };

  /* ---------- Lydene ---------- */
  const SOUNDS = {
    // Terningerne klaprer på bordet og falder til ro (passer til landingen på 1,15 s)
    dice(c, out, t) {
      const hits = [0, 0.07, 0.15, 0.21, 0.32, 0.41, 0.55, 0.68, 0.84, 0.98, 1.08];
      hits.forEach((h, k) => {
        const v = 0.42 * (1 - k / (hits.length + 2));
        burst(c, out, t + h + Math.random() * 0.02, { freq: 1800 + Math.random() * 1800, q: 3, dur: 0.035 + Math.random() * 0.02, vol: v });
        if (k % 3 === 0) tone(c, out, t + h, { f: 180 + Math.random() * 60, type: "sine", dur: 0.06, vol: v * 0.5 });
      });
    },
    // Brikken hopper ét felt: blødt trætok
    hop(c, out, t) {
      const f = 560 + Math.random() * 80;
      tone(c, out, t, { f, glideTo: f * 0.6, glide: 0.05, dur: 0.08, vol: 0.2 });
      burst(c, out, t, { freq: 3200, q: 4, dur: 0.02, vol: 0.05 });
    },
    // Penge ind: to klare mønt-klokker
    gain(c, out, t) {
      bell(c, out, t, N.B5, 0.16, 0.25);
      bell(c, out, t + 0.075, N.E6, 0.2, 0.75);
      burst(c, out, t + 0.075, { freq: 7000, q: 0.8, dur: 0.12, vol: 0.05 });
    },
    // Penge ud: dæmpet mønt der triller ned (ikke en "fejl"-lyd)
    pay(c, out, t) {
      [N.G5, N.E5, N.C5].forEach((f, k) => tone(c, out, t + k * 0.07, { f, type: "triangle", dur: 0.24, vol: 0.2 - k * 0.03 }));
      burst(c, out, t, { freq: 5000, q: 1, dur: 0.08, vol: 0.04 });
    },
    // Køb: et stempel på skødet og en lille fanfare
    buy(c, out, t) {
      tone(c, out, t, { f: 140, glideTo: 60, glide: 0.12, dur: 0.18, vol: 0.4 });
      burst(c, out, t, { freq: 900, q: 0.7, dur: 0.09, vol: 0.25 });
      [N.C5, N.E5, N.G5, N.C6].forEach((f, k) => bell(c, out, t + 0.12 + k * 0.07, f, 0.11, 0.6));
    },
    // Byg et alter eller tempel: stenklonk og en lys tone
    build(c, out, t) {
      tone(c, out, t, { f: 220, glideTo: 110, glide: 0.08, dur: 0.14, vol: 0.32 });
      burst(c, out, t, { freq: 1400, q: 2, dur: 0.06, vol: 0.2 });
      bell(c, out, t + 0.1, N.G5, 0.12, 0.7);
    },
    // Et kort vendes
    card(c, out, t) {
      burst(c, out, t, { freq: 700, q: 0.9, dur: 0.22, vol: 0.22, sweepTo: 4200 });
      bell(c, out, t + 0.18, N.A5, 0.07, 0.5);
    },
    // Ny tur: blid lyre-tone
    turn(c, out, t) {
      tone(c, out, t, { f: N.G4, type: "triangle", dur: 0.6, vol: 0.12 });
      tone(c, out, t + 0.11, { f: N.D5, type: "triangle", dur: 0.8, vol: 0.12 });
    },
    // Visdomsprøven starter
    quiz(c, out, t) {
      [N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, k) => bell(c, out, t + k * 0.06, f, 0.08, 0.5));
    },
    tick(c, out, t) { burst(c, out, t, { freq: 3800, q: 3, dur: 0.025, vol: 0.55 }); tone(c, out, t, { f: 1900, dur: 0.03, vol: 0.05 }); },
    correct(c, out, t) { [N.C6, N.E6, N.G6].forEach((f, k) => bell(c, out, t + k * 0.09, f, 0.13, 0.9)); },
    wrong(c, out, t) {
      tone(c, out, t, { f: 196, type: "triangle", dur: 0.35, vol: 0.16 });
      tone(c, out, t + 0.16, { f: 147, type: "triangle", dur: 0.5, vol: 0.16 });
    },
    // Eksil: dyb gongong
    exile(c, out, t) {
      [[98, 0.4, 2.6], [98 * 2.4, 0.16, 1.6], [98 * 3.9, 0.08, 1.1], [98 * 5.3, 0.05, 0.8]].forEach(([f, v, d]) =>
        tone(c, out, t, { f, dur: d, vol: v, attack: 0.006 }));
      burst(c, out, t, { freq: 600, q: 0.6, dur: 0.15, vol: 0.12 });
    },
    bankrupt(c, out, t) {
      [N.E5, N.C5, N.A4, N.F4].forEach((f, k) => tone(c, out, t + k * 0.22, { f, type: "triangle", dur: 0.5, vol: 0.14 }));
    },
    // Sejr: en kort fanfare
    victory(c, out, t) {
      const seq = [[N.C5, 0], [N.E5, 0.14], [N.G5, 0.28], [N.C6, 0.42]];
      seq.forEach(([f, d]) => {
        tone(c, out, t + d, { f, type: "sawtooth", dur: 0.3, vol: 0.05 });
        bell(c, out, t + d, f, 0.1, 0.5);
      });
      [N.C5, N.E5, N.G5, N.C6].forEach(f => tone(c, out, t + 0.6, { f, type: "triangle", dur: 1.6, vol: 0.08, attack: 0.03 }));
      bell(c, out, t + 0.6, N.C6, 0.12, 1.6);
    }
  };

  function chain(c) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    const g = c.createGain();
    g.gain.value = 0.9;
    comp.connect(g).connect(c.destination);
    return comp;
  }

  function unlock() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = chain(ctx);
      }
      if (ctx.state === "suspended") ctx.resume();
    } catch (e) { ctx = null; }
  }
  let lastPlay = {};
  function play(name, delay = 0) {
    if (!enabled || !ctx || !SOUNDS[name] || ctx.state !== "running") return;
    const now = ctx.currentTime;
    // Samme lyd højst ca. 12 gange i sekundet (fx mange hop i træk)
    if (lastPlay[name] && now - lastPlay[name] < 0.08) return;
    lastPlay[name] = now;
    try { SOUNDS[name](ctx, master, now + 0.01 + delay); } catch (e) { /* lyd må aldrig stoppe spillet */ }
  }
  function render(c, name, t = 0) { SOUNDS[name](c, chain(c), t); }
  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem(KEY, enabled ? "1" : "0"); } catch (e) { /* ignorer */ }
    if (enabled) { unlock(); play("turn"); }
  }
  ["pointerdown", "keydown"].forEach(ev => window.addEventListener(ev, unlock, { passive: true }));

  return { play, unlock, render, setEnabled, get enabled() { return enabled; }, names: Object.keys(SOUNDS) };
})();
