/* =====================================================================
   Profilbilleder: et symbol fra AVATAR_ICONS eller et foto.
   avatar = { kind: "icon", id } | { kind: "photo", src, v }
   Fotos skaleres til 192×192 JPEG (ca. 10-20 kB), så de kan sendes
   hurtigt mellem skærmen og telefonerne.
   ===================================================================== */
"use strict";

const Avatars = (() => {
  const SIZES = [192, 160, 128];
  const TARGET_LEN = 12000;   // holder hver besked langt under PeerJS' grænse på 16 kB
  const MAX_LEN = 16000;
  const ICON_BY_ID = Object.fromEntries(AVATAR_ICONS.map(a => [a.id, a]));
  const DEFAULT_BY_TOKEN = { sparta: "spartan-helmet", athen: "barn-owl", korinth: "pegasus", theben: "greek-sphinx" };

  const iconSVG = id => {
    const ic = ICON_BY_ID[id];
    return ic ? `<svg viewBox="0 0 512 512" aria-hidden="true">${ic.body}</svg>` : "";
  };
  const isValidPhoto = src => typeof src === "string" && src.length < MAX_LEN && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(src);
  const isValidIcon = id => typeof id === "string" && !!ICON_BY_ID[id];

  /* p: { color, letter, avatar }. photoSrc: kan overstyre billedkilden (telefonens cache). */
  function html(p, cls = "", photoSrc) {
    const a = p.avatar || {};
    const src = photoSrc || a.src;
    const title = p.name ? ` title="${esc(p.name)}"` : "";
    if (a.kind === "photo" && isValidPhoto(src)) {
      return `<span class="coin photo ${cls}" style="--c:${p.color}"${title}><img src="${src}" alt=""></span>`;
    }
    if (a.kind === "icon" && isValidIcon(a.id)) {
      return `<span class="coin icon ${cls}" style="--c:${p.color}"${title}>${iconSVG(a.id)}</span>`;
    }
    return `<span class="coin ${cls}" style="--c:${p.color}"${title}><span>${esc(p.letter || "")}</span></span>`;
  }

  /* Indlæs et billede fra en fil og beskær det til et kvadrat */
  function fromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) { reject(new Error("Vælg et billede.")); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const s = Math.min(img.naturalWidth, img.naturalHeight);
          const sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
          let out = "";
          for (const size of SIZES) {
            const c = document.createElement("canvas");
            c.width = c.height = size;
            const ctx = c.getContext("2d");
            ctx.fillStyle = "#ffffff";          // gennemsigtige PNG'er bliver hvide, ikke sorte
            ctx.fillRect(0, 0, size, size);
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
            for (let q = 0.82; q >= 0.4; q -= 0.1) {
              out = c.toDataURL("image/jpeg", q);
              if (out.length <= TARGET_LEN) break;
            }
            if (out.length <= TARGET_LEN) break;
          }
          URL.revokeObjectURL(url);
          if (!isValidPhoto(out)) { reject(new Error("Billedet er for stort eller kunne ikke bruges. Prøv et andet.")); return; }
          resolve(out);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Billedet kunne ikke læses.")); };
      img.src = url;
    });
  }

  /* Vælger: et gitter af symboler og en fotoknap. onPick({kind, id|src}) */
  function pickerHTML(color, current, opts = {}) {
    const cur = current || {};
    const icons = AVATAR_ICONS.map(a => `<button type="button" class="av-opt ${cur.kind === "icon" && cur.id === a.id ? "sel" : ""}" data-av-icon="${a.id}" title="${esc(a.label)}" aria-label="${esc(a.label)}" style="--c:${color}">${iconSVG(a.id)}</button>`).join("");
    const inputId = "avfile-" + Math.random().toString(36).slice(2, 8);
    return `<div class="av-picker">
      <div class="av-grid">${icons}</div>
      <div class="av-photo-row">
        <label class="btn small ${opts.dark ? "ghost" : ""}" for="${inputId}">${opts.camera ? "Tag eller vælg et foto" : "Upload et foto"}</label>
        <input type="file" id="${inputId}" accept="image/*" data-av-file hidden>
        ${cur.kind === "photo" ? `<button type="button" class="btn small ${opts.dark ? "ghost" : ""}" data-av-icon="${opts.fallback || "spartan-helmet"}">Fjern foto</button>` : ""}
        <span class="av-err" aria-live="polite"></span>
      </div>
    </div>`;
  }
  function bindPicker(root, onPick, onError) {
    root.querySelectorAll("[data-av-icon]").forEach(b => b.addEventListener("click", () => onPick({ kind: "icon", id: b.dataset.avIcon })));
    root.querySelectorAll("[data-av-file]").forEach(inp => inp.addEventListener("change", async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try { onPick({ kind: "photo", src: await fromFile(f) }); }
      catch (e) {
        const msg = (e && e.message) || "Billedet kunne ikke bruges.";
        if (onError) onError(msg);
        else { const err = root.querySelector(".av-err"); if (err && err.isConnected) err.textContent = msg; }
      }
    }));
  }

  return { html, fromFile, pickerHTML, bindPicker, isValidPhoto, isValidIcon, DEFAULT_BY_TOKEN, iconSVG };
})();
