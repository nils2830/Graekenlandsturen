/* =====================================================================
   3D-terninger (CSS). Bruges på både brættet og telefonerne.
   const d = Dice.create(container); d.wiggle(); d.land([3, 5]);

   Terningen er en massiv kube: seks sider plus tre indre kerneplader,
   så de afrundede hjørner aldrig bliver gennemsigtige. Mens vi venter
   på resultatet, triller kuben med en fast fart styret fra JavaScript.
   Når resultatet kommer, fortsætter den samme rotation glidende ned
   på den rigtige side, så der aldrig er et hop i bevægelsen.
   ===================================================================== */
"use strict";

const Dice = (() => {
  const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  // Rotation (x, y) der vender en given side mod beskueren
  const FACE_ROT = { 1: [0, 0], 2: [90, 0], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 6: [0, 180] };
  // Trillefart i grader pr. sekund; begge positive, så landingen fortsætter samme vej
  const SPIN = [[560, 720], [650, 470]];
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
        <div class="core cx"></div><div class="core cy"></div><div class="core cz"></div>
        ${[1, 2, 3, 4, 5, 6].map(faceHTML).join("")}
      </div><div class="die-shadow"></div></div>`
    ).join("");
    const wraps = [...container.querySelectorAll(".die-wrap")];
    const cubes = [...container.querySelectorAll(".die-cube")];
    const rot = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    let current = [5, 2], raf = null, last = 0;

    const apply = k => { cubes[k].style.transform = `rotateX(${rot[k].x.toFixed(2)}deg) rotateY(${rot[k].y.toFixed(2)}deg)`; };
    const instant = on => cubes.forEach(c => c.classList.toggle("no-anim", on));

    function stopSpin() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      wraps.forEach(w => w.classList.remove("rolling"));
    }

    function show(vals) {
      stopSpin();
      current = vals.slice();
      instant(true);
      vals.forEach((v, k) => { rot[k].x = FACE_ROT[v][0]; rot[k].y = FACE_ROT[v][1]; apply(k); });
      void container.offsetWidth;
      instant(false);
    }

    function wiggle() {
      if (raf || reduced()) return;
      instant(true);
      wraps.forEach(w => { w.classList.remove("thrown"); w.classList.add("rolling"); });
      last = performance.now();
      const tick = t => {
        const dt = Math.min(0.05, (t - last) / 1000);
        last = t;
        rot.forEach((r, k) => { r.x += SPIN[k][0] * dt; r.y += SPIN[k][1] * dt; apply(k); });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    function land(vals) {
      const spinning = !!raf;
      stopSpin();
      current = vals.slice();
      if (reduced()) { show(vals); return Promise.resolve(); }
      // Find det næste sæt vinkler fremad, der viser den rigtige side
      vals.forEach((v, k) => {
        const [bx, by] = FACE_ROT[v];
        const minX = rot[k].x + (spinning ? 300 : 540);
        const minY = rot[k].y + (spinning ? 240 : 360);
        rot[k].x = bx + 360 * Math.ceil((minX - bx) / 360);
        rot[k].y = by + 360 * Math.ceil((minY - by) / 360);
      });
      instant(false);
      wraps.forEach((w, k) => { w.classList.remove("thrown"); void w.offsetWidth; w.style.animationDelay = (k * 60) + "ms"; w.classList.add("thrown"); });
      vals.forEach((v, k) => apply(k));
      return new Promise(r => setTimeout(r, LAND_MS + 80));
    }

    show(current);
    return { show, wiggle, land, get value() { return current; } };
  }
  return { create };
})();
