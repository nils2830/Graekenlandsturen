# Polis: Nafplio og Athen

Et familiebrætspil i Monopoly-stil om Nafplio, Argolis og Athen. Brættet vises på en computer eller et tv, og hver spiller styrer sin egen tur fra sin telefon: terninger, køb, byggeri og visdomsprøver. Undervejs lærer man lidt om de steder, man besøger på ferien.

## Sådan spiller I

1. Åbn spillet på computeren (se adressen nedenfor) og skriv spillernes navne.
2. Tryk **Opret spil og vis QR-kode**.
3. Hver spiller scanner QR-koden med telefonens kamera og trykker på sit eget navn.
4. Tryk **Start spillet** på computeren. Derefter foregår alt på telefonerne.

Spillere uden telefon kan styres direkte fra skærmen. Mister en telefon forbindelsen, så åbn siden igen; den finder selv tilbage til den rigtige spiller. Spillet gemmes automatisk på computeren ved starten af hver tur.

## Læg spillet gratis på nettet (GitHub Pages)

Spillet er en ren hjemmeside uden server, så det kan ligge gratis på GitHub Pages. Telefonerne forbinder direkte til computeren via den gratis PeerJS-tjeneste.

1. Gå til repoet på GitHub: **Settings → General**, rul ned til **Danger Zone** og vælg **Change visibility → Public**. GitHub Pages er kun gratis for offentlige repoer.
2. Gå til **Settings → Pages**. Under **Build and deployment** vælges **Deploy from a branch**.
3. Vælg grenen med spillet (for eksempel `main` efter en merge, eller `claude/upbeat-goodall-pyeaec`) og mappen **/ (root)**, og tryk **Save**.
4. Efter et par minutter ligger spillet på `https://nils2830.github.io/Test/`. Åbn den adresse på computeren.

Vil I hellere holde repoet privat, kan mappen i stedet trækkes ind på [Netlify Drop](https://app.netlify.com/drop) med en gratis konto.

## Prøv det lokalt

```bash
python3 -m http.server 8000
```

Åbn `http://localhost:8000/index.html?lokal=1` i én fane og `http://localhost:8000/telefon.html?lokal=1&cid=test1` i en anden. Med `?lokal=1` taler fanerne sammen inde i browseren, så man kan teste uden internet og uden telefoner.

## Billeder

Alle billeder er rigtige fotos og malerier fra Wikimedia Commons. Fotograf, licens og link til originalen står på siden `kreditering.html`, som også kan åbnes fra spillet.

Billederne hentes af GitHub Action-workflowet `Hent billeder` ud fra `img/manifest.json`. Vil du skifte et billede, så ret Wikipedia-titlen eller søgeordene for det i manifestet og push ændringen; workflowet henter, skalerer og krediterer automatisk det nye billede.

## Regler i korte træk

* Alle starter med 1.500 ₯ og får 200 ₯ for at passere Start ved Agoraen.
* Du må bygge op til 2 altre på alle dine ejendomme. Ejer du hele farvegruppen, fordobles grundlejen, og du kan bygge op til 4 altre og et tempel.
* Lejen er den samme andel af prisen for alle ejendomme, så ingen farvegruppe er en sikker vinder.
* Frappé-pausen giver en visdomsprøve, hvor alle svarer på telefonen.
* Vælg et spil på 12 eller 20 runder; den rigeste vinder. Eller spil til der kun er én tilbage.

## Filer

| Fil | Indhold |
| --- | --- |
| `index.html`, `js/host.js`, `css/host.css` | Brættet på den store skærm, som styrer spillet |
| `telefon.html`, `js/phone.js`, `css/phone.css` | Spillerens telefon |
| `js/data.js` | Felter, fakta, kort, quizspørgsmål og økonomi |
| `js/rules.js` | Regler for leje, byggeri og pantsætning |
| `js/net.js` | Forbindelsen mellem skærm og telefoner (PeerJS) |
| `js/dice.js` | 3D-terningerne |
| `vendor/` | PeerJS 1.5.4 og qrcode-generator 1.4.4 (MIT-licens) |
