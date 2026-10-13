# Automatiske tests

Kræver Node og Playwright med Chromium. Start en server i projektmappen først:

    python3 -m http.server 8765

Kør derefter fra projektmappen (OUT er en mappe til skærmbilleder):

| Script | Hvad det tester |
|---|---|
| `node tests/multi.js OUT 10` | Et helt spil med skærm og tre telefoner (lokal tilstand, `?lokal=1`) |
| `node tests/own2.js OUT` | Ejerbånd, pantsætning og bygninger på brættet; tom liste betyder ingen fejl |
| `node tests/fx.js OUT` | Tællende beløb, beløbsmærker og lyde ved betaling og fallit |
| `node tests/sfx.js` | Alle lyde tegnet offline: ingen forvrængning og ingen NaN |
| `node tests/resume.js OUT` | Spillet fortsætter efter genindlæsning af skærmen |
| `node tests/avtest.js OUT` | Profilbilleder: symboler og fotos |
| `node tests/maptest.js OUT` | Kortet og afstande fra lejligheden |
| `node tests/dice.js OUT` | 3D-terningerne |
