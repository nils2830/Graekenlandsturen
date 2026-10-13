/* =====================================================================
   POLIS · Nafplio & Athen
   Fælles spildata for brættet (index.html) og telefonerne (telefon.html)
   ===================================================================== */
"use strict";

const ECON = {
  startMoney: 1500,
  passStart: 200,
  exileFee: 50,
  quizCorrect: 50,      // alle der svarer rigtigt
  quizLander: 100,      // den der landede på feltet og svarer rigtigt
  maxPartialAltars: 2,  // altre man må bygge uden at eje hele gruppen
  transportRent: [30, 60, 120, 200],
  quizSeconds: 25
};

const GAME_LENGTHS = [
  { rounds: 12, label: "Kort", note: "ca. 45 min" },
  { rounds: 20, label: "Mellem", note: "ca. 75 min" },
  { rounds: 0,  label: "Til sidste mand", note: "kan tage flere timer" }
];

const GROUPS = {
  brown:  { name: "Nafplios strande",     color: "#955436", build: 40 },
  lblue:  { name: "Nafplios gamle by",    color: "#aae0fa", build: 60 },
  pink:   { name: "Nafplios fæstninger",  color: "#d93a96", build: 80 },
  orange: { name: "Argolis' oldtid",      color: "#f7941d", build: 100 },
  red:    { name: "Athens kvarterer",     color: "#ed1b24", build: 120 },
  yellow: { name: "Athens oldtidsminder", color: "#fef200", build: 140 },
  dblue:  { name: "Akropolis",            color: "#0072bb", build: 200 },
  travel: { name: "Rejseruter",           color: "#2b2b2b", build: 0 }
};
const LIGHT_GROUPS = ["lblue", "yellow"];

const TOKENS = [
  { id: "sparta",  label: "Sparta-rød",   color: "#d7263d", letter: "Λ", defName: "Leonidas" },
  { id: "athen",   label: "Athen-blå",    color: "#1b65d6", letter: "Α", defName: "Perikles" },
  { id: "korinth", label: "Korinth-grøn", color: "#1e9e57", letter: "Ϙ", defName: "Bouboulina" },
  { id: "theben",  label: "Theben-guld",  color: "#e0a400", letter: "Θ", defName: "Kapodistrias" }
];

/* Leje som andel af prisen: grundleje, 1-4 altre, tempel. Samme forhold
   for alle ejendomme, så ingen farvegruppe er en sikker vinder. */
const RENT_FACTORS = [0.10, 0.45, 1.2, 2.6, 3.2, 3.8];
function niceRound(x) {
  if (x < 20) return Math.max(2, Math.round(x));
  if (x < 100) return Math.round(x / 5) * 5;
  return Math.round(x / 10) * 10;
}

/* type: start | prop | travel | oracle | gunst | tax | exile | quiz | ostra */
const SPACES = [
  { type: "start", name: "Start ved Agoraen", img: "agora",
    fact: "Agoraen var oldtidens Athens torv, hvor man handlede, diskuterede politik og lyttede til filosoffer som Sokrates. Den lange søjlehal, Attalos' Stoa, er genopbygget og rummer i dag Agoraens museum.",
    tip: "Billetten til Agoraen giver også adgang til Hefaistos-templet." },
  { type: "prop", group: "brown", name: "Arvanitia-stranden", short: "Arvanitia", price: 60, img: "arvanitia",
    fact: "Arvanitia er Nafplios egen bystrand, gemt under klipperne ved Akronafplia, med småsten i midten og klipper i siderne. Herfra går en populær promenade på omkring en kilometer rundt om halvøen.",
    tip: "Følg kyststien videre, hvis du hellere vil have sand under fødderne på Karathona." },
  { type: "gunst", name: "Gudernes Gunst", img: "olympiere" },
  { type: "prop", group: "brown", name: "Karathona-stranden", short: "Karathona", price: 80, img: "karathona",
    fact: "Karathona er en lang sandstrand omkring tre kilometer fra Nafplio, som man kan gå til ad en kyststi fra Arvanitia. Vandet er lavt langt ud, så stranden er populær hos børnefamilier." },
  { type: "travel", group: "travel", name: "Nafplios havn", short: "Nafplios havn", price: 200, img: "havn",
    fact: "Nafplio var hovedstad i det nye, frie Grækenland, indtil kong Otto flyttede hovedstaden til Athen i 1834. Fra kajen sejler små både ud til borgen Bourtzi midt i havnen." },
  { type: "prop", group: "lblue", name: "Den gamle bydel", short: "Gamle bydel", price: 100, img: "gamlebydel",
    fact: "Nafplios gamle bydel er fuld af smalle gader, venetianske huse med smedejernsaltaner og bougainvillea over dørene. Byen har skiftet hænder mellem byzantinere, venetianere og osmannere, og alle har sat deres præg på husene." },
  { type: "prop", group: "lblue", name: "Syntagma-pladsen", short: "Syntagma-pladsen", price: 100, img: "syntagma",
    fact: "Syntagma betyder forfatning, og den marmorbelagte plads er Nafplios hjerte med caféer hele vejen rundt. I den venetianske bygning fra 1713 ligger byens arkæologiske museum med Dendra-rustningen, en bronzerustning på over 3.000 år." },
  { type: "prop", group: "lblue", name: "Agios Spyridon-kirken", short: "Agios Spyridon", price: 120, img: "spyridon",
    fact: "Foran denne lille kirke blev Grækenlands første statsoverhoved, Ioannis Kapodistrias, myrdet i 1831. En af kuglerne ramte kirkemuren, og mærket kan stadig ses ved indgangen." },
  { type: "exile", name: "Bortvist i Eksil", img: "kolokotronis",
    fact: "Frihedshelten Theodoros Kolokotronis blev i 1834 dømt til døden for forræderi og sad fængslet på Palamidi. Kong Otto benådede ham året efter, og i dag står han som rytterstatue i Nafplio." },
  { type: "prop", group: "pink", name: "Bourtzi", short: "Bourtzi", price: 140, img: "bourtzi",
    fact: "Den lille borg Bourtzi blev bygget af venetianerne i 1400-tallet på en ø midt i havnen for at beskytte Nafplio mod pirater. Senere boede byens bødler derude, og fra 1930'erne til 1970 var borgen et hotel." },
  { type: "tax", name: "Taverna-regningen", short: "Taverna-regningen", amount: 100, img: "taverna",
    fact: "På en græsk taverna deler man gerne mange små retter, meze, midt på bordet. Ofte byder værten på en lille dessert eller et glas til sidst; det kaldes kerasma, en gave fra huset." },
  { type: "prop", group: "pink", name: "Akronafplia", short: "Akronafplia", price: 140, img: "akronafplia",
    fact: "Akronafplia er klippehalvøen og den ældste del af Nafplio, hvor der har stået mure siden oldtiden. Venetianere og osmannere byggede videre på murene, og i dag kan man gå derop og se ud over byen og havet." },
  { type: "prop", group: "pink", name: "Palamidi", short: "Palamidi", price: 160, img: "palamidi",
    fact: "Venetianerne byggede den enorme fæstning Palamidi mellem 1711 og 1714, men allerede året efter blev den erobret af osmannerne. Lokalt siger man, at der er 999 trin op fra byen; de fleste, der tæller efter, kommer frem til omkring 900.",
    tip: "Gå op tidligt om morgenen, og tag vand med." },
  { type: "oracle", name: "Oraklets Spådomme", img: "pythia" },
  { type: "prop", group: "orange", name: "Tiryns", short: "Tiryns", price: 180, img: "tiryns",
    fact: "Tiryns var en mykensk borg kun få kilometer fra Nafplio, kendt for sine mure af kæmpesten, der hver kan veje flere tons. De gamle grækere troede, at kun kykloperne, de enøjede kæmper, kunne have løftet dem." },
  { type: "prop", group: "orange", name: "Mykene", short: "Mykene", price: 180, img: "mykene",
    fact: "Mykene var bronzealderens mægtigste by og ifølge myten kong Agamemnons hjem. Man går ind gennem Løveporten, hvor to løver har holdt vagt i over 3.000 år." },
  { type: "quiz", name: "Frappé-pausen", img: "frappe",
    fact: "Den iskolde, skummende frappé blev ifølge historien opfundet ved et uheld i Thessaloniki i 1957, da en sælger fra Nescafé ikke kunne finde varmt vand. Her holder alle pause og dyster i en visdomsprøve." },
  { type: "prop", group: "orange", name: "Epidauros' teater", short: "Epidauros", price: 200, img: "epidauros",
    fact: "Teatret i Epidauros er fra 300-tallet f.Kr. og har plads til omkring 13.000 tilskuere. Akustikken er så god, at man kan høre en mønt falde på scenen helt oppe fra de øverste rækker.",
    tip: "Om sommeren spilles der stadig oldgræske tragedier i teatret." },
  { type: "travel", group: "travel", name: "Korinth-kanalen", short: "Korinth-kanalen", price: 200, img: "kanal",
    fact: "Korinth-kanalen blev åbnet i 1893 og skærer sig 6,3 kilometer gennem landtangen, så skibe slipper for at sejle uden om Peloponnes. Den er kun omkring 25 meter bred, og klippevæggene rejser sig op til omkring 80 meter.",
    tip: "Bussen mellem Nafplio og Athen kører over kanalen. Kig ned!" },
  { type: "prop", group: "red", name: "Monastiraki", short: "Monastiraki", price: 220, img: "monastiraki",
    fact: "Monastiraki betyder det lille kloster og har navn efter den lille kirke på pladsen. Kvarteret er kendt for sit loppemarked og sin travle plads med udsigt op til Akropolis." },
  { type: "gunst", name: "Gudernes Gunst", img: "olympiere" },
  { type: "prop", group: "red", name: "Plaka", short: "Plaka", price: 220, img: "plaka",
    fact: "Plaka er Athens ældste kvarter og ligger lige under Akropolis med små stræder, trapper og taverner. Midt i kvarteret ligger Anafiotika, bygget af håndværkere fra øen Anafi, som stadig ligner en lille ølandsby." },
  { type: "prop", group: "red", name: "Evzonerne ved Parlamentet", short: "Evzonerne", price: 240, img: "evzoner",
    fact: "Foran parlamentet i Athen holder evzonerne vagt ved Den Ukendte Soldats Grav, og hver hele time er der vagtskifte. Deres skørt, fustanellaen, siges at have 400 folder, én for hvert år under osmannisk styre." },
  { type: "travel", group: "travel", name: "Piræus", short: "Piræus", price: 200, img: "piraeus",
    fact: "Piræus har været Athens havn i omkring 2.500 år og er i dag en af Europas største passagerhavne. Herfra sejler færgerne ud til næsten alle de græske øer." },
  { type: "ostra", name: "Ostrakisme", img: "ostraka",
    fact: "I oldtidens Athen kunne borgerne én gang om året stemme en politiker i eksil i ti år ved at ridse hans navn på et potteskår, et ostrakon. Arkæologer har fundet tusindvis af disse skår, mange med navnet Themistokles." },
  { type: "prop", group: "yellow", name: "Hefaistos-templet", short: "Hefaistos-templet", price: 260, img: "hefaistos",
    fact: "Hefaistos-templet ved Agoraen blev bygget omkring 450 f.Kr. og er et af de bedst bevarede græske templer i verden. Det skyldes blandt andet, at det i mange hundrede år blev brugt som kirke." },
  { type: "prop", group: "yellow", name: "Zeus-templet", short: "Zeus-templet", price: 260, img: "zeus",
    fact: "Templet for den olympiske Zeus var et af oldtidens største templer, og det tog over 600 år at bygge det færdigt. Af de 104 kæmpesøjler står 15 stadig, og en 16. ligger væltet, hvor en storm smed den i 1852." },
  { type: "oracle", name: "Oraklets Spådomme", img: "pythia" },
  { type: "prop", group: "yellow", name: "Panathinaiko Stadion", short: "Stadion", price: 280, img: "stadion",
    fact: "Panathinaiko Stadion er det eneste stadion i verden, der er bygget helt af marmor. Her blev de første moderne Olympiske Lege holdt i 1896, og i dag slutter Athen Maraton på stadion." },
  { type: "travel", group: "travel", name: "Athens metro", short: "Metroen", price: 200, img: "metro",
    fact: "Da Athens metro blev gravet ud op til år 2000, fandt arkæologerne titusindvis af oldsager under jorden. På Syntagma station kan man se fundene og et snit gennem jordlagene bag glas, mens man venter på toget." },
  { type: "prop", group: "dblue", name: "Akropolismuseet", short: "Akropolismuseet", price: 350, img: "akropolismuseet",
    fact: "Akropolismuseet åbnede i 2009 ved foden af Akropolis, og gennem glasgulvet kan man se ned i udgravningerne af en gammel bydel. Her står fem af de originale karyatider fra Erechtheion; den sjette står i British Museum i London." },
  { type: "prop", group: "dblue", name: "Parthenon", short: "Parthenon", price: 400, img: "parthenon",
    fact: "Parthenon blev bygget mellem 447 og 432 f.Kr. som tempel for Athena, byens skytsgudinde. Templet ser lige ud, men det er bygget med små, bevidste kurver, så det ser perfekt ud for øjet.",
    tip: "Kom tidligt om morgenen eller sidst på dagen for at undgå varmen og køerne." }
];
SPACES.forEach((s, i) => {
  s.i = i;
  if (s.type === "prop") s.rent = RENT_FACTORS.map(f => niceRound(s.price * f));
});

/* ---------------- Kort: koordinater (WGS84) ----------------
   Fundet via Wikipedia, Pleiades og OpenStreetMap og kontrolleret af to
   uafhængige opslag. Afstande vises i luftlinje fra lejligheden. */
const HOME = { name: "Staikopoulou 46", geo: [0, 0] };
const GEO = {
  // Nafplio (udfyldes med kontrollerede koordinater)
  arvanitia: null, karathona: null, havn: null, gamlebydel: null, syntagma: null,
  spyridon: null, bourtzi: null, akronafplia: null, palamidi: null,
  // Argolis og Korinth
  tiryns: [37.59944, 22.80000],
  mykene: [37.73081, 22.75648],
  epidauros: [37.59611, 23.07917],
  kanal: [37.93472, 22.98389],
  // Athen og Piræus
  agora: [37.97511, 23.72422],
  monastiraki: [37.97630, 23.72585],
  plaka: [37.97222, 23.73056],
  evzoner: [37.97535, 23.73636],
  piraeus: [37.94599, 23.64242],
  hefaistos: [37.97562, 23.72139],
  zeus: [37.96943, 23.73311],
  stadion: [37.96833, 23.74111],
  metro: [37.97528, 23.73528],
  akropolismuseet: [37.96845, 23.72852],
  parthenon: [37.97156, 23.72658]
};
SPACES.forEach(sp => {
  const key = sp.type === "exile" ? "palamidi" : sp.type === "ostra" ? "agora" : sp.img;
  if (!GEO[key]) return;
  sp.geo = GEO[key];
  sp.geoKey = key;
});
SPACES[0].mapName = "Den antikke Agora";

const DECK_INFO = {
  oracle: { name: "Oraklets Spådomme", img: "pythia", color: "#1f2a44",
    fact: "Pythia var præstinde i Apollons tempel i Delfi og gav svar på spørgsmål fra hele den græske verden. Svarene var ofte så gådefulde, at de kunne tolkes på flere måder." },
  gunst: { name: "Gudernes Gunst", img: "olympiere", color: "#f2c14e",
    fact: "De olympiske guder boede ifølge myten på Olympen, Grækenlands højeste bjerg på 2.918 meter. Zeus var gudernes konge, og guderne blandede sig gerne i menneskenes liv." }
};

/* Kort. Effekter: money, moveTo, moveBy, exile, amnesty, payEach, collectEach, repairs, nearestTravel */
const ORACLE_CARDS = [
  { img: "themistokles", title: "Træmurene",
    text: "Oraklet sagde, at athenerne skulle stole på deres træmure. Themistokles forstod, at det betød skibe, og vandt søslaget ved Salamis i 480 f.Kr.",
    effect: { type: "moveTo", to: 23 }, label: "Sejl til Piræus" },
  { img: "sokrates", title: "Sokrates' spørgsmål",
    text: "Filosoffen Sokrates stillede folk på Agoraen så mange spørgsmål, at han til sidst blev dømt i 399 f.Kr. Du har også spurgt lidt for meget.",
    effect: { type: "money", amount: -50 }, label: "Betal 50 ₯ i bøde" },
  { img: "pnyx", title: "Folkeforsamlingen",
    text: "På Pnyx-højen samledes Athens borgere og stemte om byens fremtid; det var verdens første demokrati. I dag har forsamlingen stemt dig ud af byen.",
    effect: { type: "exile" }, label: "Gå direkte i eksil" },
  { img: "kapodistrias", title: "Kapodistrias inviterer",
    text: "Ioannis Kapodistrias blev i 1828 Grækenlands første statsoverhoved og styrede landet fra Nafplio. Han inviterer dig med til gudstjeneste.",
    effect: { type: "moveTo", to: 7 }, label: "Ryk frem til Agios Spyridon-kirken" },
  { img: "otto", title: "Kong Otto flytter",
    text: "Den bayerske prins Otto blev Grækenlands første konge og gik i land i Nafplio i 1833. Året efter flyttede han hovedstaden til Athen, og hans slot er i dag parlamentet.",
    effect: { type: "moveTo", to: 22 }, label: "Ryk frem til Evzonerne ved Parlamentet" },
  { img: "perikles", title: "Perikles bygger",
    text: "Perikles satte i 400-tallet f.Kr. et kæmpe byggeprojekt i gang på Akropolis. Nu er det din tur til at betale for vedligeholdelsen.",
    effect: { type: "repairs", altar: 25, temple: 100 }, label: "Betal 25 ₯ pr. alter og 100 ₯ pr. tempel" },
  { img: "maske", title: "Guld i Mykene",
    text: "Heinrich Schliemann fandt i 1876 en guldmaske i Mykene og troede, det var kong Agamemnons ansigt. Masken er faktisk endnu ældre, men du har også fundet guld.",
    effect: { type: "money", amount: 150 }, label: "Modtag 150 ₯" },
  { img: "bouboulina", title: "Kaptajn Bouboulina",
    text: "Laskarina Bouboulina fra øen Spetses var en af de få kvindelige kaptajner i frihedskrigen og var med til at belejre Nafplio fra søsiden. Sæt kurs mod havnen!",
    effect: { type: "moveTo", to: 4 }, label: "Ryk frem til Nafplios havn" },
  { img: "kolokotronisstatue", title: "Benådet",
    text: "Kong Otto benådede frihedshelten Kolokotronis i 1835, og i dag står han som rytterstatue både i Athen og i Nafplio. Også du får en ny chance.",
    effect: { type: "amnesty" }, label: "Amnestikort: Kom gratis ud af eksil én gang" },
  { img: "dionysosteater", title: "Teater for Dionysos",
    text: "I Dionysos-teatret ved Akropolis opførte man nogle af verdens første tragedier og komedier. Rige borgere betalte for koret, og nu er det din tur.",
    effect: { type: "payEach", amount: 25 }, label: "Betal 25 ₯ til hver medspiller" },
  { img: "odysseus", title: "Odysseus' rejse",
    text: "Odysseus brugte ti år på at sejle hjem fra Trojakrigen. Du håber på en hurtigere tur.",
    effect: { type: "nearestTravel" }, label: "Ryk frem til nærmeste rejserute" },
  { img: "feidippides", title: "Løbet fra Marathon",
    text: "Ifølge legenden løb budbringeren Feidippides fra Marathon til Athen med nyheden om sejren over perserne i 490 f.Kr. Løb med!",
    effect: { type: "moveTo", to: 28 }, label: "Ryk frem til Panathinaiko Stadion" },
  { img: "pest", title: "Pesten",
    text: "Under krigen mod Sparta ramte en pest Athen i 430 f.Kr. Du flygter ud af byen.",
    effect: { type: "moveBy", steps: -3 }, label: "Gå 3 felter tilbage" },
  { img: "agora", title: "Kongens gave",
    text: "Kong Attalos af Pergamon gav athenerne en lang søjlehal på Agoraen som gave. Den står der stadig, genopbygget.",
    effect: { type: "moveTo", to: 0 }, label: "Ryk frem til Start ved Agoraen og modtag 200 ₯" }
];

const GUNST_CARDS = [
  { img: "athena", title: "Athenas gave",
    text: "Athena vandt kampen om Athen ved at give byen et oliventræ, mens Poseidon kun gav en saltvandskilde. Visdommens gudinde belønner dig.",
    effect: { type: "money", amount: 150 }, label: "Modtag 150 ₯" },
  { img: "hermes", title: "Hermes' handel",
    text: "Hermes var handelens og de rejsendes gud, og statuen af ham i Olympia er et af oldtidens smukkeste værker. Dine handler går godt.",
    effect: { type: "money", amount: 100 }, label: "Modtag 100 ₯" },
  { img: "sounion", title: "Solnedgang ved Sounion",
    text: "Poseidons tempel på Kap Sounion er berømt for sin solnedgang, og digteren Lord Byron skal have ridset sit navn i en af søjlerne. Havguden giver dig medvind.",
    effect: { type: "money", amount: 100 }, label: "Modtag 100 ₯" },
  { img: "agiorgitiko", title: "Vin fra Nemea",
    text: "Området omkring Nemea, nord for Nafplio, er kendt for den røde Agiorgitiko-drue. Du vinder en vinsmagning.",
    effect: { type: "money", amount: 75 }, label: "Modtag 75 ₯" },
  { img: "zeusbronze", title: "Zeus' lyn",
    text: "Den store bronzestatue af Zeus eller Poseidon blev fundet i havet ud for Kap Artemision i 1920'erne og står i dag på Nationalmuseet i Athen. Zeus er vred og slynger et lyn.",
    effect: { type: "money", amount: -100 }, label: "Betal 100 ₯" },
  { img: "oliven", title: "Olivenhøst",
    text: "Grækenland er en af verdens største producenter af olivenolie, og nogle af træerne er flere hundrede år gamle. Demeter giver dig en god høst.",
    effect: { type: "money", amount: 100 }, label: "Modtag 100 ₯" },
  { img: "apollon", title: "Apollon hjælper",
    text: "Apollon-templet i det gamle Korinth er et af de ældste græske templer, man stadig kan se. Apollon taler din sag.",
    effect: { type: "amnesty" }, label: "Amnestikort: Kom gratis ud af eksil én gang" },
  { img: "heraion", title: "Heras vrede",
    text: "Heras store helligdom lå nær Argos, kun en kort køretur fra Nafplio. Den jaloux gudinde vil ikke se dig i nærheden.",
    effect: { type: "exile" }, label: "Gå direkte i eksil" },
  { img: "loukoumades", title: "Loukoumades",
    text: "Loukoumades er små, sprøde dejboller med honning og kanel. Værten byder på en portion som kerasma, og du sparer penge.",
    effect: { type: "money", amount: 50 }, label: "Modtag 50 ₯" },
  { img: "nemealove", title: "Løven fra Nemea",
    text: "Herakles' første opgave var at dræbe løven ved Nemea, som ingen våben kunne skade. Du hjælper ham og får løn for det.",
    effect: { type: "money", amount: 50 }, label: "Modtag 50 ₯" },
  { img: "nike", title: "Sejrens gudinde",
    text: "Det lille tempel for Athena Nike, sejrens gudinde, står ved indgangen til Akropolis. Nike fører dig hele vejen op.",
    effect: { type: "moveTo", to: 31 }, label: "Ryk frem til Parthenon" },
  { img: "hefaistosgud", title: "Smedeguden",
    text: "Hefaistos var smedenes gud og lavede både våben og smykker til guderne. Dine bygninger trænger til nye beslag.",
    effect: { type: "repairs", altar: 40, temple: 115 }, label: "Betal 40 ₯ pr. alter og 115 ₯ pr. tempel" },
  { img: "persefone", title: "Foråret kommer",
    text: "Når Persefone vender tilbage fra Underverdenen hvert forår, blomstrer Grækenland igen, fortæller myten.",
    effect: { type: "moveTo", to: 0 }, label: "Ryk frem til Start ved Agoraen og modtag 200 ₯" },
  { img: "paaskeaeg", title: "Røde påskeæg",
    text: "Påsken er Grækenlands største fest, og man slår røde æg mod hinanden; den, hvis æg holder, får held resten af året. Dit æg holdt!",
    effect: { type: "collectEach", amount: 25 }, label: "Modtag 25 ₯ fra hver medspiller" }
];

/* Visdomsprøve: alle svarer på deres telefon */
const QUIZ = [
  { img: "havn", q: "Hvilken by var hovedstad i det frie Grækenland, før Athen tog over i 1834?", a: "Nafplio", wrong: ["Sparta", "Korinth", "Thessaloniki"],
    why: "Nafplio var hovedstad, indtil kong Otto flyttede hovedstaden til Athen i 1834." },
  { img: "palamidi", q: "Hvor mange trin siger de lokale, at der er op til Palamidi?", a: "999", wrong: ["365", "500", "1.500"],
    why: "Legenden siger 999, men de fleste, der tæller efter, når frem til omkring 900." },
  { img: "bourtzi", q: "Hvad hedder den lille borg på øen i Nafplios havn?", a: "Bourtzi", wrong: ["Palamidi", "Akronafplia", "Tiryns"],
    why: "Bourtzi blev bygget af venetianerne i 1400-tallet for at beskytte havnen." },
  { img: "epidauros", q: "Hvad er teatret i Epidauros mest berømt for?", a: "Den fantastiske akustik", wrong: ["At det er bygget af træ", "At det ligger under vandet", "At det er Grækenlands nyeste teater"],
    why: "En mønt, der falder på scenen, kan høres helt oppe på de øverste rækker." },
  { img: "mykene", q: "Hvilke dyr står over porten til Mykene?", a: "To løver", wrong: ["To heste", "To ugler", "To delfiner"],
    why: "Løveporten er over 3.000 år gammel." },
  { img: "evzoner", q: "Hvad kaldes vagterne med pomponer på skoene foran parlamentet i Athen?", a: "Evzoner", wrong: ["Spartanere", "Hoplitter", "Gladiatorer"],
    why: "Evzonerne har vagtskifte hver hele time ved Den Ukendte Soldats Grav." },
  { img: "parthenon", q: "Hvilken gudinde blev Parthenon bygget til?", a: "Athena", wrong: ["Hera", "Afrodite", "Artemis"],
    why: "Athena var Athens skytsgudinde, og byen er opkaldt efter hende." },
  { img: "karyatider", q: "Hvad kaldes kvindestatuerne, der bærer taget på Erechtheion?", a: "Karyatider", wrong: ["Amazoner", "Muser", "Nymfer"],
    why: "De originale karyatider står i dag i Akropolismuseet; dem på templet er kopier." },
  { img: "stadion", q: "Hvilket år blev de første moderne Olympiske Lege holdt i Athen?", a: "1896", wrong: ["1900", "1924", "2004"],
    why: "Legene blev holdt på Panathinaiko Stadion, som også var med ved legene i 2004." },
  { img: "stadion", q: "Hvad er Panathinaiko Stadion bygget af?", a: "Marmor", wrong: ["Beton", "Træ", "Granit"],
    why: "Det er det eneste stadion i verden, der er bygget helt af marmor." },
  { img: "frappe", q: "Hvordan blev frappé-kaffen opfundet ifølge historien?", a: "Ved et uheld, fordi der ikke var varmt vand", wrong: ["Af munke på Athos-bjerget", "Af kong Otto", "Af en italiensk barista"],
    why: "Det skete på en messe i Thessaloniki i 1957." },
  { img: "kanal", q: "Hvor lang er Korinth-kanalen omtrent?", a: "6,3 km", wrong: ["600 meter", "25 km", "80 km"],
    why: "Kanalen blev åbnet i 1893 og er kun omkring 25 meter bred." },
  { img: "flag", q: "Hvad betyder det græske kaliméra?", a: "Godmorgen", wrong: ["Tak", "Farvel", "Skål"],
    why: "Om aftenen siger man kalispéra, godaften." },
  { img: "flag", q: "Hvad siger man på græsk, når man vil sige tak?", a: "Efcharistó", wrong: ["Kaliméra", "Jámas", "Parakaló"],
    why: "Parakaló betyder både vær så venlig og værsgo, og jámas betyder skål." },
  { img: "kapodistrias", q: "Hvem blev skudt ved kirken Agios Spyridon i Nafplio i 1831?", a: "Ioannis Kapodistrias", wrong: ["Kong Otto", "Theodoros Kolokotronis", "Lord Byron"],
    why: "Kapodistrias var Grækenlands første statsoverhoved." },
  { img: "monastiraki", q: "Hvilket kvarter i Athen er kendt for sit loppemarked?", a: "Monastiraki", wrong: ["Plaka", "Kolonaki", "Piræus"],
    why: "Navnet betyder det lille kloster." },
  { img: "sounion", q: "Hvilken gud var templet på Kap Sounion bygget til?", a: "Poseidon", wrong: ["Zeus", "Apollon", "Hermes"],
    why: "Poseidon var havets gud, og templet ligger højt over havet." },
  { img: "pnyx", q: "Hvad betyder det græske ord demokrati?", a: "Folkestyre", wrong: ["Kongestyre", "Gudestyre", "Fåmandsvælde"],
    why: "Demos betyder folk, og kratos betyder magt." },
  { img: "moussaka", q: "Hvad er moussaka lavet af?", a: "Aubergine, kødsovs og bechamelsovs", wrong: ["Fisk og ris", "Kylling og pasta", "Spinat og feta i filodej"],
    why: "Spinat og feta i filodej hedder spanakópita." },
  { img: "flag", q: "Hvor mange striber har det græske flag?", a: "9", wrong: ["5", "7", "13"],
    why: "Striberne siges at stå for de ni stavelser i frihedsråbet Eleftheria i thanatos, frihed eller død." },
  { img: "agiorgitiko", q: "Hvilken drue er området omkring Nemea kendt for?", a: "Agiorgitiko", wrong: ["Riesling", "Merlot", "Chardonnay"],
    why: "Agiorgitiko giver en rød vin og er en af Grækenlands mest dyrkede druer." },
  { img: "akropolismuseet", q: "Hvor mange af de originale karyatider står i Akropolismuseet?", a: "5", wrong: ["1", "3", "6"],
    why: "Den sjette står i British Museum i London." },
  { img: "ostraka", q: "Hvad brugte athenerne potteskår, ostraka, til?", a: "At stemme en politiker i eksil", wrong: ["At betale i butikker", "At spille terninger", "At skrive kærestebreve"],
    why: "Den, der fik flest stemmer, måtte forlade Athen i ti år." },
  { img: "feidippides", q: "Hvem løb ifølge legenden fra Marathon til Athen med sejrsbudskabet?", a: "Feidippides", wrong: ["Herakles", "Odysseus", "Sokrates"],
    why: "Legenden inspirerede maratonløbet ved De Olympiske Lege i 1896." }
];

const RULES = [
  "Alle starter med 1.500 ₯ og får 200 ₯, hver gang de passerer Start ved Agoraen.",
  "Lander du på en ledig ejendom eller rejserute, kan du købe den. Lander du på en andens, betales lejen automatisk.",
  "Du må bygge op til 2 altre på alle dine ejendomme. Ejer du hele farvegruppen, fordobles grundlejen, og du kan bygge op til 4 altre og til sidst et tempel.",
  "Rejseruterne giver mere i leje, jo flere du ejer: 30, 60, 120 eller 200 ₯.",
  "Oraklets Spådomme og Gudernes Gunst er kort med historie og en gevinst eller udgift.",
  "Ved Ostrakisme, tre gange to ens eller visse kort kommer du i eksil. Kom ud ved at betale 50 ₯, bruge et amnestikort eller slå to ens.",
  "På Frappé-pausen dyster alle i en visdomsprøve på telefonen. Rigtigt svar giver 50 ₯, og den, der landede der, får 100 ₯.",
  "Kan du ikke betale, må du sælge altre eller pantsætte. Ellers går du fallit.",
  "Spillet slutter efter det valgte antal runder; den rigeste vinder. Formue er kontanter plus ejendomme og bygninger."
];

/* ---------------- Fælles hjælpere ---------------- */
const imgSrc = (id, small) => `img/${small ? "sm/" : ""}${id}.jpg`;
const fmt = n => Math.round(n).toLocaleString("da-DK") + " ₯";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const gen = n => /[sxzSXZ]$/.test(n) ? n + "'" : n + "s";
const groupOf = i => GROUPS[SPACES[i].group];
const isOwnable = i => SPACES[i].type === "prop" || SPACES[i].type === "travel";
const textOn = g => LIGHT_GROUPS.includes(g) ? "#1a1a1a" : "#ffffff";
const NET_PREFIX = "polis-nafplio-v2-";
