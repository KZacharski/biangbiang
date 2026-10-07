# biangbiang — Driftguide (Docker + nginx + HTTPS)

[简体中文](ADVANCED_INSTRUCTION_zh_CN.md) · [繁體中文](ADVANCED_INSTRUCTION_zh_TW.md) · [English](ADVANCED_INSTRUCTION_en_US.md) · [Polski](ADVANCED_INSTRUCTION_pl_PL.md) · [Русский](ADVANCED_INSTRUCTION_ru_RU.md) · **Svenska**

Den här guiden tar dig från en helt ny Linux-server till **en körande, HTTPS-skyddad biangbiang-instans** bakom en reverse proxy i nginx.

Vill du bara prova lokalt räcker de korta stegen i [`README.md`](README.md). Det här dokumentet handlar om drift i produktion.

---

## Innehåll

1. [Slutlig arkitektur](#1-slutlig-arkitektur)
2. [Krav](#2-krav)
3. [Steg 1 — lägg koden på servern](#steg-1--lägg-koden-på-servern)
4. [Steg 2 — skriv config.xml](#steg-2--skriv-configxml)
5. [Steg 3 — lägg till bilder](#steg-3--lägg-till-bilder)
6. [Steg 4 — starta containern](#steg-4--starta-containern)
7. [Steg 5 — peka domänen mot servern](#steg-5--peka-domänen-mot-servern)
8. [Steg 6 — reverse proxy i nginx + TLS](#steg-6--reverse-proxy-i-nginx--tls)
9. [Steg 7 — verifiera driftsättningen](#steg-7--verifiera-driftsättningen)
10. [Löpande drift](#löpande-drift)
11. [Felsökning](#felsökning)

---

## 1. Slutlig arkitektur

```
        Internet
            │  https://mirror.example.com
            ▼
    ┌───────────────────┐
    │  nginx (värd)     │  TLS-avslut, lyssnar på 443
    │  Let's Encrypt    │
    └─────────┬─────────┘
              │  proxy_pass http://127.0.0.1:8080
              ▼
    ┌───────────────────┐
    │  biangbiang       │  en enda Docker-container
    │  Express + SPA    │  (inte direkt exponerad mot internet)
    └─────────┬─────────┘
              │  var 24:e timme
              ▼
        GitHub REST API  →  ./data/releases/{owner}/{repo}/{version}/{file}
```

En enda container serverar API:et, de speglade artefakterna **och** den paketerade Vue-webbappen. Data och artefakter ligger i en bind-montering (`./data`), så `docker compose up --build` förlorar ingenting.

---

## 2. Krav

| Del | Beskrivning |
|---|---|
| Linux-server | Vilken distribution som helst med Docker-stöd. I början räcker 1 kärna och 1 GB RAM. |
| Docker Engine | Version 24 eller senare med Compose v2-insticksmodulen (kommandot är `docker compose`, inte `docker-compose`). |
| Diskutrymme | Planera efter artefakternas storlek. biangbiang **behåller bara den senaste versionen av varje projekt**, så åtgången är förutsägbar. |
| En domän | Exempelvis `mirror.example.com`, där du kan ändra DNS-posterna. |
| nginx | Installerat på värden (`apt install nginx`) — guiden utgår från nginx på värden. |
| certbot | För att hämta ett kostnadsfritt Let's Encrypt-certifikat. |

> Själva containern **kräver inga** verktyg från värden: Node 22, ImageMagick och alla beroenden finns redan i imagen.

---

## Steg 1 — lägg koden på servern

Klona kodförrådet och checka ut **den senaste stabila utgåvan** (den nyaste utgåvetaggen):

```bash
sudo mkdir -p /srv/biangbiang
sudo chown "$USER":"$USER" /srv/biangbiang
cd /srv/biangbiang
git clone https://github.com/xiaomianguan/biangbiang.git .
git checkout "$(git tag --sort=-v:refname | head -1)"   # den nyaste utgåvetaggen
```

> **Vill du hellre ha utvecklingsversionen (grenen `main`)?** Hoppa över sista raden `git checkout` och du stannar på `main`. Den har de senaste ändringarna, men de är inte släppta än och kan vara instabila.

> **Steget med `chown` får inte hoppas över.** Katalogen som `sudo mkdir` skapar ägs av `root`, och allt som skapas inuti den (inklusive `./data`) ärver den ägaren. Containern körs som en oprivilegierad användare, så ett `./data` som ägs av `root` gör att spegeljobbet misslyckas med `EACCES` vid första skrivningen.

Om servern inte når GitHub bygger du imagen lokalt, skickar den till ett register och byter ut `build:` mot `image:` i Compose-filen.

Förbered sedan katalogstrukturen för driftsättningen:

```bash
cp docker-compose.advanced.yml docker-compose.yml
cp .env.example .env
mkdir -p data            # config.xml, overwrite.xml och assets/ finns i repot; bara data/ behövs
```

> Det är containern som skriver till `./data`. Vid start rättar den själv till ägaren (se [Filägare](#filägare)), så något manuellt `chown` behövs inte.

Från och med nu är det bara fyra sökvägar som spelar roll:

| Sökväg | Syfte |
|---|---|
| `config.xml` | Webbplatsens konfiguration (monteras in i containern skrivskyddat). |
| `overwrite.xml` | Manuella poster (projekt utanför GitHub), monteras skrivskyddat. Läses bara när `config.xml` använder `overwrite@{number}`. |
| `assets/` | Din favicon och projektens ikoner (monteras skrivskyddat). |
| `data/` | Artefakter, `state.json`, genererade PWA-ikoner och manifest. **Säkerhetskopiera alltid.** |

---

## Steg 2 — skriv config.xml

`config.xml` är det **enda** som avgör vad webbplatsen visar. Containern läser den från `/app/config.xml` och tolkar om den vid varje synkning, så det räcker att starta om containern efter en ändring — imagen behöver inte byggas om.

Kodförrådet **innehåller redan en färdig `config.xml`**, tillsammans med `overwrite.xml` och `assets/`, så även det här steget kan hoppas över — att driftsätta som det är ger en komplett webbplats. "Minimalt exempel" nedan visar hur du skriver om den för dina egna projekt.

> **Exempelkonfigurationen innehåller två medvetet trasiga kort.** Den använder `https://github.com/user/project2` (ett kodförråd som inte finns) och `overwrite@2` (ingen matchande `<id>` i `overwrite.xml`) för att visa de två fellägena — de demonstrerar hur webbplatsen beter sig när ett kodförråd är felstavat eller en manuell post saknas. Det är avsiktligt, inte en bugg. Ta bort dem eller peka dem mot dina egna projekt.

### Minimalt exempel

```xml
<favicon>assets/favicon.png</favicon>
<title>Min spegel</title>
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

### Beskrivning av taggarna

| Tagg | Placering | Krävs | Beteende |
|---|---|---|---|
| `<title>` | rot | nej | Webbplatsens titel i sidhuvudet, på fliken och som **den installerade appens namn**. Standardvärdet är `Releases`. |
| `<lang>` | rot | nej | Gränssnittets språk: `zh_cn`, `zh_tw`, `en_us`, `pl_pl`, `ru_ru` eller `sv_se` (skiftlägesokänsligt; bindestreck fungerar också, så `zh-CN` accepteras). Hela gränssnittet byter språk — texter, datumformat och den text Ant Design renderar inuti sina egna komponenter. Okänt värde ger `zh_cn` (förenklad kinesiska). |
| `<favicon>` | rot | nej | PNG/WEBP som används som webbplatsens favicon **och** som källa för den installerade PWA:ns ikoner. Utan den används den inbyggda standardikonen. |
| `<sortable>` | rot | nej | Accepterar bara `true` / `false` (skiftlägesokänsligt). `true` lägger till en sorteringslista i sidhuvudet där korten kan ordnas alfabetiskt, efter senast uppdaterad, flest filer eller minst filer — alfabetiskt är standard. `false`, en felstavning eller ingen tagg alls behåller exakt ordningen från `<project>`-posterna. |
| `<accent>` | rot | nej | Namn på en baspalett i Ant Design: `red`, `volcano`, `orange`, `gold`, `yellow`, `lime`, `green`, `cyan`, `blue`, `geekblue`, `purple` eller `magenta` (skiftlägesokänsligt). Ersätter webbplatsens standardblå (Daybreak Blue). Utelämnad, tom eller okänd ger standardblått — utan fel och utan att färgerna försvinner. |
| `<font>` | rot | nej | Sökväg till en typsnittsfil (t.ex. `assets/MyFont.woff2`), tolkad **relativt mappen med `config.xml`**, precis som `<favicon>`. Hela webbplatsen — inklusive knappar, taggar och listor i Ant Design — byter till det typsnittet; tecken som saknas fylls ut av systemtypsnittet. Utelämnad, tom eller mot en fil som inte finns behåller systemtypsnittet. |
| `<project>` | rot (0..N) | — | Motsvarar ett kort på webbplatsen. Antalet är obegränsat, korten lägger sig i 1 / 2 / 3 kolumner beroende på skärmbredden, och varje kort anpassas efter sitt eget innehåll — det sträcks inte ut till det högsta i raden. Ett kortare kort flyter dessutom upp i lediga utrymmet under sig, och avståndet är alltid 16 px: Safari 26.4+ gör det nativt med Grid Lanes, i övriga webbläsare lägger gränssnittet ut korten själv. |
| `<icon>` | i `<project>` | nej | Kortets miniatyrbild (PNG/WEBP). Utan den, eller om bilden inte laddas, visar kortet första bokstaven i projektnamnet. |
| `<name>` | i `<project>` | nej | Visningsnamn. Standardvärdet är kodförrådets namn. |
| `<repo>` | i `<project>` | **ja** | Adress till GitHub-kodförrådet. Poster med ogiltig `<repo>` hoppas tystas över. |

### Godkända former av `<repo>`

Alla former nedan tolkas till `owner/repo`:

```text
https://github.com/user/project1
https://github.com/user/project1.git
https://github.com/user/project1/
git@github.com:user/project1.git
user/project1
```

### Speglingsregler

- Från varje projekt speglas **bara den senaste utgåvan**; äldre versioner tas bort från disken.
- **Alla artefakter** som bifogats utgåvan speglas.
- Arkiven `Source code (zip)` / `Source code (tar.gz)` som GitHub skapar **speglas aldrig**.
- Dubblerade `<repo>`-poster rensas bort automatiskt.
- Ett felstavat eller borttaget kodförråd **fäller inte** hela webbplatsen: kortet visar "Synkroniseringen misslyckades" och behåller sina senast speglade data.

### Hur bildsökvägar tolkas

Alla bildsökvägar i `config.xml` tolkas **relativt mappen som innehåller `config.xml`** (alltså `/app` i containern). Båda formerna fungerar:

```xml
<icon>assets/icon1.png</icon>
<icon>icon1.png</icon>          <!-- bredvid config.xml -->
```

Eftersom `./assets` monteras till `/app/assets` skrivskyddat rekommenderar vi att lägga alla bilder i `assets/`.


### Manuella poster — filer utanför GitHub (overwrite.xml)

`<repo>` behöver inte peka på GitHub. Skriver du `overwrite@{number}` hämtas kortets data i stället från filen `overwrite.xml` bredvid `config.xml`:

```xml
<!-- config.xml -->
<project>
    <icon>assets/icon2.webp</icon>
    <name>Mitt projekt</name>
    <repo>overwrite@1</repo>
</project>
```

```xml
<!-- overwrite.xml -->
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

| Tagg | Beskrivning |
|---|---|
| `<id>` | Motsvarar numret i `overwrite@{number}`. |
| `<version>` | Versionen som visas på kortet i stället för den automatiskt hämtade. Valfri. |
| `<repo>` | Adressen som knappen "Visa kodförråd" leder till. Valfri — utan den visas inte knappen. |
| `<downloads>/<file>` | Varje `<file>` blir en nedladdningsknapp som pekar direkt på länken. |

Beteende:

- **Läses vid behov.** `overwrite.xml` läses bara när minst en `overwrite@{number}` finns i `config.xml`; en webbplats med bara GitHub-projekt öppnar den aldrig, så filen får saknas.
- **Laddar inte ner något.** Manuella poster gör inga HTTP-anrop och skriver inget till `./data`. Knapparna pekar direkt på de adresser du angett, så de tar ingen plats på disken och påverkas inte av GitHubs hastighetsgränser.
- **Inget publiceringsdatum.** Det finns ingen utgåva, alltså inget datum; filstorleken är också okänd och visas därför inte.
- **Kan blandas fritt.** GitHub-projekt och manuella poster samexisterar i vilka kombinationer som helst.
- **Filnamnet på knappen** är länkens sista del (`https://cdn.example.com/x/artifact3.zip` → `artifact3.zip`).
- **En saknad post fäller inte webbplatsen.** Om `overwrite@{number}` inte hittar någon matchande `<id>`, eller om `overwrite.xml` inte finns alls, hamnar bara det kortet i felläge och en rad skrivs till loggen; övriga projekt påverkas inte.

### Montering av overwrite.xml

`overwrite.xml` monteras som **en enskild fil**, precis som `config.xml`, av både `docker-compose.yml` och `docker-compose.advanced.yml`:

```yaml
      - ./config.xml:/app/config.xml:ro
      - ./overwrite.xml:/app/overwrite.xml:ro
      - ./assets:/app/assets:ro
      - ./data:/app/data
```

Filen läses om vid varje kontrollcykel, så efter en ändring på värden räcker det att klicka på "Sök efter uppdateringar" i gränssnittet eller vänta på nästa kontroll — **ingen** ombyggnad och ingen omstart av containern behövs.

> **Ta inte bort filen.** Om `./overwrite.xml` inte finns skapar Docker en tom **mapp** på den platsen, och alla `overwrite@{number}`-kort misslyckas med `EISDIR`. Ett nyklonat kodförråd levereras med ett fungerande exempel och drabbas därför inte; har du tagit bort det återskapar du det med `touch /srv/biangbiang/overwrite.xml`.


---

## Steg 3 — lägg till bilder

Kodförrådet **innehåller ett färdigt exempelmaterial**: favicon, projektikoner och ett medföljande typsnitt i mappen `assets/`. Tillsammans med exempelkonfigurationen ger ett nyklonat kodförråd en komplett webbplats utan att några bilder behöver förberedas. Nedan beskrivs hur du byter ut dem mot dina egna — ett i taget, eller genom att ta bort exemplen och börja från noll. Webbplatsens utseende avgörs helt av `assets/` och `config.xml`; biangbiang har inget eget inbyggt varumärkesmaterial.

### Katalogstruktur

```
/srv/biangbiang/
├── config.xml
├── assets/
│   ├── favicon.png        # webbplatsens favicon, även källa för PWA-ikonerna
│   ├── icon1.png          # miniatyrbild för projekt 1
│   └── icon2.webp         # miniatyrbild för projekt 2
└── data/
```

> Utöver `data/` **finns alla filerna ovan redan i kodförrådet**, så `cp`-kommandona nedan byter ut snarare än skapar — de behövs bara om du vill ha ett eget utseende.

### 1. favicon (krävs för ett eget utseende)

```bash
# Lägg in din logotyp och hänvisa till den i config.xml:
#   <favicon>assets/favicon.png</favicon>
cp ~/my-logo.png /srv/biangbiang/assets/favicon.png
```

- **Format:** vilket som helst som ImageMagick kan läsa; PNG och WEBP är beprövade.
- **Storlek:** 512×512 eller större rekommenderas, helst en kvadrat med alfakanal.
- Vid varje containerstart härleder backend hela uppsättningen installeringsbara ikoner ur filen:

  | Fil | Storlek | Användning |
  |---|---|---|
  | `pwa-192x192.png` | 192×192 | PWA-ikon, transparens bevarad |
  | `pwa-512x512.png` | 512×512 | PWA-ikon, transparens bevarad |
  | `pwa-maskable-512x512.png` | 512×512 | Adaptiv Android-ikon: logotypen skalad till 80 %, bakgrunden fylld med bildens medelfärg |
  | `apple-touch-icon.png` | 180×180 | Ikon för iOS hemskärm (plattad mot vit bakgrund) |

  De skrivs till `data/pwa/` och serveras av backend — **lägg inte** in dem i kodförrådet. Även `manifest.webmanifest` i samma mapp skapas om vid varje start, utifrån `<title>`: dess `name` / `short_name` är namnet den installerade appen visar, och övriga fält kommer från mallen som följer med gränssnittsbygget.

### 2. Projektikoner

Kopiera en bild per projekt och hänvisa till den med `<icon>`:

```bash
cp ~/project1-logo.png   /srv/biangbiang/assets/icon1.png
cp ~/project2-logo.webp  /srv/biangbiang/assets/icon2.webp
```

- De renderas i **48×48 px** med `object-fit: cover`, så kvadratiska original ser bäst ut.
- Taggen är valfri. Utan `<icon>` visar kortet en färgad ruta med projektnamnets första bokstav.

### 3. Låt ändringarna slå igenom

Materialet är monterat skrivskyddat, så containern ser de nya filerna direkt — men **PWA-ikonerna och appnamnet skapas bara vid start**:

```bash
cd /srv/biangbiang
docker compose restart biangbiang
```

> **Behörigheter.** Containern körs som uid/gid **1000** (`node`). Filerna i `assets/` behöver bara vara läsbara för alla (`chmod 644`, vilket också är standard när filer kopieras). `data/` däremot måste vara **skrivbar** för uid 1000 — se [Löpande drift](#löpande-drift).


---

## Steg 4 — starta containern

Redigera `.env` som skapades i steg 1:

```ini
# Valfritt. Kräver en token med smal behörighet:
# markera endast läsrätt för publika kodförråd.
# Höjer GitHubs API-gräns från 60 till 5000 anrop i timmen.
GITHUB_TOKEN=github_pat_xxxxxxxxxxxxxxxxxxxx

# Tidszonen som tidsstämplar renderas i.
TZ=Asia/Shanghai
```

Bygg och starta sedan:

```bash
cd /srv/biangbiang
docker compose up -d --build
docker compose logs -f
```

Loggen ser ungefär ut så här:

```text
[server] listening on http://0.0.0.0:8080
[server] config: /app/config.xml
[server] data:   /app/data
[server] timezone: Asia/Shanghai
[server] check interval: 24h
[pwa] generated app icons from /app/assets/favicon.png
[mirror] user/project1: downloading project1-linux-amd64.tar.gz
...
[mirror] cycle complete: 2 project(s) at 2026-01-01T12:00:00.000Z
```

Kontrollera att containern är frisk och **bara** nås via det lokala gränssnittet:

```bash
docker compose ps
curl -s http://127.0.0.1:8080/api/health
# {"status":"ok","time":"..."}
```

### Miljövariabler

Alla variabler nedan sätts i avsnittet `environment:` i Compose-filen.

| Variabel | Standard | Beskrivning |
|---|---|---|
| `PORT` | `8080` | HTTP-porten inuti containern. |
| `HOST` | `0.0.0.0` | Adress att lyssna på. |
| `TZ` | `Asia/Shanghai` | Containerns tidszon (IANA-namn). Påverkar loggar och de lokala tider backend skickar. Ändra i `docker-compose.yml` eller `.env`. |
| `CONFIG_PATH` | `/app/config.xml` | Var `config.xml` ligger. |
| `DATA_DIR` | `/app/data` | Artefakter + `state.json` + genererade PWA-ikoner och manifest. |
| `PUBLIC_DIR` | `/app/public` | Den paketerade SPA:n (inbakad i imagen). |
| `CHECK_INTERVAL_HOURS` | `24` | Kontrollintervall, minst `0.05` (3 minuter). |
| `MIRROR_ON_START` | `true` | `false` hoppar över den första synkningen vid start. |
| `DOWNLOAD_CONCURRENCY` | `4` | Antal parallella nedladdningar per projekt. |
| `GITHUB_TOKEN` | *(tom)* | Valfri. Höjer API-gränsen. |

---

## Steg 5 — peka domänen mot servern

Lägg till en DNS-**A-post** (och en `AAAA` om servern har IPv6):

```text
Typ    Namn               Värde              TTL
A      mirror             203.0.113.10       300
```

Bekräfta att posten slagit igenom innan du går vidare, annars misslyckas certbot:

```bash
dig +short mirror.example.com
# 203.0.113.10
```

> Använd en **egen subdomän**. biangbiangs SPA ligger i webbplatsens rot (`start_url: "/"`), så en driftsättning under en sökväg som `example.com/mirror` stöds inte.

---

## Steg 6 — reverse proxy i nginx + TLS

### 1. Installera nginx och certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Skapa webbplatskonfigurationen

`/etc/nginx/sites-available/biangbiang`:

```nginx
# --- ACME-kontroll + omdirigering från HTTP till HTTPS --------------------
server {
    listen 80;
    listen [::]:80;
    server_name mirror.example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

Aktivera den:

```bash
sudo ln -s /etc/nginx/sites-available/biangbiang /etc/nginx/sites-enabled/biangbiang
sudo mkdir -p /var/www/html
sudo nginx -t && sudo systemctl reload nginx
```

### 3. Hämta certifikatet

```bash
sudo certbot certonly --webroot -w /var/www/html \
  -d mirror.example.com \
  --agree-tos -m you@example.com --no-eff-email
```

certbot installerar en systemd-timer, så förnyelsen sker automatiskt.


### 4. Lägg till HTTPS-blocket

Byt nu ut konfigurationen mot den fullständiga versionen — den behåller ACME- och omdirigeringsblocket ovan och lägger till TLS med reverse proxy:

```nginx
# --- ACME-kontroll + omdirigering från HTTP till HTTPS --------------------
server {
    listen 80;
    listen [::]:80;
    server_name mirror.example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# --- HTTPS ----------------------------------------------------------------
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name mirror.example.com;

    ssl_certificate     /etc/letsencrypt/live/mirror.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mirror.example.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Artefakterna kan vara hundratals MB: strömma vidare i stället för
    # att buffra allt i nginx.
    proxy_buffering off;
    proxy_request_buffering off;
    client_max_body_size 0;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        # Stora nedladdningar får inte klippas av mitt i.
        proxy_connect_timeout 30s;
        proxy_send_timeout    3600s;
        proxy_read_timeout    3600s;
    }
}
```

Tillämpa konfigurationen:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

> **Varför bara det lokala gränssnittet?** Compose-filen publicerar `127.0.0.1:8080:8080`, så containern nås inte direkt från internet — all publik trafik tvingas genom nginx, som avslutar TLS. Vill du hoppa över nginx och exponera porten direkt byter du `ports:` mot `"8080:8080"` — men då försvinner HTTPS, och PWA:n går inte att installera.

### Alternativ: nginx i en container också

Vill du hantera allt via Compose lägger du till en nginx-tjänst i samma nätverk, tar bort `ports:`-mappningen från tjänsten `biangbiang`, byter `proxy_pass` mot `http://biangbiang:8080;` och monterar in certifikaten tillsammans med `nginx.conf`. Varianten med nginx på värden är enklare att sköta när certifikaten ska förnyas, och rekommenderas därför.

---

## Steg 7 — verifiera driftsättningen

```bash
# 1. DNS pekar på din server
dig +short mirror.example.com

# 2. TLS fungerar och HTTP omdirigerar
curl -sI http://mirror.example.com | head -1      # 301 -> https://
curl -sI https://mirror.example.com | head -1     # 200

# 3. API:et svarar genom proxyn
curl -s https://mirror.example.com/api/health

# 4. Containern är inte exponerad mot det publika gränssnittet
ss -tlnp | grep 8080        # måste visa 127.0.0.1:8080, aldrig 0.0.0.0:8080

# 5. En artefakt går att ladda ner
curl -sI "https://mirror.example.com/dl/{owner}/{repo}/{version}/{file}" | head -1
```

Öppna sedan `https://mirror.example.com` i webbläsaren och kontrollera:

- Sidhuvudet visar titeln och faviconen från `<title>`.
- Varje `<project>` blir ett kort med versionsetikett och nedladdningsknappar för varje artefakt.
- Knappen "Visa kodförråd" leder tillbaka till GitHub.
- Temaväxlaren erbjuder "System / Ljust / Mörkt".
- Om `<sortable>true</sortable>` är satt visas en sorteringslista i sidhuvudet (Alfabetiskt / Senast uppdaterad / Flest filer / Minst filer).
- Om `<lang>` är satt (t.ex. `<lang>sv_se</lang>`) byter hela gränssnittet språk — texter, datumformat och texten Ant Design renderar. Utan taggen blir det förenklad kinesiska.
- Om `<accent>` är satt (t.ex. `<accent>volcano</accent>`) får element som annars är blå — versionsetiketter, länken "Visa kodförråd" — den färgen. Utan taggen behålls standardblått.
- Om `<font>` är satt (t.ex. `<font>assets/MyFont.woff2</font>`) använder all text på sidan — inklusive knappar, taggar och listor i Ant Design — det typsnittet. Utan taggen, eller mot en fil som inte finns, behålls systemtypsnittet.
- Nypzoomning är avstängd, så hela sidan kan inte skalas; rullning och svep i sid- och höjdled fungerar som vanligt. Zoom via webbläsarens meny eller systemets tillgänglighetsfunktioner fungerar fortfarande.

### Installera som PWA

Eftersom webbplatsen nu serveras över HTTPS kan service workern registreras och appen installeras:

- **iOS Safari:** Dela → *Lägg till på hemskärmen*.
- **Android Chrome:** menyn → *Installera app*.
- **Chrome / Edge på datorn:** installationsikonen till höger i adressfältet.

Appen **fungerar inte offline**, med avsikt — service workern är en ren nätverksgenomströmning.


---

## Löpande drift

### Läsa loggen

```bash
docker compose logs -f --tail=100 biangbiang
```

### Starta en synkning manuellt

Knappen "Sök efter uppdateringar" på sidan anropar `POST /api/refresh`. Från kommandoraden går det också:

```bash
curl -X POST https://mirror.example.com/api/refresh
```

### Uppdatera biangbiang

Stabila utgåvor publiceras som taggar. Hämta taggarna, checka ut den nyaste och bygg om containern:

```bash
cd /srv/biangbiang
git fetch --tags
git checkout "$(git tag --sort=-v:refname | head -1)"   # den nyaste utgåvetaggen
docker compose up -d --build
```

> Att checka ut en tagg lämnar dig i detached HEAD, vilket inte spelar någon roll för driftsättningen. Vill du låsa en specifik version byter du ut `"$(...)"` mot ett taggnamn som `v1.0.2`.

På utvecklingsversionen (grenen `main`) är `git pull` fortfarande rätt:

```bash
cd /srv/biangbiang
git pull
docker compose up -d --build
```

`./config.xml`, `./assets` och `./data` ligger kvar på värden, så uppdateringar rör dem inte.

### Säkerhetskopior

Det är egentligen bara konfigurationen och de speglade filerna som inte går att återskapa:

```bash
tar czf biangbiang-$(date +%F).tar.gz config.xml assets data
```

Filen `data/state.json` gör att webbplatsen kan renderas direkt efter en återställning, utan att vänta på första GitHub-omgången.

### Filägare

Containern körs som uid/gid **1000** (`node`). Den bind-monterade mappen `./data` behåller ägaren från värden — och om den skapades med `sudo` är den ägaren `root` — och en oprivilegierad process kan inte skriva dit.

Det sköts av entrypointen: när containern startar som root ändrar den först ägaren på `DATA_DIR` till `node` och släpper sedan behörigheterna. Standardkonfigurationen i Compose kräver därför inget manuellt `chown`.

Om containern inte alls startar som root kan entrypointen inget göra. Sätter du `user:` i Compose eller kör `docker run --user` måste `./data` redan vara skrivbar för den uid:n:

```bash
sudo chown -R 1000:1000 /srv/biangbiang/data
```

### GitHubs hastighetsgränser

Oautentiserade anrop är begränsade till **60 i timmen** (per IP-adress). För några projekt och en kontroll om dagen räcker det med god marginal. Har du många projekt skapar du en [token med smal behörighet](https://github.com/settings/tokens?type=beta) (endast läsrätt för publika kodförråd), skriver in den i `.env` som `GITHUB_TOKEN` och startar om:

```bash
docker compose up -d --force-recreate
```

### Ändra kontrollintervallet

Sätt `CHECK_INTERVAL_HOURS` i avsnittet `environment:` i Compose-filen (minst `0.05`, alltså 3 minuter) och bygg om containern.


---

## Felsökning

| Symptom | Orsak / lösning |
|---|---|
| `503 Frontend build not found.` returneras | Det finns ingen `index.html` i `PUBLIC_DIR`. Skriv inte över `PUBLIC_DIR` — SPA:n är inbakad i imagen under `/app/public`. |
| Alla kort visar "Synkroniseringen misslyckades" med `404 Not Found` | `<repo>` finns inte eller är felstavat; är kodförrådet privat har token för låg behörighet. |
| Loggen visar `overwrite.xml not found at /app/overwrite.xml` | Ett projekt använder `overwrite@{number}` men filen finns inte. Skapa `./overwrite.xml` — se [Montering av overwrite.xml](#montering-av-overwritexml). |
| Ett kort visar `overwrite.xml has no <overwrite> block with <id>N</id>` | Numret i `overwrite@N` har ingen motsvarande `<id>N</id>` i `overwrite.xml`. Jämför de två filerna eller lägg till det saknade blocket. |
| `overwrite.xml` ger `EISDIR` / "is a directory" | Montering aktiverades innan filen fanns, och Docker skapade en mapp. Kör `rmdir ./overwrite.xml`, skapa en fil med samma namn och bygg om containern. |
| Nedladdningsknappen för en manuell post ger 404 | Länken i `<file>` är fel eller har slutat gälla — knappen pekar direkt på adressen och biangbiang kontrollerar den inte. |
| Meddelandet `API rate limit exceeded` | Sätt `GITHUB_TOKEN` i `.env`. |
| Ett kort visar ingen ikon | Fel sökväg i `<icon>`, eller filen är inte läsbar för uid 1000. Sökvägar tolkas relativt `config.xml`. |
| PWA-ikonerna är fortfarande standard | `<favicon>` saknas eller går inte att läsa, eller så misslyckades ImageMagick. Titta i `docker compose logs \| grep '\[pwa\]'` och kör sedan `docker compose restart biangbiang`. |
| Namnet på den installerade appen är fortfarande standard | `manifest.webmanifest` skapas från `<title>` vid start. Kontrollera att `<title>` i `config.xml` stämmer och kör `docker compose restart biangbiang`. Raden `[pwa] cannot read` i loggen betyder att gränssnittsbygget saknar manifestmallen. |
| `./data` ger `EACCES` / `permission denied` | Containern kan inte skriva till datamappen. Startar den som root rättar entrypointen ägaren själv — så felet betyder att du satt `user:` / `--user`, eller monterat `./data` skrivskyddat. Kör `sudo chown -R 1000:1000 ./data`, och ta bort `:ro` om du lagt till det. |
| `http://127.0.0.1:8080` fungerar men inte domänen | Kontrollera `proxy_pass` och `server_name` i nginx, och att brandväggen släpper igenom portarna 80/443. |
| Nedladdningen avbryts mitt i | Öka `proxy_read_timeout` / `proxy_send_timeout` i nginx-konfigurationen. |
| Service workern registreras aldrig | Webbplatsen måste nås över **HTTPS** (eller via `localhost`). Direkt åtkomst via IP över vanlig HTTP är inte en säker kontext. |
| certbots kontroll misslyckas | DNS har inte slagit igenom, port 80 är upptagen eller blockerad, eller så fångar ett annat serverblock upp samma `server_name`. |
| Disken fylls av gamla filer | Varje projekt behåller bara den senaste versionen. Kontrollera om `./data` innehåller något annat och överväg att justera `DOWNLOAD_CONCURRENCY` eller utöka disken. |

### Användbara kommandon

```bash
docker compose ps                                   # hälsostatus
docker inspect --format '{{.State.Health.Status}}' biangbiang
docker compose exec biangbiang node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>r.text()).then(console.log)"
curl -s http://127.0.0.1:8080/api/state | head -c 400
du -sh /srv/biangbiang/data
```

