/* =====================================================================
   POLIS · telefonen
   Viser spillerens egne valg, terninger og ejendomme. Brættet bestemmer alt.
   ===================================================================== */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const params = new URLSearchParams(location.search);
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* privat tilstand */ } }
};
let cid = params.get("cid") || LS.get("polis-cid");
if (!cid) { cid = Net.uid() + Net.uid(); LS.set("polis-cid", cid); }

let code = Net.cleanCode(params.get("rum") || "");
let client = null, V = null, tab = "game", connState = "idle";
let lastToastSeq = null, lastDiceSeq = null, lastPromptId = null, pendingRoll = null, diceAt = 0;
let lastKey = "", shakeOn = false, lastShake = 0;
const quizAnswered = {};
let mapSel = null, pmap = null, lastFocused = undefined;
const PIN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-7.2 7-12.5A7 7 0 0 0 5 9.5C5 14.8 12 22 12 22z" fill="#d7263d" stroke="#151515" stroke-width="1.6"/><circle cx="12" cy="9.5" r="2.6" fill="#fff"/></svg>';
const dice = Dice.create($("#phoneDice"));
const SHAPES = ["▲", "◆", "●", "■"];

const photoCache = {};
let avOpen = false;
let pendingAv = null;   // profilbillede sendt, men endnu ikke bekræftet af brættet
const coinHTML = (p, cls = "") => Avatars.html(p, cls, p && p.avatar && p.avatar.kind === "photo" ? photoCache[p.pid] : undefined);
const buzz = pattern => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ikke understøttet */ } };
const me = () => (V && V.you !== null && V.you !== undefined) ? V.players[V.you] : null;

/* ---------------- Forbindelse ---------------- */
function connect(c) {
  code = c;
  LS.set("polis-room", c);
  if (Net.cleanCode(params.get("rum") || "") !== c) history.replaceState(null, "", `?rum=${c}${Net.local ? "&lokal=1" : ""}`);
  client = Net.createClient(c, {
    onStatus(s) { connState = s; renderConn(); if (!V) render(true); },
    onOpen() {
      client.send({ t: "hello", cid });
      if (pendingAv) client.send(pendingAv.msg);
    },
    onData(m) {
      if (!m || typeof m !== "object") return;
      if (m.t === "photo") { if (Avatars.isValidPhoto(m.src)) { photoCache[m.pid] = m.src; if (V) render(true); } }
      else if (m.t === "view") { V = m; onView(); }
      else if (m.t === "error") showToast(m.msg, "minus");
      else if (m.t === "bye") setTimeout(() => client.reconnect(), 1500);
    }
  });
}

function renderConn() {
  const bar = $("#connbar");
  const msgs = {
    connecting: ["Forbinder til spillet …", ""],
    lost: ["Forbindelsen blev afbrudt. Forbinder igen …", ""],
    "no-host": [`Kan ikke finde spillet med koden ${code}. Er brættet åbent på computeren?`, "bad"]
  };
  const m = msgs[connState];
  if (!m || (connState === "connecting" && !V)) { bar.className = ""; bar.innerHTML = ""; return; }
  bar.className = "show " + m[1];
  bar.innerHTML = `<span>${esc(m[0])}</span>${connState === "no-host" ? '<button class="btn small" type="button" id="changeCode">Skift kode</button>' : ""}`;
  const b = $("#changeCode");
  if (b) b.addEventListener("click", () => { location.href = "telefon.html" + (Net.local ? "?lokal=1" : ""); LS.set("polis-room", ""); });
}

/* ---------------- Når en ny visning kommer fra brættet ---------------- */
function onView() {
  const you = V.you;
  // Bekræft et nyt profilbillede, når brættet har modtaget det
  const mine = me();
  if (pendingAv && mine && mine.avatar && (mine.avatar.v || 0) > pendingAv.baseV) {
    if (pendingAv.kind === "photo") showToast("Dit billede er nu på brættet.", "plus");
    pendingAv = null;
  }
  // Beskeder
  const maxSeq = V.toasts.reduce((m, t) => Math.max(m, t.seq), 0);
  if (lastToastSeq === null) lastToastSeq = maxSeq;
  V.toasts.forEach(t => {
    if (t.seq > lastToastSeq && (!t.to || (you !== null && t.to.includes(you)))) showToast(t.text, t.kind);
  });
  lastToastSeq = Math.max(lastToastSeq, maxSeq);
  // Terninger
  if (lastDiceSeq === null) { lastDiceSeq = V.dice.seq; dice.show(V.dice.d); }
  else if (V.dice.seq !== lastDiceSeq) {
    lastDiceSeq = V.dice.seq;
    diceAt = Date.now();
    const mine = V.dice.pid === you;
    $("#diceSum").textContent = "";
    dice.land(V.dice.d).then(() => {
      const who = V.players[V.dice.pid];
      $("#diceSum").textContent = `${mine ? "Du" : who ? who.name : ""} slog ${V.dice.d[0] + V.dice.d[1]}${V.dice.d[0] === V.dice.d[1] ? " · to ens!" : ""}`;
      if (mine) buzz([25, 40, 25]);
    });
    pendingRoll = null;
  }
  // Ny opgave til mig
  if (V.prompt && V.prompt.id !== lastPromptId) {
    lastPromptId = V.prompt.id;
    if (["roll", "buy", "exile", "debt", "quiz", "card"].includes(V.prompt.kind)) buzz(V.prompt.kind === "roll" ? [120, 60, 120] : 90);
    if (V.prompt.kind !== "end") tab = "game";
  }
  render();
}

/* ---------------- Tegning ---------------- */
function render(force) {
  renderTop();
  const showTabs = V && V.you !== null && V.you !== undefined && (V.phase === "play" || V.phase === "over");
  $("#tabs").hidden = !showTabs;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  const myTurnBadge = showTabs && V.prompt && tab !== "game";
  $("#tabs [data-tab=game]").innerHTML = "Spil" + (myTurnBadge ? '<span class="badge"></span>' : "");

  const key = JSON.stringify([tab, code, connState === "no-host", V && [V.you, V.phase, V.prompt, V.spot, V.activity, V.canManage, V.round,
    V.players.map(p => [p.money, p.online, p.taken, p.bankrupt, p.inExile, p.amnesty, p.avatar]), tab === "game" ? 0 : V.props, V.cur], quizAnswered, mapSel, avOpen, Object.keys(photoCache).map(k => photoCache[k].length)]);
  if (!force && key === lastKey) return;
  lastKey = key;

  let top = "", bottom = "", showDice = false;
  if (!code) [top, bottom] = joinCodeView();
  else if (!V) [top, bottom] = [heroHTML("Forbinder til spillet …"), ""];
  else if (V.you === null || V.you === undefined) [top, bottom] = pickPlayerView();
  else if (V.phase === "lobby") [top, bottom] = lobbyView();
  else if (tab === "props") [top, bottom] = propsView();
  else if (tab === "players") [top, bottom] = playersView();
  else if (tab === "map") [top, bottom] = mapView();
  else if (V.phase === "over") [top, bottom] = overView();
  else if (V.prompt) [top, bottom, showDice] = promptView(V.prompt);
  else [top, bottom, showDice] = waitView();

  $("#view").innerHTML = top;
  $("#view2").innerHTML = bottom;
  $("#diceHost").hidden = !showDice;
  const showMap = tab === "map" && !!V && V.you !== null && V.you !== undefined && (V.phase === "play" || V.phase === "over");
  $("#mapHost").hidden = !showMap;
  if (showMap) ensureMap();
  bindHandlers();
}

function renderTop() {
  const p = me();
  if (!p) { $("#top").innerHTML = '<span class="logo">ΠΟΛΙΣ</span>'; return; }
  const round = V.maxRounds ? `Runde ${V.round} af ${V.maxRounds}` : `Runde ${V.round}`;
  $("#top").innerHTML = `${coinHTML(p)}<div class="who"><b>${esc(p.name)}</b><small>${round}${p.inExile ? " · i eksil" : ""}</small></div><div class="money num">${fmt(p.money)}</div>`;
}

function heroHTML(sub) {
  return `<div class="hero"><h1>ΠΟΛΙΣ</h1><p>Nafplio · Athen</p></div>${sub ? `<p class="lead" style="text-align:center">${esc(sub)}</p>` : ""}`;
}

function joinCodeView() {
  const last = LS.get("polis-room") || "";
  return [heroHTML(""), `<form class="panel stack" id="codeForm">
      <label class="label" for="codeIn">Skriv koden fra skærmen</label>
      <input class="code-input" id="codeIn" maxlength="6" autocomplete="off" autocapitalize="characters" value="${esc(last)}" placeholder="ABCD">
      <button class="btn primary huge" type="submit">Deltag</button>
      <p class="muted" style="margin:0">Du kan også scanne QR-koden på skærmen med kameraet.</p>
    </form>`];
}

function pickPlayerView() {
  const rows = V.players.map(p => {
    const busy = p.taken && p.online;
    return `<button class="pick" type="button" data-claim="${p.pid}" ${busy ? "disabled" : ""}>${coinHTML(p)}<span>${esc(p.name)}</span><small>${busy ? "Valgt" : p.bankrupt ? "Fallit" : "Vælg"}</small></button>`;
  }).join("");
  return [heroHTML(""), `<div class="panel stack"><div class="label">Hvem er du?</div>${rows}
    <p class="muted" style="margin:0">Navnene er skrevet ind på computeren. Tryk på dit eget.</p></div>`];
}

function avatarPanel(p) {
  return `<div class="panel stack" id="avPanel"><div class="label">Dit profilbillede</div>
    <p class="muted" style="margin:0">Vælg et symbol, eller tag en selfie. Billedet bliver vist på brættet og hos de andre.</p>
    ${Avatars.pickerHTML(p.color, p.avatar, { dark: true, camera: true, fallback: "spartan-helmet" })}</div>`;
}
function lobbyView() {
  const p = me();
  return [`<div class="panel" style="text-align:center">${coinHTML(p, "hero")}
      <h2 class="big" style="margin-top:10px">Du er ${esc(p.name)}</h2>
      <p class="lead">${V.resume ? "Spillet fortsætter, så snart nogen trykker Fortsæt på skærmen." : "Venter på, at spillet bliver startet på skærmen."}</p></div>
      ${avatarPanel(p)}`,
    `<div class="panel stack"><div class="label">Med i spillet</div>${V.players.map(pl => `<div class="pl">${coinHTML(pl)}<div><b>${esc(pl.name)}<span class="dot ${pl.online ? "on" : ""}"></span></b><small>${pl.online ? "Klar" : "Venter på telefon"}</small></div><span></span></div>`).join("")}
      <button class="btn ghost" type="button" id="releaseBtn">Det er ikke mig</button></div>`];
}

/* ---------------- Mine valg ---------------- */
function optionButtons(pr) {
  return `<div class="opts">${pr.options.map(o => `<button class="btn ${o.style || ""}" type="button" data-answer="${esc(o.v)}" ${o.disabled ? "disabled" : ""}>${esc(o.label)}</button>`).join("")}</div>`;
}

function promptView(pr) {
  const p = me();
  if (pr.kind === "roll") {
    const owns = Rules.ownedBy(gSnap(), V.you).length > 0;
    return [`<div class="panel" style="text-align:center"><div class="label">Din tur</div><h2 class="big">${esc(pr.title.includes("igen") ? "To ens! Kast igen" : "Kast terningerne")}</h2></div>`,
      `<button class="btn primary huge" type="button" id="rollBtn" ${pendingRoll === pr.id ? "disabled" : ""}>Kast terningerne</button>
       <div class="shake-row"><button class="btn small ghost" type="button" id="shakeBtn">Ryst telefonen for at kaste: ${shakeOn ? "til" : "fra"}</button></div>
       ${owns ? '<p class="muted" style="text-align:center;margin:0">Vil du bygge først? Gå til Ejendomme.</p>' : ""}`, true];
  }
  if (pr.kind === "buy") return [spaceCard(pr.i, null), optionButtons(pr), false];
  if (pr.kind === "card" && V.spot && V.spot.k === "card") return [cardCard(V.spot.deck, V.spot.idx), optionButtons(pr), false];
  if (pr.kind === "exile") {
    return [`<div class="panel"><div class="label">Bortvist i Eksil</div><h2 class="big">${esc(pr.title.replace(p.name + " er", "Du er"))}</h2><p class="lead">${esc(pr.text)}</p></div>`,
      optionButtons(pr), true];
  }
  if (pr.kind === "end") {
    return [`<div class="panel"><div class="label">Turen er næsten slut</div><h2 class="big">Byg eller afslut</h2>
        <p class="lead">Under Ejendomme kan du bygge altre, sælge eller pantsætte, før du afslutter turen.</p></div>`,
      `<div class="opts">${pr.options.map(o => `<button class="btn ${o.style || ""}" type="button" data-answer="${esc(o.v)}">${esc(o.label)}</button>`).join("")}
       <button class="btn ghost" type="button" data-goto="props">Gå til Ejendomme</button></div>`, false];
  }
  if (pr.kind === "debt") {
    return [`<div class="warn">${esc(pr.title)}</div><div class="panel"><p class="lead" style="margin:0">${esc(pr.text)}</p></div>`,
      `<div class="opts"><button class="btn primary" type="button" data-goto="props">Sælg og pantsæt</button>${pr.options.map(o => `<button class="btn ${o.style || ""}" type="button" data-answer="${esc(o.v)}" ${o.disabled ? "disabled" : ""}>${esc(o.label)}</button>`).join("")}</div>`, false];
  }
  if (pr.kind === "quiz") {
    const q = QUIZ[pr.qi];
    const left = Math.max(0, Math.ceil((pr.deadline - Date.now()) / 1000));
    return [`<div class="card"><div class="card-band" style="background:#f2c14e;color:#151515"><small>Frappé-pausen · visdomsprøve</small><b>${esc(q.q)}</b></div>
        <div class="card-img" style="background-image:url(${imgSrc(q.img, true)})"></div></div>`,
      `<div class="quiz-grid phoneq">${pr.opts.map((o, k) => `<button class="qopt q${k}" type="button" data-quiz="${k}"><span class="shape">${SHAPES[k]}</span><span>${esc(o)}</span></button>`).join("")}</div>
       <p class="muted num" style="text-align:center;margin:0" id="quizLeft">${left} sekunder tilbage</p>`, false];
  }
  return [`<div class="panel"><h2 class="big">${esc(pr.title)}</h2>${pr.text ? `<p class="lead">${esc(pr.text)}</p>` : ""}</div>`, optionButtons(pr), false];
}

/* ---------------- Når det er de andres tur ---------------- */
function waitView() {
  const c = V.players[V.cur];
  const act = V.activity;
  let what = act ? act.title : "";
  if (V.spot && V.spot.k === "quiz") what = "Visdomsprøve for alle";
  const head = `<div class="panel" style="display:flex;align-items:center;gap:12px">${coinHTML(c)}<div style="min-width:0"><div class="label">${V.cur === V.you ? "Din tur" : "Venter på " + esc(c.name)}</div>
    <div style="font-weight:800;font-size:1.05rem">${esc(what || "Spillet kører")}</div></div></div>`;
  let body = "";
  const s = V.spot;
  if (s) {
    if (s.k === "space") body = spaceCard(s.i, s.note, s.noteKind);
    else if (s.k === "card") body = cardCard(s.deck, s.idx);
    else if (s.k === "quiz") body = quizSpot(s);
    else if (s.k === "msg") body = msgCard(s);
  }
  const recentDice = Date.now() - diceAt < 9000 || (act && act.kind === "roll");
  return [head, body, !s && recentDice];
}

function quizSpot(s) {
  const q = QUIZ[s.qi];
  if (s.phase === "ask") {
    const p = me();
    const mine = quizAnswered[s.id] !== undefined || (p && !p.bankrupt);
    return `<div class="card"><div class="card-band" style="background:#f2c14e;color:#151515"><small>Visdomsprøve</small><b>${esc(q.q)}</b></div>
      <div class="card-body"><div class="answered"><b>${mine ? "Dit svar er modtaget" : "Svar på skærmen"}</b><span class="muted" style="color:#4b5563">${s.answered} af ${s.total} har svaret</span></div></div></div>`;
  }
  const r = s.results && V.you !== null ? s.results[V.you] : null;
  const win = (s.winners || []).find(w => w.pid === V.you);
  return `<div class="card"><div class="card-band" style="background:#f2c14e;color:#151515"><small>Visdomsprøve</small><b>${esc(q.q)}</b></div>
    <div class="card-body">
      ${r ? `<div class="result ${r === "right" ? "right" : "wrong"}">${r === "right" ? `Rigtigt! +${fmt(win ? win.gain : 0)}` : r === "wrong" ? "Desværre forkert" : "Du nåede ikke at svare"}</div>` : ""}
      <div class="card-tip"><b>Svaret er: ${esc(q.a)}.</b> ${esc(q.why)}</div>
    </div></div>`;
}

/* ---------------- Kort ---------------- */
function gSnap() {
  const props = {};
  Object.keys(V.props).forEach(i => { const a = V.props[i]; props[i] = { owner: a[0], level: a[1], mortgaged: !!a[2] }; });
  return { props, players: V.players };
}
function spaceCard(i, note, noteKind) {
  const sp = SPACES[i];
  const G = gSnap();
  const ps = G.props[i];
  const g = sp.group ? GROUPS[sp.group] : null;
  const bandBg = g ? g.color : (sp.type === "exile" ? "#2b2b2b" : sp.type === "quiz" ? "#f2c14e" : sp.type === "ostra" ? "#d7263d" : "#0d5eaf");
  const bandFg = g ? textOn(sp.group) : (sp.type === "quiz" ? "#151515" : "#fff");
  let extra = "";
  if (isOwnable(i)) {
    if (sp.type === "travel") extra += `<div class="rent-mini">${ECON.transportRent.map((r, k) => `<div>${k + 1} rute${k ? "r" : ""}<b>${fmt(r)}</b></div>`).join("")}</div>`;
    else extra += `<div class="rent-mini">${sp.rent.map((r, k) => `<div class="${ps && ps.owner !== null && ps.level === k ? "hl" : ""}">${["Grundleje", "1 alter", "2 altre", "3 altre", "4 altre", "Tempel"][k]}<b>${fmt(r)}</b></div>`).join("")}</div>`;
    if (ps && ps.owner !== null) { const o = V.players[ps.owner]; extra += `<div class="owner-tag">${coinHTML(o)}<span>Ejes af ${esc(o.name)}${ps.mortgaged ? " · pantsat" : ""}</span></div>`; }
    else extra += `<div class="owner-tag">Pris ${fmt(sp.price)}</div>`;
  }
  if (MapKit.geoOf(i)) extra = `<button type="button" class="dist-chip" data-mapfocus="${i}">${PIN_SVG}<span>${esc(MapKit.distanceText(i))}</span><span class="chip-act">Vis på kort</span></button>` + extra;
  return `<div class="card">
    <div class="card-band" style="background:${bandBg};color:${bandFg}"><small>${esc(g ? g.name : "")}</small><b>${esc(sp.name)}</b></div>
    <div class="card-img" style="background-image:url(${imgSrc(sp.img)})"></div>
    <div class="card-body">
      ${note ? `<div class="card-effect ${noteKind || ""}">${esc(note)}</div>` : ""}
      <div class="card-text">${esc(sp.fact)}</div>
      ${sp.tip ? `<div class="card-tip"><b>Turisttip:</b> ${esc(sp.tip)}</div>` : ""}
      ${extra}
    </div></div>`;
}
function cardCard(deck, idx) {
  const card = (deck === "oracle" ? ORACLE_CARDS : GUNST_CARDS)[idx];
  const info = DECK_INFO[deck];
  const e = card.effect;
  const sign = e.type === "money" ? (e.amount > 0 ? "plus" : "minus") : ["collectEach", "amnesty"].includes(e.type) ? "plus" : ["payEach", "repairs", "exile"].includes(e.type) ? "minus" : "";
  return `<div class="card">
    <div class="card-band" style="background:${info.color};color:${deck === "oracle" ? "#fff" : "#151515"}"><small>${esc(info.name)}</small><b>${esc(card.title)}</b></div>
    <div class="card-img" style="background-image:url(${imgSrc(card.img)})"></div>
    <div class="card-body"><div class="card-text">${esc(card.text)}</div><div class="card-effect ${sign}">${esc(card.label)}</div></div></div>`;
}
function msgCard(s) {
  return `<div class="card"><div class="card-band" style="background:${s.band || "#0d5eaf"};color:#fff"><small>${esc(s.kicker || "")}</small><b>${esc(s.title)}</b></div>
    ${s.img ? `<div class="card-img" style="background-image:url(${imgSrc(s.img)})"></div>` : ""}<div class="card-body"><div class="card-text">${esc(s.text)}</div></div></div>`;
}

/* ---------------- Ejendomme ---------------- */
function propsView() {
  const G = gSnap();
  const you = V.you;
  const mine = Rules.ownedBy(G, you);
  const debt = V.prompt && V.prompt.kind === "debt";
  const head = `<div class="panel"><div class="label">Mine ejendomme</div><h2 class="big">${mine.length} ${mine.length === 1 ? "ejendom" : "ejendomme"}</h2>
    <p class="muted" style="margin:6px 0 0">${V.canManage ? (debt ? `Skaf penge til gælden: sælg bygninger eller pantsæt.` : "Du kan bygge op til 2 altre på alle dine ejendomme. Ejer du hele farvegruppen, kan du bygge op til et tempel.") : "Du kan bygge og pantsætte, når det er din tur."}</p></div>`;
  const list = mine.map(i => {
    const sp = SPACES[i], ps = G.props[i];
    const lvl = sp.type === "prop" ? Rules.levelLabel(ps.level) : "Rejserute";
    let acts = "";
    if (V.canManage) {
      if (sp.type === "prop" && !debt) {
        const block = Rules.buildBlock(G, you, i);
        acts += `<button class="btn small sun" type="button" data-manage="build" data-sp="${i}" ${block ? "disabled" : ""} title="${esc(block)}">${ps.level === 4 && Rules.maxLevel(G, you, i) === 5 ? "Byg tempel" : "Byg alter"} ${fmt(Rules.buildCost(i))}</button>`;
      }
      if (sp.type === "prop" && ps.level > 0) acts += `<button class="btn small" type="button" data-manage="sell" data-sp="${i}">Sælg +${fmt(Rules.buildCost(i) / 2)}</button>`;
      if (!ps.mortgaged) acts += `<button class="btn small" type="button" data-manage="mortgage" data-sp="${i}" ${Rules.canMortgage(G, you, i) ? "" : "disabled"}>Pantsæt +${fmt(sp.price / 2)}</button>`;
      else if (!debt) acts += `<button class="btn small good" type="button" data-manage="unmortgage" data-sp="${i}" ${Rules.canUnmortgage(G, you, i) ? "" : "disabled"}>Indfri ${fmt(Rules.unmortgageCost(i))}</button>`;
    }
    return `<div class="prop ${ps.mortgaged ? "mort" : ""}"><span class="bar" style="background:${groupOf(i).color}"></span><div>
      <div class="pname">${esc(sp.name)}</div>
      <div class="pinfo">${lvl}${ps.mortgaged ? " · pantsat" : ""} · leje nu ${fmt(Rules.rent(G, i))}${sp.type === "prop" && Rules.ownsGroup(G, you, sp.group) ? " · hele gruppen" : ""}</div>
      ${acts ? `<div class="pacts">${acts}</div>` : ""}</div></div>`;
  }).join("");
  const back = V.prompt ? `<button class="btn primary wide" type="button" data-goto="game">Tilbage til din tur</button>` : "";
  return [head, `<div class="stack">${list || '<p class="muted">Du ejer ingen ejendomme endnu.</p>'}${back}</div>`];
}

function playersView() {
  const G = gSnap();
  const rows = V.players.map(p => `<div class="pl ${p.pid === V.cur ? "cur" : ""} ${p.bankrupt ? "out" : ""}">${coinHTML(p)}
    <div style="min-width:0"><b>${esc(p.name)}${p.pid === V.you ? " (dig)" : ""}<span class="dot ${p.online ? "on" : ""}"></span></b>
      <small>${p.bankrupt ? "Fallit" : `Formue ${fmt(p.worth)}${p.inExile ? " · i eksil" : ""}`}</small>
      <div class="sq">${Rules.ownedBy(G, p.pid).map(i => `<i style="background:${groupOf(i).color}"></i>`).join("")}</div></div>
    <span class="m num">${fmt(p.money)}</span></div>`).join("");
  return [`<div class="panel"><div class="label">Stillingen</div><h2 class="big">${V.maxRounds ? `Runde ${V.round} af ${V.maxRounds}` : `Runde ${V.round}`}</h2></div>`,
    `<div class="stack">${rows}
      <button class="btn ghost" type="button" id="avToggle">${avOpen ? "Luk profilbillede" : "Skift profilbillede"}</button>
      ${avOpen ? avatarPanel(me()) : ""}
      <button class="btn ghost" type="button" id="releaseBtn">Skift spiller på denne telefon</button></div>`];
}

function overView() {
  const r = V.ranking || [];
  const w = V.players[r[0] ? r[0].pid : 0];
  const myPlace = r.findIndex(x => x.pid === V.you) + 1;
  return [`<div class="panel" style="text-align:center"><div class="label">Spillet er slut</div><h2 class="big">${V.you === w.pid ? "Du vandt!" : esc(w.name) + " vandt"}</h2>
      <p class="lead">Du blev nummer ${myPlace}.</p></div>`,
    `<div class="stack">${r.map((x, k) => { const p = V.players[x.pid]; return `<div class="pl">${coinHTML(p)}<div><b>${k + 1}. ${esc(p.name)}</b></div><span class="m num">${x.bankrupt ? "Fallit" : fmt(x.worth)}</span></div>`; }).join("")}</div>`];
}

/* ---------------- Handlinger ---------------- */
function send(m) { if (client) client.send(m); }

function doRoll(pr) {
  if (!pr || pr.kind !== "roll" || pendingRoll === pr.id) return;
  pendingRoll = pr.id;
  dice.wiggle();
  buzz(30);
  send({ t: "answer", id: pr.id, v: "roll" });
  const b = $("#rollBtn");
  if (b) b.disabled = true;
}

function bindHandlers() {
  const f = $("#codeForm");
  if (f) f.addEventListener("submit", e => {
    e.preventDefault();
    const c = Net.cleanCode($("#codeIn").value);
    if (c.length >= 4) { connect(c); render(true); }
  });
  document.querySelectorAll("[data-claim]").forEach(b => b.addEventListener("click", () => { send({ t: "claim", pid: +b.dataset.claim }); keepAwake(); }));
  const avp = $("#avPanel");
  if (avp) Avatars.bindPicker(avp, av => {
    const mine = me();
    pendingAv = { msg: Object.assign({ t: "avatar" }, av), baseV: (mine && mine.avatar && mine.avatar.v) || 0, kind: av.kind };
    send(pendingAv.msg);
    if (av.kind === "photo") showToast("Sender billedet …");
    avOpen = false;
  }, msg => showToast(msg, "minus"));
  const avt = $("#avToggle");
  if (avt) avt.addEventListener("click", () => { avOpen = !avOpen; render(true); });
  const rel = $("#releaseBtn");
  if (rel) rel.addEventListener("click", () => send({ t: "release" }));
  const roll = $("#rollBtn");
  if (roll) roll.addEventListener("click", () => doRoll(V.prompt));
  const sh = $("#shakeBtn");
  if (sh) sh.addEventListener("click", toggleShake);
  document.querySelectorAll("[data-answer]").forEach(b => b.addEventListener("click", () => {
    if (!V.prompt) return;
    const v = b.dataset.answer;
    if (V.prompt.kind === "exile" && v === "roll") dice.wiggle();
    send({ t: "answer", id: V.prompt.id, v });
    document.querySelectorAll("[data-answer]").forEach(x => { x.disabled = true; });
  }));
  document.querySelectorAll("[data-quiz]").forEach(b => b.addEventListener("click", () => {
    if (!V.prompt || V.prompt.kind !== "quiz") return;
    const k = +b.dataset.quiz;
    quizAnswered[V.prompt.id] = k;
    send({ t: "answer", id: V.prompt.id, v: k });
    buzz(40);
    document.querySelectorAll("[data-quiz]").forEach(x => { x.disabled = true; if (x !== b) x.classList.add("dim"); });
  }));
  document.querySelectorAll("[data-manage]").forEach(b => b.addEventListener("click", () => {
    send({ t: "manage", act: b.dataset.manage, sp: +b.dataset.sp });
    b.disabled = true;
  }));
  document.querySelectorAll("[data-mapfocus]").forEach(b => b.addEventListener("click", () => { mapSel = +b.dataset.mapfocus; lastFocused = undefined; tab = "map"; render(true); window.scrollTo(0, 0); }));
  const ma = $("[data-mapall]");
  if (ma) ma.addEventListener("click", () => { mapSel = null; lastFocused = null; if (pmap) pmap.overview(); render(true); });
  const mn = $("[data-mapnaf]");
  if (mn) mn.addEventListener("click", () => { mapSel = null; lastFocused = null; if (pmap) pmap.overview(true); render(true); });
  document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => { tab = b.dataset.goto; render(true); window.scrollTo(0, 0); }));
}

document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => { tab = b.dataset.tab; render(true); window.scrollTo(0, 0); }));

/* ---------------- Kort ---------------- */
function mapView() {
  const head = `<div class="panel"><div class="label">Kort over turen</div><h2 class="big">Hvor er det henne?</h2>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
      <span class="dist-chip">${PIN_SVG}<span>Lejligheden: ${esc(HOME.name)}</span></span>
      <button class="btn small ghost" type="button" data-mapall>Hele turen</button>
      <button class="btn small ghost" type="button" data-mapnaf>Kun Nafplio</button>
    </div></div>`;
  let sel = "";
  if (mapSel !== null && SPACES[mapSel]) {
    const sp = SPACES[mapSel];
    sel = `<div class="card">
      <div class="card-band" style="background:${sp.group ? GROUPS[sp.group].color : "#0d5eaf"};color:${sp.group ? textOn(sp.group) : "#fff"}"><small>${esc(MapKit.distanceText(mapSel))}</small><b>${esc(sp.name)}</b></div>
      <div class="card-body" style="flex-direction:row;gap:12px;align-items:flex-start">
        <div style="flex:0 0 34%;aspect-ratio:1;border-radius:8px;background:#cfd8e3 center/cover url(${imgSrc(sp.img, true)})"></div>
        <div class="card-text" style="font-size:.92em">${esc(sp.fact || "")}</div>
      </div></div>`;
  }
  const list = MapKit.PLACES.slice().sort((a, b) => MapKit.distKm(HOME.geo, a.geo) - MapKit.distKm(HOME.geo, b.geo)).map(p =>
    `<button type="button" class="mrow-p ${p.i === mapSel ? "on" : ""}" data-mapfocus="${p.i}"><i style="background:${p.color}"></i><span>${esc(p.name)}</span><small>${esc(MapKit.fmtDist(MapKit.distKm(HOME.geo, p.geo)))}</small></button>`).join("");
  return [head, `<div class="stack">${sel}<div class="panel stack" style="gap:6px"><div class="label">Alle steder, nærmest først</div>${list}</div></div>`];
}
function ensureMap() {
  if (!pmap) {
    pmap = MapKit.interactive($("#phoneMap"), { onSelect: i => { mapSel = i; lastFocused = i; render(true); } });
    if (!pmap) return;
  }
  setTimeout(() => {
    pmap.refresh();
    if (mapSel !== lastFocused) {
      lastFocused = mapSel;
      if (mapSel === null) pmap.overview(); else pmap.focus(mapSel);
    }
  }, 30);
}

/* ---------------- Ryst for at kaste ---------------- */
function onMotion(e) {
  const a = e.acceleration && e.acceleration.x !== null ? e.acceleration : null;
  const g = e.accelerationIncludingGravity;
  let mag = 0;
  if (a) mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
  else if (g) mag = Math.abs(Math.hypot(g.x || 0, g.y || 0, g.z || 0) - 9.81);
  if (mag > 15 && Date.now() - lastShake > 1500) {
    lastShake = Date.now();
    if (V && V.prompt && V.prompt.kind === "roll" && tab === "game") doRoll(V.prompt);
  }
}
async function toggleShake() {
  if (!shakeOn) {
    try {
      if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== "granted") { showToast("Telefonen gav ikke adgang til bevægelsessensoren.", "minus"); return; }
      }
    } catch (err) { showToast("Ryst virker ikke på denne telefon. Brug knappen.", "minus"); return; }
    window.addEventListener("devicemotion", onMotion);
    shakeOn = true;
  } else {
    window.removeEventListener("devicemotion", onMotion);
    shakeOn = false;
  }
  LS.set("polis-shake", shakeOn ? "1" : "0");
  render(true);
}
if (LS.get("polis-shake") === "1" && typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission !== "function") {
  window.addEventListener("devicemotion", onMotion);
  shakeOn = true;
}

/* ---------------- Små hjælpere ---------------- */
function showToast(text, kind) {
  const box = $("#toasts");
  const t = document.createElement("div");
  t.className = "toast " + (kind || "");
  t.textContent = text;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), 3600);
}

let wakeLock = null;
async function keepAwake() {
  try { if ("wakeLock" in navigator && (!wakeLock || wakeLock.released)) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { /* ikke tilladt */ }
}
document.addEventListener("click", keepAwake, { once: true });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && V) keepAwake(); });

setInterval(() => {
  const el = $("#quizLeft");
  if (el && V && V.prompt && V.prompt.kind === "quiz") el.textContent = Math.max(0, Math.ceil((V.prompt.deadline - Date.now()) / 1000)) + " sekunder tilbage";
  if (V && V.phase === "play" && !V.prompt && tab === "game" && V.you !== null && V.you !== undefined) {
    const want = !!waitView()[2];
    if ($("#diceHost").hidden === want) render(true);
  }
}, 1000);

/* ---------------- Start ---------------- */
if (code) connect(code);
render(true);
