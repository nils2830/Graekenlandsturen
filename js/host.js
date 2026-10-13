/* =====================================================================
   POLIS · værtsskærmen (brættet)
   Brættet ejer spillet. Telefonerne sender svar og får en personlig visning.
   ===================================================================== */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const EXILE_POS = 8;
const SAVE_KEY = "polis-nafplio-gem-v2";
const SETUP_KEY = "polis-nafplio-opsaetning-v2";

/* ---------------- Tilstand ---------------- */
const state = {
  phase: "setup",          // setup | lobby | play | over
  players: [],
  props: {},
  current: 0,
  round: 1,
  maxRounds: 12,
  doubles: 0,
  decks: { oracle: [], gunst: [] },
  quizOrder: [],
  prompt: null,
  quiz: null,
  spot: null,
  dice: { seq: 0, d: [5, 2], pid: null },
  toasts: [],
  feed: [],
  ranking: null
};
const H = { code: null, net: null, netStatus: "offline", conns: new Map(), forceControl: false, resume: false, looping: false };
let promptSeq = 0, toastSeq = 0;
const cur = () => state.players[state.current];
const active = () => state.players.filter(p => !p.bankrupt);

/* ---------------- Gem og genoptag ---------------- */
function save() {
  if (state.phase !== "play") return;
  const data = {
    code: H.code, savedAt: Date.now(),
    s: { players: state.players, props: state.props, current: state.current, round: state.round, maxRounds: state.maxRounds,
         decks: state.decks, quizOrder: state.quizOrder, feed: state.feed.slice(-8) }
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* lagring er ikke tilgængelig */ }
}
function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (d && Date.now() - d.savedAt < 3 * 24 * 3600 * 1000) return d;
  } catch (e) { /* ignorer */ }
  return null;
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignorer */ } }

/* ---------------- Forbindelser og telefoner ---------------- */
function isOnline(pid) {
  for (const c of H.conns.values()) if (c.pid === pid) return true;
  return false;
}
const hostControls = pid => H.forceControl || !isOnline(pid);

function startNet(code) {
  H.code = code;
  H.net = Net.createHost(code, {
    onStatus(s) { H.netStatus = s; renderLobby(); renderPanel(); },
    onOpen(id) { H.conns.set(id, { cid: null, pid: null, last: Date.now() }); sendView(id); },
    onClose(id) {
      const c = H.conns.get(id);
      H.conns.delete(id);
      if (c && c.pid !== null && !isOnline(c.pid)) {
        const p = state.players[c.pid];
        if (p && state.phase === "play") feed(`${esc(p.name)} mistede forbindelsen til telefonen.`, p);
      }
      broadcast();
    },
    onData(id, m) { onMessage(id, m); }
  });
}

function onMessage(id, m) {
  const c = H.conns.get(id);
  if (!c || !m || typeof m !== "object") return;
  c.last = Date.now();
  switch (m.t) {
    case "ping":
      H.net.send(id, { t: "pong" });
      return;
    case "hello": {
      c.cid = String(m.cid || "").slice(0, 40);
      const p = state.players.find(pl => pl.cid && pl.cid === c.cid);
      if (p) claimFor(id, p.pid);
      sendView(id);
      return;
    }
    case "claim": {
      const pid = Number(m.pid);
      const p = state.players[pid];
      if (!p || !c.cid) return;
      if (p.cid && p.cid !== c.cid && isOnline(pid)) {
        H.net.send(id, { t: "error", msg: `${p.name} er allerede valgt på en anden telefon.` });
        return;
      }
      p.cid = c.cid;
      claimFor(id, pid);
      if (state.phase === "play") feed(`${esc(p.name)} er tilsluttet med telefonen.`, p);
      broadcast();
      return;
    }
    case "release":
      if (c.pid !== null) { const p = state.players[c.pid]; if (p && p.cid === c.cid) p.cid = null; }
      c.pid = null;
      broadcast();
      return;
    case "answer":
      if (c.pid !== null) handleAnswer(c.pid, m.id, m.v);
      return;
    case "manage":
      if (c.pid !== null) handleManage(c.pid, m.act, Number(m.sp));
      return;
  }
}

function claimFor(connId, pid) {
  for (const [id, other] of H.conns) if (id !== connId && other.pid === pid) other.pid = null;
  H.conns.get(connId).pid = pid;
}

/* ---------------- Visninger til telefonerne ---------------- */
function evalOptions(pr) {
  const list = typeof pr.options === "function" ? pr.options() : pr.options;
  return list.map(o => ({ v: o.v, label: o.label, style: o.style || "", disabled: !!o.disabled }));
}
function canManageNow(pid) {
  const pr = state.prompt;
  return state.phase === "play" && !!pr && pr.pid === pid && ["roll", "end", "debt", "exile"].includes(pr.kind);
}
function promptFor(pid) {
  if (pid === null || pid === undefined) return null;
  const q = state.quiz;
  if (q && q.phase === "ask" && q.pids.includes(pid) && !(pid in q.answers)) {
    return { id: q.id, kind: "quiz", qi: q.qi, opts: q.opts, deadline: q.deadline, lander: q.lander };
  }
  const pr = state.prompt;
  if (!pr || pr.pid !== pid) return null;
  return { id: pr.id, kind: pr.kind, title: pr.title, text: pr.text || "", options: evalOptions(pr), i: pr.i, amount: pr.amount || 0 };
}
function buildView(pid) {
  const props = {};
  Object.keys(state.props).forEach(i => { const ps = state.props[i]; props[i] = [ps.owner, ps.level, ps.mortgaged ? 1 : 0]; });
  const pr = state.prompt;
  return {
    t: "view",
    phase: state.phase,
    code: H.code,
    round: state.round,
    maxRounds: state.maxRounds,
    cur: state.current,
    players: state.players.map(p => ({
      pid: p.pid, name: p.name, color: p.color, letter: p.letter, money: p.money, pos: p.pos,
      inExile: p.inExile, bankrupt: p.bankrupt, amnesty: p.amnesty.length,
      online: isOnline(p.pid), taken: !!p.cid, worth: Rules.netWorth(state, p.pid)
    })),
    props,
    you: pid === undefined ? null : pid,
    prompt: promptFor(pid),
    activity: pr ? { pid: pr.pid, kind: pr.kind, title: pr.title } : null,
    spot: state.spot,
    dice: state.dice,
    toasts: state.toasts.slice(-8),
    feed: state.feed.slice(-5),
    canManage: pid !== null && pid !== undefined && canManageNow(pid),
    ranking: state.ranking,
    resume: H.resume
  };
}
function sendView(id) {
  const c = H.conns.get(id);
  if (!c || !H.net) return;
  H.net.send(id, buildView(c.pid));
}
let bcastQueued = false;
function broadcast() {
  if (bcastQueued) return;
  bcastQueued = true;
  setTimeout(() => {
    bcastQueued = false;
    for (const id of H.conns.keys()) sendView(id);
    renderAll();
  }, 0);
}

/* ---------------- Beskeder, nyheder og spotlight ---------------- */
function toast(text, to = null, kind = "") {
  state.toasts.push({ seq: ++toastSeq, text, to, kind });
  if (state.toasts.length > 12) state.toasts.shift();
  showHostToast(text, kind);
  broadcast();
}
function feed(html, p = null) {
  state.feed.push({ html, color: p ? p.color : null });
  if (state.feed.length > 40) state.feed.shift();
  broadcast();
}
function setSpot(spot) { state.spot = spot; broadcast(); }
async function showSpot(spot, ms) {
  setSpot(spot);
  await sleep(ms);
  if (state.spot === spot) setSpot(null);
}

/* ---------------- Spørgsmål til spillerne ---------------- */
function ask(pid, def) {
  return new Promise(resolve => {
    state.prompt = Object.assign({ id: ++promptSeq, pid }, def, { resolve });
    broadcast();
  });
}
function answerPrompt(v) {
  const pr = state.prompt;
  if (!pr) return;
  state.prompt = null;
  pr.resolve(v);
  broadcast();
}
function handleAnswer(pid, id, v) {
  const q = state.quiz;
  if (q && id === q.id) {
    if (q.phase === "ask" && q.pids.includes(pid) && !(pid in q.answers) && Number.isInteger(v) && v >= 0 && v < 4) {
      q.answers[pid] = { v, t: Date.now() };
      state.spot.answered = Object.keys(q.answers).length;
      broadcast();
      if (state.spot.answered >= q.pids.length && q.done) q.done();
    }
    return;
  }
  const pr = state.prompt;
  if (!pr || pr.id !== id || pr.pid !== pid) return;
  const opt = evalOptions(pr).find(o => o.v === v);
  if (!opt || opt.disabled) return;
  answerPrompt(v);
}

/* ---------------- Byg, sælg og pantsæt ---------------- */
function handleManage(pid, act, i) {
  if (!canManageNow(pid) || !isOwnable(i)) return false;
  const debt = state.prompt.kind === "debt";
  const p = state.players[pid], ps = state.props[i], sp = SPACES[i];
  if (!ps || ps.owner !== pid) return false;
  const cost = sp.type === "prop" ? Rules.buildCost(i) : 0;
  if (act === "build") {
    if (debt || !Rules.canBuild(state, pid, i)) return false;
    p.money -= cost; ps.level++;
    feed(`${esc(p.name)} bygger ${ps.level === 5 ? "et tempel" : "et alter"} på ${esc(sp.name)}.`, p);
  } else if (act === "sell") {
    if (!Rules.canSell(state, pid, i)) return false;
    p.money += cost / 2; ps.level--;
    feed(`${esc(p.name)} sælger en bygning på ${esc(sp.name)}.`, p);
  } else if (act === "mortgage") {
    if (!Rules.canMortgage(state, pid, i)) return false;
    ps.mortgaged = true; p.money += sp.price / 2;
    feed(`${esc(p.name)} pantsætter ${esc(sp.name)}.`, p);
  } else if (act === "unmortgage") {
    if (debt || !Rules.canUnmortgage(state, pid, i)) return false;
    ps.mortgaged = false; p.money -= Rules.unmortgageCost(i);
    feed(`${esc(p.name)} indfrier pantet i ${esc(sp.name)}.`, p);
  } else return false;
  broadcast();
  return true;
}

/* =====================================================================
   SPILFORLØB
   ===================================================================== */
async function gameLoop() {
  if (H.looping) return;
  H.looping = true;
  try {
    while (state.phase === "play") {
      save();
      await playTurn(cur());
      if (state.phase !== "play") break;
      advance();
    }
  } catch (err) {
    console.error(err);
    feed("Der opstod en fejl. Spillet fortsætter med næste tur.");
    H.looping = false;
    if (state.phase === "play") { state.prompt = null; advance(); gameLoop(); }
    return;
  }
  H.looping = false;
}

function advance() {
  const n = state.players.length;
  let k = state.current;
  do { k = (k + 1) % n; } while (state.players[k].bankrupt);
  if (k <= state.current) state.round++;
  state.current = k;
  state.doubles = 0;
  if (state.maxRounds && state.round > state.maxRounds) { state.round = state.maxRounds; endGame("rounds"); return; }
  feed(`Det er <b>${esc(gen(cur().name))}</b> tur.`, cur());
}

async function playTurn(p) {
  state.doubles = 0;
  let rollAgain = true;
  while (rollAgain && state.phase === "play" && !p.bankrupt) {
    rollAgain = false;
    if (p.inExile) {
      rollAgain = await exileTurn(p);
      continue;
    }
    await ask(p.pid, {
      kind: "roll",
      title: state.doubles ? `${p.name} slog to ens og kaster igen` : `${p.name} skal kaste terningerne`,
      options: [{ v: "roll", label: state.doubles ? "Kast igen" : "Kast terningerne", style: "primary" }]
    });
    const [d1, d2] = await doRoll(p);
    const dbl = d1 === d2;
    if (dbl) {
      state.doubles++;
      if (state.doubles === 3) {
        await showSpot({ k: "msg", img: "ostraka", band: "#d7263d", kicker: "Tre gange to ens", title: "Mistænkt for snyd!",
          text: "Ingen har så meget held uden gudernes hjælp. Dommerne sender dig direkte i eksil." }, 3800);
        await sendToExile(p, "tre gange to ens i træk");
        break;
      }
    }
    await moveSteps(p, d1 + d2);
    await resolveSpace(p);
    if (dbl && !p.inExile && !p.bankrupt && state.phase === "play") rollAgain = true;
  }
  if (state.phase !== "play" || p.bankrupt) return;
  if (Rules.ownedBy(state, p.pid).length === 0) { await sleep(900); return; }
  await ask(p.pid, {
    kind: "end",
    title: `${p.name} kan bygge, pantsætte eller afslutte turen`,
    options: [{ v: "end", label: "Afslut tur", style: "sun" }]
  });
}

async function doRoll(p) {
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  state.dice = { seq: state.dice.seq + 1, d: [d1, d2], pid: p.pid };
  feed(`${esc(p.name)} slår ${d1} og ${d2}${d1 === d2 ? " (to ens)" : ""}.`, p);
  broadcast();
  await sleep(reduced() ? 300 : 1500);
  return [d1, d2];
}

async function moveSteps(p, steps) {
  const dir = steps < 0 ? -1 : 1;
  for (let k = 0; k < Math.abs(steps); k++) {
    p.pos = (p.pos + dir + SPACES.length) % SPACES.length;
    if (p.pos === 0 && dir > 0) {
      p.money += ECON.passStart;
      toast(`${p.name} passerer Agoraen og får ${fmt(ECON.passStart)}`, [p.pid], "plus");
      feed(`${esc(p.name)} passerer Start og modtager ${fmt(ECON.passStart)}.`, p);
    }
    hopToken(p);
    await sleep(reduced() ? 40 : 230);
  }
  highlightSpace(p.pos);
  broadcast();
  await sleep(250);
}
const moveTo = (p, target) => moveSteps(p, (target - p.pos + SPACES.length) % SPACES.length);

async function sendToExile(p, why) {
  p.pos = EXILE_POS;
  p.inExile = true;
  p.exileTries = 0;
  state.doubles = 0;
  toast(`${p.name} er sendt i eksil`, null, "minus");
  feed(`${esc(p.name)} sendes i eksil: ${why}.`, p);
  positionTokens();
  await sleep(400);
}

async function resolveSpace(p) {
  const i = p.pos, sp = SPACES[i];
  switch (sp.type) {
    case "prop":
    case "travel":
      return handleOwnable(p, i);
    case "tax":
      await showSpot({ k: "space", i, note: `${p.name} betaler ${fmt(sp.amount)}`, noteKind: "minus" }, 3800);
      feed(`${esc(p.name)} betaler ${fmt(sp.amount)} for ${esc(sp.name)}.`, p);
      return payment(p, sp.amount, null, sp.name);
    case "oracle":
      return drawCard(p, "oracle");
    case "gunst":
      return drawCard(p, "gunst");
    case "ostra":
      await showSpot({ k: "space", i, note: `${p.name} stemmes ud af byen og går direkte i eksil`, noteKind: "minus" }, 4200);
      return sendToExile(p, "ostrakiseret af folkeforsamlingen");
    case "quiz":
      return runQuiz(p);
    case "start":
      feed(`${esc(p.name)} står midt på Agoraen.`, p);
      return;
    case "exile":
      feed(`${esc(p.name)} er kun på besøg hos de landsforviste.`, p);
      return;
  }
}

async function handleOwnable(p, i) {
  const sp = SPACES[i], ps = state.props[i];
  if (ps.owner === null) {
    state.spot = { k: "space", i, mode: "buy" };
    const v = await ask(p.pid, {
      kind: "buy", i,
      title: `Vil ${p.name} købe ${sp.name} for ${fmt(sp.price)}?`,
      options: () => [
        { v: "buy", label: `Køb for ${fmt(sp.price)}`, style: "good", disabled: p.money < sp.price },
        { v: "pass", label: "Nej tak" }
      ]
    });
    state.spot = null;
    if (v === "buy" && p.money >= sp.price) {
      p.money -= sp.price;
      ps.owner = p.pid;
      toast(`${p.name} købte ${sp.name}`, null, "");
      feed(`${esc(p.name)} køber <b>${esc(sp.name)}</b> for ${fmt(sp.price)}.`, p);
      if (sp.type === "prop" && Rules.ownsGroup(state, p.pid, sp.group)) {
        toast(`${p.name} ejer nu hele ${GROUPS[sp.group].name}!`, null, "plus");
        feed(`${esc(p.name)} ejer nu hele gruppen ${esc(GROUPS[sp.group].name)}; grundlejen fordobles.`, p);
      }
    } else {
      feed(`${esc(p.name)} køber ikke ${esc(sp.name)}.`, p);
    }
    broadcast();
    return;
  }
  if (ps.owner === p.pid) { feed(`${esc(p.name)} hviler på sin egen grund: ${esc(sp.name)}.`, p); return; }
  const owner = state.players[ps.owner];
  if (ps.mortgaged) { feed(`${esc(sp.name)} er pantsat, så ${esc(p.name)} betaler ingen leje.`, p); return; }
  const rent = Rules.rent(state, i);
  const ok = await payment(p, rent, owner, `leje for ${sp.name}`);
  if (!ok) return;
  toast(`${p.name} betaler ${fmt(rent)} til ${owner.name}`, [p.pid, owner.pid], "");
  feed(`${esc(p.name)} betaler ${fmt(rent)} i leje til ${esc(owner.name)} for ${esc(sp.name)}.`, p);
  await showSpot({ k: "space", i, note: `${p.name} betaler ${fmt(rent)} i leje til ${owner.name}`, noteKind: "minus" }, 3600);
}

/* ---------------- Betaling, gæld og fallit ---------------- */
async function payment(p, amount, creditor, reason) {
  if (amount <= 0 || p.bankrupt) return true;
  if (p.money < amount) {
    const v = await ask(p.pid, {
      kind: "debt", amount,
      title: `${p.name} skal betale ${fmt(amount)} (${reason})`,
      text: (() => {
        const most = p.money + Rules.liquidation(state, p.pid);
        return most >= amount
          ? `Du har kun ${fmt(p.money)}. Sælg altre eller pantsæt ejendomme under Ejendomme, og tryk så Betal.`
          : `Du har kun ${fmt(p.money)} og kan højst skaffe ${fmt(most)}. Det er ikke nok, så du må erklære dig fallit.`;
      })(),
      options: () => [
        { v: "pay", label: `Betal ${fmt(amount)}`, style: "good", disabled: p.money < amount },
        { v: "bankrupt", label: "Erklær fallit", style: "bad" }
      ]
    });
    if (v === "bankrupt") { await bankrupt(p, creditor); return false; }
  }
  p.money -= amount;
  if (creditor) creditor.money += amount;
  broadcast();
  return true;
}

async function bankrupt(p, creditor) {
  Rules.ownedBy(state, p.pid).forEach(i => {
    const ps = state.props[i];
    if (ps.level) { p.money += ps.level * Rules.buildCost(i) / 2; ps.level = 0; }
    if (creditor) ps.owner = creditor.pid;
    else { ps.owner = null; ps.mortgaged = false; }
  });
  if (creditor) creditor.money += Math.max(0, p.money);
  p.money = 0;
  p.bankrupt = true;
  p.inExile = false;
  p.amnesty.forEach(c => state.decks[c.deck].push(c.idx));
  p.amnesty = [];
  toast(`${p.name} er gået fallit`, null, "minus");
  feed(`<b>${esc(p.name)}</b> er gået fallit${creditor ? " og overdrager alt til " + esc(creditor.name) : ""}.`, p);
  await showSpot({ k: "msg", img: "ostraka", band: "#151515", kicker: "Fallit", title: `${p.name} har mistet alt`,
    text: creditor ? `Alle ejendomme og resterende drachmer går til ${creditor.name}.` : "Alle ejendomme går tilbage til statskassen og kan købes igen." }, 4200);
  if (active().length <= 1) endGame("last");
}

function endGame(reason) {
  if (state.phase === "over") return;
  state.phase = "over";
  state.prompt = null;
  state.quiz = null;
  const ranking = state.players.slice()
    .sort((a, b) => (a.bankrupt - b.bankrupt) || Rules.netWorth(state, b.pid) - Rules.netWorth(state, a.pid))
    .map(p => ({ pid: p.pid, worth: p.bankrupt ? 0 : Rules.netWorth(state, p.pid), bankrupt: p.bankrupt }));
  state.ranking = ranking;
  state.spot = { k: "over", ranking, reason };
  const w = state.players[ranking[0].pid];
  state.current = w.pid;
  feed(`<b>${esc(w.name)}</b> vinder spillet!`, w);
  clearSave();
  broadcast();
}

/* ---------------- Eksil ---------------- */
async function exileTurn(p) {
  state.spot = { k: "space", i: EXILE_POS, note: `${p.name} er i eksil · forsøg ${p.exileTries + 1} af 3` };
  const v = await ask(p.pid, {
    kind: "exile",
    title: `${p.name} er i eksil (forsøg ${p.exileTries + 1} af 3)`,
    text: `Betal ${fmt(ECON.exileFee)}, brug et amnestikort eller prøv at slå to ens. Efter tredje forsøg skal du betale.`,
    options: () => [
      { v: "pay", label: `Betal ${fmt(ECON.exileFee)}`, disabled: p.money < ECON.exileFee },
      { v: "card", label: "Brug amnestikort", style: "sun", disabled: !p.amnesty.length },
      { v: "roll", label: "Slå to ens", style: "primary" }
    ]
  });
  state.spot = null;
  if (v === "pay" || v === "card") {
    if (v === "pay") { p.money -= ECON.exileFee; feed(`${esc(p.name)} betaler ${fmt(ECON.exileFee)} og vender hjem fra eksil.`, p); }
    else {
      const c = p.amnesty.shift();
      state.decks[c.deck].push(c.idx);
      feed(`${esc(p.name)} bruger et amnestikort og vender hjem.`, p);
    }
    p.inExile = false; p.exileTries = 0;
    positionTokens();
    broadcast();
    return true; // kast nu som normalt
  }
  const [d1, d2] = await doRoll(p);
  if (d1 === d2) {
    p.inExile = false; p.exileTries = 0;
    toast(`${p.name} slog to ens og er fri!`, null, "plus");
    await moveSteps(p, d1 + d2);
    await resolveSpace(p);
    return false;
  }
  p.exileTries++;
  if (p.exileTries >= 3) {
    feed(`${esc(p.name)} har brugt tre forsøg og skal betale ${fmt(ECON.exileFee)}.`, p);
    const ok = await payment(p, ECON.exileFee, null, "løsesum fra eksil");
    if (!ok) return false;
    p.inExile = false; p.exileTries = 0;
    await moveSteps(p, d1 + d2);
    await resolveSpace(p);
    return false;
  }
  feed(`${esc(p.name)} bliver i eksil.`, p);
  broadcast();
  return false;
}

/* ---------------- Kort ---------------- */
async function drawCard(p, deck) {
  const list = deck === "oracle" ? ORACLE_CARDS : GUNST_CARDS;
  const idx = state.decks[deck].shift();
  const card = list[idx];
  if (card.effect.type !== "amnesty") state.decks[deck].push(idx);
  state.spot = { k: "card", deck, idx };
  await ask(p.pid, { kind: "card", title: `${p.name} trak ${DECK_INFO[deck].name}: ${card.title}`, options: [{ v: "ok", label: "Videre", style: "primary" }] });
  state.spot = null;
  feed(`${esc(p.name)} trak ${esc(DECK_INFO[deck].name)}: ${esc(card.label)}.`, p);
  const e = card.effect;
  const others = active().filter(o => o !== p);
  switch (e.type) {
    case "money":
      if (e.amount > 0) { p.money += e.amount; toast(`${p.name} får ${fmt(e.amount)}`, [p.pid], "plus"); broadcast(); }
      else await payment(p, -e.amount, null, card.title);
      break;
    case "moveTo":
      await moveTo(p, e.to);
      await resolveSpace(p);
      break;
    case "moveBy":
      await moveSteps(p, e.steps);
      await resolveSpace(p);
      break;
    case "nearestTravel": {
      let k = p.pos;
      do { k = (k + 1) % SPACES.length; } while (SPACES[k].type !== "travel");
      await moveTo(p, k);
      await resolveSpace(p);
      break;
    }
    case "exile":
      await sendToExile(p, card.title.toLowerCase());
      break;
    case "amnesty":
      p.amnesty.push({ deck, idx });
      broadcast();
      break;
    case "payEach":
      for (const o of others) {
        if (p.bankrupt || state.phase !== "play") break;
        if (await payment(p, e.amount, o, card.title)) toast(`${p.name} betaler ${fmt(e.amount)} til ${o.name}`, [p.pid, o.pid]);
      }
      break;
    case "collectEach":
      for (const o of others) {
        if (state.phase !== "play") break;
        if (await payment(o, e.amount, p, card.title)) toast(`${o.name} betaler ${fmt(e.amount)} til ${p.name}`, [p.pid, o.pid]);
      }
      break;
    case "repairs": {
      let altars = 0, temples = 0;
      Rules.ownedBy(state, p.pid).forEach(i => { const lv = state.props[i].level || 0; if (lv === 5) temples++; else altars += lv; });
      const cost = altars * e.altar + temples * e.temple;
      if (cost > 0) await payment(p, cost, null, `${altars} altre og ${temples} templer`);
      else feed(`${esc(p.name)} har ingen bygninger og slipper.`, p);
      break;
    }
  }
}

/* ---------------- Visdomsprøve (alle svarer på telefonen) ---------------- */
async function runQuiz(lander) {
  if (!state.quizOrder.length) state.quizOrder = shuffle(QUIZ.map((q, k) => k));
  const qi = state.quizOrder.shift();
  const q = QUIZ[qi];
  const opts = shuffle([q.a, ...q.wrong]);
  const pids = active().map(p => p.pid);
  const deadline = Date.now() + ECON.quizSeconds * 1000;
  state.quiz = { id: ++promptSeq, qi, opts, pids, answers: {}, deadline, lander: lander.pid, phase: "ask" };
  state.spot = { k: "quiz", id: state.quiz.id, qi, opts, phase: "ask", deadline, answered: 0, total: pids.length, lander: lander.pid };
  feed(`${esc(lander.name)} holder frappé-pause: alle dyster i en visdomsprøve.`, lander);
  broadcast();
  await new Promise(resolve => {
    const quiz = state.quiz;
    let finished = false;
    const finish = () => { if (!finished) { finished = true; clearTimeout(timer); resolve(); } };
    quiz.done = finish;
    const timer = setTimeout(finish, ECON.quizSeconds * 1000 + 300);
  });
  const quiz = state.quiz;
  const correct = opts.indexOf(q.a);
  const results = {};
  const winners = [];
  pids.forEach(pid => {
    const a = quiz.answers[pid];
    const ok = !!a && a.v === correct;
    results[pid] = a ? (ok ? "right" : "wrong") : "none";
    if (ok) {
      const gain = pid === lander.pid ? ECON.quizLander : ECON.quizCorrect;
      state.players[pid].money += gain;
      winners.push({ pid, gain });
      toast(`Rigtigt! +${fmt(gain)}`, [pid], "plus");
    }
  });
  quiz.phase = "reveal";
  state.spot = Object.assign({}, state.spot, { phase: "reveal", correct, results, winners });
  feed(winners.length ? `Rigtigt svar: ${esc(q.a)}. ${winners.map(w => esc(state.players[w.pid].name)).join(", ")} vinder drachmer.` : `Rigtigt svar: ${esc(q.a)}. Ingen svarede rigtigt.`, lander);
  broadcast();
  await sleep(7500);
  state.quiz = null;
  state.spot = null;
  broadcast();
}

/* =====================================================================
   VISNING PÅ SKÆRMEN
   ===================================================================== */
const spaceEls = [];
let centerDice = null, lastDiceSeq = 0, lastHostToast = 0;
const coinHTML = (p, cls = "") => `<span class="coin ${cls}" style="--c:${p.color}"><span>${p.letter}</span></span>`;
const TEMPLE_SVG = '<svg class="temple" viewBox="0 0 30 22" aria-hidden="true"><path d="M2 8 15 1l13 7z" fill="#d7263d" stroke="#151515" stroke-width="1.4" stroke-linejoin="round"/><rect x="3" y="8" width="24" height="2.5" fill="#fff" stroke="#151515"/><g fill="#fff" stroke="#151515"><rect x="5" y="11" width="3" height="7"/><rect x="11" y="11" width="3" height="7"/><rect x="16" y="11" width="3" height="7"/><rect x="22" y="11" width="3" height="7"/></g><rect x="2" y="18" width="26" height="3" fill="#fff" stroke="#151515"/></svg>';

function gridPos(i) {
  if (i === 0) return { r: 9, c: 9, side: "corner" };
  if (i < 8) return { r: 9, c: 9 - i, side: "bottom" };
  if (i === 8) return { r: 9, c: 1, side: "corner" };
  if (i < 16) return { r: 9 - (i - 8), c: 1, side: "left" };
  if (i === 16) return { r: 1, c: 1, side: "corner" };
  if (i < 24) return { r: 1, c: 1 + (i - 16), side: "top" };
  if (i === 24) return { r: 1, c: 9, side: "corner" };
  return { r: 1 + (i - 24), c: 9, side: "right" };
}

function renderBoard() {
  const board = $("#board");
  board.querySelectorAll(".sp").forEach(e => e.remove());
  spaceEls.length = 0;
  SPACES.forEach((sp, i) => {
    const g = gridPos(i);
    const el = document.createElement("div");
    el.className = "sp " + g.side;
    el.style.gridRow = g.r;
    el.style.gridColumn = g.c;
    el.title = sp.name;
    const pic = `<div class="sp-pic" style="background-image:url(${imgSrc(sp.img, true)})"></div>`;
    if (sp.type === "prop") {
      el.innerHTML = `<div class="band" style="background:${GROUPS[sp.group].color}"></div>
        <div class="sp-body"><div class="sp-name">${esc(sp.short)}</div>${pic}<div class="sp-price num">${fmt(sp.price)}</div></div><div class="own"></div>`;
    } else if (sp.type === "travel") {
      el.innerHTML = `<div class="sp-body"><div class="sp-name">${esc(sp.short)}</div>${pic}<div class="sp-price num">${fmt(sp.price)}</div></div><div class="own"></div>`;
    } else if (sp.type === "oracle" || sp.type === "gunst") {
      el.classList.add("deck", sp.type);
      el.innerHTML = `<div class="sp-body"><div class="sp-name">${sp.type === "oracle" ? "Oraklets spådomme" : "Gudernes gunst"}</div>${pic}</div>`;
    } else if (sp.type === "tax") {
      el.innerHTML = `<div class="sp-body"><div class="sp-name">${esc(sp.short)}</div>${pic}<div class="sp-price num">Betal ${fmt(sp.amount)}</div></div>`;
    } else if (sp.type === "start") {
      el.classList.add("corner", "c-start");
      el.innerHTML = `<div class="cpic" style="background-image:url(${imgSrc(sp.img, true)})"></div><div class="arrow">&larr;</div>
        <div class="clabel"><b>Start ved Agoraen</b><small>Modtag ${fmt(ECON.passStart)}, når du passerer</small></div>`;
    } else if (sp.type === "exile") {
      el.classList.add("corner", "c-exile");
      el.innerHTML = `<div class="cpic" style="background-image:url(${imgSrc(sp.img, true)})"></div>
        <div class="visit2"></div><div class="visit">Kun på<br>besøg</div>
        <div class="xbox" style="background-image:repeating-linear-gradient(90deg,rgba(0,0,0,.75) 0 .28em,transparent .28em 1.25em),url(${imgSrc(sp.img, true)})"><span>EKSIL</span></div>`;
    } else if (sp.type === "quiz") {
      el.classList.add("corner", "c-quiz");
      el.innerHTML = `<div class="cpic" style="background-image:url(${imgSrc(sp.img, true)})"></div>
        <div class="clabel"><b>Frappé-pausen</b><small>Visdomsprøve for alle</small></div>`;
    } else if (sp.type === "ostra") {
      el.classList.add("corner", "c-ostra");
      el.innerHTML = `<div class="cpic" style="background-image:url(${imgSrc(sp.img, true)})"></div>
        <div class="clabel"><b>Ostrakisme</b><small>Gå direkte i eksil</small></div>`;
    }
    el.addEventListener("click", () => previewSpace(i));
    board.appendChild(el);
    spaceEls[i] = el;
  });
  if (!centerDice) centerDice = Dice.create($("#centerDice"));
}

function updateBoard() {
  SPACES.forEach((sp, i) => {
    if (!isOwnable(i) || !spaceEls[i]) return;
    const ps = state.props[i];
    if (!ps) return;
    const el = spaceEls[i];
    el.querySelector(".own").style.background = ps.owner === null ? "transparent" : state.players[ps.owner].color;
    el.classList.toggle("mortgaged", !!ps.mortgaged);
    if (sp.type === "prop") {
      const band = el.querySelector(".band");
      const html = ps.level === 5 ? TEMPLE_SVG : '<span class="altar"></span>'.repeat(ps.level);
      if (band.dataset.lv !== String(ps.level)) { band.innerHTML = html; band.dataset.lv = ps.level; }
    }
  });
}

function highlightSpace(i) {
  const el = spaceEls[i];
  if (!el) return;
  el.classList.remove("hl"); void el.offsetWidth; el.classList.add("hl");
}

/* ---------------- Brikker ---------------- */
function renderTokens() {
  const layer = $("#tokens");
  layer.innerHTML = "";
  state.players.forEach(p => {
    const t = document.createElement("div");
    t.className = "tok";
    t.id = "tok-" + p.pid;
    t.innerHTML = coinHTML(p);
    layer.appendChild(t);
  });
  positionTokens();
}
function spotFor(p) {
  const el = spaceEls[p.pos];
  let x = el.offsetLeft + el.offsetWidth / 2, y = el.offsetTop + el.offsetHeight / 2;
  if (p.pos === EXILE_POS) {
    if (p.inExile) { x = el.offsetLeft + el.offsetWidth * 0.66; y = el.offsetTop + el.offsetHeight * 0.36; }
    else { x = el.offsetLeft + el.offsetWidth * 0.5; y = el.offsetTop + el.offsetHeight * 0.84; }
  }
  return { x, y, key: p.pos + (p.pos === EXILE_POS && p.inExile ? "x" : "") };
}
function positionTokens() {
  if (!state.players.length || !spaceEls.length) return;
  const size = parseFloat(getComputedStyle($("#board")).fontSize) * 3;
  const groups = {};
  state.players.forEach(p => {
    const t = document.getElementById("tok-" + p.pid);
    if (!t) return;
    t.hidden = p.bankrupt;
    t.classList.toggle("active", p.pid === state.current && state.phase === "play");
    if (p.bankrupt) return;
    const s = spotFor(p);
    (groups[s.key] = groups[s.key] || []).push({ s, t });
  });
  Object.values(groups).forEach(list => {
    const n = list.length;
    list.forEach((o, k) => {
      let dx = 0, dy = 0;
      if (n === 2) dx = (k ? 0.34 : -0.34) * size;
      else if (n > 2) { dx = (k % 2 ? 0.32 : -0.32) * size; dy = (k < 2 ? -0.3 : 0.3) * size; }
      o.t.style.left = (o.s.x + dx) + "px";
      o.t.style.top = (o.s.y + dy) + "px";
    });
  });
}
function hopToken(p) {
  positionTokens();
  const t = document.getElementById("tok-" + p.pid);
  if (t && !reduced()) { t.classList.remove("hop"); void t.offsetWidth; t.classList.add("hop"); }
}

function fitBoard() {
  const wrap = $("#boardWrap"), board = $("#board");
  if (!wrap || $("#game").hidden) return;
  const narrow = window.innerWidth <= 1000;
  const ring = 22;
  const w = wrap.clientWidth - ring * 2;
  const h = window.innerHeight - 32 - ring * 2;
  const size = Math.max(320, Math.floor(narrow ? w : Math.min(w, h)));
  board.style.width = size + "px";
  board.style.height = size + "px";
  board.style.fontSize = (size / 84) + "px";
  positionTokens();
}

/* ---------------- Spotlight-kort ---------------- */
function rentGrid(i, hlLevel) {
  const sp = SPACES[i];
  if (sp.type === "travel") {
    return `<div class="rent-mini">${ECON.transportRent.map((r, k) => `<div class="${hlLevel === k ? "hl" : ""}">${k + 1} rute${k ? "r" : ""}<b>${fmt(r)}</b></div>`).join("")}</div>`;
  }
  const labels = ["Grundleje", "1 alter", "2 altre", "3 altre", "4 altre", "Tempel"];
  return `<div class="rent-mini">${sp.rent.map((r, k) => `<div class="${hlLevel === k ? "hl" : ""}">${labels[k]}<b>${fmt(r)}</b></div>`).join("")}</div>`;
}
function spaceCardHTML(i, note, noteKind) {
  const sp = SPACES[i];
  const ps = state.props[i];
  const g = sp.group ? GROUPS[sp.group] : null;
  const bandBg = g ? g.color : (sp.type === "exile" ? "#2b2b2b" : sp.type === "quiz" ? "#f2c14e" : sp.type === "ostra" ? "#d7263d" : "#0d5eaf");
  const bandFg = g ? textOn(sp.group) : (sp.type === "quiz" ? "#151515" : "#fff");
  const kicker = g ? g.name : ({ start: "Start", tax: "Udgift", exile: "Hjørne", quiz: "Hjørne", ostra: "Hjørne" }[sp.type] || "");
  let extra = "";
  if (isOwnable(i)) {
    const hl = ps && ps.owner !== null ? (sp.type === "travel" ? Rules.travelCount(state, ps.owner) - 1 : ps.level) : -1;
    extra += rentGrid(i, hl);
    if (ps && ps.owner !== null) {
      const o = state.players[ps.owner];
      extra += `<div class="owner-tag">${coinHTML(o)}<span>Ejes af ${esc(o.name)}${ps.level ? " · " + Rules.levelLabel(ps.level) : ""}${ps.mortgaged ? " · pantsat" : ""}</span></div>`;
    } else extra += `<div class="owner-tag"><span>Pris ${fmt(sp.price)} · ledig</span></div>`;
  }
  return `<div class="card">
    <div class="card-band" style="background:${bandBg};color:${bandFg}"><small>${esc(kicker)}</small><b>${esc(sp.name)}</b></div>
    <div class="spot-row">
      <div class="card-img" style="flex:1 1 55%;height:auto;aspect-ratio:4/3;background-image:url(${imgSrc(sp.img)})"></div>
      <div class="card-body" style="flex:1 1 45%">
        <div class="card-text">${esc(sp.fact)}</div>
        ${sp.tip ? `<div class="card-tip"><b>Turisttip:</b> ${esc(sp.tip)}</div>` : ""}
        ${extra}
      </div>
    </div>
    ${note ? `<div class="card-body" style="padding-top:0"><div class="card-effect ${noteKind || ""}">${esc(note)}</div></div>` : ""}
  </div>`;
}
function cardHTML(deck, idx) {
  const card = (deck === "oracle" ? ORACLE_CARDS : GUNST_CARDS)[idx];
  const info = DECK_INFO[deck];
  const e = card.effect;
  const sign = e.type === "money" ? (e.amount > 0 ? "plus" : "minus") : ["collectEach", "amnesty"].includes(e.type) ? "plus" : ["payEach", "repairs", "exile"].includes(e.type) ? "minus" : "";
  return `<div class="card">
    <div class="card-band" style="background:${info.color};color:${deck === "oracle" ? "#fff" : "#151515"}"><small>${esc(info.name)}</small><b>${esc(card.title)}</b></div>
    <div class="spot-row">
      <div class="card-img" style="flex:1 1 50%;height:auto;aspect-ratio:4/3;background-image:url(${imgSrc(card.img)})"></div>
      <div class="card-body" style="flex:1 1 50%;justify-content:center">
        <div class="card-text" style="font-size:1.12em">${esc(card.text)}</div>
        <div class="card-effect ${sign}">${esc(card.label)}</div>
      </div>
    </div>
  </div>`;
}
const SHAPES = ["▲", "◆", "●", "■"];
function quizHTML(s) {
  const q = QUIZ[s.qi];
  const lander = state.players[s.lander];
  let opts = s.opts.map((o, k) => {
    let cls = "qopt q" + k;
    if (s.phase === "reveal") cls += k === s.correct ? " right" : " dim";
    return `<div class="${cls}"><span class="shape">${SHAPES[k]}</span><span>${esc(o)}</span></div>`;
  }).join("");
  let foot;
  if (s.phase === "ask") {
    const left = Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000));
    const frac = Math.max(0, Math.min(1, (s.deadline - Date.now()) / (ECON.quizSeconds * 1000)));
    foot = `<div class="timer-bar"><i style="transform:scaleX(${frac})"></i></div>
      <div class="quiz-meta"><span>${s.answered} af ${s.total} har svaret</span><span class="num">${left} sek.</span></div>`;
  } else {
    const winners = (s.winners || []).map(w => { const p = state.players[w.pid]; return `<span>${coinHTML(p)}${esc(p.name)} +${fmt(w.gain)}</span>`; }).join("");
    foot = `<div class="card-tip"><b>Rigtigt svar: ${esc(q.a)}.</b> ${esc(q.why)}</div>
      <div class="winners">${winners || "<span>Ingen svarede rigtigt denne gang</span>"}</div>`;
  }
  return `<div class="card wide quiz-card">
    <div class="card-band" style="background:#f2c14e;color:#151515"><small>Frappé-pausen · ${esc(lander ? lander.name : "")} landede her</small><b>Visdomsprøve</b></div>
    <div class="spot-row">
      <div class="card-img" style="flex:0 0 32%;height:auto;aspect-ratio:3/4;background-image:url(${imgSrc(q.img)})"></div>
      <div class="card-body" style="flex:1">
        <div class="quiz-q">${esc(q.q)}</div>
        <div class="quiz-grid">${opts}</div>
        ${foot}
      </div>
    </div>
  </div>`;
}
function msgHTML(s) {
  return `<div class="card">
    <div class="card-band" style="background:${s.band || "#0d5eaf"};color:#fff"><small>${esc(s.kicker || "")}</small><b>${esc(s.title)}</b></div>
    <div class="spot-row">
      ${s.img ? `<div class="card-img" style="flex:1 1 45%;height:auto;aspect-ratio:4/3;background-image:url(${imgSrc(s.img)})"></div>` : ""}
      <div class="card-body" style="flex:1 1 55%;justify-content:center"><div class="card-text" style="font-size:1.15em">${esc(s.text)}</div></div>
    </div>
  </div>`;
}
function overHTML(s) {
  const w = state.players[s.ranking[0].pid];
  const rows = s.ranking.map((r, k) => {
    const p = state.players[r.pid];
    return `<div class="owner-tag" style="justify-content:space-between;font-size:1.1em;padding:.35em .2em;border-bottom:1px dashed #cfd6df">
      <span style="display:flex;gap:.5em;align-items:center">${k + 1}. ${coinHTML(p)} ${esc(p.name)}</span><span class="num">${r.bankrupt ? "Fallit" : fmt(r.worth)}</span></div>`;
  }).join("");
  return `<div class="card">
    <div class="card-band" style="background:${w.color};color:#fff"><small>${s.reason === "rounds" ? "Sidste runde er spillet" : "Kun én spiller tilbage"}</small><b>${esc(w.name)} vinder!</b></div>
    <div class="spot-row">
      <div class="card-img" style="flex:1 1 45%;height:auto;aspect-ratio:4/3;background-image:url(${imgSrc("parthenon")})"></div>
      <div class="card-body" style="flex:1 1 55%">
        <div class="card-text">Som Perikles i Athens guldalder står ${esc(w.name)} tilbage som den rigeste borger i Hellas. Formue er kontanter plus ejendomme og bygninger.</div>
        ${rows}
        <button class="btn primary" id="againBtn" type="button">Nyt spil</button>
      </div>
    </div>
  </div>`;
}
let lastSpotKey = "";
function renderSpot() {
  const el = $("#spot");
  const s = state.spot;
  if (!s) { el.hidden = true; el.innerHTML = ""; lastSpotKey = ""; return; }
  let html = "";
  if (s.k === "space") html = spaceCardHTML(s.i, s.note, s.noteKind);
  else if (s.k === "card") html = cardHTML(s.deck, s.idx);
  else if (s.k === "quiz") html = quizHTML(s);
  else if (s.k === "msg") html = msgHTML(s);
  else if (s.k === "over") html = overHTML(s);
  const key = JSON.stringify(s) + (s.k === "space" ? JSON.stringify(state.props[s.i] || null) : "");
  if (key === lastSpotKey && s.k !== "quiz") return;
  lastSpotKey = key;
  el.hidden = false;
  if (s.k === "quiz" && el.firstElementChild && el.dataset.q === String(s.qi) + s.phase) {
    el.innerHTML = html;
    el.firstElementChild.style.animation = "none";
  } else el.innerHTML = html;
  el.dataset.q = s.k === "quiz" ? String(s.qi) + s.phase : "";
  const again = $("#againBtn");
  if (again) again.addEventListener("click", () => showSetup());
}
setInterval(() => { if (state.spot && state.spot.k === "quiz" && state.spot.phase === "ask") renderSpot(); }, 500);

/* ---------------- Panelet ---------------- */
function renderPanel() {
  if ($("#game").hidden || !state.players.length) return;
  const p = cur();
  $("#roundInfo").textContent = state.maxRounds ? `Runde ${state.round} af ${state.maxRounds}` : `Runde ${state.round}`;
  $("#codeBtn").textContent = "Kode " + (H.code || "");
  $("#turnBox").style.borderLeftColor = p.color;
  $("#turnWho").innerHTML = `${coinHTML(p)}<b>${esc(p.name)}</b>`;

  const pr = state.prompt;
  const titleEl = $("#promptTitle"), optsEl = $("#promptOpts"), noteEl = $("#promptNote");
  optsEl.innerHTML = "";
  if (state.phase === "over") {
    titleEl.textContent = "Spillet er slut.";
    noteEl.textContent = "";
  } else if (state.quiz && state.quiz.phase === "ask") {
    titleEl.textContent = "Alle svarer på visdomsprøven på deres telefon.";
    const missing = state.quiz.pids.filter(pid => !(pid in state.quiz.answers) && hostControls(pid));
    missing.forEach(pid => {
      const pl = state.players[pid];
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;width:100%";
      row.innerHTML = `${coinHTML(pl)}<span style="flex:1;font-weight:700">${esc(pl.name)}</span>`;
      SHAPES.forEach((sh, k) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "qopt q" + k; b.style.cssText = "min-height:0;padding:.35em .6em";
        b.textContent = sh;
        b.addEventListener("click", () => handleAnswer(pid, state.quiz.id, k));
        row.appendChild(b);
      });
      optsEl.appendChild(row);
    });
    noteEl.textContent = missing.length ? "Spillere uden telefon kan svare her på skærmen." : "";
  } else if (pr) {
    titleEl.textContent = pr.title;
    const control = hostControls(pr.pid);
    evalOptions(pr).forEach(o => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn small " + (control ? (o.style || "") : "readonly");
      b.textContent = o.label;
      b.disabled = control && o.disabled;
      if (control) b.addEventListener("click", () => { const now = evalOptions(state.prompt || pr).find(x => x.v === o.v); if (state.prompt === pr && now && !now.disabled) answerPrompt(o.v); });
      optsEl.appendChild(b);
    });
    const who = state.players[pr.pid];
    noteEl.textContent = control ? (isOnline(pr.pid) ? "Du styrer fra skærmen." : `${who.name} har ingen telefon tilsluttet, så der kan vælges her.`) : `${who.name} vælger på sin telefon.`;
  } else {
    titleEl.textContent = "";
    noteEl.textContent = "";
  }
  $("#manageBtn").hidden = !(pr && canManageNow(pr.pid) && hostControls(pr.pid) && Rules.ownedBy(state, pr.pid).length);
  $("#controlBtn").textContent = "Styr fra skærmen: " + (H.forceControl ? "til" : "fra");

  $("#playersBox").innerHTML = state.players.map(pl => {
    const owned = Rules.ownedBy(state, pl.pid);
    const meta = pl.bankrupt ? "Fallit" : [`Formue ${fmt(Rules.netWorth(state, pl.pid))}`, pl.inExile ? "i eksil" : "", pl.amnesty.length ? `${pl.amnesty.length} amnestikort` : ""].filter(Boolean).join(" · ");
    return `<div class="prow ${pl.pid === state.current && state.phase === "play" ? "cur" : ""} ${pl.bankrupt ? "out" : ""}">
      ${coinHTML(pl)}
      <div style="min-width:0"><div class="nm">${esc(pl.name)} <span class="dot ${isOnline(pl.pid) ? "on" : ""}" title="${isOnline(pl.pid) ? "Telefon tilsluttet" : "Ingen telefon"}"></span></div>
        <div class="meta">${esc(meta)}</div>
        <div class="ownsq">${owned.map(i => `<i style="background:${groupOf(i).color};${state.props[i].mortgaged ? "opacity:.35" : ""}" title="${esc(SPACES[i].name)}"></i>`).join("")}</div></div>
      <div class="money num">${fmt(pl.money)}</div>
    </div>`;
  }).join("");
  $("#feed").innerHTML = state.feed.slice(-6).reverse().map(f => `<div style="${f.color ? "border-left-color:" + f.color : ""}">${f.html}</div>`).join("");
}

function showHostToast(text, kind) {
  const box = $("#toasts");
  const t = document.createElement("div");
  t.className = "toast " + (kind || "");
  t.textContent = text;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), 3800);
}

function renderAll() {
  if (state.phase === "lobby") renderLobby();
  if ($("#game").hidden) return;
  updateBoard();
  positionTokens();
  renderPanel();
  renderSpot();
  if (centerDice && state.dice.seq !== lastDiceSeq) {
    lastDiceSeq = state.dice.seq;
    const p = state.players[state.dice.pid];
    $("#diceInfo").textContent = "";
    centerDice.land(state.dice.d).then(() => {
      $("#diceInfo").textContent = `${p ? p.name + ": " : ""}${state.dice.d[0] + state.dice.d[1]}${state.dice.d[0] === state.dice.d[1] ? " · to ens" : ""}`;
    });
  }
}

/* ---------------- Modal (sjældent brug på skærmen) ---------------- */
function openModal(title, bodyHTML, buttons, mount) {
  return new Promise(resolve => {
    const m = $("#modal");
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true"><div class="mhead">${title}</div><div class="mbody">${bodyHTML}</div><div class="mfoot"></div></div>`;
    const close = v => { m.hidden = true; m.innerHTML = ""; resolve(v); };
    buttons.forEach(b => {
      const el = document.createElement("button");
      el.type = "button"; el.className = "btn " + (b.cls || ""); el.textContent = b.label;
      el.addEventListener("click", () => close(b.v));
      m.querySelector(".mfoot").appendChild(el);
    });
    m.hidden = false;
    if (mount) mount(m.querySelector(".mbody"), close);
  });
}

function previewSpace(i) {
  if (state.phase !== "play" && state.phase !== "over") return;
  if (!$("#modal").hidden) return;
  const sp = SPACES[i];
  const text = sp.fact || DECK_INFO[sp.type] && DECK_INFO[sp.type].fact || "";
  openModal(esc(sp.name), `<img src="${imgSrc(sp.img)}" alt="" style="border-radius:10px;width:100%;max-height:300px;object-fit:cover">
    <p style="margin:0">${esc(text)}</p>${sp.tip ? `<div class="card-tip"><b>Turisttip:</b> ${esc(sp.tip)}</div>` : ""}
    ${isOwnable(i) ? rentGrid(i, -1) : ""}`, [{ label: "Luk", v: 0, cls: "primary" }]);
}

function openHostManager() {
  const pr = state.prompt;
  if (!pr || !canManageNow(pr.pid)) return;
  const pid = pr.pid, p = state.players[pid];
  openModal(`Ejendomme: ${esc(p.name)}`, "", [{ label: "Luk", v: 0, cls: "primary" }], body => {
    const draw = () => {
      const debt = state.prompt && state.prompt.kind === "debt";
      body.innerHTML = `<div style="font-weight:800">Drachmer: <span class="num">${fmt(p.money)}</span>${debt ? ` · Skal betale ${fmt(state.prompt.amount)}` : ""}</div>`;
      Rules.ownedBy(state, pid).forEach(i => {
        const sp = SPACES[i], ps = state.props[i];
        const row = document.createElement("div");
        row.className = "mrow";
        row.innerHTML = `<span class="bar" style="background:${groupOf(i).color}"></span>
          <div><b>${esc(sp.name)}</b><br><small>${sp.type === "prop" ? Rules.levelLabel(ps.level) : "Rejserute"}${ps.mortgaged ? " · pantsat" : ""} · leje ${fmt(Rules.rent(state, i))}</small></div><div class="acts"></div>`;
        const acts = row.querySelector(".acts");
        const add = (label, act, ok, cls) => {
          const b = document.createElement("button");
          b.type = "button"; b.className = "btn small " + (cls || ""); b.textContent = label; b.disabled = !ok;
          b.addEventListener("click", () => { handleManage(pid, act, i); draw(); });
          acts.appendChild(b);
        };
        if (sp.type === "prop" && !debt) add(`${ps.level === 4 ? "Byg tempel" : "Byg alter"} ${fmt(Rules.buildCost(i))}`, "build", Rules.canBuild(state, pid, i), "sun");
        if (sp.type === "prop" && ps.level > 0) add(`Sælg +${fmt(Rules.buildCost(i) / 2)}`, "sell", Rules.canSell(state, pid, i));
        if (!ps.mortgaged) add(`Pantsæt +${fmt(sp.price / 2)}`, "mortgage", Rules.canMortgage(state, pid, i));
        else if (!debt) add(`Indfri ${fmt(Rules.unmortgageCost(i))}`, "unmortgage", Rules.canUnmortgage(state, pid, i));
        body.appendChild(row);
      });
    };
    draw();
  });
}

/* =====================================================================
   OPSÆTNING, LOBBY OG OPSTART
   ===================================================================== */
const setup = { count: 4, rounds: 12, rows: TOKENS.map(t => ({ name: t.defName, token: t.id })) };
try { Object.assign(setup, JSON.parse(localStorage.getItem(SETUP_KEY) || "{}")); } catch (e) { /* standardværdier */ }

function showScreen(id) {
  ["setup", "lobby", "game"].forEach(s => { $("#" + s).hidden = s !== id; });
  if (id === "game") { fitBoard(); renderTokens(); renderAll(); }
}

function showSetup() {
  if (H.net) { H.net.destroy(); H.net = null; }
  H.conns.clear();
  H.code = null;
  H.resume = false;
  state.phase = "setup";
  state.prompt = null; state.quiz = null; state.spot = null;
  $("#modal").hidden = true;
  showScreen("setup");
  const saved = loadSave();
  const s = $("#setup");
  const draw = () => {
    s.innerHTML = `<div class="sheet">
      <div class="sheet-hero"><h1>ΠΟΛΙΣ</h1><p>Nafplio · Athen</p></div>
      <form class="sheet-body" id="setupForm" autocomplete="off">
        ${saved ? `<div class="slot" style="background:#e3eefa"><b>Der er et gemt spil fra runde ${saved.s.round} (${new Date(saved.savedAt).toLocaleString("da-DK", { weekday: "short", hour: "2-digit", minute: "2-digit" })}).</b>
          <button type="button" class="btn primary small" id="resumeBtn">Fortsæt spillet</button></div>` : ""}
        <div><h3>Antal spillere</h3><div class="seg">
          ${[3, 4].map(n => `<button type="button" class="btn ${setup.count === n ? "sel" : ""}" data-count="${n}">${n} spillere</button>`).join("")}
        </div></div>
        <div><h3>Spillere og brikker</h3><div style="display:flex;flex-direction:column;gap:10px">
          ${setup.rows.slice(0, setup.count).map((r, k) => {
            const t = TOKENS.find(x => x.id === r.token);
            return `<div class="prow-setup">${coinHTML(t)}<div>
              <input id="pname${k}" data-row="${k}" maxlength="16" value="${esc(r.name)}" aria-label="Navn på spiller ${k + 1}">
              <div class="tokpick">${TOKENS.map(o => `<button type="button" class="${o.id === r.token ? "sel" : ""}" data-row="${k}" data-token="${o.id}">${coinHTML(o)}${o.label}</button>`).join("")}</div>
            </div></div>`;
          }).join("")}
        </div></div>
        <div><h3>Spillets længde</h3><div class="seg">
          ${GAME_LENGTHS.map(g => `<button type="button" class="btn ${setup.rounds === g.rounds ? "sel" : ""}" data-rounds="${g.rounds}">${g.label} <small>${g.rounds ? g.rounds + " runder, " : ""}${g.note}</small></button>`).join("")}
        </div></div>
        <details><summary style="cursor:pointer;font-weight:800">Sådan spiller man</summary><ul>${RULES.map(r => `<li>${esc(r)}</li>`).join("")}</ul></details>
        <button type="submit" class="btn primary" style="font-size:1.2rem;padding:16px">Opret spil og vis QR-kode</button>
      </form></div>`;
    const saveNames = () => s.querySelectorAll("input[data-row]").forEach(inp => { setup.rows[+inp.dataset.row].name = inp.value; });
    s.querySelectorAll("[data-count]").forEach(b => b.addEventListener("click", () => { saveNames(); setup.count = +b.dataset.count; draw(); }));
    s.querySelectorAll("[data-rounds]").forEach(b => b.addEventListener("click", () => { saveNames(); setup.rounds = +b.dataset.rounds; draw(); }));
    s.querySelectorAll("[data-token]").forEach(b => b.addEventListener("click", () => {
      saveNames();
      const row = +b.dataset.row, tok = b.dataset.token;
      const other = setup.rows.findIndex((r, k) => r.token === tok && k !== row);
      if (other >= 0) setup.rows[other].token = setup.rows[row].token;
      setup.rows[row].token = tok;
      draw();
    }));
    const rb = $("#resumeBtn");
    if (rb) rb.addEventListener("click", () => resumeGame(saved));
    $("#setupForm").addEventListener("submit", e => { e.preventDefault(); saveNames(); createGame(); });
  };
  draw();
}

function createGame() {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch (e) { /* ignorer */ }
  clearSave();
  state.players = setup.rows.slice(0, setup.count).map((r, k) => {
    const t = TOKENS.find(x => x.id === r.token);
    return { pid: k, name: (r.name || "").trim() || t.defName, color: t.color, letter: t.letter, money: ECON.startMoney, pos: 0,
             inExile: false, exileTries: 0, amnesty: [], bankrupt: false, cid: null };
  });
  state.props = {};
  SPACES.forEach(sp => { if (isOwnable(sp.i)) state.props[sp.i] = { owner: null, level: 0, mortgaged: false }; });
  state.decks = { oracle: shuffle(ORACLE_CARDS.map((c, k) => k)), gunst: shuffle(GUNST_CARDS.map((c, k) => k)) };
  state.quizOrder = shuffle(QUIZ.map((q, k) => k));
  state.current = 0; state.round = 1; state.maxRounds = setup.rounds; state.doubles = 0;
  state.feed = []; state.toasts = []; state.ranking = null; state.spot = null; state.prompt = null; state.quiz = null;
  H.resume = false;
  state.phase = "lobby";
  startNet(Net.makeCode());
  showScreen("lobby");
  renderLobby();
}

function resumeGame(saved) {
  Object.assign(state, saved.s);
  state.feed = state.feed || [];
  state.toasts = []; state.ranking = null; state.spot = null; state.prompt = null; state.quiz = null; state.doubles = 0;
  H.resume = true;
  state.phase = "lobby";
  startNet(saved.code);
  showScreen("lobby");
  renderLobby();
}

function joinUrl() {
  const u = new URL("telefon.html", location.href);
  u.search = "?rum=" + H.code + (Net.local ? "&lokal=1" : "");
  u.hash = "";
  return u.toString();
}

function qrSvg(text) {
  try {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch (e) { return ""; }
}

function netStatusText() {
  return ({ online: ["Klar: telefonerne kan forbinde", "ok"], connecting: ["Forbinder til netværket …", ""], reconnecting: ["Genopretter forbindelsen …", "bad"],
            "id-busy": ["Koden er stadig optaget fra sidste gang; prøver igen om lidt …", "bad"], offline: ["Ikke forbundet", "bad"] }[H.netStatus]) || ["", ""];
}

function renderLobby() {
  if (state.phase !== "lobby") return;
  const url = joinUrl();
  const [st, cls] = netStatusText();
  const connected = state.players.filter(p => isOnline(p.pid)).length;
  $("#lobby").innerHTML = `<div class="sheet">
    <div class="sheet-hero"><h1>ΠΟΛΙΣ</h1><p>${H.resume ? `Fortsæt fra runde ${state.round}` : "Scan og vælg din spiller"}</p></div>
    <div class="sheet-body">
      <div class="lobby-grid">
        <div class="qr">${qrSvg(url)}</div>
        <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
          <div><h3>Kode</h3><div class="join-code">${esc(H.code)}</div></div>
          <div><h3>Eller åbn på telefonen</h3><div class="join-url">${esc(url)}</div></div>
          <div class="net-status ${cls}">${esc(st)}</div>
          <div>${state.players.map(p => `<div class="slot">${coinHTML(p)}<b>${esc(p.name)}</b>
            <span class="st ${isOnline(p.pid) ? "on" : ""}">${isOnline(p.pid) ? "Telefon tilsluttet" : "Venter"}</span></div>`).join("")}</div>
        </div>
      </div>
      <p style="margin:0;color:#59677a">Alle spillere åbner kameraet på telefonen, scanner koden og trykker på deres eget navn. Spillere uden telefon kan styres fra skærmen.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn" type="button" id="lobbyBack">Tilbage</button>
        <button class="btn primary" type="button" id="lobbyStart" style="font-size:1.15rem">${H.resume ? "Fortsæt spillet" : "Start spillet"} (${connected} af ${state.players.length} klar)</button>
      </div>
    </div></div>`;
  $("#lobbyBack").addEventListener("click", () => showSetup());
  $("#lobbyStart").addEventListener("click", startPlaying);
}

function startPlaying() {
  state.phase = "play";
  showScreen("game");
  renderBoard();
  renderTokens();
  if (!H.resume) feed(`Spillet begynder. Alle starter med ${fmt(ECON.startMoney)}. Det er <b>${esc(gen(cur().name))}</b> tur.`, cur());
  else feed(`Spillet fortsætter fra runde ${state.round}. Det er <b>${esc(gen(cur().name))}</b> tur.`, cur());
  H.resume = false;
  broadcast();
  requestWakeLock();
  gameLoop();
}

let wakeLock = null;
async function requestWakeLock() {
  try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { /* ikke tilladt */ }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state.phase === "play") requestWakeLock(); });

function init() {
  $("#codeBtn").addEventListener("click", () => {
    const url = joinUrl();
    openModal("Tilslut en telefon", `<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center"><div class="qr" style="width:240px">${qrSvg(url)}</div>
      <div><div class="join-code">${esc(H.code)}</div><div class="join-url">${esc(url)}</div></div></div>`, [{ label: "Luk", v: 0, cls: "primary" }]);
  });
  $("#rulesBtn").addEventListener("click", () => openModal("Sådan spiller man", `<ul style="margin:0;padding-left:20px">${RULES.map(r => `<li>${esc(r)}</li>`).join("")}</ul>`, [{ label: "Luk", v: 0, cls: "primary" }]));
  $("#newBtn").addEventListener("click", async () => {
    const v = await openModal("Start et nyt spil?", "<p style='margin:0'>Det nuværende spil afsluttes. Et gemt spil kan genoptages fra startskærmen.</p>",
      [{ label: "Fortsæt spillet", v: 0 }, { label: "Nyt spil", v: 1, cls: "bad" }]);
    if (v === 1) { save(); state.phase = "setup"; location.reload(); }
  });
  $("#controlBtn").addEventListener("click", () => { H.forceControl = !H.forceControl; renderPanel(); });
  $("#manageBtn").addEventListener("click", openHostManager);
  window.addEventListener("resize", fitBoard);
  if (window.ResizeObserver) new ResizeObserver(fitBoard).observe($("#boardWrap"));
  window.addEventListener("beforeunload", e => { if (state.phase === "play") { save(); e.preventDefault(); e.returnValue = ""; } });
  window.addEventListener("pagehide", () => { if (H.net) for (const id of H.conns.keys()) H.net.send(id, { t: "bye" }); });
  showSetup();
}
init();
