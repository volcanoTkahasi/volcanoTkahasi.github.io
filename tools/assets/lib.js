/* atalabo ツールズ - 共通ロジック（ブラウザ / Node 両対応）
 * すべての計算はこのファイル内で完結し、外部への送信は行いません。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var L = {};

  /* ---------- 文字数カウント ---------- */
  L.countText = function (s) {
    s = s || '';
    var chars = Array.from(s.replace(/\r\n/g, '\n'));
    var noNl = chars.filter(function (c) { return c !== '\n'; });
    var noWs = chars.filter(function (c) { return !/\s/.test(c) && c !== '\u3000'; });
    var utf8 = 0, sjis = 0;
    chars.forEach(function (c) {
      var cp = c.codePointAt(0);
      utf8 += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      // Shift_JIS の目安: ASCII・半角カナは1バイト、それ以外は2バイト（改行は CRLF=2）
      if (c === '\n') sjis += 2;
      else if (cp < 0x80 || (cp >= 0xFF61 && cp <= 0xFF9F)) sjis += 1;
      else sjis += 2;
    });
    var lines = s === '' ? 0 : s.replace(/\r\n/g, '\n').split('\n').length;
    var paragraphs = s.trim() === '' ? 0 : s.replace(/\r\n/g, '\n').split(/\n\s*\n/).filter(function (p) { return p.trim(); }).length;
    // 原稿用紙(20×20)換算: 改行ごとに行を区切り、各段落を20字で折り返した行数 / 20
    var gLines = 0;
    if (s !== '') s.replace(/\r\n/g, '\n').split('\n').forEach(function (ln) {
      gLines += Math.max(1, Math.ceil(Array.from(ln).length / 20));
    });
    return {
      chars: chars.length, noNewline: noNl.length, noSpace: noWs.length,
      lines: lines, paragraphs: paragraphs, utf8Bytes: utf8, sjisBytes: sjis,
      genkoLines: gLines, genkoPages: s === '' ? 0 : Math.ceil(gLines / 20)
    };
  };

  /* ---------- 和暦・西暦 ---------- */
  // 改元日（新元号の初日）。明治は便宜上 1868-01-01（明治元年＝1868年、改元詔書で年初に遡及）
  L.ERAS = [
    { name: '令和', start: [2019, 5, 1] },
    { name: '平成', start: [1989, 1, 8] },
    { name: '昭和', start: [1926, 12, 25] },
    { name: '大正', start: [1912, 7, 30] },
    { name: '明治', start: [1868, 1, 1] }
  ];
  function ymdNum(y, m, d) { return y * 10000 + m * 100 + d; }
  L.dateToWareki = function (y, m, d) {
    var n = ymdNum(y, m, d);
    for (var i = 0; i < L.ERAS.length; i++) {
      var e = L.ERAS[i], s = e.start;
      if (n >= ymdNum(s[0], s[1], s[2])) {
        var ey = y - s[0] + 1;
        return { era: e.name, year: ey, label: e.name + (ey === 1 ? '元' : ey) + '年' + m + '月' + d + '日' };
      }
    }
    return null;
  };
  // 西暦年 → その年に含まれる和暦（改元年は2つ）
  L.yearToWareki = function (y) {
    var out = [];
    for (var i = L.ERAS.length - 1; i >= 0; i--) {
      var e = L.ERAS[i], s = e.start[0];
      var next = i > 0 ? L.ERAS[i - 1].start : null;
      var endY = next ? (next[1] === 1 && next[2] === 1 ? next[0] - 1 : next[0]) : 9999;
      if (y >= s && y <= endY) {
        var ey = y - s + 1;
        out.push({ era: e.name, year: ey, label: e.name + (ey === 1 ? '元' : ey) + '年' });
      }
    }
    return out;
  };
  L.warekiToYear = function (era, ey) {
    for (var i = 0; i < L.ERAS.length; i++) if (L.ERAS[i].name === era) return L.ERAS[i].start[0] + ey - 1;
    return null;
  };
  L.warekiMaxYear = function (era) {
    for (var i = 0; i < L.ERAS.length; i++) if (L.ERAS[i].name === era) {
      if (i === 0) return null;
      var nx = L.ERAS[i - 1].start; return nx[0] - L.ERAS[i].start[0] + 1;
    }
    return null;
  };

  /* ---------- 年齢 ---------- */
  L.ETO = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  L.ETO_YOMI = ['ね', 'うし', 'とら', 'う', 'たつ', 'み', 'うま', 'ひつじ', 'さる', 'とり', 'いぬ', 'い'];
  L.eto = function (y) { var i = ((y - 4) % 12 + 12) % 12; return { kanji: L.ETO[i], yomi: L.ETO_YOMI[i] }; };
  // 満年齢: 誕生日当日に加算（2/29生まれは平年は3/1に加算＝年齢計算ニ関スル法律と同じ結果）
  L.age = function (by, bm, bd, ty, tm, td) {
    var a = ty - by;
    if (tm < bm || (tm === bm && td < bd)) a--;
    return a;
  };
  L.isLeap = function (y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; };
  // 次の誕生日（今日が誕生日なら今日）。2/29生まれは平年は3/1
  L.nextBirthday = function (bm, bd, ty, tm, td) {
    var f = function (y) { return (bm === 2 && bd === 29 && !L.isLeap(y)) ? [y, 3, 1] : [y, bm, bd]; };
    var c = f(ty);
    if (c[1] < tm || (c[1] === tm && c[2] < td)) c = f(ty + 1);
    return c;
  };
  L.kazoe = function (by, ty) { return ty - by + 1; };
  // 小学校入学年（4/1生まれまでは早生まれ扱い＝前の学年）
  L.schoolEntryYear = function (by, bm, bd) {
    var early = bm < 4 || (bm === 4 && bd === 1);
    return early ? by + 6 : by + 7;
  };

  /* ---------- 日付計算 ---------- */
  function utc(y, m, d) { return Date.UTC(y, m - 1, d); }
  L.daysBetween = function (a, b) { return Math.round((utc(b[0], b[1], b[2]) - utc(a[0], a[1], a[2])) / 86400000); };
  L.addDays = function (a, n) {
    var t = new Date(utc(a[0], a[1], a[2]) + n * 86400000);
    return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  };
  L.weekday = function (a) { return new Date(utc(a[0], a[1], a[2])).getUTCDay(); };
  L.WD = ['日', '月', '火', '水', '木', '金', '土'];
  // a〜b（両端含む）の土日以外の日数
  L.weekdaysInclusive = function (a, b) {
    var n = L.daysBetween(a, b); if (n < 0) { var t = a; a = b; b = t; n = -n; }
    var total = n + 1, full = Math.floor(total / 7), cnt = full * 5, rem = total % 7, w = L.weekday(a);
    for (var i = 0; i < rem; i++) { var d = (w + i) % 7; if (d !== 0 && d !== 6) cnt++; }
    return cnt;
  };
  L.parseDate = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? [+m[1], +m[2], +m[3]] : null; };
  L.fmtDate = function (a) { return a[0] + '年' + a[1] + '月' + a[2] + '日（' + L.WD[L.weekday(a)] + '）'; };

  /* ---------- パスワード ---------- */
  L.PW_SETS = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digit: '0123456789', symbol: '!@#$%^&*-_=+?.' };
  L.PW_AMBIG = /[Il1O0o]/g;
  // randInt(n): 0..n-1 の一様乱数（ブラウザでは crypto）
  L.cryptoRandInt = function (n) {
    var c = (typeof crypto !== 'undefined') ? crypto : require('crypto').webcrypto;
    var lim = Math.floor(0x100000000 / n) * n, b = new Uint32Array(1);
    do { c.getRandomValues(b); } while (b[0] >= lim);
    return b[0] % n;
  };
  L.genPassword = function (len, opt, randInt) {
    randInt = randInt || L.cryptoRandInt;
    var sets = [];
    ['lower', 'upper', 'digit', 'symbol'].forEach(function (k) {
      if (opt[k]) { var s = L.PW_SETS[k]; if (opt.noAmbig) s = s.replace(L.PW_AMBIG, ''); sets.push(s); }
    });
    if (!sets.length || len < 1) return '';
    var all = sets.join(''), out = [];
    // 各種類を最低1文字含める
    sets.forEach(function (s) { if (out.length < len) out.push(s[randInt(s.length)]); });
    while (out.length < len) out.push(all[randInt(all.length)]);
    for (var i = out.length - 1; i > 0; i--) { var j = randInt(i + 1), t = out[i]; out[i] = out[j]; out[j] = t; }
    return out.join('');
  };
  L.pwEntropy = function (len, poolSize) { return poolSize > 1 ? Math.round(len * Math.log2(poolSize)) : 0; };

  /* ---------- 全角半角 ---------- */
  var HK = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ｡｢｣､･';
  var FK = 'ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン。「」、・';
  var DK = { 'ｶ': 'ガ', 'ｷ': 'ギ', 'ｸ': 'グ', 'ｹ': 'ゲ', 'ｺ': 'ゴ', 'ｻ': 'ザ', 'ｼ': 'ジ', 'ｽ': 'ズ', 'ｾ': 'ゼ', 'ｿ': 'ゾ', 'ﾀ': 'ダ', 'ﾁ': 'ヂ', 'ﾂ': 'ヅ', 'ﾃ': 'デ', 'ﾄ': 'ド', 'ﾊ': 'バ', 'ﾋ': 'ビ', 'ﾌ': 'ブ', 'ﾍ': 'ベ', 'ﾎ': 'ボ', 'ｳ': 'ヴ' };
  var HD = { 'ﾊ': 'パ', 'ﾋ': 'ピ', 'ﾌ': 'プ', 'ﾍ': 'ペ', 'ﾎ': 'ポ' };
  L.toHalf = function (s, o) {
    o = o || { alnum: true, symbol: true, kana: true, space: true };
    var rev = {}; Object.keys(DK).forEach(function (k) { rev[DK[k]] = k + 'ﾞ'; }); Object.keys(HD).forEach(function (k) { rev[HD[k]] = k + 'ﾟ'; });
    return Array.from(s).map(function (c) {
      var cp = c.codePointAt(0);
      if (cp === 0x3000) return o.space ? ' ' : c;
      if (cp >= 0xFF01 && cp <= 0xFF5E) {
        var h = String.fromCharCode(cp - 0xFEE0), isAl = /[0-9A-Za-z]/.test(h);
        return (isAl ? o.alnum : o.symbol) ? h : c;
      }
      if (o.kana) {
        if (rev[c]) return rev[c];
        var i = FK.indexOf(c); if (i >= 0) return HK[i];
        if (c === '゛') return 'ﾞ'; if (c === '゜') return 'ﾟ';
      }
      return c;
    }).join('');
  };
  L.toFull = function (s, o) {
    o = o || { alnum: true, symbol: true, kana: true, space: true };
    var a = Array.from(s), out = '';
    for (var k = 0; k < a.length; k++) {
      var c = a[k], cp = c.codePointAt(0), nx = a[k + 1];
      if (cp === 0x20) { out += o.space ? '\u3000' : c; continue; }
      if (cp >= 0x21 && cp <= 0x7E) {
        var isAl = /[0-9A-Za-z]/.test(c);
        out += (isAl ? o.alnum : o.symbol) ? String.fromCharCode(cp + 0xFEE0) : c; continue;
      }
      if (o.kana) {
        if (nx === 'ﾞ' && DK[c]) { out += DK[c]; k++; continue; }
        if (nx === 'ﾟ' && HD[c]) { out += HD[c]; k++; continue; }
        var i = HK.indexOf(c); if (i >= 0) { out += FK[i]; continue; }
        if (c === 'ﾞ') { out += '゛'; continue; } if (c === 'ﾟ') { out += '゜'; continue; }
      }
      out += c;
    }
    return out;
  };
  L.hiraToKata = function (s) { return s.replace(/[\u3041-\u3096]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }); };
  L.kataToHira = function (s) { return s.replace(/[\u30A1-\u30F6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }); };

  /* ---------- 単位変換（基準単位への係数） ---------- */
  L.UNITS = {
    length: { base: 'm', u: { 'mm': 0.001, 'cm': 0.01, 'm': 1, 'km': 1000, 'インチ(in)': 0.0254, 'フィート(ft)': 0.3048, 'ヤード(yd)': 0.9144, 'マイル(mi)': 1609.344, '尺': 10 / 33, '寸': 1 / 33, '海里': 1852 } },
    weight: { base: 'kg', u: { 'mg': 1e-6, 'g': 0.001, 'kg': 1, 't(トン)': 1000, 'オンス(oz)': 0.028349523125, 'ポンド(lb)': 0.45359237, '貫': 3.75, '匁': 0.00375 } },
    area: { base: '㎡', u: { '㎠': 1e-4, '㎡': 1, 'a(アール)': 100, 'ha': 10000, '㎢': 1e6, '坪': 400 / 121, '平方フィート': 0.09290304, 'エーカー': 4046.8564224 } },
    volume: { base: 'L', u: { 'mL(cc)': 0.001, 'L': 1, '㎥': 1000, '大さじ(15mL)': 0.015, '小さじ(5mL)': 0.005, 'カップ(200mL)': 0.2, '合': 2401 / 13310, '升': 24010 / 13310, '米ガロン': 3.785411784, '英ガロン': 4.54609 } },
    speed: { base: 'm/s', u: { 'm/s': 1, 'km/h': 1 / 3.6, 'mph': 0.44704, 'ノット': 1852 / 3600 } },
    data: { base: 'B', u: { 'B': 1, 'KB': 1e3, 'MB': 1e6, 'GB': 1e9, 'TB': 1e12, 'KiB': 1024, 'MiB': 1048576, 'GiB': 1073741824, 'TiB': 1099511627776 } }
  };
  L.convertUnit = function (cat, v, from, to) {
    if (cat === 'temp') {
      var c = from === '℃' ? v : from === '℉' ? (v - 32) * 5 / 9 : v - 273.15;
      return to === '℃' ? c : to === '℉' ? c * 9 / 5 + 32 : c + 273.15;
    }
    var t = L.UNITS[cat].u; return v * t[from] / t[to];
  };
  L.round = function (x, d) { var p = Math.pow(10, d); return Math.round((x + Number.EPSILON * Math.sign(x)) * p) / p; };
  L.fmtNum = function (x, maxD) {
    if (!isFinite(x)) return '—';
    if (x !== 0 && (Math.abs(x) >= 1e15 || Math.abs(x) < 1e-6)) return x.toExponential(6);
    return x.toLocaleString('ja-JP', { maximumFractionDigits: maxD == null ? 6 : maxD });
  };

  /* ---------- 割り勘 ---------- */
  // unit: 端数をまとめる単位(1,10,100,1000)。mode 'up' は全員切り上げ（集めすぎ分を表示）、'down' は切り捨てて不足分を幹事が負担
  L.warikan = function (total, people, unit, mode) {
    unit = unit || 1;
    if (!(total >= 0) || !(people >= 1)) return null;
    var raw = total / people, per;
    if (mode === 'down') {
      per = Math.floor(raw / unit) * unit;
      var collected = per * (people - 1), organizer = total - collected;
      return { per: per, organizer: organizer, diff: organizer - per, collected: per * people };
    }
    per = Math.ceil(raw / unit) * unit;
    return { per: per, organizer: per, diff: per * people - total, collected: per * people };
  };

  /* ---------- 消費税 ---------- */
  function rnd(x, mode) { return mode === 'ceil' ? Math.ceil(x) : mode === 'round' ? Math.round(x) : Math.floor(x); }
  // 整数演算で誤差を回避: 税額 = 本体 × 税率% / 100
  L.taxFromExcl = function (excl, ratePct, mode) {
    var tax = rnd(excl * ratePct / 100 + 1e-9 * (mode === 'ceil' ? -1 : 1), mode);
    return { excl: excl, tax: tax, incl: excl + tax };
  };
  // 税込→税抜: 内税額 = 税込 × 税率 / (100+税率)
  L.taxFromIncl = function (incl, ratePct, mode) {
    var tax = rnd(incl * ratePct / (100 + ratePct) + 1e-9 * (mode === 'ceil' ? -1 : 1), mode);
    return { excl: incl - tax, tax: tax, incl: incl };
  };

  /* ---------- 電気代 ---------- */
  L.electricity = function (watt, hoursPerDay, days, yenPerKwh) {
    var kwhDay = watt * hoursPerDay / 1000;
    return { kwhHour: watt / 1000, kwhDay: kwhDay, kwhTotal: kwhDay * days, yenHour: watt / 1000 * yenPerKwh, yenDay: kwhDay * yenPerKwh, yenTotal: kwhDay * days * yenPerKwh };
  };
  L.wattFromVA = function (v, a) { return v * a; };

  /* ---------- パーセント ---------- */
  L.pct = {
    ofValue: function (a, p) { return a * p / 100; },          // AのP%
    ratio: function (a, b) { return b === 0 ? NaN : a / b * 100; }, // AはBの何%
    change: function (from, to) { return from === 0 ? NaN : (to - from) / from * 100; }, // 増減率
    discount: function (a, p) { return a * (100 - p) / 100; }  // P%引き
  };

  /* ---------- BMI ---------- */
  L.bmi = function (cm, kg) {
    var m = cm / 100, b = kg / (m * m);
    var cls = b < 18.5 ? '低体重（やせ）' : b < 25 ? '普通体重' : b < 30 ? '肥満（1度）' : b < 35 ? '肥満（2度）' : b < 40 ? '肥満（3度）' : '肥満（4度）';
    return { bmi: b, cls: cls, std: 22 * m * m };
  };

  /* ---------- カラー ---------- */
  L.hexToRgb = function (h) {
    h = (h || '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, '$&$&');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  L.rgbToHex = function (r, g, b) { return '#' + [r, g, b].map(function (x) { return ('0' + Math.max(0, Math.min(255, Math.round(x))).toString(16)).slice(-2); }).join('').toUpperCase(); };
  L.rgbToHsl = function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2, d = mx - mn;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
  };
  L.hslToRgb = function (h, s, l) {
    s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; }, a = s * Math.min(l, 1 - l);
    var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  };
  L.parseColor = function (s) {
    s = (s || '').trim(); var m;
    var rgb = L.hexToRgb(s); if (rgb) return rgb;
    if ((m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(s))) return [+m[1], +m[2], +m[3]].map(function (x) { return Math.min(255, x); });
    if ((m = /^hsla?\(\s*(\d+(?:\.\d+)?)(?:deg)?[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%/i.exec(s))) return L.hslToRgb(+m[1] % 360, Math.min(100, +m[2]), Math.min(100, +m[3]));
    return null;
  };
  // WCAG コントラスト比
  L.contrast = function (a, b) {
    var lum = function (c) { var v = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  /* ---------- JSON ---------- */
  L.jsonFormat = function (s, indent) {
    try {
      var v = JSON.parse(s);
      return { ok: true, out: indent === 0 ? JSON.stringify(v) : JSON.stringify(v, null, indent === 't' ? '\t' : (indent || 2)) };
    } catch (e) {
      var msg = e.message, pos = /position (\d+)/.exec(msg), lc = /line (\d+) column (\d+)/.exec(msg), info = '', p = pos ? +pos[1] : (lc ? -1 : L.jsonErrorPos(s));
      if (lc && !pos) info = lc[1] + '行目 ' + lc[2] + '文字目付近';
      else if (p >= 0) { var before = s.slice(0, p), line = before.split('\n').length, col = p - before.lastIndexOf('\n'); info = line + '行目 ' + col + '文字目付近'; }
      return { ok: false, error: msg, where: info };
    }
  };
  // エラー位置を求める簡易スキャナ（エラー文に位置が無いブラウザ向け）
  L.jsonErrorPos = function (s) {
    var i = 0, n = s.length;
    function ws() { while (i < n && ' \t\n\r'.indexOf(s[i]) >= 0) i++; }
    function fail() { throw i; }
    function val() {
      ws(); var c = s[i];
      if (c === '{') { i++; ws(); if (s[i] === '}') { i++; return; } for (;;) { ws(); if (s[i] !== '"') fail(); str(); ws(); if (s[i] !== ':') fail(); i++; val(); ws(); if (s[i] === ',') { i++; continue; } if (s[i] === '}') { i++; return; } fail(); } }
      if (c === '[') { i++; ws(); if (s[i] === ']') { i++; return; } for (;;) { val(); ws(); if (s[i] === ',') { i++; continue; } if (s[i] === ']') { i++; return; } fail(); } }
      if (c === '"') return str();
      var m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i)); if (m && m[0]) { i += m[0].length; return; }
      var lits = ['true', 'false', 'null']; for (var k = 0; k < 3; k++) if (s.substr(i, lits[k].length) === lits[k]) { i += lits[k].length; return; }
      fail();
    }
    function str() { i++; while (i < n) { var c = s[i]; if (c === '\\') { i += 2; continue; } if (c === '"') { i++; return; } if (c < ' ') fail(); i++; } fail(); }
    try { val(); ws(); if (i < n) fail(); return -1; } catch (p) { return typeof p === 'number' ? p : -1; }
  };
  L.jsonSortKeys = function (v) {
    if (Array.isArray(v)) return v.map(L.jsonSortKeys);
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).sort().forEach(function (k) { o[k] = L.jsonSortKeys(v[k]); }); return o; }
    return v;
  };

  /* ---------- テキスト ---------- */
  L.replaceText = function (s, find, rep, o) {
    o = o || {};
    if (!find) return { out: s, count: 0 };
    var re;
    try {
      re = new RegExp(o.regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g' + (o.ignoreCase ? 'i' : '') + 'u');
    } catch (e) { return { error: '正規表現が正しくありません: ' + e.message }; }
    var count = (s.match(re) || []).length;
    return { out: s.replace(re, o.regex ? rep : function () { return rep; }), count: count };
  };
  L.dedupeLines = function (s, o) {
    o = o || {};
    var lines = s.replace(/\r\n/g, '\n').split('\n'), seen = Object.create(null), out = [], removed = 0;
    lines.forEach(function (ln) {
      var key = ln; if (o.trim) key = key.trim(); if (o.ignoreCase) key = key.toLowerCase();
      if (o.removeEmpty && key.trim() === '') { removed++; return; }
      if (seen[key]) { removed++; return; }
      seen[key] = 1; out.push(o.trim ? ln.trim() : ln);
    });
    if (o.sort) out.sort(function (a, b) { return a.localeCompare(b, 'ja', { numeric: true }); });
    return { out: out.join('\n'), removed: removed, kept: out.length };
  };

  /* ---------- くじ引き ---------- */
  L.shuffle = function (arr, randInt) {
    randInt = randInt || L.cryptoRandInt; var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = randInt(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };
  L.teams = function (arr, n, randInt) {
    var s = L.shuffle(arr, randInt), t = []; for (var i = 0; i < n; i++) t.push([]);
    s.forEach(function (x, i) { t[i % n].push(x); }); return t;
  };

  /* ---------- タイマー表示 ---------- */
  L.fmtMs = function (ms, showCs) {
    ms = Math.max(0, Math.floor(ms));
    var h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, cs = Math.floor(ms / 10) % 100;
    var p = function (x) { return ('0' + x).slice(-2); };
    return (h ? h + ':' : '') + p(m) + ':' + p(s) + (showCs ? '.' + p(cs) : '');
  };

  /* ---------- 画像リサイズ寸法 ---------- */
  L.fitSize = function (w, h, maxW, maxH) {
    var r = 1;
    if (maxW && w > maxW) r = Math.min(r, maxW / w);
    if (maxH && h > maxH) r = Math.min(r, maxH / h);
    return [Math.max(1, Math.round(w * r)), Math.max(1, Math.round(h * r))];
  };
  L.fmtBytes = function (b) { return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB'; };

  return L;
});
