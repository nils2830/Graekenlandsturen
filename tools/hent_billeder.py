#!/usr/bin/env python3
"""Henter billeder fra Wikimedia Commons til Polis.

Læser img/manifest.json. For hvert billede prøves i rækkefølge:
  1. "file":   et bestemt filnavn på Commons
  2. "wiki":   hovedbilledet fra en engelsk Wikipedia-artikel
  3. "search": første egnede resultat fra en søgning på Commons
Billederne skaleres til img/<id>.jpg (stor) og img/sm/<id>.jpg (lille), og
ophavsret og licens skrives til img/kreditering.json.
"""
import io, json, os, re, sys, time, html, urllib.parse, urllib.request
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "img")
UA = "PolisBraetspil/1.0 (https://github.com/nils2830/Test; familiebraetspil)"
COMMONS = "https://commons.wikimedia.org/w/api.php"
ENWIKI = "https://en.wikipedia.org/w/api.php"
BAD_WORDS = ("map", "logo", "collage", "drawing", "sketch", "yale center", "plan", "diagram", "coat of arms", "seal", "signature", "kart")

def get_json(url, params):
    params = dict(params, format="json", formatversion="2")
    req = urllib.request.Request(url + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception as e:
            if attempt == 3:
                raise
            time.sleep(2 + attempt * 3)

def get_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3 + attempt * 4)

def strip_html(s):
    s = re.sub(r"<[^>]+>", "", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()

def commons_info(title, allow_svg=False):
    d = get_json(COMMONS, {"action": "query", "titles": title, "prop": "imageinfo",
                           "iiprop": "url|extmetadata|mime|size", "iiurlwidth": "1200"})
    page = d["query"]["pages"][0]
    if page.get("missing") or "imageinfo" not in page:
        return None
    ii = page["imageinfo"][0]
    ok = ("image/jpeg", "image/png", "image/webp", "image/tiff") + (("image/svg+xml",) if allow_svg else ())
    if ii.get("mime") not in ok:
        return None
    meta = ii.get("extmetadata", {})
    return {
        "file": page["title"].replace("File:", "", 1),
        "thumb": ii.get("thumburl") or ii.get("url"),
        "page": ii.get("descriptionurl"),
        "artist": strip_html(meta.get("Artist", {}).get("value", "")) or "Ukendt",
        "license": strip_html(meta.get("LicenseShortName", {}).get("value", "")) or "Se kildesiden",
        "licenseUrl": meta.get("LicenseUrl", {}).get("value", ""),
    }

def from_wiki(title, allow_svg=False):
    d = get_json(ENWIKI, {"action": "query", "titles": title, "prop": "pageimages",
                          "piprop": "name", "redirects": "1"})
    pages = d["query"].get("pages", [])
    if not pages or pages[0].get("missing") or "pageimage" not in pages[0]:
        return None
    return commons_info("File:" + pages[0]["pageimage"], allow_svg)

def from_search(q):
    d = get_json(COMMONS, {"action": "query", "list": "search", "srnamespace": "6",
                           "srsearch": q + " filetype:bitmap", "srlimit": "15"})
    for hit in d["query"]["search"]:
        t = hit["title"]
        low = t.lower()
        if not re.search(r"\.(jpe?g|png)$", low) or any(w in low for w in BAD_WORDS):
            continue
        info = commons_info(t)
        if info:
            return info
    return None

def save(img_bytes, ident):
    im = Image.open(io.BytesIO(img_bytes))
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    big = im.copy(); big.thumbnail((1100, 1100))
    big.save(os.path.join(IMG, ident + ".jpg"), "JPEG", quality=80, optimize=True, progressive=True)
    sm = im.copy(); sm.thumbnail((440, 440))
    sm.save(os.path.join(IMG, "sm", ident + ".jpg"), "JPEG", quality=74, optimize=True, progressive=True)
    return big

def main():
    os.makedirs(os.path.join(IMG, "sm"), exist_ok=True)
    manifest = json.load(open(os.path.join(IMG, "manifest.json"), encoding="utf-8"))
    cred_path = os.path.join(IMG, "kreditering.json")
    credits = json.load(open(cred_path, encoding="utf-8")) if os.path.exists(cred_path) else {}
    log, thumbs = [], []
    for entry in manifest:
        ident = entry["id"]
        key = json.dumps(entry, sort_keys=True)
        target = os.path.join(IMG, ident + ".jpg")
        if credits.get(ident, {}).get("key") == key and os.path.exists(target):
            log.append(f"{ident}: uændret ({credits[ident]['file']})")
            thumbs.append((ident, Image.open(target).convert("RGB")))
            continue
        info, via = None, ""
        try:
            if entry.get("file"):
                info, via = commons_info("File:" + entry["file"]), "file"
            if not info and entry.get("wiki"):
                info, via = from_wiki(entry["wiki"], entry.get("svg", False)), "wiki:" + entry["wiki"]
            searches = entry.get("search") or []
            if isinstance(searches, str):
                searches = [searches]
            for q in searches:
                if info:
                    break
                info, via = from_search(q), "search:" + q
            if not info:
                log.append(f"{ident}: INTET BILLEDE FUNDET")
                for stale in (target, os.path.join(IMG, "sm", ident + ".jpg")):
                    if os.path.exists(stale):
                        os.remove(stale)
                credits.pop(ident, None)
                continue
            big = save(get_bytes(info["thumb"]), ident)
            info.pop("thumb")
            info.update({"via": via, "key": key})
            credits[ident] = info
            thumbs.append((ident, big))
            log.append(f"{ident}: {via} -> {info['file']} [{info['license']}]")
        except Exception as e:
            log.append(f"{ident}: FEJL {e!r}")
        time.sleep(0.4)
    json.dump(credits, open(cred_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
    open(os.path.join(ROOT, "tools", "billedlog.txt"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print("\n".join(log))
    # Kontaktark til gennemsyn
    cols, cw, ch = 6, 240, 190
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cw, max(1, rows) * ch), (30, 30, 30))
    dr = ImageDraw.Draw(sheet)
    for k, (ident, im) in enumerate(thumbs):
        t = im.copy(); t.thumbnail((cw - 8, ch - 26))
        x, y = (k % cols) * cw, (k // cols) * ch
        sheet.paste(t, (x + 4, y + 4))
        dr.text((x + 6, y + ch - 20), ident, fill=(255, 230, 120))
    sheet.save(os.path.join(ROOT, "tools", "oversigt.jpg"), "JPEG", quality=78)

if __name__ == "__main__":
    main()
