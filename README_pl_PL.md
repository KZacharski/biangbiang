# biangbiang

[简体中文](README.md) · [繁體中文](README_zh_TW.md) · [English](README_en_US.md) · **Polski** · [Русский](README_ru_RU.md) · [Svenska](README_sv_SE.md)

![100% SLOP — ale ta odznaka jest zrobiona ręcznie](.github/assets/slop_badge.webp)

Samodzielnie hostowane **lustro artefaktów wydań GitHub**. Śledzi najnowsze wydanie każdego projektu wymienionego w `config.xml`, pobiera jego artefakty na Twój serwer i udostępnia je przez szybki, przystosowany do urządzeń mobilnych frontend Vue + [Ant Design Vue](https://antdv.com).

Cały projekt działa w **jednym kontenerze Docker**: pojedynczy proces Node.js (Express) serwuje API, zmirrorowane pliki oraz zbudowaną aplikację jednostronicową.

> Adres repozytorium: <https://github.com/xiaomianguan/biangbiang/>
> Dokumentacja wdrożeniowa: [Przewodnik wdrożenia (polski)](ADVANCED_INSTRUCTION_pl_PL.md) · [Advanced Deployment Guide (English)](ADVANCED_INSTRUCTION_en_US.md)

---

## Funkcje

- **Działa od razu**: repozytorium zawiera gotowe do użycia `config.xml`, `overwrite.xml` oraz `assets/` (favicon, ikony projektów i dołączony font). Wystarczy je sklonować i uruchomić `docker compose up -d --build`, aby zobaczyć kompletną stronę bez przygotowywania czegokolwiek — możesz rozbudować ten przykład albo go usunąć i zacząć od zera.
- **Automatyczne mirrorowanie** wszystkich artefaktów dołączonych do wydania GitHub.
- **Archiwa źródeł wykluczone** — archiwa `Source code (zip)` / `Source code (tar.gz)`, które GitHub dołącza automatycznie, nigdy nie są mirrorowane.
- **Sprawdzanie aktualizacji co 24 godziny** (konfigurowalne), z zachowaniem na dysku tylko najnowszej wersji każdego projektu.
- **Dowolna liczba projektów** — jeden `<project>` w `config.xml` to jedna karta.
- **Wpisy ręczne** — zapis `<repo>overwrite@{number}</repo>` sprawia, że dane karty pochodzą z `overwrite.xml`, dzięki czemu projekty z GitHuba i dowolne zewnętrzne linki do pobrania mogą współistnieć na jednej stronie.
- **W pełni konfigurowalne**: tytuł, favicon oraz ikona/nazwa/repozytorium każdego projektu pochodzą z `config.xml`; ikony to zwykłe pliki PNG/WEBP, a repozytorium zawiera gotowy zestaw przykładowy, który możesz dowolnie wymienić.
- **Opcjonalne sortowanie kart**: ustaw `<sortable>true</sortable>`, a w nagłówku pojawi się lista sortowania pozwalająca odwiedzającym uporządkować karty alfabetycznie, według ostatniej aktualizacji, największej lub najmniejszej liczby plików. Wartość `false` (lub brak znacznika) zachowuje dokładną kolejność wpisów z `config.xml`.
- **Konfigurowalny kolor akcentu**: podaj `<accent>` nazwę koloru z [podstawowych palet](https://ant.design/docs/spec/colors) Ant Design (np. `volcano` lub `purple`), a strona użyje go zamiast domyślnego niebieskiego. Pominięcie lub literówka pozostawia domyślny niebieski.
- **Konfigurowalny font**: wskaż w `<font>` plik fontu (np. `.woff2`), a cała strona — wraz z komponentami Ant Design — przełączy się na niego. Ścieżkę rozwiązuje się względem `config.xml`, tak samo jak `<favicon>`. Pominięcie znacznika lub wskazanie nieistniejącego pliku pozostawia font systemowy.
- **Motyw jasny / ciemny**, domyślnie „zgodny z systemem”, z możliwością ręcznego wymuszenia. Zaimplementowany na tokenach projektowych Ant Design Vue.
- **Instalowalna jako PWA** (manifest + Service Worker) — celowo **bez buforowania offline**; nazwa aplikacji pochodzi z `<title>`, a ikony z `<favicon>`.
- **Interfejs wielojęzyczny**: ustaw `<lang>` na `zh_cn`, `zh_tw`, `en_us`, `pl_pl`, `ru_ru` lub `sv_se`, a cały interfejs — teksty, formaty dat oraz napisy, które Ant Design renderuje we własnych komponentach — przełączy się na ten język. Pominięcie znacznika lub nieznana wartość pozostawia chiński uproszczony.
- **Responsywna siatka kart** — jedna kolumna na telefonie, dwie na tablecie, trzy na komputerze. Każda karta ma wysokość dopasowaną do swojej treści i nie jest rozciągana do najwyższej karty w rzędzie. Niższa karta dodatkowo unoszona jest w wolne miejsce pod sobą, więc odstępy między kartami wynoszą zawsze 16 px: Safari 26.4+ robi to natywnie dzięki Grid Lanes, a w pozostałych przeglądarkach karty rozmieszcza sam frontend.
- **Odporność na błędy**: jedno zepsute lub błędnie zapisane repozytorium nie powala całej strony — projekt, którego synchronizacja się nie powiodła, zachowuje ostatnie udane dane. Dołączona konfiguracja przykładowa celowo zostawia dwie niedziałające karty, aby to zademonstrować.

---

## Jak to działa

```text
                    co 24 h     ┌──────────────────────────────┐
        GitHub REST API ──────► │  Silnik lustra (backend)     │
   (releases/latest)            │  · pobierz najnowsze wydanie │
                                │  · pobierz artefakty         │
                                │  · usuń stare wersje         │
                                └──────────────┬───────────────┘
                                               │ zapis
                                               ▼
                              data/releases/{owner}/{repo}/{version}/{file}
                                               │
   przeglądarka ──► Express ───────────────────┘
                 ├─ /                  → zbudowana aplikacja Vue (pliki statyczne)
                 ├─ /api/state         → bieżący JSON: tytuł, projekty, wersje, artefakty
                 ├─ /media/{path}      → favicon i ikony projektów z katalogu konfiguracji
                 └─ /dl/{owner}/{repo}/{version}/{file}  → zmirrorowane artefakty
```

Frontend jest **statycznym pakietem**, ale dane, które wyświetla, pobiera w czasie działania przez `GET /api/state`. Gdy pojawi się nowe wydanie i zostanie zmirrorowane, znaczniki wersji oraz zestaw przycisków pobierania aktualizują się same — **przebudowanie frontendu nigdy nie jest konieczne**. Strona okresowo odświeża też dane (oraz wtedy, gdy karta przeglądarki odzyska fokus), dzięki czemu długo otwarte strony pozostają aktualne.

---

## Struktura projektu

```text
biangbiang/
├── .github/assets/         # odznaka README
├── config.xml              # konfiguracja strony, z gotowym przykładem (montowana)
├── overwrite.xml           # wpisy ręczne (poza GitHubem), z przykładem (montowane)
├── assets/                 # favicon, ikony projektów i font, z przykładem (tylko do odczytu)
├── data/                   # artefakty, state.json, wygenerowane ikony PWA i manifest
├── backend/                # API / silnik lustra w Node.js + Express
│   └── src/
│       ├── index.js        # serwer HTTP: SPA, /api, /media, /dl
│       ├── cli.js          # jednorazowe uruchomienie lustra (npm run mirror)
│       ├── config.js       # parsowanie config.xml + normalizacja adresów repozytoriów
│       ├── github.js       # klient API GitHuba + strumieniowe pobieranie
│       ├── mirror.js       # silnik lustra (porównanie, pobieranie, czyszczenie)
│       ├── overwrite.js    # parsowanie overwrite.xml (wpisy ręczne)
│       ├── pwaIcons.js     # generowanie ikon PWA z faviconu przez ImageMagick
│       ├── pwaManifest.js  # generowanie manifestu z <title> (nazwa aplikacji)
│       ├── scheduler.js    # zadanie cykliczne co 24 godziny
│       ├── state.js        # stan w pamięci + stan utrwalony
│       └── env.js          # konfiguracja ze zmiennych środowiskowych
├── frontend/               # SPA: Vue 3 + Vite + Ant Design Vue
│   ├── public/             # manifest, Service Worker, domyślne ikony PWA
│   └── src/
│       ├── App.vue         # ConfigProvider (motyw + pakiet językowy)
│       ├── api.ts          # klient API i funkcje formatujące
│       ├── theme.ts        # logika motywu auto / jasny / ciemny
│       ├── strings.ts      # stan języka interfejsu i wyszukiwanie tekstów
│       ├── locales/        # pakiety tekstów w sześciu językach
│       └── components/     # SiteView, ProjectCard, ThemeSwitcher
├── Dockerfile
├── docker-compose.yml             # minimalny przykład
├── docker-compose.advanced.yml    # przykład produkcyjny (tylko interfejs lokalny + nginx)
├── .env.example                   # skopiuj do .env i uzupełnij
├── ADVANCED_INSTRUCTION_zh_CN.md  # przewodnik wdrożenia (chiński uproszczony)
├── ADVANCED_INSTRUCTION_zh_TW.md  # przewodnik wdrożenia (chiński tradycyjny)
├── ADVANCED_INSTRUCTION_en_US.md  # przewodnik wdrożenia (angielski)
├── ADVANCED_INSTRUCTION_pl_PL.md  # przewodnik wdrożenia (polski)
├── ADVANCED_INSTRUCTION_ru_RU.md  # przewodnik wdrożenia (rosyjski)
├── ADVANCED_INSTRUCTION_sv_SE.md  # przewodnik wdrożenia (szwedzki)
├── README.md                      # README (chiński uproszczony)
├── README_zh_TW.md                # README (chiński tradycyjny)
├── README_en_US.md                # README (angielski)
├── README_pl_PL.md                # README (polski)
├── README_ru_RU.md                # README (rosyjski)
└── README_sv_SE.md                # README (szwedzki)
```

---

## Konfiguracja (`config.xml`)

`config.xml` leży obok katalogu `assets/`. Wszystkie ścieżki obrazów są rozwiązywane **względem katalogu zawierającego `config.xml`**, więc ikony mogą leżeć zarówno obok niego, jak i w podkatalogu `assets/`.

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

| Znacznik     | Położenie    | Opis |
|--------------|--------------|------|
| `<title>`    | główny       | Tytuł strony widoczny w nagłówku, na karcie przeglądarki oraz jako **nazwa zainstalowanej aplikacji** (zapisywana do manifestu przy każdym uruchomieniu). |
| `<lang>`     | główny       | Opcjonalny. Język interfejsu: `zh_cn`, `zh_tw`, `en_us`, `pl_pl`, `ru_ru` lub `sv_se` (bez rozróżniania wielkości liter; myślnik też jest akceptowany, więc `zh-CN` działa). Pominięty, pusty lub nieznany znacznik daje `zh_cn` (chiński uproszczony). |
| `<favicon>`  | główny       | Opcjonalny. Plik PNG/WEBP używany jako favicon strony. |
| `<sortable>` | główny       | Opcjonalny. Wartość `true` dodaje w nagłówku listę sortowania, pozwalając odwiedzającym uporządkować karty alfabetycznie, według ostatniej aktualizacji, największej lub najmniejszej liczby plików — domyślnie alfabetycznie. Wartość `false` (lub brak znacznika) zachowuje dokładną kolejność wpisów `<project>`. |
| `<accent>`   | główny       | Opcjonalny. Nazwa podstawowej palety Ant Design — `red`, `volcano`, `orange`, `gold`, `yellow`, `lime`, `green`, `cyan`, `blue`, `geekblue`, `purple` lub `magenta` (bez rozróżniania wielkości liter). Zastępuje domyślny niebieski (Daybreak Blue). Pominięta, pusta lub nieznana wartość daje domyślny niebieski. |
| `<font>`     | główny       | Opcjonalny. Ścieżka do pliku fontu (np. `assets/MyFont.woff2`), rozwiązywana względem `config.xml`, dokładnie jak `<favicon>`. Cała strona — wraz z komponentami Ant Design — przełącza się na ten font. Pominięty, pusty lub nieistniejący plik pozostawia font systemowy. |
| `<project>`  | główny (0..N) | Jeden wpis na projekt → jedna karta na stronie. |
| `<icon>`     | w projekcie  | Plik PNG/WEBP używany jako ikona karty. Opcjonalny. |
| `<name>`     | w projekcie  | Nazwa wyświetlana projektu. |
| `<repo>`     | w projekcie  | Adres repozytorium GitHub. |

**Obsługiwane zapisy `<repo>`** (wszystkie są rozwiązywane do `owner/repo`):

```text
https://github.com/user/project1
https://github.com/user/project1.git
https://github.com/user/project1/
git@github.com:user/project1.git
user/project1
```

Liczbę wpisów `<project>` możesz dowolnie zmieniać — strona renderuje dokładnie jedną kartę na każdy prawidłowy wpis. Wpisy z brakującym lub błędnym `<repo>` są pomijane i nie wpływają na pozostałe.


### Wpisy ręczne (`overwrite.xml`)

`<repo>` nie musi wskazywać GitHuba. Zapis `overwrite@{number}` sprawia, że dane tej karty pochodzą z pliku `overwrite.xml` leżącego **obok** `config.xml`:

```xml
<project>
    <icon>assets/icon2.webp</icon>
    <name>Mój prywatny projekt</name>
    <repo>overwrite@1</repo>
</project>
```

Struktura `overwrite.xml`:

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

| Znacznik             | Opis |
|----------------------|------|
| `<id>`               | Odpowiada liczbie w `overwrite@{number}` w `config.xml`. |
| `<version>`          | Wersja pokazywana na karcie zamiast pobieranej automatycznie. Opcjonalna. |
| `<repo>`             | Adres, na który prowadzi przycisk „Zobacz repozytorium”. Opcjonalny — bez niego przycisk się nie pojawia. |
| `<downloads>/<file>` | Każdy `<file>` to jeden przycisk pobierania prowadzący wprost do podanego linku. |

Warto wiedzieć:

- `overwrite.xml` jest czytany **tylko** wtedy, gdy w `config.xml` istnieje co najmniej jeden wpis `overwrite@{number}`. Jeśli każdy `<repo>` to adres GitHuba, plik nie jest w ogóle otwierany.
- Wpisy ręczne **niczego nie pobierają ani nie buforują** — przyciski prowadzą wprost do podanych adresów, więc nie zajmują miejsca na dysku i nie podlegają limitom API GitHuba.
- Wpisy ręczne **nie pokazują daty wydania** (nie ma wydania, które można by datować) ani rozmiaru pliku (jest nieznany).
- Projekty z GitHuba i wpisy ręczne można dowolnie mieszać w jednym `config.xml`.
- Nazwa pliku na przycisku pobierania to ostatni segment adresu URL.
- We wdrożeniu Dockerowym `overwrite.xml` jest montowany tylko do odczytu obok `config.xml`, więc nie trzeba nic dodatkowo konfigurować.

> **Repozytorium zawiera gotowy zestaw przykładowy.** Świeżo sklonowane repozytorium ma już `config.xml`, `overwrite.xml` oraz `assets/` (favicon, ikony projektów i dołączony font), więc `docker compose up -d --build` daje kompletną stronę bez żadnych zmian. Aby nadać jej własny wygląd, podmień pliki w `assets/` i wskaż je w konfiguracji; aby zacząć od zera, usuń przykłady i zostaw tylko własną konfigurację.

---

## Szybki start (Docker)

> **Wdrażasz na publiczny serwer?** Zobacz przewodniki wdrożeniowe:
> [polski](ADVANCED_INSTRUCTION_pl_PL.md) ·
> [English](ADVANCED_INSTRUCTION_en_US.md).
> Omawiają przykład `docker-compose.advanced.yml`, szczegółowy opis `config.xml`,
> sposób umieszczania obrazów oraz wystawienie kontenera przez nginx z HTTPS.

### 1. Pobierz projekt

Sklonuj repozytorium i przełącz się na **najnowsze stabilne wydanie** (najnowszy znacznik wydania):

```bash
git clone https://github.com/xiaomianguan/biangbiang.git
cd biangbiang
git checkout "$(git tag --sort=-v:refname | head -1)"   # najnowszy znacznik wydania
```

> **Wolisz wersję rozwojową (gałąź `main`)?** Pomiń ostatnią linię `git checkout` — zostaniesz na `main`. Zawiera ona najświeższe zmiany, ale nie zostały jeszcze wydane i może być niestabilna.

### 2. Przygotuj konfigurację i ikony (opcjonalnie — repozytorium zawiera działający przykład)

```
biangbiang/
├── config.xml
├── overwrite.xml           # wpisy ręczne: potrzebne tylko dla overwrite@{number}
└── assets/
    ├── favicon.png
    ├── icon1.png
    └── icon2.webp
```

Świeżo sklonowane repozytorium **zawiera już** wszystkie powyższe pliki, więc ten krok jest opcjonalny: `docker compose up -d --build` od razu daje kompletną stronę. Aby dostosować ją do siebie, edytuj `config.xml`, wpisując tytuł i swoje projekty (składnia w poprzedniej sekcji), a następnie podmień obrazy w `assets/`.

> **Konfiguracja przykładowa zawiera dwie celowo niedziałające karty.** Dołączony `config.xml` używa `https://github.com/user/project2` (nieistniejące repozytorium) oraz `overwrite@2` (brak pasującego `<id>` w `overwrite.xml`), aby pokazać oba stany błędów — obrazują one zachowanie strony, gdy repozytorium jest błędnie zapisane lub brakuje wpisu ręcznego. To działanie zamierzone, nie błąd. Usuń je lub wskaż własne projekty.

> **Korzystasz z wpisów ręcznych?** Wystarczy uzupełnić je w `overwrite.xml` — `docker-compose.yml` już montuje ten plik w kontenerze.
>
> Po zmianie pliku na hoście kliknij „Sprawdź aktualizacje” w interfejsie; nie trzeba przebudowywać kontenera.
>
> Pamiętaj, aby plik istniał: jeśli `./overwrite.xml` zniknie, Docker utworzy w tym miejscu pusty katalog i powiązane karty zgłoszą błąd `EISDIR`. Repozytorium zawiera gotowy przykład, więc dotyczy to tylko sytuacji, gdy go usunąłeś.

### 3. Zbuduj i uruchom

```bash
docker compose up -d --build
```

### 4. Otwórz stronę

Wejdź w przeglądarce na <http://localhost:8080>.

Pierwsza synchronizacja startuje od razu przy uruchomieniu kontenera; kolejne odbywają się co 24 godziny (patrz `CHECK_INTERVAL_HOURS`). Zmironowane artefakty trafiają do katalogu `./data` na hoście i przetrwają restart.


### Bez Compose

```bash
docker build -t biangbiang .
docker run -d --name biangbiang -p 8080:8080 \
  -v "$PWD/config.xml:/app/config.xml:ro" \
  -v "$PWD/assets:/app/assets:ro" \
  -v "$PWD/data:/app/data" \
  biangbiang
```

### Przydatne polecenia

```bash
docker compose logs -f          # podglądaj logi na bieżąco
docker compose restart          # restart (odtwarza ikony PWA i nazwę aplikacji)
docker compose down             # zatrzymaj i usuń kontener
```

### Aktualizacja do najnowszej wersji

Stabilne wydania publikowane są jako znaczniki. Pobierz znaczniki, przełącz się na najnowszy z nich i przebuduj kontener:

```bash
git fetch --tags
git checkout "$(git tag --sort=-v:refname | head -1)"   # najnowszy znacznik wydania
docker compose up -d --build
```

> Przełączenie na znacznik pozostawia Cię w stanie detached HEAD, co nie ma znaczenia dla wdrożenia. Aby przypiąć konkretną wersję, zastąp `"$(...)"` nazwą znacznika, np. `v1.0.2`.

W wersji rozwojowej (gałąź `main`) nadal chcesz użyć `git pull`:

```bash
git pull
docker compose up -d --build
```

`./config.xml`, `./overwrite.xml`, `./assets` oraz `./data` są zachowywane na hoście przez montowanie, więc aktualizacje ich nie ruszają.

---

## Praca lokalna

Uruchom osobno backend i serwer deweloperski Vite, aby korzystać z odświeżania na żywo.

```bash
# Terminal 1 — backend (mirroruje do ./data, serwuje API i pliki)
cd backend
npm install
CONFIG_PATH=../config.xml DATA_DIR=../data PUBLIC_DIR=../frontend/dist npm start

# Terminal 2 — serwer deweloperski frontendu (proxy /api, /dl i /media na :8080)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Przydatne skrypty:

```bash
cd backend  && npm run mirror   # jednorazowe mirrorowanie i wyjście
cd frontend && npm run build    # produkcyjna kompilacja SPA
cd frontend && npm run type-check
```

> Do lokalnego generowania ikon PWA potrzebny jest ImageMagick — szczegóły w sekcji „PWA” poniżej.

---

## Zmienne środowiskowe

| Zmienna                 | Domyślnie               | Opis |
|-------------------------|-------------------------|------|
| `PORT`                  | `8080`                  | Port HTTP. |
| `HOST`                  | `0.0.0.0`               | Adres nasłuchu. |
| `TZ`                    | `Asia/Shanghai`         | Strefa czasowa kontenera (nazwa IANA). Wpływa na logi i lokalne czasy zwracane przez backend. Zmień w `docker-compose.yml` / `.env`. |
| `CONFIG_PATH`           | `/app/config.xml`       | Ścieżka do `config.xml`. |
| `DATA_DIR`              | `/app/data`             | Katalog na artefakty i `state.json`. |
| `PUBLIC_DIR`            | `/app/public`           | Katalog ze zbudowanym frontendem. |
| `CHECK_INTERVAL_HOURS`  | `24`                    | Odstęp między sprawdzaniem nowych wydań GitHuba (w godzinach). |
| `MIRROR_ON_START`       | `true`                  | Czy uruchomić synchronizację od razu po starcie. |
| `DOWNLOAD_CONCURRENCY`  | `4`                     | Liczba równoległych pobierań na projekt. |
| `GITHUB_TOKEN`          | *(puste)*               | Opcjonalny. Podnosi limit API (60 → 5000 zapytań na godzinę). |

Wszystkie te zmienne można ustawić w sekcji `environment` pliku `docker-compose.yml`.


---

## Interfejs HTTP

| Metoda | Ścieżka                               | Opis |
|--------|---------------------------------------|------|
| `GET`  | `/api/state`                          | Bieżący stan strony: tytuł, favicon, projekty, wersje i artefakty. |
| `GET`  | `/api/health`                         | Test kondycji (sonda żywotności). |
| `POST` | `/api/refresh`                        | Natychmiast uruchamia mirrorowanie (używane przez przycisk „Sprawdź aktualizacje”). |
| `GET`  | `/media/{path}`                       | Favicon / ikony projektów, rozwiązywane względem katalogu konfiguracji. |
| `GET`  | `/dl/{owner}/{repo}/{version}/{file}` | Pobierz zmirrorowany artefakt. |

> Wcięcia `{...}` powyżej to symbole zastępcze — w prawdziwym żądaniu wstaw konkretne wartości (np. `{owner}` zamień na właściciela repozytorium). W całej tej dokumentacji `<...>` oznacza wyłącznie znaczniki XML.

Przykładowa odpowiedź `GET /api/state`:

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

`status` przyjmuje wartości `ok`, `empty` (brak wydania) lub `error` (np. repozytorium nie istnieje). Projekt, którego synchronizacja się nie powiodła, zachowuje ostatnie udane dane.

---

## Uwagi

### Motyw
Motyw domyślnie działa w trybie **zgodnym z systemem (auto)**, podążając za jasnym/ciemnym ustawieniem systemu i aktualizując się na bieżąco. Przełącznik w nagłówku pozwala wymusić tryb **jasny** lub **ciemny**; wybór zapisywany jest w `localStorage`. Oba motywy korzystają z tokenów `defaultAlgorithm` / `darkAlgorithm` Ant Design Vue.

### PWA
Aplikacja dostarcza `manifest.webmanifest` oraz minimalny Service Worker, więc można ją zainstalować na ekranie głównym lub pulpicie. Service Worker **niczego nie buforuje** — to czysty przekaz sieciowy, więc trybu offline nie ma z założenia.

**Ikony zainstalowanej aplikacji zawsze podążają za `<favicon>`**, a **nazwa aplikacji zawsze za `<title>`**. Przy każdym uruchomieniu backend generuje z faviconu cały zestaw ikon przy pomocy ImageMagicka:

| Wynik | Rozmiar | Opis |
|-------|---------|------|
| `pwa-192x192.png` | 192×192 | Przezroczystość zachowana, dopełnione do kwadratu |
| `pwa-512x512.png` | 512×512 | Przezroczystość zachowana, dopełnione do kwadratu |
| `pwa-maskable-512x512.png` | 512×512 | Logo skalowane do 80%, tło wypełnione średnim kolorem faviconu |
| `apple-touch-icon.png` | 180×180 | Spłaszczone na białym tle (iOS nie obsługuje przezroczystości) |

Ikony trafiają do `{DATA_DIR}/pwa/` i są serwowane pod ścieżkami zadeklarowanymi w manifeście. Przy każdym uruchomieniu backend odtwarza też w tym samym katalogu plik `manifest.webmanifest`, podmieniając jego `name` / `short_name` (nazwę widoczną dla zainstalowanej aplikacji) na `<title>` z `config.xml` i ustawiając `lang` na znacznik BCP-47 odpowiadający `<lang>`; pozostałe pola (opis, kolory, lista ikon) pochodzą z szablonu dołączonego do kompilacji frontendu. Zmiana `<favicon>`, `<title>` lub `<lang>` i restart kontenera wystarczą więc, aby zaktualizować ikony, nazwę i język aplikacji. Faviconem może być dowolny format czytany przez ImageMagick (PNG, WEBP itd.). Jeśli `<favicon>` nie jest ustawiony lub ImageMagick jest niedostępny, używane są domyślne ikony z `frontend/public/`; jeśli nie da się odczytać szablonu manifestu, używany jest domyślny manifest.

ImageMagick jest już zainstalowany w obrazie Docker. Do pracy lokalnej zainstaluj go samodzielnie (`brew install imagemagick`, `apt install imagemagick` itd.).

### Limity API
Nieuwierzytelnione zapytania do API GitHuba są ograniczone do 60 na godzinę, co przy kilku projektach i jednym sprawdzeniu dziennie w zupełności wystarcza. Przy większej liczbie projektów ustaw `GITHUB_TOKEN` w `docker-compose.yml`.

### Działanie bez uprawnień roota
Entrypoint kontenera startuje jako root, przejmuje katalog `./data` na użytkownika `node` (uid 1000), po czym natychmiast zrzeka się uprawnień — dzięki temu montowany katalog działa od razu i nie trzeba ręcznie wywoływać `chown`. Jeśli wymusisz innego użytkownika przez `user:` lub `--user`, musi on mieć prawo zapisu do `./data`.

---

## Licencja

Projekt udostępniany na licencji [The Unlicense](https://unlicense.org) i przekazany do domeny publicznej. Możesz go swobodnie kopiować, modyfikować, publikować, używać, kompilować, sprzedawać i rozpowszechniać — w formie źródłowej i binarnej — do dowolnych celów, komercyjnych i niekomercyjnych, bez obowiązku podania autora.

Pełna treść znajduje się w pliku [LICENSE](LICENSE) w katalogu głównym repozytorium.

