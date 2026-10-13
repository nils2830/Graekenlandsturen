/* =====================================================================
   3D-terninger (CSS). Bruges på både brættet og telefonerne.
   const d = Dice.create(container); d.wiggle(); d.land([3, 5]);

   Terningen er en massiv kube: seks afrundede sider uden på en indre
   kube med skarpe hjørner, så hjørnerne aldrig bliver gennemsigtige.
   Al bevægelse styres fra én requestAnimationFrame-løkke: først triller
   kuben med fast fart, og når resultatet kommer, bremser den jævnt ned
   fra præcis samme fart til den rigtige side. Der er derfor intet hop.
   ===================================================================== */
"use strict";

const Dice = (() => {
  const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  // Rotation (x, y) der vender en given side mod beskueren
  const FACE_ROT = { 1: [0, 0], 2: [90, 0], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 6: [0, 180] };
  // Trillefart i grader pr. sekund; begge positive, så landingen fortsætter samme vej
  const SPIN = [[560, 720], [650, 470]];
  const THROW = [[900, 1100], [1000, 820]]; // startfart, når terningen kastes fra hvile
  const LAND_MS = 1150;
  const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function faceHTML(v) {
    let h = "";
    for (let k = 0; k < 9; k++) h += `<i class="${PIPS[v].includes(k) ? "pip" : ""}"></i>`;
    return `<div class="face f${v}">${h}</div>`;
  }

  function create(container) {
    container.classList.add("dice-pair");
    container.innerHTML = [0, 1].map(() =>
      `<div class="die-wrap"><div class="die-cube">
        ${[1, 2, 3, 4, 5, 6].map(v => `<div class="core f${v}"></div>`).join("")}
        ${[1, 2, 3, 4, 5, 6].map(faceHTML).join("")}
      </div><div class="die-shadow"></div></div>`
    ).join("");
    const wraps = [...container.querySelectorAll(".die-wrap")];
    const cubes = [...container.querySelectorAll(".die-cube")];
    const rot = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    let current = [5, 2], raf = null, mode = "idle", last = 0, landing = null;

    const apply = k => { cubes[k].style.transform = `rotateX(${rot[k].x.toFixed(2)}deg) rotateY(${rot[k].y.toFixed(2)}deg)`; };
    // Hold vinklerne små, så de ikke vokser gennem et langt spil
    const normalize = () => rot.forEach(r => { r.x %= 360; r.y %= 360; });

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      mode = "idle";
    }

    function show(vals) {
      stop();
      current = vals.slice();
      wraps.forEach(w => { w.classList.remove("rolling", "thrown"); w.style.removeProperty("--from"); });
      vals.forEach((v, k) => { rot[k].x = FACE_ROT[v][0]; rot[k].y = FACE_ROT[v][1]; apply(k); });
    }

    function loop(t) {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (mode === "spin") {
        rot.forEach((r, k) => { r.x += SPIN[k][0] * dt; r.y += SPIN[k][1] * dt; apply(k); });
      } else if (mode === "land") {
        const s = Math.min(1, (t - landing.t0) / LAND_MS);
        landing.axes.forEach(a => {
          // Hermite-kurve: starter med den aktuelle fart og ender i ro
          const h = (s * s * s - 2 * s * s + s) * a.m0 + (-2 * s * s * s + 3 * s * s);
          rot[a.k][a.ax] = a.a0 + a.d * h;
        });
        rot.forEach((r, k) => apply(k));
        if (s >= 1) { stop(); normalize(); rot.forEach((r, k) => apply(k)); landing.done(); return; }
      }
      raf = requestAnimationFrame(loop);
    }

    function wiggle() {
      if (mode === "spin" || reduced()) return;
      stop();
      wraps.forEach(w => { w.classList.remove("thrown"); w.style.removeProperty("--from"); w.classList.add("rolling"); });
      mode = "spin";
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }

    function land(vals) {
      const spinning = mode === "spin";
      stop();
      current = vals.slice();
      if (reduced()) { show(vals); return Promise.resolve(); }
      const speed = spinning ? SPIN : THROW;
      const T = LAND_MS / 1000;
      const axes = [];
      vals.forEach((v, k) => {
        const [bx, by] = FACE_ROT[v];
        [["x", bx], ["y", by]].forEach(([ax, base], j) => {
          const v0 = speed[k][j];
          const a0 = rot[k][ax];
          // Nok afstand til en blød opbremsning (hældning højst 3 for en monoton kurve)
          const minD = Math.max(v0 * T / 2.6, 360);
          const a1 = base + 360 * Math.ceil((a0 + minD - base) / 360);
          const d = a1 - a0;
          axes.push({ k, ax, a0, d, m0: v0 * T / d });
        });
      });
      // Kastet starter fra den højde, hoppet var nået til, så der ikke er et ryk
      wraps.forEach((w, k) => {
        let from = 0;
        if (spinning) { try { from = new DOMMatrixReadOnly(getComputedStyle(w).transform).m42; } catch (e) { from = 0; } }
        w.classList.remove("rolling", "thrown");
        w.style.setProperty("--from", from + "px");
        void w.offsetWidth;
        w.style.animationDelay = (k * 60) + "ms";
        w.classList.add("thrown");
      });
      return new Promise(resolve => {
        landing = { t0: performance.now(), axes, done: resolve };
        mode = "land";
        last = performance.now();
        raf = requestAnimationFrame(loop);
      });
    }

    show(current);
    return { show, wiggle, land, get value() { return current; } };
  }
  return { create };
})();
