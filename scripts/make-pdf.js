/**
 * make-pdf.js
 * output/calendar_<year>_<month>.html を 210×258mm のPDFに変換する。
 *
 * フォント完全再現の核心:
 *   - コンテナ/CI環境では Google Fonts(fonts.googleapis.com) が使えない/不安定なため、
 *     @fontsource パッケージのローカル woff2 を base64 で @font-face 埋め込みする。
 *   - 日本語は files/m-plus-2-japanese-<weight>-normal.woff2、欧文見出しは archivo-black。
 *   - document.fonts.ready を待ってからレンダリングする。
 *
 * 前提:  npm i playwright @fontsource/m-plus-2 @fontsource/archivo-black
 *        npx playwright install chromium
 * 使い方: node scripts/make-pdf.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'calendar-data.json');

const MPLUS_DIR = path.join(ROOT, 'node_modules', '@fontsource', 'm-plus-2', 'files');
const ARCHIVO_DIR = path.join(ROOT, 'node_modules', '@fontsource', 'archivo-black', 'files');

const MPLUS_WEIGHTS = [400, 500, 600, 700, 800, 900];

function b64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

function buildFontFaceCSS() {
  const faces = [];

  for (const w of MPLUS_WEIGHTS) {
    // 日本語サブセット（全角カバー）
    const jp = path.join(MPLUS_DIR, `m-plus-2-japanese-${w}-normal.woff2`);
    if (fs.existsSync(jp)) {
      faces.push(
        `@font-face{font-family:'M PLUS 2';font-style:normal;font-weight:${w};` +
        `font-display:block;src:url(data:font/woff2;base64,${b64(jp)}) format('woff2');}`
      );
    }
    // 欧文サブセット（latin）— 数字・英字の字形再現用
    const latin = path.join(MPLUS_DIR, `m-plus-2-latin-${w}-normal.woff2`);
    if (fs.existsSync(latin)) {
      faces.push(
        `@font-face{font-family:'M PLUS 2';font-style:normal;font-weight:${w};` +
        `font-display:block;src:url(data:font/woff2;base64,${b64(latin)}) format('woff2');` +
        `unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,` +
        `U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}`
      );
    }
  }

  const archivo = path.join(ARCHIVO_DIR, 'archivo-black-latin-400-normal.woff2');
  if (fs.existsSync(archivo)) {
    faces.push(
      `@font-face{font-family:'Archivo Black';font-style:normal;font-weight:400;` +
      `font-display:block;src:url(data:font/woff2;base64,${b64(archivo)}) format('woff2');}`
    );
  }

  return faces.join('\n');
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const year = data.meta.year;
  const month = String(data.meta.month).padStart(2, '0');

  const htmlPath = path.join(ROOT, 'output', `calendar_${year}_${month}.html`);
  const pdfPath = path.join(ROOT, 'output', `calendar_${year}_${month}.pdf`);

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML not found: ${htmlPath}\n先に node scripts/build.js を実行してください。`);
  }

  const fontCSS = buildFontFaceCSS();

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
  // 埋め込みフォントを最優先注入
  await page.addStyleTag({ content: fontCSS });
  // フォント完全ロード待ち
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  // 検証ログ
  const usedFont = await page.evaluate(() => {
    const el = document.querySelector('.ta-title');
    return el ? getComputedStyle(el).fontFamily : '(no .ta-title)';
  });
  const fontCount = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.size;
  });
  console.log('computed font-family:', usedFont);
  console.log('loaded font faces  :', fontCount);

  await page.pdf({
    path: pdfPath,
    width: '210mm',
    height: '258mm',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: false,
  });

  await browser.close();

  const kb = (fs.statSync(pdfPath).size / 1024).toFixed(1);
  console.log(`PDF generated: ${pdfPath} (${kb} KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
