# biangbiang

[简体中文](README.md) · [繁體中文](README_zh_TW.md) · [English](README_en_US.md) · [Polski](README_pl_PL.md) · [Русский](README_ru_RU.md) · **Svenska**

![100% SLOP — men den här brickan är handgjord](.github/assets/slop_badge.webp)

Egenhostad **spegel för GitHub-utgåvors artefakter**. Den följer den senaste utgåvan av varje projekt i `config.xml`, laddar ner dess artefakter till din server och delar ut dem via ett snabbt, mobilvänligt gränssnitt byggt med Vue + [Ant Design Vue](https://antdv.com).

Hela projektet körs i **en enda Docker-container**: en enda Node.js-process (Express) serverar API:et, de speglade filerna och den byggda webbappen.

> Kodförråd: <https://github.com/xiaomianguan/biangbiang/>
> Driftdokumentation: [Driftguide (svenska)](ADVANCED_INSTRUCTION_sv_SE.md) · [Advanced Deployment Guide (English)](ADVANCED_INSTRUCTION_en_US.md)

---

## Funktioner

- **Fungerar direkt**: kodförrådet innehåller färdiga `config.xml`, `overwrite.xml` och `assets/` (favicon, projektikoner och ett medföljande typsnitt). Klona det och kör `docker compose up -d --build` så får du en komplett webbplats utan att förbereda något — bygg vidare på exemplet eller ta bort det och börja från noll.
- **Automatisk spegling** av alla artefakter som bifogats en GitHub-utgåva.
- **Källkodsarkiv undantas** — arkiven `Source code (zip)` / `Source code (tar.gz)` som GitHub lägger till automatiskt speglas aldrig.
- **Söker efter uppdateringar var 24:e timme** (konfigurerbart) och behåller bara den senaste versionen av varje projekt på disk.
- **Valfritt antal projekt** — ett `<project>` i `config.xml` blir ett kort.
- **Manuella poster** — skriver du `<repo>overwrite@{number}</repo>` hämtas kortets data från `overwrite.xml` i stället, så GitHub-projekt och godtyckliga externa nedladdningslänkar kan blandas på en och samma webbplats.
- **Helt konfigurationsdrivet**: titel, favicon samt varje projekts ikon/namn/kodförråd kommer från `config.xml`; ikonerna är vanliga PNG/WEBP-filer och kodförrådet innehåller ett färdigt exempel du kan byta ut fritt.
- **Valfri sortering av korten**: sätt `<sortable>true</sortable>` och en sorteringslista dyker upp i sidhuvudet där besökare kan ordna korten efter namn, senast uppdaterad, flest filer eller minst filer. Med `false` (eller utan taggen) behåller korten exakt ordningen från `config.xml`.
- **Konfigurerbar accentfärg**: ge `<accent>` namnet på en färg ur Ant Designs [basPaletter](https://ant.design/docs/spec/colors) — till exempel `volcano` eller `purple` — och webbplatsen använder den i stället för standardblått. Utelämnad eller felstavad ger standardblått.
- **Konfigurerbart typsnitt**: peka `<font>` mot en typsnittsfil (t.ex. `.woff2`) och hela webbplatsen — Ant Design-komponenterna inräknade — byter till den. Sökvägen tolkas relativt `config.xml`, precis som `<favicon>`. Utelämnad, eller mot en fil som inte finns, behålls systemtypsnittet.
- **Ljust / mörkt tema**, som standard "följ systemet", med möjlighet att tvinga fram ljust eller mörkt. Implementerat med Ant Design Vues designtokens.
- **Installerbar som PWA** (manifest + service worker) — med **ingen offline-cachning**, med avsikt; appnamnet följer `<title>` och ikonerna följer `<favicon>`.
- **Flerspråkigt gränssnitt**: sätt `<lang>` till `zh_cn`, `zh_tw`, `en_us`, `pl_pl`, `ru_ru` eller `sv_se` och hela gränssnittet — texter, datumformat och texten som Ant Design renderar inuti sina egna komponenter — byter till det språket. Utelämnad tagg eller okänt värde behåller förenklad kinesiska.
- **Responsivt kortrutnät** — en kolumn på telefon, två på surfplatta, tre på dator. Varje kort anpassas efter sitt eget innehåll och sträcks aldrig ut till det högsta kortet i raden. Ett kortare kort flyter dessutom upp i lediga utrymmet under sig, så avståndet mellan korten är alltid 16 px: Safari 26.4+ gör detta nativt med Grid Lanes, och i alla andra webbläsare lägger gränssnittet ut korten själv.
- **Robust**: ett trasigt eller felstavat kodförråd fäller aldrig hela webbplatsen — ett projekt vars synkning misslyckas behåller sina senast speglade data. Exempelkonfigurationen behåller med avsikt två felande kort för att visa det.

---

## Så fungerar det

```text
                    var 24:e h   ┌──────────────────────────────┐
        GitHub REST API ───────► │  Spegelmotor (backend)       │
   (releases/latest)             │  · hämta senaste utgåvan     │
                                 │  · ladda ner artefakter      │
                                 │  · ta bort gamla versioner   │
                                 └──────────────┬───────────────┘
                                                │ skriv
                                                ▼
                              data/releases/{owner}/{repo}/{version}/{file}
                                                │
   webbläsare ──► Express ──────────────────────┘
                 ├─ /                  → byggd Vue-app (statiska filer)
                 ├─ /api/state         → aktuell JSON: titel, projekt, versioner
                 ├─ /media/{path}      → favicon och projektikoner från konfigmappen
                 └─ /dl/{owner}/{repo}/{version}/{file}  → speglade artefakter
```

Gränssnittet är ett **statiskt paket**, men datan det visar hämtas vid körning via `GET /api/state`. När en ny utgåva speglas uppdateras versionsetiketterna och uppsättningen nedladdningsknappar av sig själva — **gränssnittet behöver aldrig byggas om**. Sidan uppdaterar också datan med jämna mellanrum (och när fliken får fokus igen), så länge öppna sidor hålls aktuella.

---

## Projektstruktur

```text
biangbiang/
├── .github/assets/         # README-bricka
├── config.xml              # webbplatskonfiguration, med färdigt exempel (monteras)
├── overwrite.xml           # manuella poster (icke-GitHub), med exempel (monteras)
├── assets/                 # favicon, projektikoner och typsnitt, med exempel (skrivskyddat)
├── data/                   # speglade artefakter, state.json, genererade PWA-ikoner och manifest
├── backend/                # API / spegelmotor i Node.js + Express
│   └── src/
│       ├── index.js        # HTTP-server: SPA, /api, /media, /dl
│       ├── cli.js          # enstaka spegelkörning (npm run mirror)
│       ├── config.js       # tolkar config.xml + normaliserar kodförrådsadresser
│       ├── github.js       # GitHub API-klient + strömmande nedladdning
│       ├── mirror.js       # spegelmotorn (jämför, laddar ner, städar)
│       ├── overwrite.js    # tolkar overwrite.xml (manuella poster)
│       ├── pwaIcons.js     # skapar PWA-ikoner från favicon med ImageMagick
│       ├── pwaManifest.js  # skapar manifestets appnamn från <title>
│       ├── scheduler.js    # den schemalagda uppgiften var 24:e timme
│       ├── state.js        # tillstånd i minnet + sparat tillstånd
│       └── env.js          # konfiguration via miljövariabler
├── frontend/               # SPA: Vue 3 + Vite + Ant Design Vue
│   ├── public/             # manifest, service worker, standardikoner för PWA
│   └── src/
│       ├── App.vue         # ConfigProvider (tema + språkpaket)
│       ├── api.ts          # API-klient och formateringshjälpare
│       ├── theme.ts        # logik för auto / ljust / mörkt tema
│       ├── strings.ts      # gränssnittets språktillstånd och textuppslag
│       ├── locales/        # textpaket för sex språk
│       └── components/     # SiteView, ProjectCard, ThemeSwitcher
├── Dockerfile
├── docker-compose.yml             # minimalt exempel
├── docker-compose.advanced.yml    # produktionsexempel (endast lokal adress + nginx)
├── .env.example                   # kopiera till .env och fyll i
├── ADVANCED_INSTRUCTION_zh_CN.md  # driftguide (förenklad kinesiska)
├── ADVANCED_INSTRUCTION_zh_TW.md  # driftguide (traditionell kinesiska)
├── ADVANCED_INSTRUCTION_en_US.md  # driftguide (engelska)
├── ADVANCED_INSTRUCTION_pl_PL.md  # driftguide (polska)
├── ADVANCED_INSTRUCTION_ru_RU.md  # driftguide (ryska)
├── ADVANCED_INSTRUCTION_sv_SE.md  # driftguide (svenska)
├── README.md                      # README (förenklad kinesiska)
├── README_zh_TW.md                # README (traditionell kinesiska)
├── README_en_US.md                # README (engelska)
├── README_pl_PL.md                # README (polska)
├── README_ru_RU.md                # README (ryska)
└── README_sv_SE.md                # README (svenska)
```


---

## Konfiguration (`config.xml`)

`config.xml` ligger bredvid mappen `assets/`. Alla bildsökvägar tolkas **relativt mappen som innehåller `config.xml`**, så ikoner kan ligga antingen bredvid den eller i undermappen `assets/`.

```xml
<favicon>assets/favicon.png</favicon>
<title>Page title</title>
<lang>zh_cn</lang>
<sortable>true</sortable>
<accent>volcano</accent>
<font>assets/MyFont.woff2</font>

<project>
    <icon>assets/icon1.png</icon>
    <name>Project 1</name>
    <repo>https://github.com/user/project1</repo>
</project>

<project>
    <icon>assets/icon2.webp</icon>
    <name>Project 2</name>
    <repo>https://github.com/user/project2</repo>
</project>
```

| Tagg         | Placering     | Beskrivning |
|--------------|---------------|-------------|
| `<title>`    | rot           | Webbplatsens titel, som visas i sidhuvudet, på fliken och som **den installerade appens namn** (skrivs in i manifestet vid varje start). |
| `<lang>`     | rot           | Valfri. Gränssnittets språk: `zh_cn`, `zh_tw`, `en_us`, `pl_pl`, `ru_ru` eller `sv_se` (skiftlägesokänsligt; bindestreck fungerar också, så `zh-CN` accepteras). Utelämnad, tom eller okänd tagg ger `zh_cn` (förenklad kinesiska). |
| `<favicon>`  | rot           | Valfri. PNG/WEBP-fil som används som webbplatsens favicon. |
| `<sortable>` | rot           | Valfri. Med `true` visas en sorteringslista i sidhuvudet där besökare kan ordna korten efter namn, senast uppdaterad, flest filer eller minst filer — namn (alfabetiskt) är standard. Med `false` (eller utan taggen) behåller korten exakt ordningen från `<project>-posterna`. |
| `<accent>`   | rot           | Valfri. Namn på en baspalett i Ant Design — `red`, `volcano`, `orange`, `gold`, `yellow`, `lime`, `green`, `cyan`, `blue`, `geekblue`, `purple` eller `magenta` (skiftlägesokänsligt). Ersätter webbplatsens standardblå (Daybreak Blue). Utelämnad, tom eller okänd ger standardblått. |
| `<font>`     | rot           | Valfri. Sökväg till en typsnittsfil (t.ex. `assets/MyFont.woff2`), tolkad relativt `config.xml` precis som `<favicon>`. Hela webbplatsen — Ant Design-komponenterna inräknade — byter till den. Utelämnad, tom eller mot en fil som inte finns behåller systemtypsnittet. |
| `<project>`  | rot (0..N)    | En post per projekt → ett kort på webbplatsen. |
| `<icon>`     | i projekt     | PNG/WEBP-fil som används som kortets ikon. Valfri. |
| `<name>`     | i projekt     | Projektets visningsnamn. |
| `<repo>`     | i projekt     | Adress till GitHub-kodförrådet. |

**Godkända former av `<repo>`** (alla tolkas till `owner/repo`):

```text
https://github.com/user/project1
https://github.com/user/project1.git
https://github.com/user/project1/
git@github.com:user/project1.git
user/project1
```

Du kan fritt lägga till och ta bort `<project>`-poster — webbplatsen renderar exakt ett kort per giltig post. Poster med saknad eller felaktig `<repo>` hoppas över utan att påverka de andra.


### Manuella poster (`overwrite.xml`)

`<repo>` behöver inte peka på GitHub. Skriver du `overwrite@{number}` hämtas kortets data i stället från filen `overwrite.xml` som ligger **bredvid** `config.xml`:

```xml
<project>
    <icon>assets/icon2.webp</icon>
    <name>Mitt privata projekt</name>
    <repo>overwrite@1</repo>
</project>
```

Strukturen i `overwrite.xml`:

```xml
<overwrite>
    <id>1</id>
    <version>1.0.0</version>
    <repo>https://example.com/my-project</repo>
    <downloads>
        <file>https://example.com/artifact.zip</file>
        <file>https://example.com/artifact2.rar</file>
    </downloads>
</overwrite>
```

| Tagg                 | Beskrivning |
|----------------------|-------------|
| `<id>`               | Motsvarar numret i `overwrite@{number}` i `config.xml`. |
| `<version>`          | Versionen som visas på kortet i stället för den automatiskt hämtade. Valfri. |
| `<repo>`             | Adressen som knappen "Visa kodförråd" leder till. Valfri — utan den visas inte knappen. |
| `<downloads>/<file>` | Varje `<file>` blir en nedladdningsknapp som pekar direkt på länken. |

Bra att veta:

- `overwrite.xml` läses **bara** när minst en `overwrite@{number}` finns i `config.xml`. Om varje `<repo>` är en GitHub-adress öppnas filen aldrig.
- Manuella poster **laddar inte ner eller cachar något** — knapparna pekar direkt på de adresser du angett, så de tar ingen plats på servern och påverkas inte av GitHubs hastighetsgränser.
- Manuella poster **visar inget publiceringsdatum** (det finns ingen utgåva att datera) och ingen filstorlek (den är okänd).
- GitHub-projekt och manuella poster kan blandas fritt i en och samma `config.xml`.
- Filnamnet på nedladdningsknappen är länkens sista del.
- Vid Docker-drift monteras `overwrite.xml` skrivskyddat bredvid `config.xml`, så inget extra behöver ställas in.

> **Kodförrådet innehåller ett färdigt exempel.** Ett nyklonat kodförråd har redan `config.xml`, `overwrite.xml` och `assets/` (favicon, projektikoner och ett medföljande typsnitt), så `docker compose up -d --build` ger en komplett webbplats utan ändringar. För att göra den till din egen byter du filerna i `assets/` och hänvisar till dem i konfigurationen; vill du börja från noll tar du bort exemplen och behåller bara din egen konfiguration.

---

## Snabbstart (Docker)

> **Ska du driftsätta på en publik server?** Se driftguiderna:
> [svenska](ADVANCED_INSTRUCTION_sv_SE.md) ·
> [English](ADVANCED_INSTRUCTION_en_US.md).
> De går igenom exemplet `docker-compose.advanced.yml`, `config.xml` i detalj,
> hur du placerar bilder och hur du sätter containern bakom nginx med HTTPS.

### 1. Hämta projektet

Klona kodförrådet och checka ut **den senaste stabila utgåvan** (den nyaste utgåvetaggen):

```bash
git clone https://github.com/xiaomianguan/biangbiang.git
cd biangbiang
git checkout "$(git tag --sort=-v:refname | head -1)"   # den nyaste utgåvetaggen
```

> **Vill du hellre ha utvecklingsversionen (grenen `main`)?** Hoppa över sista raden `git checkout` och du stannar på `main`. Den har de senaste ändringarna, men de är inte släppta än och kan vara instabila.

### 2. Förbered konfiguration och ikoner (valfritt — ett fungerande exempel medföljer)

```
biangbiang/
├── config.xml
├── overwrite.xml           # manuella poster: behövs bara för overwrite@{number}
└── assets/
    ├── favicon.png
    ├── icon1.png
    └── icon2.webp
```

Ett nyklonat kodförråd **innehåller redan** allt ovanstående, så det här steget är valfritt: `docker compose up -d --build` ger en komplett webbplats direkt. För att göra den till din egen redigerar du `config.xml` och fyller i titel och dina projekt (syntaxen finns i föregående avsnitt) och byter sedan ut bilderna i `assets/`.

> **Exempelkonfigurationen innehåller två medvetet trasiga kort.** Den medföljande `config.xml` använder `https://github.com/user/project2` (ett kodförråd som inte finns) och `overwrite@2` (ingen matchande `<id>` i `overwrite.xml`) för att visa de två fellägena — de demonstrerar hur webbplatsen beter sig när ett kodförråd är felstavat eller en manuell post saknas. Det är avsiktligt, inte en bugg. Ta bort dem eller peka dem mot dina egna projekt.

> **Använder du manuella poster?** Fyll bara i dem i `overwrite.xml` — `docker-compose.yml` monterar redan filen i containern.
>
> Klicka på "Sök efter uppdateringar" i gränssnittet efter att du ändrat filen på värden; ingen ombyggnad behövs.
>
> Se till att filen finns kvar: om `./overwrite.xml` saknas skapar Docker en tom mapp på den platsen och de berörda korten misslyckas med `EISDIR`. Ett nyklonat kodförråd levereras med ett fungerande exempel, så det gäller bara om du tagit bort det.

### 3. Bygg och starta

```bash
docker compose up -d --build
```

### 4. Öppna webbplatsen

Gå till <http://localhost:8080> i webbläsaren.

Den första synkningen startar direkt när containern startar; därefter sker den var 24:e timme (se `CHECK_INTERVAL_HOURS`). Speglade artefakter sparas i mappen `./data` på värden och överlever en omstart.


### Utan Compose

```bash
docker build -t biangbiang .
docker run -d --name biangbiang -p 8080:8080 \
  -v "$PWD/config.xml:/app/config.xml:ro" \
  -v "$PWD/assets:/app/assets:ro" \
  -v "$PWD/data:/app/data" \
  biangbiang
```

### Användbara kommandon

```bash
docker compose logs -f          # följ loggarna
docker compose restart          # starta om (återskapar PWA-ikoner och appnamn)
docker compose down             # stoppa och ta bort containern
```

### Uppdatera till senaste version

Stabila utgåvor publiceras som taggar. Hämta taggarna, checka ut den nyaste och bygg om containern:

```bash
git fetch --tags
git checkout "$(git tag --sort=-v:refname | head -1)"   # den nyaste utgåvetaggen
docker compose up -d --build
```

> Att checka ut en tagg lämnar dig i detached HEAD, vilket inte spelar någon roll för en driftsättning. Vill du låsa en specifik version byter du ut `"$(...)"` mot ett taggnamn som `v1.0.2`.

På utvecklingsversionen (grenen `main`) är `git pull` fortfarande rätt:

```bash
git pull
docker compose up -d --build
```

`./config.xml`, `./overwrite.xml`, `./assets` och `./data` bevaras på värden via monteringar, så uppdateringar rör dem inte.

---

## Lokal utveckling

Kör backend och Vites utvecklingsserver var för sig för att få liveuppdatering.

```bash
# Terminal 1 — backend (speglar till ./data, serverar API och filer)
cd backend
npm install
CONFIG_PATH=../config.xml DATA_DIR=../data PUBLIC_DIR=../frontend/dist npm start

# Terminal 2 — gränssnittets utvecklingsserver (proxy för /api, /dl och /media till :8080)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Användbara skript:

```bash
cd backend  && npm run mirror   # kör en spegling och avsluta
cd frontend && npm run build    # produktionsbygge av SPA:n
cd frontend && npm run type-check
```

> För att generera PWA-ikoner lokalt krävs ImageMagick — se avsnittet "PWA" nedan.

---

## Miljövariabler

| Variabel                | Standard                | Beskrivning |
|-------------------------|-------------------------|-------------|
| `PORT`                  | `8080`                  | HTTP-port. |
| `HOST`                  | `0.0.0.0`               | Adress att lyssna på. |
| `TZ`                    | `Asia/Shanghai`         | Containerns tidszon (IANA-namn). Påverkar loggar och lokala tider från backend. Ändra i `docker-compose.yml` / `.env`. |
| `CONFIG_PATH`           | `/app/config.xml`       | Sökväg till `config.xml`. |
| `DATA_DIR`              | `/app/data`             | Mapp för artefakter och `state.json`. |
| `PUBLIC_DIR`            | `/app/public`           | Mappen med det byggda gränssnittet. |
| `CHECK_INTERVAL_HOURS`  | `24`                    | Intervall för att söka efter nya GitHub-utgåvor (i timmar). |
| `MIRROR_ON_START`       | `true`                  | Kör en synkning direkt vid start. |
| `DOWNLOAD_CONCURRENCY`  | `4`                     | Antal parallella nedladdningar per projekt. |
| `GITHUB_TOKEN`          | *(tom)*                 | Valfri. Höjer API-gränsen (60 → 5000 anrop i timmen). |

Alla dessa variabler kan sättas i avsnittet `environment` i `docker-compose.yml`.


---

## HTTP-gränssnitt

| Metod  | Sökväg                                | Beskrivning |
|--------|---------------------------------------|-------------|
| `GET`  | `/api/state`                          | Aktuellt tillstånd: titel, favicon, projekt, versioner och artefakter. |
| `GET`  | `/api/health`                         | Hälsokontroll (liveness-probe). |
| `POST` | `/api/refresh`                        | Startar en spegling direkt (används av knappen "Sök efter uppdateringar"). |
| `GET`  | `/media/{path}`                       | Favicon och projektikoner, tolkade relativt konfigmappen. |
| `GET`  | `/dl/{owner}/{repo}/{version}/{file}` | Ladda ner en speglad artefakt. |

> Delarna `{...}` ovan är platshållare — i en verklig förfrågan sätter du in riktiga värden (t.ex. blir `{owner}` kodförrådets ägare). I hela den här dokumentationen används `<...>` bara för XML-taggar.

Exempel på svar från `GET /api/state`:

```json
{
  "title": "Page title",
  "lang": "zh_cn",
  "favicon": "/media/assets/favicon.png",
  "lastUpdated": "2026-01-01T12:00:00.000Z",
  "projects": [
    {
      "id": "user/project1",
      "name": "Project 1",
      "icon": "/media/assets/icon1.png",
      "repo": "https://github.com/user/project1",
      "version": "v2.4.0",
      "status": "ok",
      "assets": [
        { "name": "project1-linux-amd64.tar.gz", "size": 1234567,
          "url": "/dl/user/project1/v2.4.0/project1-linux-amd64.tar.gz" }
      ]
    }
  ]
}
```

`status` är något av `ok`, `empty` (ingen utgåva än) eller `error` (t.ex. att kodförrådet inte finns). Ett projekt vars synkning misslyckas behåller sina senast speglade data.

---

## Övrigt

### Tema
Temat är som standard **följ systemet (auto)**, följer operativsystemets ljusa/mörka inställning och uppdateras direkt när systemet byter. Växlaren i sidhuvudet låter dig tvinga fram **ljust** eller **mörkt**; valet sparas i `localStorage`. Båda temana använder Ant Design Vues designtokens `defaultAlgorithm` / `darkAlgorithm`.

### PWA
Appen levereras med `manifest.webmanifest` och en minimal service worker, så den kan installeras på hemskärmen eller skrivbordet. Service workern **cachar ingenting** — den är en ren nätverksgenomströmning, så något offlineläge finns inte, med avsikt.

**Den installerade appens ikoner följer alltid din `<favicon>`**, och **appens namn följer alltid `<title>`**. Vid varje start skapar backend hela ikonuppsättningen från faviconen med ImageMagick:

| Utdata | Storlek | Beskrivning |
|--------|---------|-------------|
| `pwa-192x192.png` | 192×192 | Transparens bevarad, utfylld till en kvadrat |
| `pwa-512x512.png` | 512×512 | Transparens bevarad, utfylld till en kvadrat |
| `pwa-maskable-512x512.png` | 512×512 | Logotypen skalad till 80 %, bakgrunden fylld med faviconens medelfärg |
| `apple-touch-icon.png` | 180×180 | Plattad mot vit bakgrund (iOS stöder inte transparens) |

Ikonerna skrivs till `{DATA_DIR}/pwa/` och serveras på de sökvägar som manifestet anger. Vid varje start skapar backend också om `manifest.webmanifest` i samma mapp, byter ut dess `name` / `short_name` (namnet som visas för den installerade appen) mot `<title>` från `config.xml` och sätter `lang` till den BCP-47-tagg som motsvarar `<lang>`; övriga fält (beskrivning, färger, ikonlistan) kommer från mallen som följer med gränssnittsbygget. Det räcker alltså att ändra `<favicon>`, `<title>` eller `<lang>` och starta om containern för att uppdatera ikoner, appnamn och språk. Faviconen kan vara i vilket format ImageMagick kan läsa (PNG, WEBP m.fl.). Om `<favicon>` inte är satt eller ImageMagick saknas används standardikonerna från `frontend/public/`; om manifestmallen inte kan läsas används standardmanifestet på samma sätt.

ImageMagick är redan installerat i Docker-imagen. För lokal utveckling installerar du det själv (`brew install imagemagick`, `apt install imagemagick` m.fl.).

### Hastighetsgränser
Oautentiserade anrop till GitHub API är begränsade till 60 i timmen, vilket med god marginal räcker för några projekt med en kontroll per dygn. Har du många projekt sätter du `GITHUB_TOKEN` i `docker-compose.yml`.

### Att köra som icke-root
Containerns entrypoint startar som root, tar över `./data` till användaren `node` (uid 1000) och släpper sedan behörigheterna direkt — därför fungerar bind-monterade mappar direkt och du behöver inte köra `chown` manuellt. Tvingar du fram en annan användare med `user:` eller `--user` måste den användaren kunna skriva till `./data`.

---

## Licens

Projektet ges ut under [The Unlicense](https://unlicense.org) och är därmed allmän egendom. Du får fritt kopiera, ändra, publicera, använda, kompilera, sälja och distribuera programvaran — i källkods- som binärform — för vilket syfte som helst, kommersiellt eller inte, utan att ange upphovsperson.

Fullständiga villkor finns i filen [LICENSE](LICENSE) i kodförrådets rot.

