# biangbiang —— 進階部署指南（Docker + nginx + HTTPS）

[简体中文](ADVANCED_INSTRUCTION_zh_CN.md) · **繁體中文** · [English](ADVANCED_INSTRUCTION_en_US.md) · [Polski](ADVANCED_INSTRUCTION_pl_PL.md) · [Русский](ADVANCED_INSTRUCTION_ru_RU.md) · [Svenska](ADVANCED_INSTRUCTION_sv_SE.md)

本指南將帶你從一台全新的 Linux 伺服器，一步步走到**透過 nginx 反向代理對外提供 HTTPS 服務的 biangbiang 實例**。

如果你只是想在本地試用，[`README.md`](README.md) 中的簡要步驟就夠了。本文件面向生產部署。

---

## 目錄

1. [最終架構](#1-最終架構)
2. [環境要求](#2-環境要求)
3. [第一步 —— 把程式碼放到伺服器上](#第一步--把程式碼放到伺服器上)
4. [第二步 —— 撰寫 config.xml](#第二步--撰寫-configxml)
5. [第三步 —— 加入圖片素材](#第三步--加入圖片素材)
6. [第四步 —— 啟動容器](#第四步--啟動容器)
7. [第五步 —— 把網域指向伺服器](#第五步--把網域指向伺服器)
8. [第六步 —— nginx 反向代理 + TLS](#第六步--nginx-反向代理--tls)
9. [第七步 —— 驗證部署](#第七步--驗證部署)
10. [日常維運](#日常維運)
11. [故障排查](#故障排查)

---

## 1. 最終架構

```
        網際網路
            │  https://mirror.example.com
            ▼
    ┌───────────────────┐
    │  nginx（主機）    │  TLS 終止，監聽 443
    │  Let's Encrypt    │
    └─────────┬─────────┘
              │  proxy_pass http://127.0.0.1:8080
              ▼
    ┌───────────────────┐
    │  biangbiang       │  單一 Docker 容器
    │  Express + SPA    │  （不直接暴露到公網）
    └─────────┬─────────┘
              │  每 24 小時
              ▼
        GitHub REST API  →  ./data/releases/{owner}/{repo}/{version}/{file}
```

一個容器同時提供 API、鏡像後的建置產物**以及**打包好的 Vue 單頁應用程式。資料與產物都存放在 bind mount（`./data`）中，因此執行 `docker compose up --build` 不會遺失任何資料。

---

## 2. 環境要求

| 項目 | 說明 |
|---|---|
| Linux 伺服器 | 任何支援 Docker 的發行版。起步階段 1 核 / 1 GB 記憶體完全夠用。 |
| Docker Engine | 24 或更高版本，並帶 Compose v2 外掛（指令是 `docker compose`，不是 `docker-compose`）。 |
| 磁碟空間 | 依建置產物大小規劃。biangbiang **每個專案只保留最新版本**，所以佔用是可預期的。 |
| 一個網域 | 例如 `mirror.example.com`，且你能修改它的解析記錄。 |
| nginx | 安裝在主機上（`apt install nginx`）——本文以主機 nginx 為例。 |
| certbot | 用於申請免費的 Let's Encrypt 憑證。 |

> 容器本身**不依賴**主機上的任何工具：Node 22、ImageMagick 以及全部相依套件都已打包進映像檔。

---

## 第一步 —— 把程式碼放到伺服器上

複製倉庫，再切到**最新的穩定版**（最新的 release 標籤）：

```bash
sudo mkdir -p /srv/biangbiang
sudo chown "$USER":"$USER" /srv/biangbiang
cd /srv/biangbiang
git clone https://github.com/xiaomianguan/biangbiang.git .
git checkout "$(git tag --sort=-v:refname | head -1)"   # 最新的 release 標籤
```

> **想改用 git 開發版（追蹤 `main` 分支）？** 略過最後那行 `git checkout`，複製出來的就會是 `main`。開發版包含最新的改動，但尚未作為正式版本發佈，可能不穩定。

> **`chown` 這一步不能省。** `sudo mkdir` 建出來的目錄擁有者是 `root`，之後在它裡面建立的所有東西（包括 `./data`）都會繼承這個擁有者。容器是以非特權使用者執行的，擁有者為 `root` 的 `./data` 會讓鏡像工作在第一次寫入時就報 `EACCES`。

如果伺服器無法存取外網 Git，可以在本地建置映像檔並推送到映像檔倉庫，然後把 Compose 檔案中的 `build:` 換成 `image:`。

接著準備實際部署用的目錄結構：

```bash
cp docker-compose.advanced.yml docker-compose.yml
cp .env.example .env
mkdir -p data            # config.xml、overwrite.xml 與 assets/ 隨倉庫提供，這裡只需 data/
```

> `./data` 由容器寫入。容器啟動時會自動修正它的擁有者（見[檔案擁有者](#檔案擁有者)），因此無需手動 `chown`。

從這裡開始，只有四個路徑需要你關心：

| 路徑 | 用途 |
|---|---|
| `config.xml` | 站點設定（以唯讀方式掛載進容器）。 |
| `overwrite.xml` | 手動條目（非 GitHub 專案），唯讀掛載。僅當 `config.xml` 裡用到 `overwrite@{數字}` 時才會被讀取。 |
| `assets/` | 你的 favicon 與各專案圖示（唯讀掛載）。 |
| `data/` | 鏡像產物、`state.json`、產生的 PWA 圖示與 manifest。**請務必備份。** |

---

## 第二步 —— 撰寫 config.xml

`config.xml` 是**唯一**決定站點呈現內容的檔案。容器從 `/app/config.xml` 讀取它，每次同步都會重新解析，因此改完設定後重新啟動容器即可，無需重新建置映像檔。

倉庫**已經自帶一份可直接使用的 `config.xml`**，與之配套的 `overwrite.xml` 和 `assets/` 也一併提供，因此本步驟同樣可以略過——原樣部署即可看到一個完整站點。下面的「最小範例」講的是如何按自己的需求改寫它。

> **自帶的範例裡有兩張「故意失敗」的卡片。** 它分別用 `https://github.com/user/project2`（不存在的倉庫）和 `overwrite@2`（`overwrite.xml` 中沒有對應 `<id>`）示範兩種錯誤狀態，用來展示站點在倉庫寫錯或手動條目缺失時的表現——這是預期行為，不是 bug。刪掉它們，或改成你自己的專案即可。

### 最小範例

```xml
<favicon>assets/favicon.png</favicon>
<title>我的鏡像站</title>
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

### 標籤說明

| 標籤 | 位置 | 是否必填 | 行為 |
|---|---|---|---|
| `<title>` | 根節點 | 否 | 頁首、瀏覽器分頁以及**安裝後的應用程式名稱**顯示的站點標題。缺省時回退為 `Releases`。 |
| `<lang>` | 根節點 | 否 | 介面語言，取 `zh_cn` / `zh_tw` / `en_us` / `pl_pl` / `ru_ru` / `sv_se` 之一（大小寫不敏感，也接受 `zh-CN` 這種連字號寫法）。整套介面文案、日期格式以及 Ant Design 元件自帶的文案都會隨之切換。缺省或填了無法辨識的值時回退為 `zh_cn`（簡體中文）。 |
| `<favicon>` | 根節點 | 否 | 用作站點 favicon 的 PNG/WEBP，**同時**是可安裝 PWA 圖示的產生來源。缺省時使用內建的預設圖示。 |
| `<sortable>` | 根節點 | 否 | 只接受 `true` / `false`（大小寫不敏感）。設為 `true` 時頁首會出現排序下拉選單，訪客可依「依名稱 / 最近更新 / 檔案最多 / 檔案最少」重新排列卡片，預設依名稱（字母順序）；`false`、寫錯或省略時，卡片嚴格保持 `<project>` 的書寫順序。 |
| `<accent>` | 根節點 | 否 | Ant Design [基礎色板](https://ant.design/docs/spec/colors) 的色名，取 `red` / `volcano` / `orange` / `gold` / `yellow` / `lime` / `green` / `cyan` / `blue` / `geekblue` / `purple` / `magenta` 之一（大小寫不敏感）。用該色取代站點預設的品牌藍（Daybreak Blue）。省略、留空或寫成無法辨識的值時一律回退為預設藍色——不會報錯，也不會讓站點失去配色。 |
| `<font>` | 根節點 | 否 | 字型檔案路徑（如 `assets/MyFont.woff2`），與 `<favicon>` 一樣**相對於 `config.xml` 所在目錄**解析。站點整體——包括 Ant Design 的按鈕、標籤、下拉選單等元件——都會改用該字型，缺字形的字元仍由系統字型補足。省略、留空或檔案不存在時保持系統預設字型。 |
| `<project>` | 根節點（0..N） | — | 對應站點上的一張卡片。數量不限，自動依螢幕寬度排成 1 / 2 / 3 欄，且每張卡片各自獨立高度——不會被拉伸去補齊同列最高的卡片。較矮的卡片還會上浮填滿下方的空位，卡片間距恆為 16px——Safari 26.4+ 走原生 Grid Lanes，其他瀏覽器由前端自行排版。 |
| `<icon>` | `<project>` 內 | 否 | 卡片縮圖（PNG/WEBP）。缺省或圖片載入失敗時，卡片會顯示專案名稱的首字母。 |
| `<name>` | `<project>` 內 | 否 | 顯示名稱。缺省時回退為倉庫名稱。 |
| `<repo>` | `<project>` 內 | **是** | GitHub 倉庫位址。`<repo>` 無效的 `<project>` 會被靜默略過。 |

### `<repo>` 支援的寫法

以下寫法都會被解析為 `owner/repo`：

```text
https://github.com/user/project1
https://github.com/user/project1.git
https://github.com/user/project1/
git@github.com:user/project1.git
user/project1
```

### 鏡像規則

- 每個專案**只鏡像最新的 Release**，舊版本會自動從磁碟刪除。
- 該 Release 中附帶的**全部建置產物**都會被鏡像。
- GitHub 自動產生的 `Source code (zip)` / `Source code (tar.gz)` 封存檔**永遠不會**被鏡像。
- 重複的 `<repo>` 條目會自動去重。
- 某個倉庫寫錯或已刪除**不會**拖垮整個站點：該卡片會顯示「同步失敗」提示，並保留上一次成功鏡像的資料。

### 圖片路徑的解析規則

`config.xml` 中的所有圖片路徑都**相對於 `config.xml` 所在的目錄**（即容器內的 `/app`）解析。下面兩種寫法都有效：

```xml
<icon>assets/icon1.png</icon>
<icon>icon1.png</icon>          <!-- 與 config.xml 放在同一目錄 -->
```

由於 `./assets` 以唯讀方式掛載到 `/app/assets`，推薦把所有圖片統一放在 `assets/` 下。


### 手動條目 —— 把任意位置的檔案託管到站點上（overwrite.xml）

`<repo>` 不一定要寫 GitHub。寫成 `overwrite@{數字}` 時，這張卡片的資料就改由與 `config.xml` 同目錄的 `overwrite.xml` 提供：

```xml
<!-- config.xml -->
<project>
    <icon>assets/icon2.webp</icon>
    <name>我的專案</name>
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

| 標籤 | 說明 |
|---|---|
| `<id>` | 與 `overwrite@{數字}` 中的數字對應。 |
| `<version>` | 卡片上顯示的版本號，代替自動取得的版本。可省略。 |
| `<repo>` | 「查看原倉庫」按鈕指向的位址。可省略，省略時該按鈕不顯示。 |
| `<downloads>/<file>` | 每個 `<file>` 對應一個下載按鈕，直接指向該外部連結。 |

行為說明：

- **按需讀取。** 只有當 `config.xml` 中至少存在一個 `overwrite@{數字}` 時才會讀取 `overwrite.xml`；純 GitHub 站點根本不會開啟它，所以這個檔案可以不存在。
- **不下載任何東西。** 手動條目不會發起任何 HTTP 請求，也不會往 `./data` 寫任何檔案。下載按鈕直接指向你填寫的 URL，因此不佔磁碟、也不受 GitHub 速率限制影響。
- **不顯示「發佈於」日期。** 沒有 Release，自然沒有發佈日期；檔案大小同樣未知，因此也不顯示。
- **可以隨意混用。** GitHub 專案與手動條目能以任意組合共存。
- **按鈕上的檔案名稱**取自連結 URL 的最後一段（`https://cdn.example.com/x/artifact3.zip` → `artifact3.zip`）。
- **條目缺失不會拖垮站點。** 如果 `overwrite@{數字}` 找不到對應的 `<id>`，或者 `overwrite.xml` 整個不存在，只有那一張卡片會進入錯誤狀態並輸出一行日誌，其他專案不受影響。

### 掛載 overwrite.xml

`overwrite.xml` 與 `config.xml` 一樣，由 `docker-compose.yml` 和 `docker-compose.advanced.yml` 以**單一檔案**的方式掛載：

```yaml
      - ./config.xml:/app/config.xml:ro
      - ./overwrite.xml:/app/overwrite.xml:ro
      - ./assets:/app/assets:ro
      - ./data:/app/data
```

每一輪鏡像檢查都會重新讀取這個檔案，所以改完主機上的內容後，點一下介面上的「立即檢查更新」，或等下一次定時檢查即可生效，**不需要**重新建置或重新啟動容器。

> **請保持檔案存在。** 如果 `./overwrite.xml` 不存在，Docker 會把它建成一個空**目錄**，所有 `overwrite@{數字}` 卡片都會以 `EISDIR` 報錯。倉庫裡已經自帶一份可直接使用的範例，新複製的倉庫不會遇到這個問題；若你刪掉了它，用 `touch /srv/biangbiang/overwrite.xml` 重新建一個即可。

---

## 第三步 —— 加入圖片素材

倉庫**自帶一套可用的範例素材**：`assets/` 中的 favicon、專案圖示，以及一份隨附字型。配合自帶的 `config.xml`，新複製的倉庫開箱就是一個外觀完整的站點，無需先準備任何圖片。下面講的是如何把它們換成你自己的——可以逐個替換，也可以把範例全部刪掉、從零開始。站點外觀完全由 `assets/` 與 `config.xml` 決定；biangbiang 本身不內建任何固定的品牌素材。

### 目錄結構

```
/srv/biangbiang/
├── config.xml
├── assets/
│   ├── favicon.png        # 站點 favicon，同時是 PWA 圖示的產生來源
│   ├── icon1.png          # 專案 1 的縮圖
│   └── icon2.webp         # 專案 2 的縮圖
└── data/
```

> 除 `data/` 外，以上檔案都**已經隨倉庫提供**，所以下面的 `cp` 指令是「替換」而不是「建立」——只有當你想要自己的外觀時才需要執行。

### 1. favicon（想要自訂外觀就必填）

```bash
# 把你的 logo 放進去，並在 config.xml 中引用：
#   <favicon>assets/favicon.png</favicon>
cp ~/my-logo.png /srv/biangbiang/assets/favicon.png
```

- **格式：** ImageMagick 能讀取的任意格式，PNG 與 WEBP 是經過驗證的路徑。
- **尺寸：** 建議 512×512 或更大，最好是帶透明通道的正方形。
- 每次容器啟動時，後端都會由這個檔案衍生出整套可安裝圖示：

  | 產生的檔案 | 尺寸 | 用途 |
  |---|---|---|
  | `pwa-192x192.png` | 192×192 | PWA 圖示，保留透明度 |
  | `pwa-512x512.png` | 512×512 | PWA 圖示，保留透明度 |
  | `pwa-maskable-512x512.png` | 512×512 | Android 自適應圖示，圖案縮放到 80%，背景填滿圖片的平均色 |
  | `apple-touch-icon.png` | 180×180 | iOS 主畫面圖示（平鋪到白色背景） |

  它們會被寫入 `data/pwa/` 並由後端對外提供，**不需要**提交到倉庫。同一目錄下的 `manifest.webmanifest` 同樣是每次啟動時由 `<title>` 重新產生的——其中的 `name` / `short_name` 就是安裝後顯示的應用程式名稱，其餘欄位沿用前端建置產物中的範本。

### 2. 專案圖示

為每個專案複製一張圖片，並用 `<icon>` 引用：

```bash
cp ~/project1-logo.png   /srv/biangbiang/assets/icon1.png
cp ~/project2-logo.webp  /srv/biangbiang/assets/icon2.webp
```

- 呈現尺寸為 **48×48 px**，使用 `object-fit: cover`，因此正方形原圖效果最好。
- 該標籤為選用。不寫 `<icon>` 時，卡片會顯示專案名稱首字母的色塊。

### 3. 讓改動生效

素材是唯讀掛載的，容器會立刻看到新檔案——但 **PWA 圖示與應用程式名稱只在啟動時重新產生**：

```bash
cd /srv/biangbiang
docker compose restart biangbiang
```

> **權限說明。** 容器以 uid/gid **1000**（`node`）執行。`assets/` 下的檔案只需要全域可讀（`chmod 644`，這也是複製檔案的預設權限）。而 `data/` 必須對 uid 1000 **可寫**，詳見[日常維運](#日常維運)。


---

## 第四步 —— 啟動容器

編輯第一步建立的 `.env`：

```ini
# 選用。需要細粒度的 PAT，勾選「公開倉庫」唯讀權限。
# 可把 GitHub API 限額從 60 次/小時提升到 5000 次/小時。
GITHUB_TOKEN=github_pat_xxxxxxxxxxxxxxxxxxxx

# 站點呈現時間戳所用的時區。
TZ=Asia/Shanghai
```

然後建置並啟動：

```bash
cd /srv/biangbiang
docker compose up -d --build
docker compose logs -f
```

正常會看到類似輸出：

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

確認容器健康，並且**只能**透過回送位址存取：

```bash
docker compose ps
curl -s http://127.0.0.1:8080/api/health
# {"status":"ok","time":"..."}
```

### 環境變數

以下變數都在 Compose 檔案的 `environment:` 段落中設定。

| 變數 | 預設值 | 說明 |
|---|---|---|
| `PORT` | `8080` | 容器內的 HTTP 埠。 |
| `HOST` | `0.0.0.0` | 監聽位址。 |
| `TZ` | `Asia/Shanghai` | 容器時區（IANA 名稱）。影響日誌與後端呈現的本機時間。可在 `docker-compose.yml` 或 `.env` 中修改。 |
| `CONFIG_PATH` | `/app/config.xml` | `config.xml` 的位置。 |
| `DATA_DIR` | `/app/data` | 鏡像產物 + `state.json` + 產生的 PWA 圖示與 manifest。 |
| `PUBLIC_DIR` | `/app/public` | 打包好的 SPA（已固化在映像檔中）。 |
| `CHECK_INTERVAL_HOURS` | `24` | 輪詢間隔，最小 `0.05`（3 分鐘）。 |
| `MIRROR_ON_START` | `true` | 設為 `false` 可略過啟動時的首次同步。 |
| `DOWNLOAD_CONCURRENCY` | `4` | 每個專案並行下載的數量。 |
| `GITHUB_TOKEN` | *（空）* | 選用。用於提升 API 限額。 |

---

## 第五步 —— 把網域指向伺服器

新增一條 DNS **A 記錄**（若伺服器有 IPv6，再加一條 `AAAA` 記錄）：

```text
類型   名稱              值                  TTL
A      mirror            203.0.113.10       300
```

繼續之前先確認解析已生效，否則 certbot 會失敗：

```bash
dig +short mirror.example.com
# 203.0.113.10
```

> 請使用**獨立子網域**。biangbiang 的 SPA 位於站點根路徑（`start_url: "/"`），因此不支援部署在 `example.com/mirror` 這樣的子路徑下。

---

## 第六步 —— nginx 反向代理 + TLS

### 1. 安裝 nginx 與 certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. 建立站點設定

`/etc/nginx/sites-available/biangbiang`：

```nginx
# --- ACME 驗證 + HTTP 跳轉 HTTPS ------------------------------------------
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

啟用它：

```bash
sudo ln -s /etc/nginx/sites-available/biangbiang /etc/nginx/sites-enabled/biangbiang
sudo mkdir -p /var/www/html
sudo nginx -t && sudo systemctl reload nginx
```

### 3. 申請憑證

```bash
sudo certbot certonly --webroot -w /var/www/html \
  -d mirror.example.com \
  --agree-tos -m you@example.com --no-eff-email
```

certbot 會安裝一個 systemd timer，之後會自動續期。


### 4. 補上 HTTPS server 段

現在把設定替換為完整版本——它保留了上面的 ACME / 跳轉段，並新增了 TLS 與反向代理：

```nginx
# --- ACME 驗證 + HTTP 跳轉 HTTPS ------------------------------------------
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

    # 建置產物可能有幾百 MB：直接透傳，不要先整個快取進 nginx。
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

        # 下載大檔案不能被中途截斷。
        proxy_connect_timeout 30s;
        proxy_send_timeout    3600s;
        proxy_read_timeout    3600s;
    }
}
```

套用設定：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

> **為什麼只綁定回送位址？** Compose 檔案發佈的是 `127.0.0.1:8080:8080`，因此容器無法從公網直接存取，所有公網流量都被強制經由 nginx，由 nginx 負責 TLS 終止。若你不想用 nginx、想讓埠直接對外，把 `ports:` 改成 `"8080:8080"` 即可——但那樣就沒有 HTTPS，PWA 也無法安裝。

### 備選方案：把 nginx 也放進容器

如果你希望所有東西都由 Compose 管理，可以在同一個網路裡再加一個 nginx 服務，去掉 `biangbiang` 服務的 `ports:` 映射，並把 `proxy_pass` 改成 `http://biangbiang:8080;`，同時把憑證和 `nginx.conf` 掛載進去。上面基於主機 nginx 的方案在憑證續期上更省事，因此是推薦做法。

---

## 第七步 —— 驗證部署

```bash
# 1. DNS 已解析到你的伺服器
dig +short mirror.example.com

# 2. TLS 正常，且 HTTP 會跳轉
curl -sI http://mirror.example.com | head -1      # 301 -> https://
curl -sI https://mirror.example.com | head -1     # 200

# 3. API 可以透過代理存取
curl -s https://mirror.example.com/api/health

# 4. 容器沒有暴露到公網網卡
ss -tlnp | grep 8080        # 必須顯示 127.0.0.1:8080，絕不能是 0.0.0.0:8080

# 5. 鏡像產物可以下載
curl -sI "https://mirror.example.com/dl/{owner}/{repo}/{version}/{file}" | head -1
```

然後用瀏覽器開啟 `https://mirror.example.com`，檢查：

- 頁首顯示你在 `<title>` 中設定的標題與 favicon。
- 每個 `<project>` 對應一張卡片，卡片上有版本標籤和每個產物的下載按鈕。
- 「查看原倉庫」按鈕會跳回 GitHub。
- 主題切換器提供「跟隨系統 / 淺色 / 深色」三檔。
- 若設定了 `<sortable>true</sortable>`，頁首會出現排序下拉選單（依名稱 / 最近更新 / 檔案最多 / 檔案最少）。
- 若設定了 `<lang>`（如 `<lang>zh_tw</lang>`），整套介面文案、日期格式以及 Ant Design 元件自帶的文案都會變成該語言；未設定時為簡體中文。
- 若設定了 `<accent>`（如 `<accent>volcano</accent>`），版本標籤、「查看原倉庫」連結等原本為藍色的元素會變成該顏色；未設定時保持預設藍色。
- 若設定了 `<font>`（如 `<font>assets/MyFont.woff2</font>`），頁面所有文字——含按鈕、標籤、下拉選單等 Ant Design 元件——都會改用該字型；未設定或檔案不存在時保持系統預設字型。
- 頁面已停用雙指縮放，整體不再能放大縮小，捲動與左右/上下滑動不受影響；瀏覽器選單或系統輔助功能裡的縮放仍然可用。

### 安裝為 PWA

由於站點現在透過 HTTPS 提供，Service Worker 可以註冊，應用程式也就可以安裝：

- **iOS Safari：** 分享 → *加入主畫面*。
- **Android Chrome：** 選單 → *安裝應用程式*。
- **桌面版 Chrome / Edge：** 網址列右側的安裝圖示。

應用程式依設計**不提供離線能力**——Service Worker 只是純網路透傳。


---

## 日常維運

### 查看日誌

```bash
docker compose logs -f --tail=100 biangbiang
```

### 立即觸發一次同步

頁面上的「立即檢查更新」按鈕實際呼叫的是 `POST /api/refresh`。在命令列裡也可以：

```bash
curl -X POST https://mirror.example.com/api/refresh
```

### 升級 biangbiang

穩定版以標籤形式發佈。取回標籤、切到最新的 release 標籤，再重建容器：

```bash
cd /srv/biangbiang
git fetch --tags
git checkout "$(git tag --sort=-v:refname | head -1)"   # 最新的 release 標籤
docker compose up -d --build
```

> 檢出標籤後處於 detached HEAD 狀態，這對部署沒有影響。想固定在某個具體版本，把 `"$(...)"` 換成 `v1.0.2` 這樣的標籤名即可。

如果部署的是 **git 開發版**（`main` 分支），改用 `git pull` 即可：

```bash
cd /srv/biangbiang
git pull
docker compose up -d --build
```

`./config.xml`、`./assets` 與 `./data` 都保存在主機上，升級不會影響它們。

### 備份

真正不可替代的只有設定與鏡像下來的檔案：

```bash
tar czf biangbiang-$(date +%F).tar.gz config.xml assets data
```

`data/state.json` 能讓站點在還原後立即呈現出來，而不必等第一次 GitHub 輪詢完成。

### 檔案擁有者

容器以 uid/gid **1000**（`node`）執行。bind mount 進來的 `./data` 會保留主機上的擁有者——如果是用 `sudo` 建的目錄，擁有者就是 `root`——而非特權行程無法寫入這樣的目錄。

這一步由 entrypoint 自動完成：容器以 root 啟動時，會先把 `DATA_DIR` 的擁有者改成 `node`，然後再降權執行。所以預設的 Compose 設定不需要任何手動 `chown`。

如果容器根本不以 root 啟動，entrypoint 就無能為力了。當你在 Compose 裡設定了 `user:`，或用 `--user` 執行 `docker run` 時，`./data` 必須已經對該 uid 可寫：

```bash
sudo chown -R 1000:1000 /srv/biangbiang/data
```

### GitHub 速率限制

未認證請求限制為**每小時 60 次**（依 IP 計）。少量專案、每天輪詢一次完全夠用。如果專案很多，請建立一個[細粒度權杖](https://github.com/settings/tokens?type=beta)（唯讀公開倉庫權限），寫進 `.env` 的 `GITHUB_TOKEN`，然後重新啟動：

```bash
docker compose up -d --force-recreate
```

### 修改輪詢間隔

在 Compose 的 `environment:` 段落中設定 `CHECK_INTERVAL_HOURS`（最小 `0.05`，即 3 分鐘），然後重建容器。

---

## 故障排查

| 現象 | 原因 / 解決辦法 |
|---|---|
| 回傳 `503 Frontend build not found.` | `PUBLIC_DIR` 下沒有 `index.html`。不要覆寫 `PUBLIC_DIR`，SPA 已固化在映像檔的 `/app/public`。 |
| 所有卡片都顯示「同步失敗」且錯誤為 `404 Not Found` | `<repo>` 不存在或拼寫錯誤；若是私有倉庫，則權杖權限不足。 |
| 日誌出現 `overwrite.xml not found at /app/overwrite.xml` | 有專案用了 `overwrite@{數字}`，但該檔案不存在。請建立 `./overwrite.xml`，見[掛載 overwrite.xml](#掛載-overwritexml)。 |
| 某張卡片顯示 `overwrite.xml has no <overwrite> block with <id>N</id>` | `overwrite@N` 中的數字在 `overwrite.xml` 裡沒有對應的 `<id>N</id>`。核對兩個檔案，或補上缺失的段落。 |
| `overwrite.xml` 報 `EISDIR`／「是一個目錄」 | 檔案還不存在時就啟用了掛載，Docker 把它建成了目錄。執行 `rmdir ./overwrite.xml`，建立同名檔案，再重建容器。 |
| 手動條目的下載按鈕 404 | `<file>` 連結寫錯或已失效——按鈕直接指向該位址，biangbiang 不會去驗證它。 |
| 提示 `API rate limit exceeded` | 在 `.env` 中設定 `GITHUB_TOKEN`。 |
| 卡片不顯示圖示 | `<icon>` 路徑寫錯，或檔案對 uid 1000 不可讀。路徑是相對 `config.xml` 解析的。 |
| PWA 圖示還是預設的 | `<favicon>` 缺失/不可讀，或 ImageMagick 執行失敗。查看 `docker compose logs \| grep '\[pwa\]'`，然後 `docker compose restart biangbiang`。 |
| 安裝後的應用程式名稱還是預設的 | `manifest.webmanifest` 由 `<title>` 在啟動時產生。確認 `config.xml` 裡的 `<title>` 正確，然後 `docker compose restart biangbiang`。日誌中出現 `[pwa] cannot read` 說明前端建置產物缺少 manifest 範本。 |
| `./data` 報 `EACCES` / `permission denied` | 容器無法寫入資料目錄。只要容器以 root 啟動，entrypoint 就會自動修正擁有者，所以出現這個錯誤說明你設定了 `user:`／`--user`，或者把 `./data` 掛成了唯讀。執行 `sudo chown -R 1000:1000 ./data`，如果加了 `:ro` 就去掉它。 |
| `http://127.0.0.1:8080` 正常，但網域存取不了 | 檢查 nginx 的 `proxy_pass` 目標、`server_name`，以及防火牆是否放行了 80/443 埠。 |
| 下載中途斷開 | 調大 nginx 設定中的 `proxy_read_timeout` / `proxy_send_timeout`。 |
| Service Worker 始終註冊不上 | 站點必須透過 **HTTPS**（或 `localhost`）存取。直接用 IP + 明文 HTTP 不屬於安全內容環境。 |
| certbot 驗證失敗 | DNS 尚未生效、80 埠被佔用或被阻擋，或已有其他 server 段佔用了同一個 `server_name`。 |
| 磁碟被舊檔案佔滿 | 每個專案只會保留最新版本。檢查 `./data` 中是否還有其他資料，並考慮調整 `DOWNLOAD_CONCURRENCY` 或擴充容量。 |

### 常用指令

```bash
docker compose ps                                   # 查看健康狀態
docker inspect --format '{{.State.Health.Status}}' biangbiang
docker compose exec biangbiang node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>r.text()).then(console.log)"
curl -s http://127.0.0.1:8080/api/state | head -c 400
du -sh /srv/biangbiang/data
```

