# biangbiang — Przewodnik wdrożenia (Docker + nginx + HTTPS)

[简体中文](ADVANCED_INSTRUCTION_zh_CN.md) · [繁體中文](ADVANCED_INSTRUCTION_zh_TW.md) · [English](ADVANCED_INSTRUCTION_en_US.md) · **Polski** · [Русский](ADVANCED_INSTRUCTION_ru_RU.md) · [Svenska](ADVANCED_INSTRUCTION_sv_SE.md)

Ten przewodnik prowadzi od świeżo postawionego serwera Linux do **działającej, zabezpieczonej HTTPS instancji biangbiang** za reverse proxy nginx.

Jeśli chcesz tylko wypróbować projekt lokalnie, wystarczą krótkie kroki z [`README.md`](README.md). Ten dokument opisuje wdrożenie produkcyjne.

---

## Spis treści

1. [Docelowa architektura](#1-docelowa-architektura)
2. [Wymagania](#2-wymagania)
3. [Krok 1 — umieść kod na serwerze](#krok-1--umieść-kod-na-serwerze)
4. [Krok 2 — napisz config.xml](#krok-2--napisz-configxml)
5. [Krok 3 — dodaj obrazy](#krok-3--dodaj-obrazy)
6. [Krok 4 — uruchom kontener](#krok-4--uruchom-kontener)
7. [Krok 5 — skieruj domenę na serwer](#krok-5--skieruj-domenę-na-serwer)
8. [Krok 6 — reverse proxy nginx + TLS](#krok-6--reverse-proxy-nginx--tls)
9. [Krok 7 — zweryfikuj wdrożenie](#krok-7--zweryfikuj-wdrożenie)
10. [Bieżąca eksploatacja](#bieżąca-eksploatacja)
11. [Rozwiązywanie problemów](#rozwiązywanie-problemów)

---

## 1. Docelowa architektura

```
        Internet
            │  https://mirror.example.com
            ▼
    ┌───────────────────┐
    │  nginx (host)     │  terminacja TLS, nasłuch na 443
    │  Let's Encrypt    │
    └─────────┬─────────┘
              │  proxy_pass http://127.0.0.1:8080
              ▼
    ┌───────────────────┐
    │  biangbiang       │  pojedynczy kontener Docker
    │  Express + SPA    │  (nie wystawiony bezpośrednio do internetu)
    └─────────┬─────────┘
              │  co 24 godziny
              ▼
        GitHub REST API  →  ./data/releases/{owner}/{repo}/{version}/{file}
```

Jeden kontener serwuje API, zmirrorowane artefakty **oraz** spakowaną aplikację jednostronicową Vue. Dane i artefakty leżą w bind mount (`./data`), więc `docker compose up --build` niczego nie gubi.

---

## 2. Wymagania

| Element | Opis |
|---|---|
| Serwer Linux | Dowolna dystrybucja z Dockerem. Na start 1 rdzeń / 1 GB RAM w zupełności wystarczy. |
| Docker Engine | Wersja 24 lub nowsza z wtyczką Compose v2 (polecenie `docker compose`, nie `docker-compose`). |
| Miejsce na dysku | Zaplanuj je według rozmiaru artefaktów. biangbiang **zachowuje tylko najnowszą wersję każdego projektu**, więc zajętość jest przewidywalna. |
| Domena | Np. `mirror.example.com`, z możliwością zmiany jej rekordów DNS. |
| nginx | Zainstalowany na hoście (`apt install nginx`) — ten przewodnik zakłada nginx na hoście. |
| certbot | Do uzyskania darmowego certyfikatu Let's Encrypt. |

> Sam kontener **nie wymaga** żadnych narzędzi z hosta: Node 22, ImageMagick i wszystkie zależności są już w obrazie.

---

## Krok 1 — umieść kod na serwerze

Sklonuj repozytorium i przełącz się na **najnowsze stabilne wydanie** (najnowszy znacznik wydania):

```bash
sudo mkdir -p /srv/biangbiang
sudo chown "$USER":"$USER" /srv/biangbiang
cd /srv/biangbiang
git clone https://github.com/xiaomianguan/biangbiang.git .
git checkout "$(git tag --sort=-v:refname | head -1)"   # najnowszy znacznik wydania
```

> **Wolisz wersję rozwojową (gałąź `main`)?** Pomiń ostatnią linię `git checkout` — zostaniesz na `main`. Zawiera ona najświeższe zmiany, ale nie zostały jeszcze wydane i może być niestabilna.

> **Kroku `chown` nie można pominąć.** Katalog utworzony przez `sudo mkdir` należy do `root`, a wszystko, co powstanie w jego wnętrzu (w tym `./data`), dziedziczy tego właściciela. Kontener działa jako użytkownik nieuprzywilejowany, więc `./data` należący do `root` sprawi, że zadanie lustra zgłosi `EACCES` przy pierwszym zapisie.

Jeśli serwer nie ma dostępu do GitHuba, zbuduj obraz lokalnie i wypchnij go do rejestru, a następnie zamień `build:` na `image:` w pliku Compose.

Teraz przygotuj strukturę katalogów do wdrożenia:

```bash
cp docker-compose.advanced.yml docker-compose.yml
cp .env.example .env
mkdir -p data            # config.xml, overwrite.xml i assets/ są w repo; potrzebny jest tylko data/
```

> Do `./data` pisze kontener. Przy starcie sam koryguje jego właściciela (patrz [Właściciel plików](#właściciel-plików)), więc ręczne `chown` nie jest potrzebne.

Od tego momentu liczą się tylko cztery ścieżki:

| Ścieżka | Przeznaczenie |
|---|---|
| `config.xml` | Konfiguracja strony (montowana do kontenera tylko do odczytu). |
| `overwrite.xml` | Wpisy ręczne (projekty spoza GitHuba), montowane tylko do odczytu. Czytany wyłącznie wtedy, gdy `config.xml` używa `overwrite@{number}`. |
| `assets/` | Twój favicon i ikony projektów (montowane tylko do odczytu). |
| `data/` | Artefakty, `state.json`, wygenerowane ikony PWA i manifest. **Koniecznie rób kopie zapasowe.** |

---

## Krok 2 — napisz config.xml

`config.xml` to **jedyny** plik decydujący o tym, co pokazuje strona. Kontener czyta go z `/app/config.xml` i parsuje od nowa przy każdej synchronizacji, więc po zmianie konfiguracji wystarczy zrestartować kontener — przebudowa obrazu nie jest potrzebna.

Repozytorium **zawiera już gotowy do użycia `config.xml`**, a wraz z nim `overwrite.xml` i `assets/`, więc ten krok też można pominąć — wdrożenie tak jak jest daje kompletną stronę. Poniższy „minimalny przykład” pokazuje, jak przepisać go pod własne projekty.

> **Konfiguracja przykładowa zawiera dwie celowo niedziałające karty.** Używa `https://github.com/user/project2` (nieistniejące repozytorium) oraz `overwrite@2` (brak pasującego `<id>` w `overwrite.xml`), aby pokazać oba stany błędów — obrazują one zachowanie strony przy błędnie zapisanym repozytorium lub brakującym wpisie ręcznym. To działanie zamierzone, nie błąd. Usuń je lub wskaż własne projekty.

### Minimalny przykład

```xml
<favicon>assets/favicon.png</favicon>
<title>Moje lustro</title>
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

### Opis znaczników

| Znacznik | Położenie | Wymagany | Zachowanie |
|---|---|---|---|
| `<title>` | główny | nie | Tytuł strony widoczny w nagłówku, na karcie przeglądarki oraz jako **nazwa zainstalowanej aplikacji**. Domyślnie `Releases`. |
| `<lang>` | główny | nie | Język interfejsu: `zh_cn`, `zh_tw`, `en_us`, `pl_pl`, `ru_ru` lub `sv_se` (bez rozróżniania wielkości liter; myślnik też działa, więc `zh-CN` jest akceptowany). Zmienia cały interfejs — teksty, formaty dat oraz napisy, które Ant Design renderuje we własnych komponentach. Nieznana wartość daje `zh_cn` (chiński uproszczony). |
| `<favicon>` | główny | nie | PNG/WEBP używany jako favicon strony **oraz** źródło ikon instalowalnej PWA. Domyślnie wbudowana ikona. |
| `<sortable>` | główny | nie | Przyjmuje tylko `true` / `false` (bez rozróżniania wielkości liter). `true` dodaje w nagłówku listę sortowania pozwalającą ułożyć karty według nazwy, ostatniej aktualizacji, największej lub najmniejszej liczby plików — domyślnie według nazwy (alfabetycznie). `false`, literówka lub brak znacznika zachowuje dokładną kolejność wpisów `<project>`. |
| `<accent>` | główny | nie | Nazwa koloru z [podstawowych palet](https://ant.design/docs/spec/colors) Ant Design: `red`, `volcano`, `orange`, `gold`, `yellow`, `lime`, `green`, `cyan`, `blue`, `geekblue`, `purple` lub `magenta` (bez rozróżniania wielkości liter). Zastępuje domyślny niebieski (Daybreak Blue). Pominięty, pusty lub nieznany znacznik daje domyślny niebieski — bez błędu i bez utraty kolorów. |
| `<font>` | główny | nie | Ścieżka do pliku fontu (np. `assets/MyFont.woff2`), rozwiązywana **względem katalogu z `config.xml`**, tak samo jak `<favicon>`. Cała strona — wraz z przyciskami, etykietami i listami Ant Design — przełącza się na ten font; brakujące glify uzupełnia font systemowy. Pominięty, pusty lub nieistniejący plik pozostawia font systemowy. |
| `<project>` | główny (0..N) | — | Odpowiada jednemu karcie na stronie. Liczba jest nieograniczona, karty układają się w 1 / 2 / 3 kolumny zależnie od szerokości ekranu, a każda ma wysokość dopasowaną do treści — nie jest rozciągana do najwyższej w rzędzie. Niższa karta dodatkowo unosi się w wolne miejsce pod sobą, a odstępy wynoszą zawsze 16 px: Safari 26.4+ robi to natywnie dzięki Grid Lanes, w pozostałych przeglądarkach karty rozmieszcza frontend. |
| `<icon>` | w `<project>` | nie | Miniatura karty (PNG/WEBP). Bez niej, lub gdy obraz się nie wczyta, karta pokazuje pierwszą literę nazwy projektu. |
| `<name>` | w `<project>` | nie | Nazwa wyświetlana. Domyślnie nazwa repozytorium. |
| `<repo>` | w `<project>` | **tak** | Adres repozytorium GitHub. Wpisy `<project>` z nieprawidłowym `<repo>` są po cichu pomijane. |

### Obsługiwane zapisy `<repo>`

Wszystkie poniższe formy są rozwiązywane do `owner/repo`:

```text
https://github.com/user/project1
https://github.com/user/project1.git
https://github.com/user/project1/
git@github.com:user/project1.git
user/project1
```

### Zasady mirrorowania

- Z każdego projektu mirrorowane jest **tylko najnowsze wydanie**; starsze wersje są usuwane z dysku.
- Mirrorowane są **wszystkie artefakty** dołączone do tego wydania.
- Archiwa `Source code (zip)` / `Source code (tar.gz)` generowane przez GitHuba **nigdy** nie są mirrorowane.
- Zduplikowane wpisy `<repo>` są automatycznie odsiewane.
- Błędny lub usunięty kod repozytorium **nie** powala całej strony: karta pokazuje komunikat „Synchronizacja nie powiodła się” i zachowuje ostatnie udane dane.

### Jak rozwiązywane są ścieżki obrazów

Wszystkie ścieżki obrazów w `config.xml` są rozwiązywane **względem katalogu zawierającego `config.xml`** (czyli `/app` w kontenerze). Obie poniższe formy działają:

```xml
<icon>assets/icon1.png</icon>
<icon>icon1.png</icon>          <!-- obok config.xml -->
```

Ponieważ `./assets` jest montowany do `/app/assets` tylko do odczytu, zalecamy trzymanie wszystkich obrazów w `assets/`.


### Wpisy ręczne — hostowanie plików spoza GitHuba (overwrite.xml)

`<repo>` nie musi wskazywać GitHuba. Zapis `overwrite@{number}` sprawia, że dane karty pochodzą z pliku `overwrite.xml` leżącego obok `config.xml`:

```xml
<!-- config.xml -->
<project>
    <icon>assets/icon2.webp</icon>
    <name>Mój projekt</name>
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

| Znacznik | Opis |
|---|---|
| `<id>` | Odpowiada liczbie w `overwrite@{number}`. |
| `<version>` | Wersja pokazywana na karcie zamiast pobieranej automatycznie. Opcjonalna. |
| `<repo>` | Adres, na który prowadzi przycisk „Zobacz repozytorium”. Opcjonalny — bez niego przycisk się nie pojawia. |
| `<downloads>/<file>` | Każdy `<file>` to jeden przycisk pobierania prowadzący wprost do tego linku. |

Zachowanie:

- **Czytany na żądanie.** `overwrite.xml` jest czytany tylko wtedy, gdy w `config.xml` istnieje co najmniej jeden wpis `overwrite@{number}`; strona z samymi projektami GitHub nigdy go nie otwiera, więc plik może nie istnieć.
- **Nic nie pobiera.** Wpisy ręczne nie wykonują żadnych żądań HTTP ani nie zapisują niczego w `./data`. Przyciski prowadzą wprost do podanych adresów, więc nie zajmują dysku i nie podlegają limitom API GitHuba.
- **Bez daty wydania.** Nie ma wydania, więc nie ma daty; rozmiar pliku też jest nieznany, więc również się nie pojawia.
- **Można je dowolnie mieszać.** Projekty z GitHuba i wpisy ręczne współistnieją w dowolnych kombinacjach.
- **Nazwa na przycisku** to ostatni segment adresu URL (`https://cdn.example.com/x/artifact3.zip` → `artifact3.zip`).
- **Brak wpisu nie powala strony.** Jeśli `overwrite@{number}` nie znajdzie pasującego `<id>`, albo `overwrite.xml` w ogóle nie istnieje, tylko ta jedna karta przechodzi w stan błędu i zapisuje jedną linię w logu; pozostałe projekty nie ucierpią.

### Montowanie overwrite.xml

`overwrite.xml` jest montowany jako **pojedynczy plik**, tak samo jak `config.xml`, przez `docker-compose.yml` i `docker-compose.advanced.yml`:

```yaml
      - ./config.xml:/app/config.xml:ro
      - ./overwrite.xml:/app/overwrite.xml:ro
      - ./assets:/app/assets:ro
      - ./data:/app/data
```

Plik jest czytany od nowa przy każdym cyklu sprawdzania, więc po zmianie na hoście wystarczy kliknąć „Sprawdź aktualizacje” w interfejsie albo poczekać na kolejne sprawdzenie — **bez** przebudowy i bez restartu kontenera.

> **Nie usuwaj tego pliku.** Jeśli `./overwrite.xml` nie istnieje, Docker utworzy w tym miejscu pusty **katalog** i wszystkie karty `overwrite@{number}` zgłoszą błąd `EISDIR`. Repozytorium zawiera gotowy przykład, więc świeżo sklonowany projekt nie ma tego problemu; jeśli go usunąłeś, odtwórz go przez `touch /srv/biangbiang/overwrite.xml`.


---

## Krok 3 — dodaj obrazy

Repozytorium **zawiera gotowy zestaw przykładów**: favicon, ikony projektów i dołączony font w katalogu `assets/`. Wraz z przykładowym `config.xml` świeżo sklonowany projekt daje kompletną stronę bez przygotowywania żadnych obrazów. Poniżej opisano, jak zastąpić je własnymi — pojedynczo lub usuwając przykłady i zaczynając od zera. Wygląd strony zależy wyłącznie od `assets/` i `config.xml`; biangbiang nie ma wbudowanych żadnych stałych materiałów firmowych.

### Struktura katalogów

```
/srv/biangbiang/
├── config.xml
├── assets/
│   ├── favicon.png        # favicon strony, zarazem źródło ikon PWA
│   ├── icon1.png          # miniatura projektu 1
│   └── icon2.webp         # miniatura projektu 2
└── data/
```

> Poza `data/` wszystkie powyższe pliki **są już w repozytorium**, więc poniższe polecenia `cp` to zamiana, a nie tworzenie — potrzebne tylko wtedy, gdy chcesz własny wygląd.

### 1. favicon (wymagany dla własnego wyglądu)

```bash
# Wrzuć swoje logo i wskaż je w config.xml:
#   <favicon>assets/favicon.png</favicon>
cp ~/my-logo.png /srv/biangbiang/assets/favicon.png
```

- **Format:** dowolny, który czyta ImageMagick; PNG i WEBP są sprawdzone.
- **Rozmiar:** zalecane 512×512 lub więcej, najlepiej kwadrat z kanałem alfa.
- Przy każdym starcie kontenera backend wyprowadza z tego pliku cały zestaw ikon instalowalnych:

  | Plik | Rozmiar | Przeznaczenie |
  |---|---|---|
  | `pwa-192x192.png` | 192×192 | Ikona PWA, przezroczystość zachowana |
  | `pwa-512x512.png` | 512×512 | Ikona PWA, przezroczystość zachowana |
  | `pwa-maskable-512x512.png` | 512×512 | Ikona adaptacyjna Androida, logo skalowane do 80 %, tło wypełnione średnim kolorem obrazu |
  | `apple-touch-icon.png` | 180×180 | Ikona na ekran główny iOS (spłaszczona na białym tle) |

  Trafiają do `data/pwa/` i są serwowane przez backend — **nie** należy ich dodawać do repozytorium. Plik `manifest.webmanifest` w tym samym katalogu jest również odtwarzany przy każdym starcie z `<title>`: jego `name` / `short_name` to nazwa widoczna dla zainstalowanej aplikacji, a pozostałe pola pochodzą z szablonu dołączonego do kompilacji frontendu.

### 2. Ikony projektów

Skopiuj po jednym obrazie na projekt i wskaż go przez `<icon>`:

```bash
cp ~/project1-logo.png   /srv/biangbiang/assets/icon1.png
cp ~/project2-logo.webp  /srv/biangbiang/assets/icon2.webp
```

- Renderowane w rozmiarze **48×48 px** z `object-fit: cover`, więc najlepiej wyglądają kwadratowe źródła.
- Znacznik jest opcjonalny. Bez `<icon>` karta pokazuje kolorowy kafel z pierwszą literą nazwy projektu.

### 3. Wprowadź zmiany w życie

Materiały są montowane tylko do odczytu, więc kontener od razu widzi nowe pliki — ale **ikony PWA i nazwa aplikacji powstają wyłącznie przy starcie**:

```bash
cd /srv/biangbiang
docker compose restart biangbiang
```

> **Uprawnienia.** Kontener działa jako uid/gid **1000** (`node`). Pliki w `assets/` muszą być tylko czytelne dla wszystkich (`chmod 644`, czyli domyślne uprawnienie kopiowanych plików). Natomiast `data/` musi być **zapisywalny** dla uid 1000 — patrz [Bieżąca eksploatacja](#bieżąca-eksploatacja).


---

## Krok 4 — uruchom kontener

Edytuj plik `.env` utworzony w kroku 1:

```ini
# Opcjonalne. Potrzebny token o wąskim zakresie, z zaznaczonym
# prawem tylko do odczytu publicznych repozytoriów.
# Podnosi limit API GitHuba z 60 do 5000 żądań na godzinę.
GITHUB_TOKEN=github_pat_xxxxxxxxxxxxxxxxxxxx

# Strefa czasowa używana przy renderowaniu znaczników czasu.
TZ=Asia/Shanghai
```

Następnie zbuduj i uruchom:

```bash
cd /srv/biangbiang
docker compose up -d --build
docker compose logs -f
```

W logu pojawi się mniej więcej to:

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

Sprawdź, że kontener jest zdrowy i dostępny **wyłącznie** przez interfejs lokalny:

```bash
docker compose ps
curl -s http://127.0.0.1:8080/api/health
# {"status":"ok","time":"..."}
```

### Zmienne środowiskowe

Wszystkie poniższe ustawia się w sekcji `environment:` pliku Compose.

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PORT` | `8080` | Port HTTP wewnątrz kontenera. |
| `HOST` | `0.0.0.0` | Adres nasłuchu. |
| `TZ` | `Asia/Shanghai` | Strefa czasowa kontenera (nazwa IANA). Wpływa na logi i lokalne czasy zwracane przez backend. Zmień w `docker-compose.yml` lub `.env`. |
| `CONFIG_PATH` | `/app/config.xml` | Położenie `config.xml`. |
| `DATA_DIR` | `/app/data` | Artefakty + `state.json` + wygenerowane ikony PWA i manifest. |
| `PUBLIC_DIR` | `/app/public` | Spakowana aplikacja SPA (wbudowana w obraz). |
| `CHECK_INTERVAL_HOURS` | `24` | Odstęp sprawdzania, minimum `0.05` (3 minuty). |
| `MIRROR_ON_START` | `true` | `false` pomija pierwszą synchronizację przy starcie. |
| `DOWNLOAD_CONCURRENCY` | `4` | Liczba równoległych pobierań na projekt. |
| `GITHUB_TOKEN` | *(puste)* | Opcjonalny. Podnosi limit API. |

---

## Krok 5 — skieruj domenę na serwer

Dodaj rekord DNS **A** (a jeśli serwer ma IPv6 — także `AAAA`):

```text
Typ    Nazwa              Wartość            TTL
A      mirror             203.0.113.10       300
```

Zanim przejdziesz dalej, upewnij się, że rekord się rozpropagował — inaczej certbot zawiedzie:

```bash
dig +short mirror.example.com
# 203.0.113.10
```

> Użyj **osobnej subdomeny**. Aplikacja SPA biangbiang siedzi w katalogu głównym (`start_url: "/"`), więc wdrożenie pod ścieżką typu `example.com/mirror` nie jest obsługiwane.

---

## Krok 6 — reverse proxy nginx + TLS

### 1. Zainstaluj nginx i certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Utwórz konfigurację witryny

`/etc/nginx/sites-available/biangbiang`:

```nginx
# --- weryfikacja ACME + przekierowanie HTTP na HTTPS ----------------------
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

Włącz ją:

```bash
sudo ln -s /etc/nginx/sites-available/biangbiang /etc/nginx/sites-enabled/biangbiang
sudo mkdir -p /var/www/html
sudo nginx -t && sudo systemctl reload nginx
```

### 3. Uzyskaj certyfikat

```bash
sudo certbot certonly --webroot -w /var/www/html \
  -d mirror.example.com \
  --agree-tos -m you@example.com --no-eff-email
```

certbot instaluje timer systemd, więc odnowienie będzie automatyczne.


### 4. Dodaj blok serwera HTTPS

Zastąp teraz konfigurację pełną wersją — zachowuje powyższy blok ACME / przekierowania i dodaje TLS oraz reverse proxy:

```nginx
# --- weryfikacja ACME + przekierowanie HTTP na HTTPS ----------------------
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

    # Artefakty mogą mieć setki MB: przekazuj strumieniowo,
    # nie buforuj całości w nginx.
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

        # Duże pobrania nie mogą zostać przerwane w połowie.
        proxy_connect_timeout 30s;
        proxy_send_timeout    3600s;
        proxy_read_timeout    3600s;
    }
}
```

Zastosuj konfigurację:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

> **Dlaczego tylko interfejs lokalny?** Plik Compose publikuje `127.0.0.1:8080:8080`, więc kontener nie jest dostępny bezpośrednio z internetu — cały ruch publiczny przechodzi przez nginx, który kończy TLS. Jeśli nie chcesz nginx i wolisz wystawić port wprost, zmień `ports:` na `"8080:8080"` — stracisz jednak HTTPS, a PWA przestanie się instalować.

### Alternatywa: nginx także w kontenerze

Jeśli wolisz zarządzać wszystkim przez Compose, dodaj usługę nginx w tej samej sieci, usuń mapowanie `ports:` z usługi `biangbiang`, zmień `proxy_pass` na `http://biangbiang:8080;` i zamontuj certyfikaty oraz `nginx.conf`. Powyższe rozwiązanie z nginx na hoście jest prostsze w utrzymaniu odnowień certyfikatów, dlatego jest zalecane.

---

## Krok 7 — zweryfikuj wdrożenie

```bash
# 1. DNS wskazuje na Twój serwer
dig +short mirror.example.com

# 2. TLS działa, a HTTP przekierowuje
curl -sI http://mirror.example.com | head -1      # 301 -> https://
curl -sI https://mirror.example.com | head -1     # 200

# 3. API odpowiada przez proxy
curl -s https://mirror.example.com/api/health

# 4. Kontener nie jest wystawiony na publiczny interfejs
ss -tlnp | grep 8080        # musi pokazać 127.0.0.1:8080, nigdy 0.0.0.0:8080

# 5. Artefakt da się pobrać
curl -sI "https://mirror.example.com/dl/{owner}/{repo}/{version}/{file}" | head -1
```

Następnie otwórz `https://mirror.example.com` w przeglądarce i sprawdź:

- W nagłówku widać tytuł i favicon ustawione w `<title>`.
- Każdy `<project>` to jedna karta z etykietą wersji i przyciskami pobierania dla każdego artefaktu.
- Przycisk „Zobacz repozytorium” prowadzi z powrotem na GitHuba.
- Przełącznik motywu oferuje „Systemowy / Jasny / Ciemny”.
- Jeśli ustawiono `<sortable>true</sortable>`, w nagłówku pojawia się lista sortowania (Nazwa / Ostatnio zaktualizowane / Najwięcej plików / Najmniej plików).
- Jeśli ustawiono `<lang>` (np. `<lang>pl_pl</lang>`), cały interfejs — teksty, formaty dat i napisy Ant Design — przełącza się na ten język. Bez znacznika zostaje chiński uproszczony.
- Jeśli ustawiono `<accent>` (np. `<accent>volcano</accent>`), elementy normalnie niebieskie — etykiety wersji, link „Zobacz repozytorium” — przyjmują ten kolor. Bez znacznika zostaje domyślny niebieski.
- Jeśli ustawiono `<font>` (np. `<font>assets/MyFont.woff2</font>`), cały tekst na stronie — wraz z przyciskami, etykietami i listami Ant Design — używa tego fontu. Bez znacznika lub przy nieistniejącym pliku zostaje font systemowy.
- Powiększanie gestem dwoma palcami jest wyłączone, więc całości nie da się przeskalować; przewijanie i przesuwanie w poziomie i w pionie działa normalnie. Powiększanie z menu przeglądarki lub funkcji ułatwień dostępu systemu nadal działa.

### Instalacja jako PWA

Ponieważ strona działa teraz po HTTPS, service worker może się zarejestrować, a aplikację da się zainstalować:

- **iOS Safari:** Udostępnij → *Dodaj do ekranu początkowego*.
- **Android Chrome:** menu → *Zainstaluj aplikację*.
- **Chrome / Edge na komputerze:** ikona instalacji po prawej stronie paska adresu.

Z założenia aplikacja **nie działa offline** — service worker to czysty przekaz sieciowy.


---

## Bieżąca eksploatacja

### Podgląd logów

```bash
docker compose logs -f --tail=100 biangbiang
```

### Ręczne uruchomienie synchronizacji

Przycisk „Sprawdź aktualizacje” na stronie wywołuje `POST /api/refresh`. Z wiersza poleceń również:

```bash
curl -X POST https://mirror.example.com/api/refresh
```

### Aktualizacja biangbiang

Stabilne wydania publikowane są jako znaczniki. Pobierz znaczniki, przełącz się na najnowszy i przebuduj kontener:

```bash
cd /srv/biangbiang
git fetch --tags
git checkout "$(git tag --sort=-v:refname | head -1)"   # najnowszy znacznik wydania
docker compose up -d --build
```

> Przełączenie na znacznik pozostawia Cię w stanie detached HEAD, co nie ma znaczenia dla wdrożenia. Aby przypiąć konkretną wersję, zastąp `"$(...)"` nazwą znacznika, np. `v1.0.2`.

W wersji rozwojowej (gałąź `main`) nadal używasz `git pull`:

```bash
cd /srv/biangbiang
git pull
docker compose up -d --build
```

`./config.xml`, `./assets` i `./data` leżą na hoście, więc aktualizacje ich nie ruszają.

### Kopie zapasowe

Nie do odtworzenia są tak naprawdę tylko konfiguracja i zmirrorowane pliki:

```bash
tar czf biangbiang-$(date +%F).tar.gz config.xml assets data
```

Plik `data/state.json` pozwala stronie wyrenderować się natychmiast po odtworzeniu, bez czekania na pierwszy cykl sprawdzania GitHuba.

### Właściciel plików

Kontener działa jako uid/gid **1000** (`node`). Zamontowany przez bind mount katalog `./data` zachowuje właściciela z hosta — a jeśli powstał przez `sudo`, jest nim `root` — i proces nieuprzywilejowany nie może do niego pisać.

Robi to za Ciebie entrypoint: gdy kontener startuje jako root, najpierw zmienia właściciela `DATA_DIR` na `node`, a potem zrzeka uprawnień. Domyślna konfiguracja Compose nie wymaga więc ręcznego `chown`.

Jeśli kontener w ogóle nie startuje jako root, entrypoint nic nie zdziała. Gdy w Compose ustawisz `user:` albo uruchomisz `docker run --user`, `./data` musi być już zapisywalny dla tego uid:

```bash
sudo chown -R 1000:1000 /srv/biangbiang/data
```

### Limity API GitHuba

Nieuwierzytelnione żądania są ograniczone do **60 na godzinę** (na adres IP). Przy kilku projektach i jednym sprawdzeniu dziennie to w zupełności wystarcza. Przy większej liczbie projektów utwórz [token o wąskim zakresie](https://github.com/settings/tokens?type=beta) (prawo tylko do odczytu publicznych repozytoriów), wpisz go w `.env` jako `GITHUB_TOKEN` i zrestartuj:

```bash
docker compose up -d --force-recreate
```

### Zmiana interwału sprawdzania

Ustaw `CHECK_INTERVAL_HOURS` w sekcji `environment:` pliku Compose (minimum `0.05`, czyli 3 minuty) i przebuduj kontener.


---

## Rozwiązywanie problemów

| Objaw | Przyczyna / rozwiązanie |
|---|---|
| Zwracane `503 Frontend build not found.` | W `PUBLIC_DIR` nie ma `index.html`. Nie nadpisuj `PUBLIC_DIR` — SPA jest wbudowana w obraz pod `/app/public`. |
| Wszystkie karty pokazują „Synchronizacja nie powiodła się” z błędem `404 Not Found` | `<repo>` nie istnieje lub jest błędnie zapisane; a jeśli to repozytorium prywatne — token ma za małe uprawnienia. |
| W logu `overwrite.xml not found at /app/overwrite.xml` | Projekt używa `overwrite@{number}`, ale plik nie istnieje. Utwórz `./overwrite.xml` — patrz [Montowanie overwrite.xml](#montowanie-overwritexml). |
| Karta pokazuje `overwrite.xml has no <overwrite> block with <id>N</id>` | Liczba z `overwrite@N` nie ma odpowiadającego `<id>N</id>` w `overwrite.xml`. Porównaj oba pliki albo dopisz brakujący blok. |
| `overwrite.xml` zgłasza `EISDIR` / „is a directory” | Montowanie włączono, gdy pliku jeszcze nie było, więc Docker utworzył katalog. Wykonaj `rmdir ./overwrite.xml`, utwórz plik o tej samej nazwie i przebuduj kontener. |
| Przycisk pobierania wpisu ręcznego zwraca 404 | Link `<file>` jest błędny lub wygasł — przycisk prowadzi wprost pod ten adres, biangbiang go nie weryfikuje. |
| Komunikat `API rate limit exceeded` | Ustaw `GITHUB_TOKEN` w `.env`. |
| Karta nie pokazuje ikony | Błędna ścieżka `<icon>` albo plik nieczytelny dla uid 1000. Ścieżki są rozwiązywane względem `config.xml`. |
| Ikony PWA zostały domyślne | Brak lub nieczytelny `<favicon>` albo ImageMagick zawiódł. Sprawdź `docker compose logs \| grep '\[pwa\]'`, potem `docker compose restart biangbiang`. |
| Nazwa zainstalowanej aplikacji została domyślna | `manifest.webmanifest` powstaje z `<title>` przy starcie. Upewnij się, że `<title>` w `config.xml` jest poprawny, i wykonaj `docker compose restart biangbiang`. Wpis `[pwa] cannot read` w logu oznacza, że w kompilacji frontendu brakuje szablonu manifestu. |
| `./data` zgłasza `EACCES` / `permission denied` | Kontener nie może pisać do katalogu danych. Gdy startuje jako root, entrypoint sam poprawia właściciela — więc ten błąd oznacza, że ustawiłeś `user:` / `--user` albo zamontowałeś `./data` tylko do odczytu. Wykonaj `sudo chown -R 1000:1000 ./data`, a jeśli dodałeś `:ro`, usuń je. |
| `http://127.0.0.1:8080` działa, ale domena nie | Sprawdź cel `proxy_pass` i `server_name` w nginx oraz to, czy firewall przepuszcza porty 80/443. |
| Pobieranie urywa się w połowie | Zwiększ `proxy_read_timeout` / `proxy_send_timeout` w konfiguracji nginx. |
| Service worker nie chce się zarejestrować | Strona musi być dostępna po **HTTPS** (albo z `localhost`). Bezpośredni dostęp po IP przez zwykłe HTTP to nie kontekst bezpieczny. |
| Weryfikacja certbota zawodzi | DNS jeszcze się nie rozpropagował, port 80 jest zajęty lub zablokowany, albo inny blok serwera przechwytuje ten sam `server_name`. |
| Dysk zapełniają stare pliki | Każdy projekt zachowuje tylko najnowszą wersję. Sprawdź, czy w `./data` nie ma innych danych, i rozważ zmianę `DOWNLOAD_CONCURRENCY` lub powiększenie dysku. |

### Przydatne polecenia

```bash
docker compose ps                                   # stan zdrowia
docker inspect --format '{{.State.Health.Status}}' biangbiang
docker compose exec biangbiang node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>r.text()).then(console.log)"
curl -s http://127.0.0.1:8080/api/state | head -c 400
du -sh /srv/biangbiang/data
```

