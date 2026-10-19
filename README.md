# Klipp

En Ditto-liknande urklippshanterare för macOS. Klipp sparar allt du kopierar (text, formaterad text, bilder och filer), låter dig söka i historiken med ett kortkommando och klistrar in valt klipp i programmet du kom ifrån. Byggd med Electron så att den kan byggas på en Mac med bara Node installerat, utan Xcode. Allt sparas lokalt, ingen nätverkstrafik.

## Installera på Mac

1. Installera Node (22 eller nyare): `brew install node` eller hämta LTS från nodejs.org.
2. Hämta koden och bygg:

```bash
git clone https://github.com/kpkatrik1/klipp.git
cd klipp
npm install
npm run install:mac
```

`install:mac` bygger `Klipp.app`, signerar den, kopierar den till `/Applications` och startar den. Klipp syns som en ikon i menyraden, inte i Dock.

Vill du bara bygga utan att installera: `npm run build:mac` (resultatet hamnar i `dist/`).

## Behörigheter

macOS frågar efter tre saker. Alla finns under Systeminställningar → Integritet och säkerhet.

| Behörighet | Varför | Var |
|---|---|---|
| Hjälpmedel | Klipp skickar Cmd+V till programmet du kom ifrån | Hjälpmedel → slå på Klipp |
| Automation | Cmd+V skickas via System Events | Automation → Klipp → System Events (dialogen kommer vid första inklistringen) |
| Klistra in från andra appar | Klipp läser urklipp var 300:e ms. Utan Tillåt visar macOS "Klipp vill klistra in från …" om och om igen | Klistra in från andra appar → Klipp → Tillåt |

Utan Hjälpmedel-behörigheten hamnar klippet ändå på urklipp, men du får trycka Cmd+V själv.

### Slipp ge behörigheter om efter ombyggnad

Appen signeras ad hoc som standard. Då ser macOS varje ny bygge som ett nytt program och nollställer behörigheterna. Skapa ett eget certifikat en gång så återanvänds det automatiskt:

1. Öppna Nyckelhanteraren → meny Nyckelhanterare → Certifikatassistent → Skapa ett certifikat…
2. Namn: `Klipp Dev`. Identitetstyp: Självsignerad rot. Certifikattyp: Kodsignering. Skapa.
3. Kör `npm run install:mac` igen. Skriptet hittar certifikatet och använder det.

## Kortkommandon

| Tangent | Gör |
|---|---|
| Ctrl+Ö | Öppna/stäng Klipp vid muspekaren |
| Skriv | Sök i klippen |
| Pil upp/ner | Flytta markeringen |
| Enter | Klistra in markerat klipp (flera markerade klistras in på var sin rad) |
| Shift+Enter | Klistra in som ren text |
| Esc | Stäng |
| Cmd+1 … Cmd+9 | Klistra in klipp nummer 1–9 i listan direkt |
| Shift+klick / Cmd+klick | Markera flera |
| Cmd+A | Markera alla synliga |
| Cmd+P | Fäst/lossa markerat klipp |
| Cmd+E | Redigera klippets text (Cmd+Enter sparar, Esc avbryter) |
| Cmd+Backspace | Ta bort markerade klipp (fästa klipp tas bort via högerklick) |
| Cmd+M eller högerklick | Meny: klistra in, fäst, flytta till grupp, byt namn, redigera, ta bort |
| Cmd+[ / Cmd+] | Byt flik (Historik, Fästa, grupper) |

Fästa klipp rensas aldrig automatiskt. Grupper skapas med `+` i flikraden eller via menyn Flytta till grupp → Ny grupp. Högerklicka på en gruppflik för att byta namn eller ta bort gruppen (klippen ligger kvar under Fästa).

## Inställningar

`~/Library/Application Support/Klipp/settings.json` skapas vid första start. Ändra, spara och starta om Klipp.

| Nyckel | Standard | Betydelse |
|---|---|---|
| `hotkey` | `Control+;` | Electron-accelerator i amerikansk tangentbordslayout. `Control+;` är tangenten där Ö sitter på svenskt tangentbord. |
| `hotkeyLabel` | `Ctrl+Ö` | Texten som visas i menyn |
| `maxClips` | `500` | Antal ofästa klipp som sparas |
| `pollMs` | `300` | Hur ofta urklipp läses av |
| `pasteDelayMs` | `120` | Paus mellan att fönstret stängs och Cmd+V skickas |
| `hideOnBlur` | `true` | Stäng fönstret när det tappar fokus |
| `previewChars` | `500` | Max tecken i förhandsvisningen |
| `thumbMaxPx` | `200` | Storlek på miniatyrer av bilder |

Data: `klipp.json` i samma mapp, bilder under `images/` och `thumbs/`. Menyradsikonen har Öppna datamapp.

## Utveckla på Windows

Allt utom själva inklistringen och Mac-paketeringen går att köra på Windows:

```bash
npm install
npm test
npm start
```

Avsluta Ditto först, annars äger Ditto Ctrl+Ö och Klipp faller tillbaka på Ctrl+Alt+V. `KLIPP_SMOKE=<mapp> npm start` kör ett självtest av gränssnittet mot egen testdata och skriver skärmdumpar och `report.json` till mappen.

## Kända begränsningar

- En fil per klipp vid kopiering i Finder. Filklipp klistras in i Finder, inte som text i andra program.
- Urklipp läses med polling (300 ms). Mycket snabba på varandra följande kopieringar kan slås ihop.
- Electron: appen tar runt 200 MB på disk och runt 100 MB RAM.
- Ad hoc-signatur nollställer behörigheter vid ombyggnad (se ovan).
- Ingen synk, ingen kryptering, inga inställningar i gränssnittet.
