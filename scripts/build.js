/**
 * build.js  v1.1
 * data/calendar-data.json を読み込み、月間カレンダーHTMLを生成する。
 * 出力デザインは確定版PDF（v31系・210×258mm）を完全再現する。
 *
 * 使い方:  node scripts/build.js
 * 出力:    output/calendar_<year>_<month>.html
 *
 * --- 変更履歴 ---
 * v1.1 (2026-08-03)
 *   - 週数を自動化。6週必要な月（例:2026年8月）で最終週が切れる不具合を修正。
 *     .calendar に data-weeks と grid-template-rows をインライン出力する。
 *   - message.advisor / message.coach は text が空なら枠ごと出力しない。
 *     両方空なら message-card そのものを出さない。
 *   - PICK UP が6件以上の月は .timeline-card に dense を付与し行間を圧縮。
 *   - date_label が日付型（ISO文字列）で渡ってきた場合に M/D へ正規化。
 * v1.0  初版
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'calendar-data.json');
const CSS_PATH = path.join(__dirname, 'styles.css');

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * date_label の正規化。
 * スプレッドシート側でセルが日付型になっていると "2026-09-25T07:00:00.000Z" の
 * ようなISO文字列で渡ってくるため、"9/25" に直す。
 * タイムゾーンはシート設定によって変わる（UTC±12h以内）ため、12時間足してから
 * UTC日付を取ることで、どのタイムゾーン設定でも意図した日付になる。
 * "8/1-2" のような文字列はそのまま返す。
 */
function fmtDateLabel(v) {
  if (v === null || v === undefined) return '';
  let iso = null;
  if (v instanceof Date) {
    iso = v.toISOString();
  } else {
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) iso = s;
    else return s;
  }
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(v).trim();
  const d = new Date(t + 12 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// 曜日（0=日, 6=土）。dailyの並びはMON始まりカレンダーに使う。
function buildCalendarGrid(year, month, dailyMap) {
  const lastDay = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const startOffset = (firstDow + 6) % 7;                 // MON始まり

  const weeks = [];
  let week = [];
  for (let i = 0; i < startOffset; i++) week.push(null);
  for (let d = 1; d <= lastDay; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  // 常に5行（空行はそのまま）に整える
  while (weeks.length < 5) weeks.push([null, null, null, null, null, null, null]);

  const renderEvent = (ev) => {
    const type = escapeHtml(ev.type || '');
    // 改行制御: 「放課後スクーミー部」と「EDIX東京X日目」は2行表示
    let title = escapeHtml(ev.title || '');
    if (ev.title === '放課後スクーミー部') {
      title = '放課後<br>スクーミー部';
    } else if (/^EDIX東京\d日目$/.test(ev.title || '')) {
      title = ev.title.replace(/^(EDIX東京)(\d日目)$/, '$1<br>$2');
    }
    let h = `<div class="ev ${type}">${title}`;
    if (ev.time) h += `<span class="t">${escapeHtml(ev.time)}</span>`;
    h += '</div>';
    // 説明文（contents）があれば ev-contents として追加
    if (ev.contents) {
      h += `<div class="ev-contents ${type}">${escapeHtml(ev.contents)}</div>`;
    }
    return h;
  };

  const renderDay = (day) => {
    if (day === null) return '<div class="day empty"></div>';
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const info = dailyMap[dateStr];
    const dow = new Date(year, month - 1, day).getDay();

    const cls = ['day'];
    if (dow === 0) cls.push('sun');
    else if (dow === 6) cls.push('sat');
    if (info && info.is_holiday) cls.push('holiday-day');

    // 日付ヘッダ（タグ有無で day-h を使い分け。CSSのmin-heightで頭位置は揃う）
    let inner;
    if (info && info.tag) {
      inner = `<div class="day-h"><div class="d">${day}</div><div class="day-tag">${escapeHtml(info.tag)}</div></div>`;
    } else {
      inner = `<div class="d">${day}</div>`;
    }

    if (info && info.events && info.events.length) {
      const evs = info.events.map(renderEvent).join('\n              ');
      inner += `<div class="ev-list">${evs}</div>`;
    }
    return `<div class="${cls.join(' ')}">${inner}</div>`;
  };

  const html = weeks.map(w =>
    `<div class="week-row">\n          ${w.map(renderDay).join('\n          ')}\n        </div>`
  ).join('\n\n        ');

  // 週数はCSSのグリッド行数に反映する（5週固定だと6週の月が切れるため）
  return { html, weekCount: weeks.length };
}

function buildPickup(pickup) {
  return pickup.map(p => {
    const cls = `tl-item${p.type ? ' ' + escapeHtml(p.type) : ''}`;
    const dateLine = `${escapeHtml(fmtDateLabel(p.date_label))}${p.time ? ' ' + escapeHtml(p.time) : ''}`;
    return `<div class="${cls}">
              <div class="tl-date">${dateLine}</div>
              <div class="tl-title">${escapeHtml(p.title || '')}</div>
              <div class="tl-meta">${escapeHtml(p.meta || '')}</div>
            </div>`;
  }).join('\n            ');
}

function buildNext(next) {
  return next.map(n =>
    `<div class="next-item">
            <div class="next-date">${escapeHtml(fmtDateLabel(n.date_label))}</div>
            <div class="next-text">${n.html || ''}</div>
          </div>`
  ).join('\n          ');
}

function buildHTML(data) {
  const meta = data.meta;
  const year = parseInt(meta.year, 10);
  const month = parseInt(meta.month, 10);

  // daily を日付キーの辞書に
  const dailyMap = {};
  for (const d of (data.daily || [])) {
    dailyMap[String(d.date)] = d;
  }

  const css = fs.readFileSync(CSS_PATH, 'utf-8');
  const grid = buildCalendarGrid(year, month, dailyMap);
  const calendarGrid = grid.html;
  const weekCount = grid.weekCount;
  const pickupList = data.pickup || [];
  const pickupHtml = buildPickup(pickupList);
  const nextHtml = buildNext(data.next || []);
  const ch = data.challenge || {};
  const msg = data.message || {};
  const adv = msg.advisor || {};
  const coach = msg.coach || {};

  // PICK UP が多い月はサイドバーが溢れるため行間を圧縮する
  const denseClass = pickupList.length >= 6 ? ' dense' : '';

  // メッセージは text が入っているものだけ描画する（空枠を出さない）
  const hasText = (o) => !!(o && typeof o.text === 'string' && o.text.trim() !== '');
  const showAdv = hasText(adv);
  const showCoach = hasText(coach);

  const advHtml = showAdv ? `<div class="msg-item">
            <div class="msg-avatar">
              <div class="msg-avatar-icon">${escapeHtml(adv.icon || 'K')}</div>
              <div class="msg-role">${escapeHtml(adv.role || '顧問')}</div>
              <div class="msg-name">${escapeHtml(adv.name || '')}</div>
            </div>
            <div class="msg-bubble${adv.lang === 'en' ? ' lang-en' : ''}">${escapeHtml(adv.text || '')}</div>
          </div>` : '';

  const coachHtml = showCoach ? `<div class="msg-item coach">
            <div class="msg-avatar">
              <div class="msg-avatar-icon">${escapeHtml(coach.icon || 'M')}</div>
              <div class="msg-role">${escapeHtml(coach.role || 'コーチ')}</div>
              <div class="msg-name">${escapeHtml(coach.name || '')}</div>
            </div>
            <div class="msg-bubble${coach.lang === 'en' ? ' lang-en' : ''}">${escapeHtml(coach.text || '')}</div>
          </div>` : '';

  // 見出しは実際に出る人に合わせる（両方空ならカードごと非表示）
  const msgHeadTitle = showAdv && showCoach ? '顧問・コーチより'
    : showCoach ? 'コーチより' : '顧問より';

  const messageCardHtml = (showAdv || showCoach) ? `<div class="message-card">
        <div class="msg-head">
          <div class="msg-head-title">${msgHeadTitle}</div>
          <div class="msg-head-en">MESSAGE</div>
        </div>
        <div class="msg-body">
          ${[advHtml, coachHtml].filter(Boolean).join('\n          ')}
        </div>
      </div>` : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(meta.title_main || '放課後スクーミー部 カレンダー')} ${year}年${month}月 (build v1.1)</title>
<style>
@page { size: 210mm 258mm; margin: 0; }
${css}
</style>
</head>
<body>

<div class="page">

  <div class="top-area">
    <div class="ta-month">
      <div class="ta-month-num">${month}</div>
      <div class="ta-month-text">
        <div class="ta-month-en">${escapeHtml(meta.month_en || '')}</div>
        <div class="ta-month-jp">${escapeHtml(meta.month_jp || '')}</div>
      </div>
    </div>
    <div class="ta-center">
      <div class="ta-eyebrow">${escapeHtml(meta.issue_label || '')} ・ ${escapeHtml(meta.issue_no_short || '')}</div>
      <div class="ta-title">${escapeHtml(meta.title_main || '')} <span class="ta-title-sub">${escapeHtml(meta.title_sub || '')}</span></div>
    </div>
    <div class="ta-meta">
      <div>
        <div class="ta-vol">${escapeHtml(meta.issue_no_short || '')}</div>
        <div class="ta-date"><strong>${escapeHtml(meta.publish_date || '')}</strong><br>発行</div>
      </div>
    </div>
  </div>

  <div class="main">

    <div class="cal-section">

      <div class="calendar" data-weeks="${weekCount}" style="grid-template-rows: auto repeat(${weekCount}, 1fr);">
        <div class="weekday-row">
          <div class="wd">MON</div>
          <div class="wd">TUE</div>
          <div class="wd">WED</div>
          <div class="wd">THU</div>
          <div class="wd">FRI</div>
          <div class="wd sat">SAT</div>
          <div class="wd sun">SUN</div>
        </div>

        ${calendarGrid}
      </div>
    </div>

    <div class="sidebar">

      <div class="timeline-card${denseClass}">
        <div class="tc-head">
          <div class="tc-head-title">PICK UP イベント</div>
          <div class="tc-head-num">${(data.pickup || []).length} EVENTS</div>
        </div>
        <div class="tc-body">
          <div class="timeline">
            ${pickupHtml}
          </div>
        </div>
      </div>

      <div class="challenge-card">
        <div class="ch-head">
          <div class="ch-head-title">今月のチャレンジ</div>
          <div class="ch-head-en">CHALLENGE</div>
        </div>
        <div class="ch-body">
          <div class="ch-thema">
            <div class="ch-tag thema">THEMA</div>
            <div class="ch-thema-title">${escapeHtml(ch.thema_prefix || '')}<em>${escapeHtml(ch.thema_em || '')}</em></div>
            <div class="ch-thema-desc">${escapeHtml(ch.thema_desc || '')}</div>
          </div>
          <div class="ch-divider"></div>
          <div class="ch-mission">
            <div class="ch-tag mission">CHALLENGE</div>
            <div class="ch-mission-text">${ch.mission_html || ''}</div>
            <div class="ch-mission-note">${escapeHtml(ch.mission_note || '')}</div>
          </div>
        </div>
      </div>

      ${messageCardHtml}

      <div class="next-card">
        <div class="next-head">
          <div class="next-head-title">来月の予告</div>
          <div class="next-head-en">NEXT MONTH</div>
        </div>
        <div class="next-body">
          ${nextHtml}
        </div>
      </div>

    </div>
  </div>

  <div class="footer">
    <div class="footer-l">発行：<strong>${escapeHtml(meta.publisher || '')}</strong>　${escapeHtml(meta.publisher_addr || '')}</div>
    <div class="footer-c"><strong>${escapeHtml(meta.portal_url || '')}</strong></div>
    <div class="footer-r">${year}.${String(month).padStart(2, '0')}  ${escapeHtml(meta.issue_no_short || '')}　<strong>SchooMy, Inc.</strong></div>
  </div>

</div>

</body>
</html>`;
}

function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const html = buildHTML(data);
  const year = data.meta.year;
  const month = String(data.meta.month).padStart(2, '0');
  const outDir = path.join(ROOT, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `calendar_${year}_${month}.html`);
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log('HTML generated:', outPath);
}

if (require.main === module) main();

module.exports = { buildHTML };
