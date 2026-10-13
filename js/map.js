/* =====================================================================
   Kort: afstande fra lejligheden, et stiliseret oversigtskort (SVG)
   og et interaktivt kort med gader (Leaflet + OpenStreetMap/CARTO).
   Kræver data.js (SPACES, GEO, HOME) og regionmap.js (REGION_MAP).
   ===================================================================== */
"use strict";

/* Nøgle til CARTO's kortfliser. Den står synligt i siden, som det er meningen
   med browsernøgler; begræns den gerne til jeres domæne i CARTO's indstillinger. */
const MAP_TILE_KEY = "cb1_4jbl_1_b4a3518d389823c4feabfc7d";

const MapKit = (() => {
  const rad = d => d * Math.PI / 180;
  const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-bidragydere';
  let cartoDown = false;

  /* Afstand i luftlinje (haversine), i kilometer */
  function distKm(a, b) {
    const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  function fmtDist(km) {
    if (km < 0.95) return `${Math.max(50, Math.round(km * 1000 / 50) * 50)} m`;
    if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
    return `${Math.round(km)} km`;
  }
  const READY = !!(HOME.geo && HOME.geo[0]);
  const geoOf = i => (READY && SPACES[i] && SPACES[i].geo) || null;
  function distanceText(i) {
    const g = geoOf(i);
    if (!g) return "";
    const km = distKm(HOME.geo, g);
    return km < 0.08 ? "Lige ved lejligheden" : `${fmtDist(km)} fra lejligheden`;
  }

  /* Ét kortpunkt pr. sted (Agora-felterne deler punkt) */
  const PLACES = [];
  const own = sp => sp.geo && sp.img === sp.geoKey;
  if (READY) SPACES.filter(own).concat(SPACES.filter(sp => sp.geo && !own(sp))).forEach(sp => {
    if (PLACES.some(p => p.key === sp.geoKey)) return;
    PLACES.push({ key: sp.geoKey, i: sp.i, name: sp.mapName || sp.name, geo: sp.geo, color: sp.group ? GROUPS[sp.group].color : "#0d5eaf" });
  });

  /* ---------------- Stiliseret oversigtskort ---------------- */
  function project(g) {
    const R = REGION_MAP;
    const x = R.k * rad(g[1]) + R.tx;
    const y = R.ty - R.k * Math.log(Math.tan(Math.PI / 4 + rad(g[0]) / 2));
    return [x, y];
  }
  const TOWNS = [
    { name: "Nafplio", geo: [37.5673, 22.8015], dx: -16, dy: 34, anchor: "end" },
    { name: "Mykene", geo: [37.7308, 22.7564], dx: -16, dy: 6, anchor: "end" },
    { name: "Epidauros", geo: [37.5961, 23.0794], dx: 16, dy: 6, anchor: "start" },
    { name: "Korinth-kanalen", geo: [37.9310, 22.9840], dx: -14, dy: -16, anchor: "end" },
    { name: "Athen", geo: [37.9750, 23.7300], dx: 0, dy: -24, anchor: "middle" },
    { name: "Piræus", geo: [37.9420, 23.6380], dx: -14, dy: 30, anchor: "end" }
  ];
  function regionSVG(focusIdx, opts = {}) {
    const R = REGION_MAP;
    const home = project(HOME.geo);
    const f = focusIdx !== undefined && focusIdx !== null ? geoOf(focusIdx) : null;
    const fp = f ? project(f) : null;
    const dots = PLACES.map(p => {
      const [x, y] = project(p.geo);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${p.color}" stroke="#151515" stroke-width="2"/>`;
    }).join("");
    const towns = opts.labels === false ? "" : TOWNS.map(t => {
      const [x, y] = project(t.geo);
      return `<text x="${(x + t.dx).toFixed(1)}" y="${(y + t.dy).toFixed(1)}" text-anchor="${t.anchor}" class="rm-town">${t.name}</text>`;
    }).join("");
    let focus = "";
    if (fp) {
      focus = `<line x1="${home[0].toFixed(1)}" y1="${home[1].toFixed(1)}" x2="${fp[0].toFixed(1)}" y2="${fp[1].toFixed(1)}" class="rm-line"/>
        <circle cx="${fp[0].toFixed(1)}" cy="${fp[1].toFixed(1)}" r="30" class="rm-pulse"/>
        <circle cx="${fp[0].toFixed(1)}" cy="${fp[1].toFixed(1)}" r="15" fill="#d7263d" stroke="#fff" stroke-width="5"/>`;
    }
    const house = `<g transform="translate(${home[0].toFixed(1)} ${home[1].toFixed(1)})" class="rm-home">
        <circle r="19" fill="#f2c14e" stroke="#151515" stroke-width="3"/>
        <path d="M-10 1 0 -9 10 1 M-7 -1 V9 H7 V-1" fill="none" stroke="#151515" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></g>`;
    return `<svg class="regionmap" viewBox="0 0 ${R.w} ${R.h}" role="img" aria-label="Oversigtskort over Argolis og Athen${f ? " med stedet markeret" : ""}">
      <rect width="${R.w}" height="${R.h}" class="rm-land"/>
      <path d="${R.sea}" fill-rule="evenodd" class="rm-sea"/>
      ${towns}${dots}${focus}${house}
    </svg>`;
  }

  /* ---------------- Interaktivt kort (Leaflet) ---------------- */
  const HOUSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8M6 9.5V20h12V9.5" fill="none" stroke="#151515" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  function interactive(el, opts = {}) {
    if (typeof L === "undefined") { el.innerHTML = '<p class="map-missing">Kortet kunne ikke indlæses.</p>'; return null; }
    const still = !!opts.static;
    const map = L.map(el, { zoomControl: !still, attributionControl: true, scrollWheelZoom: !!opts.wheel && !still, dragging: !still,
      touchZoom: !still, doubleClickZoom: !still, boxZoom: !still, keyboard: !still, zoomSnap: still ? 0.25 : 1 });
    // CARTO Voyager med jeres nøgle. Kan fliserne slet ikke hentes, skiftes der til OpenStreetMap
    // (gælder også alle senere kort). En afvist nøgle giver derimod CARTO's vandmærke, som
    // browseren ikke kan skelne fra et rigtigt kort; sæt da MAP_TILE_KEY til "" for at bruge OpenStreetMap.
    const osmLayer = () => L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: OSM_ATTR });
    let tiles = (cartoDown || !MAP_TILE_KEY) ? osmLayer() : L.tileLayer(`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${encodeURIComponent(MAP_TILE_KEY)}`, {
      maxZoom: 19,
      attribution: OSM_ATTR + ' &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
    });
    tiles.addTo(map);
    if (!cartoDown && MAP_TILE_KEY) {
      let ok = 0, bad = 0;
      tiles.on("tileload", () => { ok++; });
      tiles.on("tileerror", () => {
        if (cartoDown) return;
        if (++bad < (ok ? 4 : 1)) return;   // intet hentet endnu: skift straks
        cartoDown = true;
        map.removeLayer(tiles);
        tiles = osmLayer().addTo(map);
      });
    }
    const markers = {};
    PLACES.forEach(p => {
      const icon = L.divIcon({ className: "mpin-wrap", html: `<span class="mpin" style="--c:${p.color}"><i></i></span>`, iconSize: [30, 38], iconAnchor: [15, 36], tooltipAnchor: [0, -30] });
      const m = L.marker(p.geo, { icon, title: p.name, keyboard: true }).addTo(map);
      m.bindTooltip(p.name, { direction: "top", className: "mtip" });
      m.on("click", () => { focus(p.i); if (opts.onSelect) opts.onSelect(p.i); });
      markers[p.key] = m;
    });
    const homeIcon = L.divIcon({ className: "mpin-wrap", html: `<span class="mhome">${HOUSE_SVG}</span>`, iconSize: [40, 40], iconAnchor: [20, 20], tooltipAnchor: [0, -18] });
    const homeMarker = L.marker(HOME.geo, { icon: homeIcon, title: HOME.name, zIndexOffset: 1000 }).addTo(map);
    homeMarker.bindTooltip(`Lejligheden · ${HOME.name}`, { direction: "top", className: "mtip home", permanent: !still });
    const line = L.polyline([], { color: "#0d5eaf", weight: 3, dashArray: "6 8", opacity: 0.9 }).addTo(map);
    let current = null;
    // Kanten skaleres efter kortets størrelse, så et lille kort ikke zoomer helt ud
    const pad = px => { const z = map.getSize(); return [Math.min(px, Math.round(z.x / 6)), Math.min(px, Math.round(z.y / 6))]; };

    function setActive(key) {
      Object.entries(markers).forEach(([k, m]) => {
        const node = m.getElement();
        if (node) node.classList.toggle("active", k === key);
        m.setZIndexOffset(k === key ? 900 : 0);
      });
    }
    function focus(i) {
      const g = geoOf(i);
      if (!g) return overview();
      current = SPACES[i].geoKey;
      setActive(current);
      line.setLatLngs([HOME.geo, g]);
      const km = distKm(HOME.geo, g);
      if (km < 0.25) map.setView([(HOME.geo[0] + g[0]) / 2, (HOME.geo[1] + g[1]) / 2], 17);
      else map.fitBounds(L.latLngBounds([HOME.geo, g]), { padding: pad(46), maxZoom: 17 });
    }
    function overview(nafplio) {
      current = null;
      setActive(null);
      line.setLatLngs([]);
      const pts = nafplio ? PLACES.filter(p => distKm(HOME.geo, p.geo) < 6).map(p => p.geo) : PLACES.map(p => p.geo);
      map.fitBounds(L.latLngBounds(pts.concat([HOME.geo])), { padding: pad(30) });
    }
    overview();
    return { map, focus, overview, refresh: () => map.invalidateSize(), get current() { return current; } };
  }

  return { distKm, fmtDist, distanceText, regionSVG, interactive, PLACES, geoOf };
})();
