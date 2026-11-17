# Skriveark

Øve-ark til børn: ét ark pr. bogstav med bogstavsporing, en tegning til
farvelægning, en kort tekst og linjer at skrive på. A4 på tværs.

## Lav en PDF

```bash
npm install
npx playwright install chromium
node lav.js B          # ét bogstav  -> ud/skriveark-B.pdf
node lav.js alle       # alle poster -> ud/skriveark-alle.pdf
```

Scriptet kontrollerer arket, før PDF'en laves: at intet ligger nærmere end
8 mm fra papirets kant, at tegningen bliver i sit vindue, at alle skrivefelter
har præcis de samme linjer, at brødteksten er mindst 14 pt, og at der kun er
sort og hvid. Fejler noget, laves der ingen PDF.

## Tilføj et bogstav

1. Læg tegningen i `billeder/` som PNG. Krav og tegneopskrift står i
   `billeder/TEGNINGER.md`. Mangler tegningen, laves arket alligevel med en
   markering i vinduet, og scriptet siger til.
2. Tilføj en post i `data/bogstaver.json` — kopiér B og ret teksterne.
3. Kør `node lav.js X --gitter`. Så ligger der et koordinatgitter over det
   store bogstav, og pilenes punkter kan aflæses direkte.
4. Skriv punkterne ind under `pile`, og kør uden `--gitter`.

Pilenes koordinater: `(0, 0)` er bogstavets start på grundlinjen, y går opad,
og 1 er én linjeafstand (grundlinje til toplinje). `vej` er de punkter, pilen
går igennem — den bliver glat af sig selv. `nummer` er hvor cirklen med
tallet sidder. En pil uden `vej` er en prik (fx prikken over i og j).

Scriptet tjekker, at alle pilenes punkter ligger inde i bogstavet. Brede
bogstaver (M, W) og bogstaver med lange haler (g, j, p, q, y) gøres
automatisk lidt mindre, så de passer i feltet — pilene følger med.

## Hjælpelinjerne

Alle linjer udledes af `skabelon/konstanter.json`: linjeafstand,
stregtykkelse og midterlinjens placering. Sporingsbogstavernes størrelse
regnes ud fra samme tal, så de små bogstaver rammer midterlinjen præcis.
Store bogstaver går præcis fra grundlinjen til toplinjen, små bogstaver
rammer midterlinjen. Ingen linje er placeret i hånden.

## Skrifttype

Brødtekst og skrivebogstaver: Andika fra SIL — lavet til børn, der lærer at læse, med tydeligt forskellige
a, g og q og fuld æ, ø og å. Licens: `skrifttype/OFL.txt`.
Overskrifter: Merriweather. Licens: `skrifttype/OFL-merriweather.txt`.

## Tegningerne

Tegningen skal være realistisk, men med åbne flader, så den er sjov at
farvelægge. Hold øverste højre hjørne af billedet tomt — dér står dyrets
navn. `billeder/brachiosaurus.png` er klippet ud af Saras forlæg.
