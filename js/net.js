/* =====================================================================
   Netværk mellem brættet (vært) og telefonerne.
   Standard: PeerJS (WebRTC) via den gratis offentlige PeerJS-server.
   Lokal testtilstand (?lokal=1): BroadcastChannel mellem faner i samme browser.
   ===================================================================== */
"use strict";

const Net = (() => {
  const params = new URLSearchParams(location.search);
  const local = params.has("lokal");
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function makeCode(n = 4) {
    let s = "";
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    for (let k = 0; k < n; k++) s += CODE_CHARS[buf[k] % CODE_CHARS.length];
    return s;
  }
  function uid() {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    return buf[0].toString(36) + buf[1].toString(36);
  }
  function cleanCode(s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  }

  /* ---------------- Vært ---------------- */
  function createHost(code, h) {
    const conns = new Map();
    let peer = null, destroyed = false, tries = 0, watchdog = null;

    const addConn = (id, sendFn) => { conns.set(id, { send: sendFn }); h.onOpen(id); };
    const dropConn = id => { if (conns.delete(id)) h.onClose(id); };

    if (local) {
      const bc = new BroadcastChannel("polis-lokal-" + code);
      bc.onmessage = e => {
        const m = e.data;
        if (!m || m.to !== "host") return;
        if (m.k === "hello") {
          if (!conns.has(m.from)) addConn(m.from, d => bc.postMessage({ k: "d", to: m.from, d }));
        } else if (m.k === "d") {
          if (!conns.has(m.from)) addConn(m.from, d => bc.postMessage({ k: "d", to: m.from, d }));
          h.onData(m.from, m.d);
        } else if (m.k === "bye") dropConn(m.from);
      };
      setTimeout(() => h.onStatus("online"), 0);
      return { local, send: (id, d) => { const c = conns.get(id); if (c) c.send(d); }, ids: () => [...conns.keys()], drop: dropConn, destroy() { destroyed = true; bc.close(); } };
    }

    const start = () => {
      if (destroyed) return;
      h.onStatus("connecting");
      peer = new Peer(NET_PREFIX + code, { debug: 1 });
      peer.on("open", () => { tries = 0; h.onStatus("online"); });
      peer.on("connection", conn => {
        const id = conn.connectionId;
        conn.on("open", () => addConn(id, d => { try { if (conn.open) conn.send(d); } catch (err) { /* forbindelsen er lukket */ } }));
        conn.on("data", d => h.onData(id, d));
        conn.on("close", () => dropConn(id));
        conn.on("error", () => dropConn(id));
      });
      peer.on("disconnected", () => {
        h.onStatus("reconnecting");
        setTimeout(() => { if (!destroyed && peer && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch (err) { /* prøver igen */ } } }, 1500);
      });
      peer.on("error", err => {
        if (err.type === "unavailable-id") {
          h.onStatus("id-busy");
          peer.destroy();
          if (++tries < 60) setTimeout(start, 3000);
        } else if (["network", "server-error", "socket-error", "socket-closed"].includes(err.type)) {
          h.onStatus("reconnecting");
        } else {
          console.warn("PeerJS:", err.type, err);
        }
      });
    };
    start();
    watchdog = setInterval(() => {
      if (destroyed || !peer) return;
      if (peer.destroyed) return;
      if (peer.disconnected) { try { peer.reconnect(); } catch (err) { /* næste forsøg */ } }
    }, 6000);
    return {
      local,
      send: (id, d) => { const c = conns.get(id); if (c) c.send(d); },
      ids: () => [...conns.keys()],
      drop: dropConn,
      destroy() { destroyed = true; clearInterval(watchdog); if (peer) peer.destroy(); }
    };
  }

  /* ---------------- Telefon ---------------- */
  function createClient(code, h) {
    const myId = uid();
    let peer = null, conn = null, alive = false, lastMsg = 0, retryTimer = null, bc = null;

    const setAlive = () => {
      lastMsg = Date.now();
      if (!alive) { alive = true; h.onStatus("connected"); h.onOpen(); }
    };
    const lost = reason => {
      if (alive) h.onStatus("lost", reason);
      alive = false;
      scheduleRetry(2000);
    };
    const scheduleRetry = ms => {
      if (retryTimer) return;
      retryTimer = setTimeout(() => { retryTimer = null; connect(); }, ms);
    };

    let connect, send;
    if (local) {
      bc = new BroadcastChannel("polis-lokal-" + code);
      bc.onmessage = e => {
        const m = e.data;
        if (!m || m.to !== myId || m.k !== "d") return;
        setAlive();
        h.onData(m.d);
      };
      connect = () => { h.onStatus("connecting"); bc.postMessage({ k: "hello", from: myId, to: "host" }); setTimeout(() => { if (!alive) { h.onStatus("no-host"); scheduleRetry(2500); } }, 2500); };
      send = d => bc.postMessage({ k: "d", from: myId, to: "host", d });
      window.addEventListener("pagehide", () => bc.postMessage({ k: "bye", from: myId, to: "host" }));
    } else {
      const openConn = () => {
        if (conn) { try { conn.close(); } catch (err) { /* allerede lukket */ } }
        conn = peer.connect(NET_PREFIX + code, { reliable: true, serialization: "json" });
        const thisConn = conn;
        conn.on("open", () => { if (conn === thisConn) setAlive(); });
        conn.on("data", d => { if (conn === thisConn) { lastMsg = Date.now(); h.onData(d); } });
        conn.on("close", () => { if (conn === thisConn) lost("close"); });
        conn.on("error", () => { if (conn === thisConn) lost("error"); });
      };
      connect = () => {
        h.onStatus("connecting");
        if (!peer || peer.destroyed) {
          peer = new Peer({ debug: 1 });
          peer.on("open", openConn);
          peer.on("disconnected", () => { setTimeout(() => { if (peer && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch (err) { /* nyt forsøg */ } } }, 1000); });
          peer.on("error", err => {
            if (err.type === "peer-unavailable") { alive = false; h.onStatus("no-host"); scheduleRetry(3000); }
            else if (["network", "server-error", "socket-error", "socket-closed", "disconnected"].includes(err.type)) { lost(err.type); }
            else console.warn("PeerJS:", err.type, err);
          });
        } else if (peer.open) openConn();
        else if (peer.disconnected) { try { peer.reconnect(); } catch (err) { peer.destroy(); peer = null; } scheduleRetry(2500); }
      };
      send = d => { if (conn && conn.open) { try { conn.send(d); } catch (err) { lost("send"); } } };
    }

    setInterval(() => {
      if (alive) {
        send({ t: "ping" });
        if (Date.now() - lastMsg > 16000) lost("timeout");
      }
    }, 5000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && (!alive || Date.now() - lastMsg > 8000)) {
        alive = false;
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        connect();
      }
    });
    connect();
    return { local, send: d => send(d), isAlive: () => alive, reconnect: () => { alive = false; connect(); } };
  }

  return { local, makeCode, uid, cleanCode, createHost, createClient };
})();
