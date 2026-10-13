/* =====================================================================
   Regler, som både brættet og telefonerne bruger.
   G er et øjebliksbillede: { props: {felt: {owner, level, mortgaged}}, players: [{money, ...}] }
   ===================================================================== */
"use strict";

const Rules = {
  groupMembers(g) {
    return SPACES.filter(s => s.group === g).map(s => s.i);
  },
  ownedBy(G, pid) {
    return SPACES.filter(s => isOwnable(s.i) && G.props[s.i] && G.props[s.i].owner === pid).map(s => s.i);
  },
  ownsGroup(G, pid, g) {
    return Rules.groupMembers(g).every(i => G.props[i].owner === pid);
  },
  travelCount(G, pid) {
    return Rules.ownedBy(G, pid).filter(i => SPACES[i].type === "travel").length;
  },
  rent(G, i) {
    const sp = SPACES[i], ps = G.props[i];
    if (!ps || ps.owner === null || ps.mortgaged) return 0;
    if (sp.type === "travel") return ECON.transportRent[Rules.travelCount(G, ps.owner) - 1] || 0;
    if (ps.level > 0) return sp.rent[ps.level];
    return Rules.ownsGroup(G, ps.owner, sp.group) ? sp.rent[0] * 2 : sp.rent[0];
  },
  maxLevel(G, pid, i) {
    return Rules.ownsGroup(G, pid, SPACES[i].group) ? 5 : ECON.maxPartialAltars;
  },
  buildCost(i) {
    return GROUPS[SPACES[i].group].build;
  },
  buildBlock(G, pid, i) {
    const sp = SPACES[i], ps = G.props[i];
    if (sp.type !== "prop") return "Rejseruter kan ikke bebygges";
    if (ps.owner !== pid) return "Du ejer ikke ejendommen";
    if (ps.mortgaged) return "Ejendommen er pantsat";
    if (ps.level >= 5) return "Der står allerede et tempel";
    if (ps.level >= Rules.maxLevel(G, pid, i)) return "Eje hele farvegruppen for at bygge mere";
    if (G.players[pid].money < Rules.buildCost(i)) return "Ikke nok drachmer";
    return "";
  },
  canBuild(G, pid, i) { return Rules.buildBlock(G, pid, i) === ""; },
  canSell(G, pid, i) {
    const ps = G.props[i];
    return SPACES[i].type === "prop" && ps.owner === pid && ps.level > 0;
  },
  canMortgage(G, pid, i) {
    const ps = G.props[i];
    return ps.owner === pid && !ps.mortgaged && (ps.level || 0) === 0;
  },
  unmortgageCost(i) { return Math.round(SPACES[i].price / 2 * 1.1); },
  canUnmortgage(G, pid, i) {
    const ps = G.props[i];
    return ps.owner === pid && ps.mortgaged && G.players[pid].money >= Rules.unmortgageCost(i);
  },
  liquidation(G, pid) {
    let v = 0;
    Rules.ownedBy(G, pid).forEach(i => {
      const ps = G.props[i];
      if (SPACES[i].type === "prop") v += ps.level * Rules.buildCost(i) / 2;
      if (!ps.mortgaged) v += SPACES[i].price / 2;
    });
    return v;
  },
  netWorth(G, pid) {
    let w = G.players[pid].money;
    Rules.ownedBy(G, pid).forEach(i => {
      const ps = G.props[i];
      w += ps.mortgaged ? SPACES[i].price / 2 : SPACES[i].price;
      if (SPACES[i].type === "prop") w += ps.level * Rules.buildCost(i);
    });
    return w;
  },
  levelLabel(level) {
    if (!level) return "Ingen bygninger";
    if (level === 5) return "Tempel";
    return level === 1 ? "1 alter" : level + " altre";
  }
};
