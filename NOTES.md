# Noter til videre arbejde

Til den, der arbejder videre på Polis (også en ny Claude-session).

## Opbygning
* Ren statisk side uden byggetrin; hostes på GitHub Pages.
* `index.html` er brættet på computeren (værten). `telefon.html` er hver spillers controller.
* Værten bestemmer alt i spillet; telefonerne sender kun valg og får en personlig visning (`view`).
* Vigtigste filer: `js/data.js` (felter, kort, quiz, økonomi), `js/rules.js` (regler), `js/host.js` (spillet og brættet), `js/phone.js` (telefonen), `js/net.js` (forbindelse), `js/sound.js` (lyde), `js/map.js` (kort).

## Ting der er lette at ødelægge
* Forbindelsen bruger PeerJS med `serialization: "binary"`. Med "json" afvises beskeder over cirka 16 kB, og så går profilfotos i stykker for alle.
* Fotos sendes som egne beskeder (`{t:"photo"}`) og holdes under 12.000 tegn.
* Billederne hentes fra Wikimedia af en GitHub Action (`img/`, `img/kreditering.json`). Ret i manifestet, ikke i billedfilerne.
* Lyd må først startes efter et klik eller tastetryk (browserens regler).
* Kortnøglen til CARTO står i `js/map.js`. Fejler den, bruges OpenStreetMap automatisk.

## Brugerens ønsker
* Svar på dansk og uden tankestreger; ingen undskyldninger.
* Lejligheden ligger på Staikopoulou 46, Nafplio.
* Åbent spørgsmål: ønskes valgfri baggrundsmusik (lyre) eller lavere lyd på brikkens hop?

## Test
Se `tests/README.md`.
