/* =====================================================================
   3D-terninger (CSS). Bruges på både brættet og telefonerne.
   const d = Dice.create(container); d.wiggle(); d.land([3, 5]);
   ===================================================================== */
"use strict";

const Dice = (() => {
  const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  // Rotation der vender en given side mod beskueren
  const FACE_ROT = { 1: [0, 0], 2: [90, 0], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 6: [0, 180] };
  const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function faceHTML(v) {
    let h = "";
    for (let k = 0; k < 9; k++) h += `<i class="${PIPS[v].includes(k) ? "pip" : ""}"></i>`;
    return `<div class="face f${v}">${h}</div>`;
  }

  function create(container) {
    container.classList.add("dice-pair");
    container.innerHTML = [0, 1].map(() =>
      `<div class="die-wrap"><div class="die-cube">${[1, 2, 3, 4, 5, 6].map(faceHTML).join("")}</div><div class="die-shadow"></div></div>`
    ).join("");
    const wraps = [...container.querySelectorAll(".die-wrap")];
    const cubes = [...container.querySelectorAll(".die-cube")];
    const spins = [[0, 0], [0, 0]];
    let current = [5, 2];

    function set(k, v, animate) {
      const [bx, by] = FACE_ROT[v];
      if (animate) { spins[k][0] += 2 + Math.floor(Math.random() * 2); spins[k][1] += 1 + Math.floor(Math.random() * 2); }
      const tilt = animate ? (Math.random() * 10 - 5) : 0;
      cubes[k].style.transform = `rotateX(${bx + 360 * spins[k][0]}deg) rotateY(${by + 360 * spins[k][1]}deg) rotateZ(${tilt}deg)`;
    }
    function show(vals) {
      current = vals.slice();
      cubes.forEach(c => c.classList.add("no-anim"));
      vals.forEach((v, k) => set(k, v, false));
      void container.offsetWidth;
      cubes.forEach(c => c.classList.remove("no-anim"));
    }
    function wiggle() {
      wraps.forEach(w => w.classList.add("wiggle"));
    }
    function land(vals) {
      current = vals.slice();
      wraps.forEach(w => { w.classList.remove("wiggle", "thrown"); void w.offsetWidth; });
      if (reduced()) { show(vals); return Promise.resolve(); }
      wraps.forEach((w, k) => { w.style.animationDelay = (k * 70) + "ms"; w.classList.add("thrown"); });
      vals.forEach((v, k) => set(k, v, true));
      return new Promise(r => setTimeout(r, 1250));
    }
    show(current);
    return { show, wiggle, land, get value() { return current; } };
  }
  return { create };
})();
