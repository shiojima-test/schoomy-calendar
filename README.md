# schoomy-calendar

放課後スクーミー部 月間カレンダー（スクーミーワールドカレンダー）の PDF 自動生成リポジトリ。

`data/calendar-data.json` を更新すると、GitHub Actions が **HTML → PDF（210×258mm・M PLUS 2フォント完全埋め込み）** を生成し `output/` にコミットする。

## 仕組み

```
data/calendar-data.json   ← データ（GASがここを更新）
        │  push
        ▼
.github/workflows/build-pdf.yml   ← GitHub Actions
        │
        ├─ node scripts/build.js     JSON → output/calendar_YYYY_MM.html
        └─ node scripts/make-pdf.js  HTML → output/calendar_YYYY_MM.pdf
                                     (@fontsource を base64 で @font-face 埋め込み)
        │  commit
        ▼
output/calendar_YYYY_MM.pdf
        │
        ▼
https://shiojima-test.github.io/schoomy-calendar/output/calendar_YYYY_MM.pdf  (GitHub Pages)
```

## フォント完全再現の要点

- CI環境では Google Fonts が不安定なため、`@fontsource/m-plus-2` / `@fontsource/archivo-black` の
  ローカル woff2 を base64 で `@font-face` 埋め込みする（`scripts/make-pdf.js`）。
- 日本語は `m-plus-2-japanese-<weight>-normal.woff2`（weight 400–900）、見出し数字は Archivo Black。
- `document.fonts.ready` を待ってから `page.pdf()` する。

## ローカル実行

```bash
npm install
npx playwright install chromium
npm run all      # build → pdf 一括
# 個別: npm run build / npm run pdf
```

## デザイン更新時の注意

- レイアウト/CSSは `scripts/styles.css` に集約。`.page` は 210×258mm・余白なし設定。
- 「放課後スクーミー部」「EDIX東京X日目」はセル内2行表示にするため `build.js` の `renderEvent` で
  `<br>` を自動挿入している。
- 日付の頭位置を全セルで揃えるため `.day-h` / `.d` に `min-height` を設定済み（styles.css）。

## データ形式（calendar-data.json）

- `meta`: 年月・号・発行日・タイトル・発行者など
- `daily[]`: `{ date, is_holiday, tag, events:[{type,title,time,contents}] }`
  - `type`: bukatsu / exhibit / webinar / special / holiday
- `pickup[]`: PICK UP イベント
- `challenge`: THEMA + CHALLENGE（`mission_html` はHTML可）
- `message`: advisor / coach（`lang:"en"` で英文スタイル）
- `next[]`: 来月の予告（`html` はHTML可）
