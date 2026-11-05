/* HAYAOSHI LIVE — オンライン早押しクイズ大会システム
 * Host is the single source of truth. Transport: PeerJS (WebRTC data channels)
 * or BroadcastChannel (?transport=local, same-browser demo/testing).
 */
'use strict';
(() => {
  // ------------------------------------------------------------------ utils
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => performance.now();
  const params = new URLSearchParams(location.search);
  const PEER_PREFIX = 'hayaoshi-live-v1-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const MAX_PLAYERS = 24;
  const PROTO = 1;
  const HOST_KEY = 'hayaoshi-host-v1';
  const BASE_URL = location.href.split(/[?#]/)[0].replace(/index\.html$/, '');
  const LOCAL = params.get('transport') === 'local';

  const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);
  const genCode = () => { const a = new Uint32Array(6); crypto.getRandomValues(a); return [...a].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join(''); };
  const uid = (n = 10) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((x) => (x % 36).toString(36)).join(''); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

  function toast(msg, ms = 2200) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }
  function netbar(msg, err = false) {
    const b = $('#netbar');
    if (!msg) { b.hidden = true; return; }
    b.textContent = msg; b.classList.toggle('err', err); b.hidden = false;
  }
  async function copyText(s) {
    try { await navigator.clipboard.writeText(s); toast('コピーしました'); }
    catch { window.prompt('コピーしてください', s); }
  }

  // ------------------------------------------------------------------ sound
  const Sound = (() => {
    let ctx = null;
    const ensure = () => {
      if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    };
    const tone = (freq, dur, type = 'sine', vol = 0.18, delay = 0) => {
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime + delay;
      const o = c.createOscillator(); const g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    };
    return {
      unlock: ensure,
      press() { tone(1320, 0.07, 'square', 0.06); },
      buzz() { tone(988, 0.12, 'square', 0.12); tone(1319, 0.28, 'square', 0.12, 0.11); },
      correct() { tone(1047, 0.18, 'sine', 0.22); tone(1568, 0.45, 'sine', 0.22, 0.16); },
      wrong() { tone(196, 0.55, 'sawtooth', 0.14); tone(185, 0.55, 'square', 0.06); },
      tick() { tone(880, 0.05, 'sine', 0.06); },
    };
  })();
  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true, capture: true });
  document.addEventListener('keydown', () => Sound.unlock(), { once: true, capture: true });
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };

  // ------------------------------------------------------------------ transports
  function peerAvailable() { return typeof window.Peer === 'function'; }

  function createPeerHost(code, h) {
    let peer = null; let destroyed = false; let seq = 0; let lastRe = 0;
    const conns = new Map();
    function start() {
      peer = new window.Peer(PEER_PREFIX + code, { debug: 1 });
      peer.on('open', () => h.onOpen());
      peer.on('connection', (conn) => {
        const id = 'c' + (++seq);
        conn.on('open', () => { conns.set(id, conn); h.onConnect(id); });
        conn.on('data', (d) => h.onData(id, d));
        conn.on('close', () => { if (conns.get(id) === conn) { conns.delete(id); h.onClose(id); } });
        conn.on('error', () => {});
      });
      peer.on('disconnected', () => {
        if (destroyed || peer.destroyed) return;
        h.onStatus('signal-lost');
        setTimeout(() => { try { if (!destroyed && !peer.destroyed && peer.disconnected) peer.reconnect(); } catch {} }, 1500);
      });
      peer.on('error', (err) => h.onError(err));
    }
    start();
    return {
      send(id, msg) { const c = conns.get(id); if (c && c.open) { try { c.send(msg); } catch {} } },
      broadcast(msg) { for (const c of conns.values()) if (c.open) { try { c.send(msg); } catch {} } },
      close(id) { const c = conns.get(id); if (c) { conns.delete(id); setTimeout(() => { try { c.close(); } catch {} }, 300); } },
      destroy() { destroyed = true; try { peer.destroy(); } catch {} },
      restart() { try { peer.destroy(); } catch {} conns.clear(); start(); },
      check() { // periodic: re-attach to the signaling server if it dropped us (data channels keep working meanwhile)
        if (destroyed || !peer || peer.destroyed) return 'dead';
        if (peer.disconnected) { const t = Date.now(); if (t - lastRe > 5000) { lastRe = t; try { peer.reconnect(); } catch {} } return 'disconnected'; }
        return peer.open ? 'open' : 'connecting';
      },
    };
  }

  function createPeerClient(code, h) {
    let peer = null; let conn = null; let destroyed = false; let retryTimer = 0; let attempt = 0;
    function connect() {
      if (destroyed) return;
      if (!peer || peer.destroyed) {
        peer = new window.Peer({ debug: 1 });
        peer.on('open', () => dial());
        peer.on('error', (err) => {
          if (conn && conn.open && err.type !== 'peer-unavailable') return; // signaling hiccup; data channel still fine
          h.onStatus('error', err.type);
          if (err.type === 'peer-unavailable') scheduleRetry(false);
          else if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected', 'unavailable-id'].includes(err.type)) scheduleRetry(true);
        });
        peer.on('disconnected', () => {
          if (destroyed || peer.destroyed) return;
          setTimeout(() => { try { if (peer && !peer.destroyed && peer.disconnected) peer.reconnect(); } catch {} }, 1000);
        });
      } else if (peer.open) dial();
      else if (peer.disconnected) { try { peer.reconnect(); } catch { scheduleRetry(true); } }
    }
    function dial() {
      if (destroyed) return;
      if (conn) { const old = conn; conn = null; try { old.close(); } catch {} }
      const c = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
      if (!c) { scheduleRetry(true); return; }
      conn = c;
      const to = setTimeout(() => { if (conn === c && !c.open) { conn = null; try { c.close(); } catch {} scheduleRetry(false); } }, 12000);
      c.on('open', () => { clearTimeout(to); attempt = 0; h.onOpen(); });
      c.on('data', (d) => { if (conn === c) h.onData(d); });
      c.on('close', () => { clearTimeout(to); if (conn === c) { conn = null; h.onClose(); scheduleRetry(false); } });
      c.on('error', () => {});
    }
    function scheduleRetry(resetPeer) {
      if (destroyed) return;
      clearTimeout(retryTimer);
      const delay = Math.min(8000, 700 * 2 ** attempt); attempt = Math.min(attempt + 1, 6);
      h.onStatus('retry', delay);
      retryTimer = setTimeout(() => {
        if (resetPeer && peer) { try { peer.destroy(); } catch {} peer = null; }
        connect();
      }, delay);
    }
    connect();
    return {
      send(m) { if (conn && conn.open) { try { conn.send(m); return true; } catch {} } return false; },
      isOpen: () => !!(conn && conn.open),
      forceReconnect() { if (conn) { const c = conn; conn = null; try { c.close(); } catch {} } h.onClose(); attempt = 0; scheduleRetry(false); },
      destroy() { destroyed = true; clearTimeout(retryTimer); try { peer && peer.destroy(); } catch {} },
    };
  }

  // BroadcastChannel transport — same-browser demo / automated testing.
  function createLocalHost(code, h) {
    const bc = new BroadcastChannel('hayaoshi-' + code);
    const ids = new Set();
    bc.onmessage = (e) => {
      const m = e.data; if (!m || m.to !== 'host') return;
      if (m.type === 'open') { if (ids.has(m.from)) h.onClose(m.from); ids.add(m.from); bc.postMessage({ to: m.from, type: 'open' }); h.onConnect(m.from); }
      else if (m.type === 'data' && ids.has(m.from)) h.onData(m.from, m.msg);
      else if (m.type === 'close' && ids.has(m.from)) { ids.delete(m.from); h.onClose(m.from); }
    };
    bc.postMessage({ to: '*', type: 'reset' }); // tell clients of a previous host instance to reconnect
    setTimeout(() => h.onOpen(), 30);
    return {
      send(id, msg) { if (ids.has(id)) bc.postMessage({ to: id, type: 'data', msg }); },
      broadcast(msg) { for (const id of ids) bc.postMessage({ to: id, type: 'data', msg }); },
      close(id) { ids.delete(id); bc.postMessage({ to: id, type: 'close' }); },
      destroy() { bc.close(); },
      restart() {},
      check() { return 'open'; },
    };
  }
  function createLocalClient(code, h) {
    const bc = new BroadcastChannel('hayaoshi-' + code);
    const me = 'l' + uid(8); let open = false; let destroyed = false; let timer = 0;
    bc.onmessage = (e) => {
      const m = e.data; if (!m) return;
      if (m.to === '*' && m.type === 'reset') { if (open) { open = false; h.onClose(); } retry(); return; }
      if (m.to !== me) return;
      if (m.type === 'open') { if (!open) { open = true; h.onOpen(); } }
      else if (m.type === 'data' && open) h.onData(m.msg);
      else if (m.type === 'close') { open = false; h.onClose(); retry(); }
    };
    const hello = () => { if (!destroyed && !open) { bc.postMessage({ to: 'host', type: 'open', from: me }); timer = setTimeout(hello, 1000); } };
    const retry = () => { clearTimeout(timer); timer = setTimeout(hello, 800); };
    addEventListener('pagehide', () => { try { bc.postMessage({ to: 'host', type: 'close', from: me }); } catch {} });
    hello();
    return {
      send(msg) { if (open) { bc.postMessage({ to: 'host', type: 'data', from: me, msg }); return true; } return false; },
      isOpen: () => open,
      forceReconnect() { open = false; h.onClose(); retry(); },
      destroy() { destroyed = true; clearTimeout(timer); try { bc.postMessage({ to: 'host', type: 'close', from: me }); } catch {} bc.close(); },
    };
  }

  const makeHostTransport = (code, h) => (LOCAL ? createLocalHost(code, h) : createPeerHost(code, h));
  const makeClientTransport = (code, h) => (LOCAL ? createLocalClient(code, h) : createPeerClient(code, h));

  // Worker-based ticker so the host keeps reading even when its tab is throttled.
  function makeTicker(fn, ms) {
    try {
      const src = `let t=setInterval(()=>postMessage(0),${ms});onmessage=e=>{if(e.data==='stop')clearInterval(t)}`;
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = fn;
      return { stop: () => { w.postMessage('stop'); w.terminate(); } };
    } catch {
      const t = setInterval(fn, ms);
      return { stop: () => clearInterval(t) };
    }
  }

  // ------------------------------------------------------------------ data
  const SAMPLE_QUESTIONS = [
    ['日本で一番高い山は富士山ですが、では日本で二番目に高い、南アルプスにある標高3193mの山は何でしょう？', '北岳'],
    ['元素記号「Au」で表され、古くから装飾品や貨幣に使われてきた、さびにくい貴金属は何でしょう？', '金'],
    ['1964年に、アジアで初めての夏季オリンピックが開催された都市はどこでしょう？', '東京'],
    ['「吾輩は猫である」「坊っちゃん」などの作品で知られ、かつて千円札の肖像にもなった作家は誰でしょう？', '夏目漱石'],
    ['太陽系の惑星の中で最も大きく、「大赤斑」と呼ばれる巨大な渦が見られることで知られる惑星は何でしょう？', '木星'],
    ['テレビやスマートフォンの画面の色を作る「光の三原色」とは、赤、緑と、あと一つは何色でしょう？', '青'],
    ['世界で最も面積が大きい国はロシアですが、では世界で二番目に面積が大きい国はどこでしょう？', 'カナダ'],
    ['チェスで、相手のキングが攻撃されていて、どう動いても逃げられない状態にして勝つことを何というでしょう？', 'チェックメイト'],
    ['二十四節気の一つで、北半球では一年のうち昼の長さが最も長くなる、6月21日ごろの日を何というでしょう？', '夏至'],
    ['「モナ・リザ」や「最後の晩餐」を描いたことで知られる、イタリア・ルネサンス期の芸術家は誰でしょう？', 'レオナルド・ダ・ヴィンチ'],
    ['日本の47都道府県の中で、最も面積が小さく、讃岐うどんが名物として知られる県はどこでしょう？', '香川県'],
    ['「春はあけぼの」という有名な書き出しで始まる、平安時代に清少納言が書いた随筆は何でしょう？', '枕草子'],
    ['血液の成分のうち、ヘモグロビンを含み、肺で受け取った酸素を全身に運ぶ役割を持つものは何でしょう？', '赤血球'],
    ['1867年、江戸幕府の15代将軍・徳川慶喜が、政権を朝廷に返上した出来事を何というでしょう？', '大政奉還'],
    ['日本の国会は二院制をとっていますが、衆議院ともう一つの議院を何というでしょう？', '参議院'],
    ['首都はキャンベラで、カンガルーやコアラなど独特の動物が暮らすことで知られる南半球の国はどこでしょう？', 'オーストラリア'],
    ['柑橘類や野菜に多く含まれ、不足すると壊血病を引き起こすことで知られるビタミンは何でしょう？', 'ビタミンC'],
    ['1945年8月6日に原子爆弾が投下され、現在は平和記念公園や原爆ドームがある都市はどこでしょう？', '広島市'],
    ['一般的なピアノの鍵盤は、白鍵と黒鍵をあわせて全部でいくつあるでしょう？', '88'],
    ['地球の大気に最も多く含まれ、体積でおよそ78%を占める気体は何でしょう？', '窒素'],
  ];

  const PRESETS = {
    '1o1x': { label: '1○1×', desc: '1問正解で勝ち抜け・1回誤答で失格', rule: { correctPts: 1, wrongPts: 0, wrongReset: false, winAt: 1, loseWrong: 1, rest: 0 } },
    '7o3x': { label: '7○3×', desc: '7問正解で勝ち抜け・3回誤答で失格', rule: { correctPts: 1, wrongPts: 0, wrongReset: false, winAt: 7, loseWrong: 3, rest: 0 } },
    '10ud': { label: '10up-down', desc: '10ポイントで勝ち抜け・誤答で0に戻る・2回誤答で失格', rule: { correctPts: 1, wrongPts: 0, wrongReset: true, winAt: 10, loseWrong: 2, rest: 0 } },
    free: { label: 'フリー', desc: '正解+10・誤答−5。勝ち抜け/失格なし', rule: { correctPts: 10, wrongPts: 5, wrongReset: false, winAt: 0, loseWrong: 0, rest: 0 } },
  };
  const CORE_KEYS = ['correctPts', 'wrongPts', 'wrongReset', 'winAt', 'loseWrong'];
  const presetMatches = (r) => { const p = PRESETS[r.preset]; return !!p && CORE_KEYS.every((k) => p.rule[k] === r[k]); };
  function ruleLabel(r) {
    if (presetMatches(r)) return PRESETS[r.preset].label + (r.rest ? `（誤答${r.rest}休）` : '');
    const parts = [];
    if (r.winAt) parts.push(`${r.winAt}${r.correctPts === 1 && !r.wrongReset ? '○' : 'pt'}抜け`);
    if (r.loseWrong) parts.push(`${r.loseWrong}×失格`);
    if (r.wrongReset) parts.push('誤答0点');
    if (r.rest) parts.push(`誤答${r.rest}休`);
    return `カスタム（${parts.join('・') || `+${r.correctPts}/−${r.wrongPts}`}）`;
  }

  function parseCSV(text) {
    const rows = []; let row = []; let f = ''; let q = false;
    text = String(text || '').replace(/^\uFEFF/, '');
    // delimiter is decided per row: a row containing a TAB is TSV (spreadsheet paste), otherwise CSV
    const rowDelim = (i) => { const e = text.indexOf('\n', i); const line = text.slice(i, e < 0 ? undefined : e); return line.includes('\t') ? '\t' : ','; };
    let delim = rowDelim(0);
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (!q && f === '' && row.length === 0 && i > 0 && (text[i - 1] === '\n' || text[i - 1] === '\r')) delim = rowDelim(i);
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"' && f === '') q = true;
      else if (c === delim) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    const out = [];
    rows.forEach((r, i) => {
      const qq = (r[0] || '').trim(); const a = (r[1] || '').trim();
      if (!qq || !a) return;
      if (i === 0 && /問題|question/i.test(qq) && /答|answer/i.test(a)) return;
      out.push({ q: qq.slice(0, 400), a: a.slice(0, 120) });
    });
    return out;
  }
  const fmtTime = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  const csvCell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

  function qrSvg(text) {
    if (typeof window.qrcode !== 'function') return '';
    try { const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make(); return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
    catch { return ''; }
  }

  // ------------------------------------------------------------------ shared rendering
  function boardItemsHTML(players, opt = {}) {
    return players.map((p) => {
      const cls = [p.status, p.id === opt.answerer ? 'ans' : '', p.id === opt.me ? 'me' : ''].filter(Boolean).join(' ');
      const badges = [];
      if (p.status === 'win') badges.push(`<span class="badge win">${p.winRank ? p.winRank + '位抜け' : '勝ち抜け'}</span>`);
      if (p.status === 'lose') badges.push('<span class="badge lose">失格</span>');
      if (p.resting) badges.push('<span class="badge rest">休み</span>');
      else if (p.locked) badges.push('<span class="badge lock">誤答</span>');
      if (!p.online) badges.push('<span class="badge off">切断</span>');
      return `<li class="${cls}"><span class="rk">${p.rank}</span><span class="nm">${esc(p.name)} ${badges.join('')}</span><span class="sc">${p.score}<small>${p.correct}○${p.wrong}×</small></span></li>`;
    }).join('');
  }
  function qTextHTML(text, cuts, opt = {}) {
    // cuts: char indices where a buzz happened ("／" marker)
    const set = new Set(cuts || []);
    let html = '';
    for (let i = 0; i < text.length; i++) { if (set.has(i)) html += '<span class="cut">／</span>'; html += esc(text[i]); }
    if (set.has(text.length) && text.length) html += '<span class="cut">／</span>';
    if (opt.unread) html += `<span class="unread">${esc(opt.unread)}</span>`;
    if (opt.caret) html += '<span class="caret"></span>';
    return html;
  }

  // =================================================================== HOST
  const Host = (() => {
    let S = null; // persisted state
    let T = null; // transport
    const conns = new Map(); // connId -> {role, pid, last, rtt}
    const pidConn = new Map(); // pid -> connId
    let ticker = null; let decideTimer = 0; let stateTimer = 0; let saveTimer = 0; let lastTimeLeft = null;
    let resuming = false; let idRetries = 0; let opened = false;
    const R = {}; // transient read state: segStart, segRevealed, revealTimes[], readDoneAt, openAt

    function defaultState(code) {
      return {
        v: 1, code, created: Date.now(),
        rule: { preset: '7o3x', ...PRESETS['7o3x'].rule },
        speed: 8, window: 250, timeUp: 5, autoStart: false, allowLate: true,
        players: [], questions: [], qIndex: -1, cur: null, phase: 'lobby',
        log: [], undo: [], winCount: 0, loseCount: 0, finished: false,
      };
    }
    const saveNow = () => { clearTimeout(saveTimer); if (S && !S._closing) { try { localStorage.setItem(HOST_KEY, JSON.stringify(S)); } catch {} } };
    const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); };
    const P = (id) => S.players.find((p) => p.id === id);
    const online = (pid) => { const c = pidConn.get(pid); return !!(c && conns.has(c)); };

    function start(code, existing) {
      S = existing || defaultState(code);
      resuming = !!existing;
      if (S.cur && ['reading', 'deciding'].includes(S.phase)) { S.phase = 'reading'; S.cur.paused = true; }
      history.replaceState(null, '', BASE_URL + '?host=' + S.code + (LOCAL ? '&transport=local' : ''));
      document.title = `司会 ${S.code} | HAYAOSHI LIVE`;
      showScreen('host');
      bindUI(); renderAll();
      connect();
      ticker = makeTicker(tick, 40);
      setInterval(heartbeat, 1000);
      saveNow();
      addEventListener('pagehide', saveNow);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
      addEventListener('beforeunload', (e) => { saveNow(); if (S && S.players.length && !S._closing) { e.preventDefault(); e.returnValue = ''; } });
    }

    function connect() {
      netbar('サーバーに接続しています…');
      if (!LOCAL && !peerAvailable()) { netbar('通信ライブラリを読み込めませんでした。ネット接続を確認して再読み込みしてください。', true); return; }
      T = makeHostTransport(S.code, {
        onOpen() { opened = true; idRetries = 0; netbar(''); setDot(); if (!resuming) toast('ルームを作成しました'); resuming = true; },
        onStatus(s) { if (s === 'signal-lost') netbar('シグナリングサーバーから切断されました。再接続中…（参加者との通信は継続します）'); },
        onError(err) {
          const type = err && err.type;
          if (type === 'unavailable-id') {
            if (!resuming) { // brand new room collided: new code
              const old = S.code; S.code = genCode(); T.destroy(); toast(`コード ${old} は使用中のため変更しました`);
              history.replaceState(null, '', BASE_URL + '?host=' + S.code); renderTop(); connect(); return;
            }
            idRetries++;
            netbar(`ルーム ${S.code} を再取得しています…（${idRetries}）`);
            T.destroy();
            if (idRetries > 12) { netbar('同じルームコードを再取得できません。別のタブで司会画面が開いていませんか？', true); return; }
            setTimeout(connect, 2500); return;
          }
          if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(type)) {
            if (!opened) { // initial connection failed: rebuild
              netbar('サーバーに接続できません。再試行します…', true);
              const old = T; setTimeout(() => { try { old.destroy(); } catch {} if (T === old) connect(); }, 3000);
            } else netbar('シグナリングサーバーとの接続が不安定です。再接続を試みています…（接続済みの参加者はそのまま遊べます）');
          } else if (type === 'browser-incompatible') netbar('このブラウザはWebRTCに対応していません。', true);
        },
        onConnect(id) { conns.set(id, { role: null, pid: null, last: now(), rtt: null }); },
        onData(id, msg) { const c = conns.get(id); if (!c) return; c.last = now(); handle(id, c, msg); },
        onClose(id) { dropConn(id); },
      });
    }

    function dropConn(id) {
      const c = conns.get(id); if (!c) return;
      conns.delete(id);
      if (c.pid && pidConn.get(c.pid) === id) { pidConn.delete(c.pid); scheduleState(); renderPlayersSoon(); }
    }

    function heartbeat() {
      const t = now();
      for (const [id, c] of conns) if (t - c.last > 9000) { T.close(id); dropConn(id); }
      if (T && opened && T.check && T.check() === 'open' && !$('#netbar').hidden && !$('#netbar').classList.contains('err')) netbar('');
      setDot();
    }
    function setDot() {
      const n = S.players.filter((p) => online(p.id)).length;
      const v = [...conns.values()].filter((c) => c.role === 'viewer').length;
      $('#host-dot').className = 'dot ' + (opened ? 'on' : 'warn');
      $('#host-online').textContent = opened ? `参加者 ${n}人接続中${v ? ` ・ 配信画面 ${v}` : ''}` : '接続待ち';
    }

    // ---------------------------------------------------------- messages
    function handle(id, c, m) {
      if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
      switch (m.t) {
        case 'ping': T.send(id, { t: 'pong', c: m.c, h: now() }); if (typeof m.rtt === 'number') c.rtt = m.rtt; return;
        case 'hello': return onHello(id, c, m);
        case 'buzz': if (c.pid) onBuzz(c.pid, m, c); return;
        case 'leave': if (c.pid) { const p = P(c.pid); if (p) toast(`${p.name} さんが切断しました`); } T.close(id); dropConn(id); return;
      }
    }
    function onHello(id, c, m) {
      if (m.role === 'viewer') { c.role = 'viewer'; T.send(id, { t: 'welcome', role: 'viewer', code: S.code }); T.send(id, publicState()); setDot(); return; }
      const name = cleanName(m.name); const cid = String(m.cid || '').slice(0, 40);
      if (!name || !cid) { T.send(id, { t: 'error', code: 'name', msg: 'ニックネームを入力してください' }); return; }
      let p = S.players.find((x) => x.cid === cid);
      if (!p) p = S.players.find((x) => x.name === name && (!online(x.id) || now() - ((conns.get(pidConn.get(x.id)) || {}).last || 0) > 3500));
      if (!p) {
        if (S.players.length >= MAX_PLAYERS) { T.send(id, { t: 'error', code: 'full', msg: `満員です（最大${MAX_PLAYERS}人）` }); return; }
        if (!S.allowLate && S.qIndex >= 0) { T.send(id, { t: 'error', code: 'late', msg: '大会がすでに始まっているため参加できません' }); return; }
        let nm = name; let k = 2; while (S.players.some((x) => x.name === nm)) nm = `${name.slice(0, 14)}${k++}`;
        p = { id: 'p' + uid(6), cid, name: nm, score: 0, correct: 0, wrong: 0, status: 'active', winRank: null, loseOrder: null, rest: 0, joinedAt: Date.now() };
        S.players.push(p);
        toast(`${p.name} さんが参加しました`);
      } else { p.cid = cid; }
      const prev = pidConn.get(p.id);
      if (prev && prev !== id) { T.send(prev, { t: 'error', code: 'replaced', msg: '別の端末・タブで同じ参加者が接続しました' }); T.close(prev); conns.delete(prev); }
      c.role = 'player'; c.pid = p.id; pidConn.set(p.id, id);
      T.send(id, { t: 'welcome', role: 'player', pid: p.id, name: p.name, code: S.code });
      T.send(id, publicState());
      if (S.cur && ['reading', 'deciding'].includes(S.phase)) T.send(id, readMsg());
      save(); scheduleState(); renderPlayersSoon(); setDot();
    }

    // ---------------------------------------------------------- game logic
    const isPlaying = (p) => p.status === 'active';
    function canBuzz(p) {
      if (!S.cur || !isPlaying(p)) return false;
      if (S.cur.locked.includes(p.id) || S.cur.resting.includes(p.id)) return false;
      return true;
    }
    const eligibleCount = () => S.players.filter((p) => canBuzz(p)).length;

    function loadQuestion(idx) {
      if (idx < 0 || idx >= S.questions.length) { toast('問題がありません。「問題」タブで追加してください'); return false; }
      clearTimeout(decideTimer);
      S.qIndex = idx;
      const q = S.questions[idx];
      const resting = [];
      for (const p of S.players) if (p.status === 'active' && p.rest > 0) { resting.push(p.id); p.rest--; }
      S.cur = { qid: uid(8), idx, text: q.q, answer: q.a, revealed: 0, readDone: false, paused: false, attempt: 0,
        buzzes: [], answerer: null, cuts: [], locked: [], resting, result: null };
      S.phase = 'ready';
      R.revealTimes = []; R.readDoneAt = 0; lastTimeLeft = null;
      save(); scheduleState(); renderPlay(); renderQuestions();
      return true;
    }
    function nextQuestion() {
      if (S.phase === 'answering') { toast('先に ○ / × で判定してください'); return; }
      if (S.finished) { toast('大会は終了しています（結果タブでリセットできます）'); return; }
      if (S.cur && !['revealed', 'ready', 'lobby'].includes(S.phase)) reveal(true);
      if (!loadQuestion(S.qIndex + 1)) return;
      if (S.autoStart) startReading();
    }
    function startReading() {
      if (!S.cur) { nextQuestion(); return; }
      if (S.phase === 'ready' || (S.phase === 'reading' && S.cur.paused)) {
        S.phase = 'reading'; S.cur.paused = false;
        R.segStart = now(); R.segRevealed = S.cur.revealed; R.openAt = now();
        if (S.cur.readDone) R.readDoneAt = now();
        broadcast(readMsg()); scheduleState(); renderPlay(); save();
      }
    }
    function pauseReading() {
      if (S.phase === 'reading' && !S.cur.paused) { S.cur.paused = true; scheduleState(); renderPlay(); save(); }
    }
    function tick() {
      if (!S || !S.cur || S.phase !== 'reading' || S.cur.paused) return;
      const cur = S.cur; const len = cur.text.length; const t = now();
      if (cur.revealed < len) {
        const due = Math.min(len, R.segRevealed + Math.floor(((t - R.segStart) * S.speed) / 1000));
        if (due > cur.revealed) {
          while (cur.revealed < due) { R.revealTimes[cur.revealed] = t; cur.revealed++; }
          if (cur.revealed >= len) { cur.readDone = true; R.readDoneAt = t; }
          broadcast(readMsg()); renderQText();
        }
      } else if (!cur.readDone) { cur.readDone = true; R.readDoneAt = t; }
      if (cur.readDone && S.timeUp > 0) {
        const left = Math.max(0, Math.ceil(S.timeUp - (t - R.readDoneAt) / 1000));
        if (left !== lastTimeLeft) { lastTimeLeft = left; broadcast(readMsg()); renderTimer(left); }
        if (t - R.readDoneAt >= S.timeUp * 1000) { S.cur.result = { timeup: true }; reveal(); toast('時間切れ'); }
      }
    }
    function timeLeft() {
      if (!S.cur || !S.cur.readDone || !S.timeUp || S.phase !== 'reading') return null;
      if (S.cur.paused) return lastTimeLeft;
      return Math.max(0, Math.ceil(S.timeUp - (now() - R.readDoneAt) / 1000));
    }
    function readMsg() {
      return { t: 'read', qid: S.cur.qid, text: S.cur.text.slice(0, S.cur.revealed), done: S.cur.readDone, tl: timeLeft(), cuts: S.cur.cuts };
    }
    function revealedAt(ht) {
      let n = 0; const rt = R.revealTimes || [];
      for (let i = 0; i < S.cur.revealed; i++) { if (rt[i] === undefined || rt[i] <= ht) n = i + 1; else break; }
      return n;
    }

    function onBuzz(pid, m, c) {
      const p = P(pid); const cur = S.cur;
      if (!p || !cur || m.qid !== cur.qid) return;
      if (!canBuzz(p)) return;
      if (cur.buzzes.some((b) => b.pid === pid)) return;
      const arrival = now();
      const rtt = clamp(num(m.rtt, c.rtt ?? 300), 0, 2000);
      const maxBack = Math.min(900, rtt / 2 + 120);
      let ht = num(m.ht, arrival);
      ht = clamp(ht, arrival - maxBack, arrival);
      ht = Math.max(ht, R.openAt || 0);
      if (S.phase === 'reading' && !cur.paused) {
        cur.buzzes.push({ pid, ht, arrival });
        S.phase = 'deciding';
        broadcast({ t: 'fx', k: 'lock' });
        clearTimeout(decideTimer);
        decideTimer = setTimeout(decide, clamp(num(S.window, 250), 0, 1000));
        scheduleState(); renderPlay();
      } else if (S.phase === 'deciding') {
        cur.buzzes.push({ pid, ht, arrival });
      } else if (S.phase === 'answering' && arrival - (cur.decidedAt || 0) < 3000) {
        cur.buzzes.push({ pid, ht, arrival, late: true });
        scheduleState(); renderBuzz();
      }
    }
    function decide() {
      if (S.phase !== 'deciding') return;
      const cur = S.cur;
      cur.buzzes.sort((a, b) => a.ht - b.ht);
      const first = cur.buzzes[0];
      cur.answerer = first.pid; cur.decidedAt = now();
      const cut = revealedAt(first.ht);
      if (!cur.cuts.includes(cut)) cur.cuts.push(cut);
      S.phase = 'answering';
      const p = P(first.pid);
      broadcast({ t: 'fx', k: 'buzz', pid: first.pid, name: p ? p.name : '' });
      Sound.buzz();
      save(); scheduleState(); renderPlay();
    }

    function snapshot() {
      S.undo.push(JSON.stringify({ players: S.players, cur: S.cur, phase: S.phase, qIndex: S.qIndex, winCount: S.winCount, loseCount: S.loseCount, log: S.log, finished: S.finished }));
      if (S.undo.length > 30) S.undo.shift();
    }
    function undo() {
      const s = S.undo.pop(); if (!s) { toast('元に戻せる判定がありません'); return; }
      const o = JSON.parse(s); Object.assign(S, o);
      clearTimeout(decideTimer);
      if (S.phase === 'reading' && S.cur) S.cur.paused = true;
      toast('直前の判定を取り消しました');
      save(); scheduleState(); renderAll();
    }
    function judge(ok) {
      if (S.phase !== 'answering' || !S.cur) return;
      const cur = S.cur; const p = P(cur.answerer); if (!p) return;
      snapshot();
      const r = S.rule;
      const entry = { no: cur.idx + 1, q: cur.text, a: cur.answer, name: p.name, ok, at: cur.cuts[cur.cuts.length - 1] ?? 0, len: cur.text.length, time: fmtTime(new Date()) };
      if (ok) {
        p.correct++; p.score += r.correctPts;
        if (r.winAt > 0 && p.score >= r.winAt) { p.status = 'win'; p.winRank = ++S.winCount; }
        cur.result = { pid: p.id, ok: true };
        S.log.push(entry);
        S.phase = 'revealed'; cur.revealed = cur.text.length;
        broadcast({ t: 'fx', k: 'correct', pid: p.id, name: p.name });
        Sound.correct();
      } else {
        p.wrong++;
        if (r.wrongReset) p.score = 0; else p.score -= r.wrongPts;
        if (r.loseWrong > 0 && p.wrong >= r.loseWrong) { p.status = 'lose'; p.loseOrder = ++S.loseCount; }
        else if (r.rest > 0) p.rest = r.rest;
        cur.locked.push(p.id);
        cur.result = { pid: p.id, ok: false };
        S.log.push(entry);
        S.phase = 'afterwrong';
        broadcast({ t: 'fx', k: 'wrong', pid: p.id, name: p.name });
        Sound.wrong();
        if (eligibleCount() === 0) { S.phase = 'revealed'; cur.revealed = cur.text.length; }
      }
      checkFinished();
      save(); scheduleState(); renderAll();
    }
    function continueReading() {
      if (S.phase !== 'afterwrong') return;
      if (eligibleCount() === 0) { reveal(); return; }
      const cur = S.cur;
      cur.attempt++; cur.buzzes = []; cur.answerer = null; cur.result = null; cur.paused = false;
      S.phase = 'reading';
      R.segStart = now(); R.segRevealed = cur.revealed; R.openAt = now();
      if (cur.readDone) R.readDoneAt = now();
      lastTimeLeft = null;
      broadcast(readMsg()); save(); scheduleState(); renderPlay();
    }
    function reveal(silent) {
      if (!S.cur || S.phase === 'answering') { if (!silent && S.phase === 'answering') toast('先に ○ / × で判定してください'); return; }
      clearTimeout(decideTimer);
      S.cur.revealed = S.cur.text.length; S.phase = 'revealed';
      if (!S.cur.result) S.cur.result = { through: true };
      save(); scheduleState(); renderPlay();
    }
    function checkFinished() {
      if (S.players.length && S.players.every((p) => p.status !== 'active')) { S.finished = true; S.phase = 'revealed'; toast('全員の勝敗が確定しました！'); }
    }
    function finishGame() { S.finished = true; if (S.phase !== 'answering') S.phase = S.cur ? 'revealed' : 'lobby'; save(); scheduleState(); renderAll(); toast('大会を終了しました'); }
    function resetGame() {
      if (!confirm('得点・判定ログをリセットして新しい試合を始めますか？（参加者と問題は残ります）')) return;
      for (const p of S.players) Object.assign(p, { score: 0, correct: 0, wrong: 0, status: 'active', winRank: null, loseOrder: null, rest: 0 });
      Object.assign(S, { qIndex: -1, cur: null, phase: 'lobby', log: [], undo: [], winCount: 0, loseCount: 0, finished: false });
      save(); scheduleState(); renderAll(); toast('リセットしました');
    }

    function ranked() {
      const list = S.players.map((p) => ({ ...p }));
      list.sort((a, b) => {
        const g = (x) => (x.status === 'win' ? 0 : x.status === 'active' ? 1 : 2);
        if (g(a) !== g(b)) return g(a) - g(b);
        if (a.status === 'win') return a.winRank - b.winRank;
        if (a.status === 'lose') return (b.loseOrder || 0) - (a.loseOrder || 0);
        return b.score - a.score || b.correct - a.correct || a.wrong - b.wrong;
      });
      let rank = 0; let prevKey = null;
      list.forEach((p, i) => {
        const key = p.status === 'active' ? `a${p.score}/${p.correct}/${p.wrong}` : `${p.id}`;
        if (key !== prevKey) rank = i + 1;
        p.rank = rank; prevKey = key;
      });
      return list;
    }
    function publicState() {
      const cur = S.cur; const rev = S.phase === 'revealed' || S.finished;
      const players = ranked().map((p) => ({ id: p.id, name: p.name, score: p.score, correct: p.correct, wrong: p.wrong, status: p.status, winRank: p.winRank, rank: p.rank, online: online(p.id),
        resting: !!(cur && cur.resting.includes(p.id)), locked: !!(cur && cur.locked.includes(p.id)), restLeft: p.rest }));
      let buzzes = [];
      if (cur && cur.buzzes.length && S.phase !== 'deciding') {
        const t0 = cur.buzzes[0].ht;
        buzzes = cur.buzzes.map((b) => ({ pid: b.pid, name: (P(b.pid) || {}).name || '?', d: Math.round(b.ht - t0), late: !!b.late }));
      }
      return { t: 'state', v: PROTO, code: S.code, phase: S.phase, paused: !!(cur && cur.paused), finished: S.finished, rule: ruleLabel(S.rule),
        qNo: cur ? cur.idx + 1 : 0, qTotal: S.questions.length, qid: cur ? cur.qid : null, attempt: cur ? cur.attempt : 0,
        text: cur ? cur.text.slice(0, cur.revealed) : '', done: cur ? cur.readDone : false, cuts: cur ? cur.cuts : [], tl: timeLeft(),
        answer: cur && rev ? cur.answer : null, answerer: cur ? cur.answerer : null, result: cur ? cur.result : null, buzzes, players };
    }
    function broadcast(m) { if (T) T.broadcast(m); }
    function scheduleState() { clearTimeout(stateTimer); stateTimer = setTimeout(() => { broadcast(publicState()); setDot(); }, 25); }

    // ---------------------------------------------------------- export
    function exportCSV() {
      const lines = [];
      lines.push(['HAYAOSHI LIVE 結果', S.code, new Date().toLocaleString('ja-JP'), ruleLabel(S.rule)].map(csvCell).join(','));
      lines.push('');
      lines.push(['順位', '名前', '得点', '正解数', '誤答数', '状態'].join(','));
      for (const p of ranked()) lines.push([p.rank, p.name, p.score, p.correct, p.wrong, p.status === 'win' ? `勝ち抜け(${p.winRank}位)` : p.status === 'lose' ? '失格' : '—'].map(csvCell).join(','));
      lines.push('');
      lines.push(['問題番号', '問題', '答え', '解答者', '判定', '押下位置(文字)', '問題文字数', '時刻'].join(','));
      for (const l of S.log) lines.push([l.no, l.q, l.a, l.name, l.ok ? '○' : '×', l.at, l.len, l.time].map(csvCell).join(','));
      const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `hayaoshi-${S.code}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    // ---------------------------------------------------------- UI
    const PHASE_LABEL = { lobby: '待機中', ready: '出題準備', reading: '読み上げ中', deciding: '判定中…', answering: '解答中', afterwrong: '誤答', revealed: '正解発表' };
    let bound = false;
    function bindUI() {
      if (bound) return; bound = true;
      $$('.tab').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
      $('#host-copy').onclick = () => copyText(joinURL());
      $('#host-copy-view').onclick = () => copyText(viewURL());
      $('#host-qr-mini').onclick = () => { const d = $('#qr-dialog'); d.showModal ? d.showModal() : d.setAttribute('open', ''); };
      $('#c-start').onclick = () => startReading();
      $('#c-pause').onclick = () => pauseReading();
      $('#c-ok').onclick = () => judge(true);
      $('#c-ng').onclick = () => judge(false);
      $('#c-continue').onclick = () => continueReading();
      $('#c-reveal').onclick = () => reveal();
      $('#c-next').onclick = () => nextQuestion();
      $('#c-undo').onclick = () => undo();
      const sp = $('#c-speed');
      sp.oninput = () => { S.speed = clamp(+sp.value, 2, 25); $('#c-speed-val').textContent = S.speed; if (S.cur && S.phase === 'reading') { R.segStart = now(); R.segRevealed = S.cur.revealed; } save(); };
      $('#c-autostart').onchange = (e) => { S.autoStart = e.target.checked; save(); };
      // questions
      $('#csv-add').onclick = () => importCSV(false);
      $('#csv-replace').onclick = () => importCSV(true);
      $('#csv-file').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; $('#csv-input').value = await f.text(); e.target.value = ''; toast('ファイルを読み込みました。「末尾に追加」か「置き換え」を押してください'); };
      $('#q-form').onsubmit = (e) => { e.preventDefault(); const q = $('#q-text').value.trim(); const a = $('#q-ans').value.trim(); if (!q || !a) return; S.questions.push({ q, a }); $('#q-text').value = ''; $('#q-ans').value = ''; $('#q-text').focus(); save(); renderQuestions(); scheduleState(); toast('追加しました'); };
      $('#q-sample').onclick = () => { S.questions.push(...SAMPLE_QUESTIONS.map(([q, a]) => ({ q, a }))); save(); renderQuestions(); scheduleState(); toast('サンプル20問を追加しました'); };
      $('#q-shuffle').onclick = () => {
        const start = S.qIndex + 1; const rest = S.questions.slice(start);
        for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
        S.questions.splice(start, rest.length, ...rest); save(); renderQuestions(); toast('未出題の問題をシャッフルしました');
      };
      $('#q-clear').onclick = () => { if (!S.questions.length || !confirm('問題をすべて削除しますか？')) return; S.questions = []; S.qIndex = -1; save(); renderQuestions(); scheduleState(); };
      $('#q-list').onclick = (e) => {
        const b = e.target.closest('button[data-act]'); if (!b) return;
        const i = +b.dataset.i;
        if (b.dataset.act === 'del') {
          if (S.cur && i === S.qIndex && S.phase !== 'revealed') { toast('出題中の問題は削除できません'); return; }
          S.questions.splice(i, 1); if (i <= S.qIndex) S.qIndex--; if (S.cur && S.cur.idx > i) S.cur.idx--;
        } else if (b.dataset.act === 'jump') {
          if (S.phase === 'answering') { toast('先に判定してください'); return; }
          S.qIndex = i - 1; toast(`次は第${i + 1}問から出題します`);
        } else if (b.dataset.act === 'up' && i > 0) {
          [S.questions[i - 1], S.questions[i]] = [S.questions[i], S.questions[i - 1]];
        }
        save(); renderQuestions(); scheduleState();
      };
      // rules
      $('#preset-grid').innerHTML = Object.entries(PRESETS).map(([k, p]) => `<button type="button" class="preset" role="radio" data-preset="${k}"><b>${p.label}</b><small>${p.desc}</small></button>`).join('');
      $('#preset-grid').onclick = (e) => {
        const b = e.target.closest('[data-preset]'); if (!b) return;
        if (S.log.length && !confirm('試合の途中です。ルールを変更しますか？（得点はそのまま）')) return;
        S.rule = { preset: b.dataset.preset, ...PRESETS[b.dataset.preset].rule }; save(); renderRules(); scheduleState(); renderPlay();
      };
      const ruleFields = { 'r-correct': 'correctPts', 'r-wrong': 'wrongPts', 'r-win': 'winAt', 'r-lose': 'loseWrong', 'r-rest': 'rest' };
      for (const [id, k] of Object.entries(ruleFields)) $('#' + id).addEventListener('change', (e) => { S.rule[k] = Math.max(0, Math.round(num(e.target.value, 0))); save(); renderRules(); scheduleState(); renderPlay(); });
      $('#r-reset').onchange = (e) => { S.rule.wrongReset = e.target.checked; save(); renderRules(); scheduleState(); };
      $('#r-window').onchange = (e) => { S.window = clamp(Math.round(num(e.target.value, 250)), 0, 1000); save(); renderRules(); };
      $('#r-timeup').onchange = (e) => { S.timeUp = clamp(Math.round(num(e.target.value, 5)), 0, 60); save(); renderRules(); };
      $('#r-late').onchange = (e) => { S.allowLate = e.target.checked; save(); };
      // players
      $('#pl-body').onclick = (e) => {
        const b = e.target.closest('button[data-act]'); if (!b) return;
        const p = P(b.dataset.id); if (!p) return;
        const act = b.dataset.act;
        if (act === 'plus') p.score += Math.max(1, S.rule.correctPts);
        else if (act === 'minus') p.score -= Math.max(1, S.rule.correctPts);
        else if (act === 'status') {
          if (p.status === 'active') { p.status = 'win'; p.winRank = ++S.winCount; }
          else if (p.status === 'win') { p.status = 'lose'; p.winRank = null; p.loseOrder = ++S.loseCount; }
          else { p.status = 'active'; p.loseOrder = null; }
        } else if (act === 'rename') {
          const n = cleanName(prompt('新しい名前', p.name)); if (!n) return;
          if (S.players.some((x) => x !== p && x.name === n)) { toast('同じ名前の参加者がいます'); return; }
          p.name = n;
        } else if (act === 'kick') {
          if (!confirm(`${p.name} さんを退出させますか？`)) return;
          const c = pidConn.get(p.id); if (c) { T.send(c, { t: 'kicked' }); T.close(c); conns.delete(c); pidConn.delete(p.id); }
          S.players = S.players.filter((x) => x !== p);
          if (S.cur && S.cur.answerer === p.id && S.phase === 'answering') { S.phase = 'afterwrong'; S.cur.answerer = null; }
        }
        save(); scheduleState(); renderAll();
      };
      // results
      $('#res-export').onclick = exportCSV;
      $('#res-finish').onclick = () => { if (confirm('大会を終了して順位を確定しますか？')) finishGame(); };
      $('#res-reset').onclick = resetGame;
      $('#res-close').onclick = () => {
        if (!confirm('ルームを閉じますか？参加者は切断され、このルームの記録は消去されます（先にCSVを書き出しておくと安心です）。')) return;
        broadcast({ t: 'closed' }); S._closing = true; localStorage.removeItem(HOST_KEY);
        setTimeout(() => { try { T.destroy(); } catch {} location.href = BASE_URL; }, 400);
      };
      // keyboard
      document.addEventListener('keydown', (e) => {
        if ($('#scr-host').hidden) return;
        if (e.target.closest('input,textarea,select,[contenteditable]') || $('#qr-dialog').open) return;
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (k === ' ') { e.preventDefault(); if (S.phase === 'reading' && !S.cur.paused) pauseReading(); else if (S.phase === 'ready' || S.phase === 'reading') startReading(); else if (S.phase === 'lobby') nextQuestion(); }
        else if (k === 'o' || k === 'enter') { if (e.target.closest('button')) return; judge(true); }
        else if (k === 'x') judge(false);
        else if (k === 'c') continueReading();
        else if (k === 'r') reveal();
        else if (k === 'n') nextQuestion();
      });
    }
    function selectTab(t) {
      $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
      $$('.tabpanel').forEach((p) => (p.hidden = p.dataset.panel !== t));
      if (t === 'results') renderResults();
    }
    const joinURL = () => BASE_URL + '?room=' + S.code + (LOCAL ? '&transport=local' : '');
    const viewURL = () => BASE_URL + '?view=' + S.code + (LOCAL ? '&transport=local' : '');

    function renderAll() { renderTop(); renderPlay(); renderQuestions(); renderRules(); renderPlayers(); renderResults(); }
    function renderTop() {
      $('#host-code').textContent = S.code; $('#qr-code').textContent = S.code; $('#qr-url').textContent = joinURL();
      const svg = qrSvg(joinURL());
      $('#host-qr-mini').innerHTML = svg || '<span style="color:#000;font-size:10px">QR</span>';
      $('#qr-big').innerHTML = svg || '<p style="color:#000">QRコードを表示できませんでした</p>';
      $('#c-speed').value = S.speed; $('#c-speed-val').textContent = S.speed; $('#c-autostart').checked = !!S.autoStart;
    }
    function renderQText() {
      const cur = S.cur; const el = $('#h-qtext');
      if (!cur) { el.innerHTML = '<span class="muted">「次の問題」を押して出題を始めましょう。</span>'; return; }
      el.innerHTML = qTextHTML(cur.text.slice(0, cur.revealed), cur.cuts, { unread: cur.text.slice(cur.revealed), caret: S.phase === 'reading' && !cur.paused && !cur.readDone });
    }
    function renderTimer(left) {
      const ph = $('#h-phase');
      if (S.phase === 'reading' && left != null && S.cur && S.cur.readDone) ph.textContent = `読み上げ終了・残り ${left} 秒`;
    }
    function renderBuzz() {
      const cur = S.cur; const banner = $('#h-buzz'); const list = $('#h-buzzlist');
      if (!cur || (!cur.answerer && !cur.result)) { banner.hidden = true; list.innerHTML = ''; return; }
      const ps = publicState();
      list.innerHTML = ps.buzzes.map((b, i) => `<li class="${i === 0 ? 'first' : ''} ${b.late ? 'late' : ''}">${i + 1}. ${esc(b.name)}${i ? ` +${(b.d / 1000).toFixed(3)}s` : ''}</li>`).join('');
      const r = cur.result; let html = ''; let cls = '';
      if (S.phase === 'answering') { const p = P(cur.answerer); html = `🔔 ${esc(p ? p.name : '?')} さん　解答権！`; }
      else if (r && r.pid) { const p = P(r.pid); html = r.ok ? `○ ${esc(p ? p.name : '?')} さん 正解！` : `× ${esc(p ? p.name : '?')} さん 誤答`; cls = r.ok ? 'ok' : 'ng'; }
      else if (r && r.timeup) html = '⏰ 時間切れ';
      else if (r && r.through) html = 'スルー';
      banner.className = 'buzz-banner ' + cls; banner.innerHTML = html; banner.hidden = !html;
    }
    function renderPlay() {
      const cur = S.cur; const ph = S.phase;
      $('#h-qno').textContent = cur ? `第${cur.idx + 1}問 / ${S.questions.length}` : `問題 — / ${S.questions.length}`;
      const phEl = $('#h-phase');
      phEl.textContent = S.finished ? '大会終了' : (ph === 'reading' && cur.paused ? '一時停止中' : PHASE_LABEL[ph] || ph);
      phEl.className = 'phase ' + (ph === 'deciding' ? 'answering' : ph);
      if (ph === 'reading' && cur && cur.readDone && !cur.paused) renderTimer(timeLeft());
      $('#h-rule').textContent = ruleLabel(S.rule);
      renderQText();
      $('#h-answer').textContent = cur ? cur.answer : '—';
      renderBuzz();
      const has = !!cur; const reading = ph === 'reading';
      $('#c-start').disabled = !(ph === 'ready' || (reading && cur.paused) || ph === 'lobby');
      $('#c-start').innerHTML = reading && cur && cur.paused ? '▶ 再開 <kbd>Space</kbd>' : '▶ 読み上げ開始 <kbd>Space</kbd>';
      $('#c-pause').disabled = !(reading && !cur.paused);
      $('#c-ok').disabled = $('#c-ng').disabled = ph !== 'answering';
      $('#c-continue').disabled = ph !== 'afterwrong' || eligibleCount() === 0;
      $('#c-reveal').disabled = !has || ['answering', 'revealed', 'deciding'].includes(ph);
      $('#c-next').disabled = ph === 'answering' || ph === 'deciding' || S.finished || S.qIndex + 1 >= S.questions.length;
      $('#c-undo').disabled = !S.undo.length;
      const board = ranked();
      $('#h-board').innerHTML = boardItemsHTML(publicState().players, { answerer: ph === 'answering' ? cur.answerer : null });
      $('#h-board-empty').hidden = board.length > 0;
      $('#p-count').textContent = S.players.length;
      $('#q-count').textContent = S.questions.length;
    }
    function renderQuestions() {
      $('#q-count').textContent = S.questions.length;
      $('#q-empty').hidden = S.questions.length > 0;
      $('#q-list').innerHTML = S.questions.map((q, i) => `<li class="${i < S.qIndex || (i === S.qIndex && S.phase === 'revealed') ? 'done' : ''} ${S.cur && i === S.qIndex && S.phase !== 'revealed' ? 'current' : ''}">
        <div><div>${esc(q.q)}</div><div class="qa">${esc(q.a)}</div></div>
        <div class="ops"><button class="btn btn-sm btn-ghost" data-act="jump" data-i="${i}" title="次にこの問題を出題">次に出題</button><button class="btn btn-sm btn-ghost" data-act="up" data-i="${i}" aria-label="上へ" ${i ? '' : 'disabled'}>↑</button><button class="btn btn-sm btn-ghost danger" data-act="del" data-i="${i}" aria-label="削除">✕</button></div></li>`).join('');
    }
    function importCSV(replace) {
      const items = parseCSV($('#csv-input').value);
      if (!items.length) { toast('読み込める行がありません（問題,答え の形式）'); return; }
      if (replace) { if (S.cur && !['revealed', 'lobby'].includes(S.phase)) { toast('出題中は置き換えできません'); return; } S.questions = items; S.qIndex = -1; S.cur = null; S.phase = 'lobby'; }
      else S.questions.push(...items);
      $('#csv-input').value = ''; save(); renderQuestions(); renderPlay(); scheduleState(); toast(`${items.length}問を読み込みました`);
    }
    function renderRules() {
      const r = S.rule;
      $$('#preset-grid .preset').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.preset === r.preset && presetMatches(r))));
      $('#r-correct').value = r.correctPts; $('#r-wrong').value = r.wrongPts; $('#r-reset').checked = r.wrongReset;
      $('#r-win').value = r.winAt; $('#r-lose').value = r.loseWrong; $('#r-rest').value = r.rest;
      $('#r-window').value = S.window; $('#r-timeup').value = S.timeUp; $('#r-late').checked = S.allowLate;
      $('#r-wrong').disabled = r.wrongReset;
      const t = [`正解 +${r.correctPts}`, r.wrongReset ? '誤答で0に戻る' : `誤答 −${r.wrongPts}`, r.winAt ? `${r.winAt}点で勝ち抜け` : '勝ち抜けなし', r.loseWrong ? `${r.loseWrong}回誤答で失格` : '失格なし', r.rest ? `誤答後${r.rest}問休み` : '休みなし'];
      $('#r-summary').textContent = '現在のルール：' + ruleLabel(r) + ' — ' + t.join('・');
    }
    let plTimer = 0;
    function renderPlayersSoon() { clearTimeout(plTimer); plTimer = setTimeout(() => { renderPlayers(); renderPlay(); }, 60); }
    function renderPlayers() {
      $('#p-count').textContent = S.players.length;
      $('#pl-empty').hidden = S.players.length > 0;
      const n = S.players.filter((p) => online(p.id)).length;
      $('#pl-summary').textContent = `${S.players.length}人（接続中 ${n}人）`;
      $('#pl-body').innerHTML = ranked().map((p) => {
        const c = conns.get(pidConn.get(p.id));
        const st = p.status === 'win' ? `勝ち抜け${p.winRank}位` : p.status === 'lose' ? '失格' : p.rest ? `休み残${p.rest}` : '参加中';
        return `<tr><td><span class="dot ${online(p.id) ? 'on' : 'off'}" title="${online(p.id) ? '接続中' : '切断'}"></span></td><td>${esc(p.name)}</td><td>${p.score}</td><td>${p.correct}</td><td>${p.wrong}</td><td>${st}</td><td>${c && c.rtt != null ? Math.round(c.rtt) + 'ms' : '—'}</td>
          <td class="ops"><button class="btn btn-sm btn-ghost" data-act="plus" data-id="${p.id}" aria-label="加点">＋</button><button class="btn btn-sm btn-ghost" data-act="minus" data-id="${p.id}" aria-label="減点">−</button><button class="btn btn-sm btn-ghost" data-act="status" data-id="${p.id}" title="参加中→勝ち抜け→失格→参加中">状態</button><button class="btn btn-sm btn-ghost" data-act="rename" data-id="${p.id}">名前</button><button class="btn btn-sm btn-ghost danger" data-act="kick" data-id="${p.id}">退出</button></td></tr>`;
      }).join('');
    }
    function renderResults() {
      $('#res-board').innerHTML = boardItemsHTML(publicState().players);
      $('#res-log').innerHTML = S.log.map((l) => `<tr><td>${l.no}</td><td class="wrap">${esc(l.q)}<br><small class="muted">答：${esc(l.a)}</small></td><td>${esc(l.name)}</td><td>${l.ok ? '○' : '×'}</td><td>${l.at}/${l.len}字</td></tr>`).join('') || '<tr><td colspan="5" class="muted">まだ判定がありません</td></tr>';
    }
    setInterval(() => { if (S && !$('#scr-host').hidden && !$('[data-panel=players]').hidden) renderPlayers(); }, 3000);

    return { start, _debug: () => ({ S, conns, pidConn }) };
  })();

  // =================================================================== CLIENT (player / viewer)
  function Client(role, code, name) {
    let T = null; let st = null; let pid = null; let open = false; let lastMsg = now(); let closed = false;
    const samples = []; let offset = 0; let bestRtt = null; let pingTimer = 0; let pingCount = 0;
    let pressedKey = null; let frozenText = null; let readText = ''; let readCuts = []; let lastFx = null;
    const cidKey = 'hayaoshi-cid-' + code;
    let cid = sessionStorage.getItem(cidKey); if (!cid) { cid = uid(16); sessionStorage.setItem(cidKey, cid); }

    function start() {
      if (!LOCAL && !peerAvailable()) { netbar('通信ライブラリを読み込めませんでした。ネット接続を確認して再読み込みしてください。', true); return; }
      netbar('ルームに接続しています…');
      T = makeClientTransport(code, {
        onOpen() {
          open = true; lastMsg = now(); netbar('');
          T.send({ t: 'hello', v: PROTO, role, cid, name });
          samples.length = 0; pingCount = 0; schedulePing(50);
        },
        onData(m) { lastMsg = now(); onMsg(m); },
        onClose() { if (closed) return; open = false; netbar('接続が切れました。再接続しています…', true); setDot(); },
        onStatus(s, x) {
          if (closed) return;
          if (s === 'error' && x === 'peer-unavailable') netbar(`ルーム ${code} が見つかりません。コードを確認するか、司会の準備をお待ちください（自動で再試行します）`, true);
          else if (s === 'retry' && !open) setDot();
        },
      });
      setInterval(() => { if (open && now() - lastMsg > 8000 && !closed) { open = false; T.forceReconnect(); } }, 2000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !closed && (!open || now() - lastMsg > 4000)) T.forceReconnect(); });
      addEventListener('pagehide', () => { try { T.send({ t: 'leave' }); } catch {} });
    }
    function schedulePing(ms) { clearTimeout(pingTimer); pingTimer = setTimeout(ping, ms); }
    function ping() {
      if (open) { T.send({ t: 'ping', c: now(), rtt: bestRtt }); pingCount++; }
      schedulePing(pingCount < 6 ? 250 : 2000);
    }
    function onPong(m) {
      const t = now(); const rtt = t - m.c; if (rtt < 0 || rtt > 10000) return;
      samples.push({ rtt, off: m.h + rtt / 2 - t }); if (samples.length > 10) samples.shift();
      const best = samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
      offset = best.off; bestRtt = best.rtt;
      setDot();
    }
    function onMsg(m) {
      if (!m || typeof m.t !== 'string') return;
      switch (m.t) {
        case 'pong': onPong(m); break;
        case 'welcome': if (m.pid) { pid = m.pid; name = m.name; try { localStorage.setItem('hayaoshi-name', m.name); } catch {} } setDot(); break;
        case 'state':
          st = m; readText = m.text; readCuts = m.cuts || [];
          if (frozenText !== null && (!['reading', 'deciding'].includes(m.phase) || pressedKey !== m.qid + ':' + m.attempt)) frozenText = null;
          render(); break;
        case 'read': if (st && m.qid === st.qid) { readText = m.text; readCuts = m.cuts || readCuts; st.done = m.done; st.tl = m.tl; renderText(); } break;
        case 'fx': onFx(m); break;
        case 'error': if (['full', 'late', 'replaced', 'name'].includes(m.code)) { closed = true; T.destroy(); overlay(m.msg || 'エラーが発生しました'); } break;
        case 'kicked': closed = true; T.destroy(); overlay('司会により退出となりました'); break;
        case 'closed': closed = true; T.destroy(); overlay('ルームは終了しました。ご参加ありがとうございました！'); break;
      }
    }
    function onFx(m) {
      lastFx = m;
      if (role === 'viewer' && !params.has('sound')) return;
      if (m.k === 'buzz') { Sound.buzz(); if (m.pid === pid) vibrate([60, 40, 120]); }
      else if (m.k === 'correct') { Sound.correct(); if (m.pid === pid) vibrate([40, 30, 40]); }
      else if (m.k === 'wrong') { Sound.wrong(); if (m.pid === pid) vibrate(300); }
    }
    function overlay(msg) { netbar(''); if (role === 'player') { $('#p-overlay-msg').textContent = msg; $('#p-overlay').hidden = false; } else { $('#v-wait').hidden = false; $('#v-wait').textContent = msg; } }
    function setDot() {
      const d = role === 'player' ? $('#p-dot') : null; if (!d) return;
      d.className = 'dot ' + (open ? (bestRtt != null && bestRtt > 400 ? 'warn' : 'on') : 'off');
      d.title = open ? `接続中${bestRtt != null ? `（ping ${Math.round(bestRtt)}ms）` : ''}` : '再接続中';
    }

    // player
    const me = () => (st && pid ? st.players.find((p) => p.id === pid) : null);
    function canBuzz() {
      const p = me(); if (!st || !p || !open) return false;
      if (p.status !== 'active' || p.locked || p.resting || st.finished) return false;
      return (st.phase === 'reading' && !st.paused) || st.phase === 'deciding';
    }
    function buzz() {
      if (role !== 'player' || !st) return;
      const key = st.qid + ':' + st.attempt;
      if (pressedKey === key) return;
      if (!canBuzz()) { vibrate(15); return; }
      pressedKey = key;
      const ht = now() + offset;
      T.send({ t: 'buzz', qid: st.qid, attempt: st.attempt, ht, rtt: bestRtt });
      frozenText = readText;
      Sound.press(); vibrate(40);
      const b = $('#buzzer'); b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 160);
      renderButton(); renderText();
    }
    function renderText() {
      if (!st) return;
      const text = frozenText !== null ? frozenText : readText;
      const el = role === 'player' ? $('#p-qtext') : $('#v-qtext');
      const reading = st.phase === 'reading' && !st.paused && !st.done && frozenText === null;
      el.innerHTML = st.qid ? qTextHTML(text, readCuts, { caret: reading }) : `<span class="muted">${role === 'viewer' ? '' : 'まもなく出題されます'}</span>`;
      const tEl = role === 'player' ? $('#p-timer') : $('#v-timer');
      if (st.phase === 'reading' && st.tl != null) { tEl.hidden = false; tEl.textContent = `⏱ ${st.tl}`; } else tEl.hidden = true;
    }
    function render() {
      if (role === 'player') renderPlayer(); else renderViewer();
    }
    function renderPlayer() {
      const p = me();
      $('#p-name').textContent = p ? p.name : name;
      $('#p-score').textContent = p ? p.score : 0;
      $('#p-ox').textContent = p ? `${p.correct}○${p.wrong}×` : '';
      $('#p-qno').textContent = st.qNo ? `第${st.qNo}問` : '待機中';
      const chip = $('#p-chip');
      let ct = '参加中'; let cc = '';
      if (p) {
        if (p.status === 'win') { ct = `勝ち抜け ${p.winRank || ''}位`; cc = 'win'; }
        else if (p.status === 'lose') { ct = '失格'; cc = 'lose'; }
        else if (p.resting) { ct = '休み'; cc = 'rest'; }
        else if (st.answerer === pid && st.phase === 'answering') { ct = '解答権！'; cc = 'ans'; }
        else ct = `${p.rank}位`;
      }
      chip.textContent = ct; chip.className = 'chip ' + cc;
      const ans = $('#p-answer');
      if (st.answer) {
        const r = st.result; const rp = r && r.pid ? st.players.find((x) => x.id === r.pid) : null;
        ans.hidden = false; ans.textContent = `答え：${st.answer}${rp && r.ok ? `（${rp.name} さん正解）` : ''}`;
      } else ans.hidden = true;
      $('#p-board').innerHTML = boardItemsHTML(st.players, { me: pid, answerer: st.phase === 'answering' ? st.answerer : null });
      renderText(); renderButton();
    }
    function renderButton() {
      const b = $('#buzzer'); const p = me(); const L = $('#buzzer-label'); const sub = $('#buzzer-sub');
      let label = '待機中'; let s = 'PCはスペースキーでも押せます'; let cls = ''; let enabled = false;
      const key = st ? st.qid + ':' + st.attempt : '';
      if (!open) { label = '接続中…'; s = '自動で再接続します'; }
      else if (!st || !p) { label = '参加中…'; }
      else if (p.status === 'win') { label = `勝ち抜け！`; s = `${p.winRank || ''}位で勝ち抜けました 🎉`; cls = 'st-win'; }
      else if (p.status === 'lose') { label = '失格'; s = '観戦モード'; cls = 'st-lose'; }
      else if (st.phase === 'answering' && st.answerer === pid) { label = '解答権獲得！'; s = '声に出して答えてください'; cls = 'st-answer'; }
      else if (p.resting) { label = '休み'; s = 'この問題はお休みです'; cls = 'st-rest'; }
      else if (p.locked && st.phase !== 'revealed') { label = '誤答'; s = 'この問題はもう押せません'; cls = 'st-wrong'; }
      else if (pressedKey === key && ['reading', 'deciding'].includes(st.phase)) { label = '判定中…'; s = '押しました！'; }
      else if (st.phase === 'deciding') { label = '押す！'; s = '誰かが押しました — 判定中'; enabled = true; }
      else if (st.phase === 'answering') { const a = st.players.find((x) => x.id === st.answerer); label = a ? `${a.name}` : '判定中…'; s = a ? 'さんが解答中' : ''; }
      else if (st.phase === 'reading' && !st.paused) { label = '押す！'; s = 'PCはスペースキーでも押せます'; enabled = true; }
      else if (st.phase === 'reading' && st.paused) { label = '一時停止中'; s = ''; }
      else if (st.phase === 'afterwrong') { label = '待機中'; s = '司会が続きを読むかもしれません'; }
      else if (st.phase === 'revealed') { label = st.result && st.result.pid === pid ? (st.result.ok ? '正解！' : '誤答') : '次の問題へ'; s = ''; if (st.result && st.result.pid === pid) cls = st.result.ok ? 'st-win' : 'st-wrong'; }
      else if (st.finished) { label = '終了'; }
      if (st && st.finished && p && p.status === 'active') { label = '大会終了'; s = `最終 ${p.rank}位`; enabled = false; }
      L.textContent = label; sub.textContent = s;
      b.className = 'buzzer ' + cls;
      b.disabled = !enabled;
    }
    function renderViewer() {
      $('#v-wait').hidden = true;
      $('#v-qno').textContent = st.qNo ? `第${st.qNo}問` : '';
      $('#v-rule').textContent = st.rule;
      $('#v-code').textContent = params.has('hidecode') ? '' : st.code;
      const bz = $('#v-buzz'); const r = st.result;
      let t = ''; let c = '';
      if (st.phase === 'answering') { const a = st.players.find((x) => x.id === st.answerer); t = a ? `🔔 ${a.name}` : ''; }
      else if (r && r.pid) { const a = st.players.find((x) => x.id === r.pid); t = a ? `${r.ok ? '○' : '×'} ${a.name}` : ''; c = r.ok ? 'ok' : 'ng'; }
      else if (r && r.timeup) t = '⏰ 時間切れ';
      bz.textContent = t; bz.className = 'v-buzz ' + c;
      $('#v-answer').textContent = st.answer ? `答え：${st.answer}` : '';
      const ans = st.phase === 'answering' ? st.answerer : null;
      $('#v-board').innerHTML = st.players.map((p) => `<li class="${p.status} ${p.id === ans ? 'ans' : ''} ${p.resting ? 'rest' : ''}">
        <span class="rk">${p.rank}位</span><span class="st">${p.status === 'win' ? `<span class="badge win">${p.winRank}位抜け</span>` : p.status === 'lose' ? '<span class="badge lose">失格</span>' : p.resting ? '<span class="badge rest">休</span>' : p.locked ? '<span class="badge lock">×</span>' : ''}</span>
        <div class="nm">${esc(p.name)}</div><div class="sc">${p.score}</div><div class="ox">${p.correct}○ ${p.wrong}×</div></li>`).join('');
      renderText();
    }

    if (role === 'player') {
      const b = $('#buzzer');
      const press = (e) => { e.preventDefault(); buzz(); };
      b.addEventListener('pointerdown', press);
      b.addEventListener('click', (e) => e.preventDefault());
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      document.addEventListener('keydown', (e) => {
        if (e.repeat || e.target.closest('input,textarea')) return;
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); buzz(); }
      });
    }
    start();
    return { _debug: () => ({ st, pid, offset, bestRtt, open }), buzz };
  }

  // =================================================================== routing
  function showScreen(name) {
    $$('.screen').forEach((s) => (s.hidden = s.id !== 'scr-' + name));
    document.body.classList.remove('mode-landing', 'mode-host', 'mode-player', 'mode-viewer');
    document.body.classList.add('mode-' + name);
  }
  function savedHost() { try { const s = JSON.parse(localStorage.getItem(HOST_KEY) || 'null'); return s && s.v === 1 && s.code ? s : null; } catch { return null; } }

  function startPlayer(code, name) {
    try { sessionStorage.setItem('hayaoshi-join-' + code, name); localStorage.setItem('hayaoshi-name', name); } catch {}
    history.replaceState(null, '', BASE_URL + '?room=' + code + (LOCAL ? '&transport=local' : ''));
    document.title = `参加 ${code} | HAYAOSHI LIVE`;
    showScreen('player');
    $('#p-name').textContent = name;
    window.__hayaoshi = Client('player', code, name);
  }
  function startViewer(code) {
    if (params.get('bg') === 'transparent' || params.has('transparent')) document.body.classList.add('transparent');
    if (params.get('bg') === 'green') document.body.classList.add('chroma');
    document.title = `配信 ${code} | HAYAOSHI LIVE`;
    showScreen('viewer');
    window.__hayaoshi = Client('viewer', code, '');
  }

  function init() {
    const room = normCode(params.get('room'));
    const view = normCode(params.get('view'));
    const hostCode = normCode(params.get('host'));
    const saved = savedHost();

    if (view && view.length === 6) return startViewer(view);
    if (hostCode && saved && saved.code === hostCode) { Host.start(saved.code, saved); window.__hayaoshiHost = Host; return; }
    if (room && room.length === 6) {
      const n = sessionStorage.getItem('hayaoshi-join-' + room);
      if (n) return startPlayer(room, n);
    }
    // landing
    showScreen('landing');
    if (room) $('#join-code').value = room;
    $('#join-name').value = localStorage.getItem('hayaoshi-name') || '';
    if (room) setTimeout(() => $('#join-name').focus(), 50);
    if (saved) { const b = $('#btn-resume'); b.hidden = false; b.textContent = `前回の大会（${saved.code}）を再開`; b.onclick = () => { Host.start(saved.code, saved); window.__hayaoshiHost = Host; }; }
    $('#form-join').onsubmit = (e) => {
      e.preventDefault();
      const code = normCode($('#join-code').value); const name = cleanName($('#join-name').value);
      if (code.length !== 6) { toast('ルームコードは6文字です'); $('#join-code').focus(); return; }
      if (!name) { toast('ニックネームを入力してください'); $('#join-name').focus(); return; }
      Sound.unlock(); startPlayer(code, name);
    };
    $('#btn-create').onclick = () => {
      if (saved && !confirm(`前回の大会（${saved.code}）のデータは上書きされます。新しいルームを作りますか？`)) return;
      Host.start(genCode(), null); window.__hayaoshiHost = Host;
    };
    $('#form-view').onsubmit = (e) => {
      e.preventDefault();
      const code = normCode($('#view-code').value); if (code.length !== 6) { toast('ルームコードは6文字です'); return; }
      location.href = BASE_URL + '?view=' + code + ($('#view-transparent').checked ? '&bg=transparent' : '') + (LOCAL ? '&transport=local' : '');
    };
    ['#join-code', '#view-code'].forEach((s) => $(s).addEventListener('input', (e) => { const p = e.target.selectionStart; e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); try { e.target.setSelectionRange(p, p); } catch {} }));
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  // expose pure helpers for tests
  window.__hayaoshiLib = { parseCSV, ruleLabel, PRESETS, SAMPLE_QUESTIONS, normCode };
  init();
})();
