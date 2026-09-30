/* 二分探索ラボ — 画面制御。ルール・計算は logic.js（BS）、木の描画は tree.js（BSTree）。 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    kids.forEach(c => c != null && e.append(c));
    return e;
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境でも動かす */ } },
  };
  const randInt = n => Math.floor(Math.random() * n);
  const setPressed = (sel, attr, val) => document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val))));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =========================================================
   * ルーター・共通
   * ========================================================= */
  const pages = {};
  function route() {
    const name = (location.hash || '#home').slice(1);
    const target = document.querySelector(`[data-page="${name}"]`) ? name : 'home';
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('is-active', p.dataset.page === target));
    document.querySelectorAll('.nav a').forEach(a => {
      if (a.getAttribute('href') === '#' + target) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const cur = document.querySelector('.nav a[aria-current="page"]');
    if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    if (pages[target] && pages[target].onShow) pages[target].onShow();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  const bigBtn = $('bigToggle');
  function applyBig(on) {
    document.documentElement.dataset.big = on ? '1' : '0';
    bigBtn.setAttribute('aria-pressed', String(on));
    bigBtn.textContent = on ? '文字 標準' : '文字 大';
  }
  applyBig(store.get('bs.big', false));
  bigBtn.addEventListener('click', () => { const on = document.documentElement.dataset.big !== '1'; store.set('bs.big', on); applyBig(on); });

  /* =========================================================
   * 1 誕生日当て
   * ========================================================= */
  (function birthday() {
    const N = BS.DAYS_IN_YEAR;
    const st = { out: new Array(N).fill(false), sel: new Set(), selKind: null, hist: [], over: null, pending: null };
    const cells = [];

    // カレンダー
    const cal = $('bCal');
    for (let m = 1; m <= 12; m++) {
      const row = h('div', { class: 'cal__row' }, h('span', { class: 'cal__m', text: m + '月' }));
      for (let d = 1; d <= 31; d++) {
        if (d > BS.MONTH_DAYS[m - 1]) { row.append(h('span', { class: 'cal__d cal__d--none' })); continue; }
        const day = BS.dateToDay(m, d);
        const b = h('button', { type: 'button', class: 'cal__d', 'data-day': day, title: m + '月' + d + '日', 'aria-label': m + '月' + d + '日', text: String(d) });
        cells[day] = b;
        row.append(b);
      }
      cal.append(row);
    }
    // タップ、または指でなぞって（ドラッグ）範囲を選ぶ
    let dragging = false, dragAnchor = null;
    function cellAtPoint(x, y) {
      const el = document.elementFromPoint(x, y);
      return el && el.dataset && el.dataset.day != null ? el : null;
    }
    function setRangeSelection(a, b) {
      if (st.over) return;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      st.sel = new Set();
      for (let i = lo; i <= hi; i++) st.sel.add(i);
      st.selKind = 'range';
      render();
    }
    function selectParity(parity) {
      if (st.over) return;
      st.sel = new Set();
      for (let day = 0; day < N; day++) {
        const { d } = BS.dayToDate(day);
        if ((d % 2 === 1) === (parity === 'odd')) st.sel.add(day);
      }
      st.selKind = parity;
      render();
    }
    function clearSelection() { st.sel = new Set(); st.selKind = null; render(); }
    cal.addEventListener('pointerdown', e => {
      const el = cellAtPoint(e.clientX, e.clientY);
      if (!el) return;
      dragAnchor = +el.dataset.day;
      dragging = true;
      setRangeSelection(dragAnchor, dragAnchor);
    });
    window.addEventListener('pointermove', e => {
      if (!dragging) return;
      const el = cellAtPoint(e.clientX, e.clientY);
      if (el) setRangeSelection(dragAnchor, +el.dataset.day);
    });
    window.addEventListener('pointerup', () => { dragging = false; });

    function remainingCount() { let c = 0; for (let i = 0; i < N; i++) if (!st.out[i]) c++; return c; }
    function remainingEnvelope() {
      let min = null, max = null, count = 0;
      for (let i = 0; i < N; i++) if (!st.out[i]) { if (min == null) min = i; max = i; count++; }
      return { min, max, count, contiguous: min != null && (max - min + 1 === count) };
    }
    function selectionLabel() {
      const days = [...st.sel].sort((a, b) => a - b);
      if (st.selKind === 'odd') return '奇数の日';
      if (st.selKind === 'even') return '偶数の日';
      if (days.length === 1) return BS.dayLabel(days[0]);
      return BS.dayLabel(days[0]) + '〜' + BS.dayLabel(days[days.length - 1]);
    }

    function reset() {
      st.out = new Array(N).fill(false);
      Object.assign(st, { sel: new Set(), selKind: null, hist: [], over: null, pending: null });
      render();
    }

    function erase() {
      if (st.over || st.sel.size === 0) return;
      const days = [];
      st.sel.forEach(i => { if (!st.out[i]) { st.out[i] = true; days.push(i); } });
      if (!days.length) return;
      st.hist.push({ label: selectionLabel(), days, remainingAfter: remainingCount() });
      st.sel = new Set(); st.selKind = null;
      render();
    }

    const declTarget = () => {
      const env = remainingEnvelope();
      if (env.count === 1) return env.min;
      return st.sel.size === 1 ? [...st.sel][0] : null;
    };

    function finish(hit) {
      st.over = { hit, day: st.pending };
      st.pending = null;
      const recs = store.get('bs.records', []);
      recs.push({ count: st.hist.length, hit });
      store.set('bs.records', recs);
      render();
    }

    function declare() {
      if (st.over) return;
      const day = declTarget();
      if (day == null) return;
      st.pending = day;
      render();
    }

    function undo() {
      // 宣言（結果）が出たあとは戻せない。1ゲームに宣言は1回だけ。次の人へ（はじめから）で新しいゲームへ。
      if (st.over) return;
      if (st.pending != null) st.pending = null;
      else if (st.hist.length) { const last = st.hist.pop(); last.days.forEach(d => { st.out[d] = false; }); }
      render();
    }

    function render() {
      const env = remainingEnvelope();
      $('bCount').textContent = env.count;
      $('bAsked').textContent = st.hist.length;
      $('bRange').textContent = env.count === 0 ? '候補がありません'
        : env.count === 1 ? BS.dayLabel(env.min) + ' にしぼれた！'
        : env.contiguous ? BS.dayLabel(env.min) + ' 〜 ' + BS.dayLabel(env.max)
        : env.count + '日（' + BS.dayLabel(env.min) + '〜' + BS.dayLabel(env.max) + 'の間にとびとび）';

      // カレンダー色
      const ans = st.over ? st.over.day : null;
      let selRemain = 0;
      cells.forEach((c, i) => {
        const inSel = !st.over && st.sel.has(i);
        if (inSel && !st.out[i]) selRemain++;
        c.classList.toggle('is-out', st.out[i]);
        c.classList.toggle('is-sel', inSel);
        c.classList.toggle('is-answer', i === ans);
      });

      // 選択・消す
      $('bVerdict').textContent = st.sel.size === 0 ? 'カレンダーをタップ、またはドラッグして消したい範囲を選ぼう。'
        : st.sel.size === 1 ? selectionLabel() + 'を選択中'
        : selectionLabel() + '（' + st.sel.size + '日）を選択中';
      $('bErase').disabled = !!st.over || selRemain === 0 || (env.count - selRemain) < 1;
      $('bClearSel').disabled = !!st.over || st.sel.size === 0;

      // 宣言
      const dt = declTarget();
      $('bDeclare').textContent = dt != null ? '「' + BS.dayLabel(dt) + '」と宣言' : '…と宣言';
      $('bDeclare').disabled = !!st.over || st.pending != null || dt == null;
      $('bDeclareHint').textContent = env.count === 1
        ? '候補が1つになりました。自信をもって宣言しよう！'
        : 'まだ候補が' + env.count + '日あります。宣言するなら1日だけ選んで（運まかせの一発勝負！）';
      $('bJudge').classList.toggle('hide', st.pending == null);

      const res = $('bResult');
      res.replaceChildren();
      if (st.over) {
        const n = st.hist.length;
        const b = h('div', { class: 'banner ' + (st.over.hit ? 'banner--ok' : 'banner--ng') });
        if (st.over.hit) b.append(h('strong', { text: '当たり！ ' }), '消した回数 ' + n + ' 回で当てました。');
        else b.append(h('strong', { text: 'はずれ… ' }), '宣言は1回だけ。');
        b.append(h('br'), '（ちょうど半分ずつ消せば、どの誕生日でも 9 回以内で必ず当たる）');
        res.append(b, h('div', { class: 'row', style: 'margin-top: var(--space-2xs);' }, h('button', { class: 'btn btn--primary', text: '次の人へ（はじめから）', onclick: reset })));
      }

      // 記録
      const log = $('bLog');
      log.replaceChildren();
      if (!st.hist.length) log.append(h('tr', {}, h('td', { colspan: 3, class: 'muted', text: 'まだ消していません' })));
      st.hist.forEach((s, i) => {
        log.append(h('tr', {},
          h('td', { class: 'num', text: i + 1 }),
          h('td', { text: s.label + '（' + s.days.length + '日）' }),
          h('td', { class: 'num', text: s.remainingAfter + '日' })));
      });
      renderRecords();
    }

    function renderRecords() {
      const recs = store.get('bs.records', []);
      const tb = $('bRecords');
      tb.replaceChildren();
      if (!recs.length) { tb.append(h('tr', {}, h('td', { colspan: 3, class: 'muted', text: 'まだ記録はありません' }))); return; }
      recs.forEach((r, i) => tb.append(h('tr', {},
        h('td', { class: 'num', text: i + 1 }),
        h('td', { class: 'num', text: r.count + '回' }),
        h('td', {}, h('span', { class: 'tag ' + (r.hit ? 'tag--ok' : 'tag--ng'), text: r.hit ? '当たり' : 'はずれ' })))));
    }

    $('bErase').addEventListener('click', erase);
    $('bClearSel').addEventListener('click', clearSelection);
    $('bSelOdd').addEventListener('click', () => selectParity('odd'));
    $('bSelEven').addEventListener('click', () => selectParity('even'));
    $('bDeclare').addEventListener('click', declare);
    $('bHit').addEventListener('click', () => finish(true));
    $('bMiss').addEventListener('click', () => finish(false));
    $('bUndo').addEventListener('click', undo);
    $('bReset').addEventListener('click', reset);
    $('bClearRecords').addEventListener('click', () => {
      if (confirm('この端末に保存した記録をすべて消しますか？')) { store.set('bs.records', []); renderRecords(); }
    });
    reset();
  })();

  /* =========================================================
   * 2 箱の鍵さがし
   * ========================================================= */
  const shared = { lastBox: null }; // 決定木ページへの受け渡し

  (function boxes() {
    const st = { n: 8, key: 0, lo: 0, hi: 7, sel: null, hist: [], over: null, table: {} };
    const boxEls = [];
    const keySel = $('xKeySel');

    function fillKeySel() {
      const cur = keySel.value;
      keySel.replaceChildren();
      for (let i = 0; i < st.n; i++) keySel.append(h('option', { value: String(i), text: i + '番' }));
      keySel.value = (cur !== '' && +cur < st.n) ? cur : '0';
    }
    function newGame() {
      const key = +keySel.value;
      Object.assign(st, { key, lo: 0, hi: st.n - 1, sel: null, hist: [], over: null });
      build();
      render();
    }
    function build() {
      const wrap = $('xBoxes');
      wrap.replaceChildren(); boxEls.length = 0;
      wrap.style.setProperty('--n', Math.min(st.n, 8));
      for (let i = 0; i < st.n; i++) {
        const b = h('button', { type: 'button', class: 'box', 'aria-label': i + '番の箱' }, String(i));
        b.addEventListener('click', () => { if (!st.over) { st.sel = i; render(); } });
        boxEls.push(b); wrap.append(b);
      }
      if (!st.table[st.n]) st.table[st.n] = {};
    }

    function answer(isAfter) {
      if (st.over || st.lo === st.hi) return;
      const q = BS.halfSplit(st.lo, st.hi);
      st.hist.push({ lo: st.lo, hi: st.hi, q, isAfter });
      Object.assign(st, BS.applyAnswer(st.lo, st.hi, q, isAfter));
      if (st.lo === st.hi) st.sel = st.lo;
      render();
    }
    function declare() {
      if (st.sel == null || st.over) return;
      const hit = st.sel === st.key;
      st.over = { hit, pick: st.sel };
      st.table[st.n][st.key] = hit ? st.hist.length : '失敗';
      shared.lastBox = { n: st.n, key: st.key };
      render();
    }

    function render() {
      const count = st.hi - st.lo + 1;
      const q = BS.halfSplit(st.lo, st.hi);
      $('xCount').textContent = count;
      $('xAsked').textContent = st.hist.length;
      boxEls.forEach((b, i) => {
        b.className = 'box';
        const inR = i >= st.lo && i <= st.hi;
        if (st.over) {
          if (i === st.key) { b.classList.add('is-key'); b.replaceChildren(String(i), h('span', { class: 'box__key', text: '🔑' })); return; }
          if (i === st.over.pick) b.classList.add('is-open');
          else if (!inR) b.classList.add('is-out');
        } else {
          if (!inR) b.classList.add('is-out');
          if (i === st.sel) b.classList.add('is-selected');
          if (count > 1 && i === q) b.classList.add('is-mid');
        }
        b.replaceChildren(String(i));
      });

      const sel = st.sel;
      const verdict = $('xVerdict');
      verdict.replaceChildren();
      if (!st.over) {
        if (count === 1) verdict.append('候補は1つ。宣言しよう！');
        else verdict.append('鍵は' + q + '番より番号が大きいですか？　', h('span', { class: 'muted', text: '(mid > ' + q + ')' }));
      }
      $('xYes').disabled = !!st.over || count === 1;
      $('xNo').disabled = !!st.over || count === 1;
      $('xDeclare').disabled = sel == null || !!st.over;
      $('xDeclare').textContent = sel == null ? 'この箱だと宣言' : sel + '番だと宣言';

      const res = $('xResult');
      res.replaceChildren();
      if (st.over) {
        const b = h('div', { class: 'banner ' + (st.over.hit ? 'banner--ok' : 'banner--ng') });
        if (st.over.hit) b.append(h('strong', { text: '見つけた！ ' }), '質問 ' + st.hist.length + ' 回で ' + st.key + '番の鍵を見つけました。');
        else b.append(h('strong', { text: 'はずれ… ' }), '鍵は ' + st.key + '番にありました。');
        res.append(b, h('div', { class: 'row', style: 'margin-top: var(--space-2xs);' }, h('button', { class: 'btn btn--primary', text: 'もう一回（鍵をかくし直す）', onclick: newGame })));
      }

      const log = $('xLog');
      log.replaceChildren();
      if (!st.hist.length) log.append(h('li', { text: 'まだ質問していません' }));
      st.hist.forEach(s => {
        const r = BS.applyAnswer(s.lo, s.hi, s.q, s.isAfter);
        log.append(h('li', {}, '鍵は' + s.q + '番より番号が大きい？ → ', h('span', { class: 'tag ' + (s.isAfter ? 'tag--yes' : 'tag--no'), text: s.isAfter ? 'はい' : 'いいえ' }),
          '　のこり ' + (r.lo === r.hi ? r.lo + '番' : r.lo + '〜' + r.hi + '番') + '（' + (r.hi - r.lo + 1) + '個）'));
      });
      renderTable();
    }

    function renderTable() {
      const tb = $('xTable');
      tb.replaceChildren();
      const t = st.table[st.n] || {};
      const nums = Object.values(t).filter(v => typeof v === 'number');
      const max = nums.length ? Math.max(...nums) : null;
      for (let k = 0; k < st.n; k++) {
        const v = t[k];
        const tr = h('tr', {},
          h('td', { text: k + '番' }),
          h('td', { class: 'num', text: v == null ? '' : typeof v === 'number' ? v + '回' : v }));
        if (v != null && v === max) tr.classList.add('is-max');
        tb.append(tr);
      }
      const filled = Object.keys(t).length;
      $('xTableNote').textContent = filled
        ? filled + ' / ' + st.n + ' 個ためしました。' + (max != null ? 'あなたの最大は ' + max + ' 回。' : '')
        : '';
    }

    document.querySelectorAll('[data-xn]').forEach(b => b.addEventListener('click', () => {
      st.n = +b.dataset.xn; setPressed('[data-xn]', 'xn', st.n); fillKeySel(); newGame();
    }));
    $('xNew').addEventListener('click', newGame);
    keySel.addEventListener('change', newGame);
    $('xYes').addEventListener('click', () => answer(true));
    $('xNo').addEventListener('click', () => answer(false));
    $('xDeclare').addEventListener('click', declare);
    $('xClearTable').addEventListener('click', () => { st.table[st.n] = {}; renderTable(); });
    $('xToTree').addEventListener('click', () => { shared.toTree = { n: st.n, key: st.over ? st.key : null }; });
    fillKeySel();
    newGame();
  })();

  /* =========================================================
   * 3 線形探索と比較
   * ========================================================= */
  (function linear() {
    const N = 8;
    const st = { key: 0, lin: 0, linDone: false, lo: 0, hi: N - 1, binQ: 0, binDone: false, timer: null };
    const linEls = [], binEls = [];
    const sel = $('lKey');
    sel.append(h('option', { value: 'r', text: 'ランダム（ひみつ）' }));
    for (let i = 0; i < N; i++) sel.append(h('option', { value: i, text: i + '番' }));

    [['lLinBoxes', linEls], ['lBinBoxes', binEls]].forEach(([id, arr]) => {
      const w = $(id); w.style.setProperty('--n', N);
      for (let i = 0; i < N; i++) { const b = h('div', { class: 'box', 'aria-label': i + '番' }, String(i)); b.style.cursor = 'default'; arr.push(b); w.append(b); }
    });

    function reset() {
      clearInterval(st.timer); st.timer = null;
      st.key = sel.value === 'r' ? randInt(N) : +sel.value;
      Object.assign(st, { lin: 0, linDone: false, lo: 0, hi: N - 1, binQ: 0, binDone: false });
      $('lStart').textContent = 'スタート';
      $('lMsg').textContent = 'スタートを押すと、1秒ごとに1手ずつ進みます。';
      render();
    }
    function step() {
      if (!st.linDone) { st.lin++; if (st.lin - 1 === st.key) st.linDone = true; }
      if (!st.binDone) {
        if (st.lo < st.hi) {
          const q = BS.halfSplit(st.lo, st.hi);
          Object.assign(st, BS.applyAnswer(st.lo, st.hi, q, st.key > q));
          st.binQ++;
        }
        if (st.lo === st.hi) st.binDone = true;
      }
      if (st.linDone && st.binDone) {
        clearInterval(st.timer); st.timer = null;
        $('lStart').textContent = 'スタート';
        $('lMsg').textContent = '鍵は ' + st.key + '番。線形探索は ' + st.lin + ' 回、二分探索は ' + st.binQ + ' 回でした。';
      }
      render();
    }
    function start() {
      if (st.timer) { clearInterval(st.timer); st.timer = null; $('lStart').textContent = '再開'; return; }
      if (st.linDone && st.binDone) reset();
      $('lStart').textContent = '一時停止';
      step();
      st.timer = setInterval(step, 1000);
    }
    function render() {
      linEls.forEach((b, i) => {
        b.className = 'box';
        b.replaceChildren(String(i));
        if (i < st.lin) {
          if (i === st.key) { b.classList.add('is-key'); b.append(h('span', { class: 'box__key', text: '🔑' })); }
          else b.classList.add('is-open');
        }
      });
      binEls.forEach((b, i) => {
        b.className = 'box';
        b.replaceChildren(String(i));
        if (i < st.lo || i > st.hi) b.classList.add('is-out');
        else if (st.binDone) { b.classList.add('is-key'); b.append(h('span', { class: 'box__key', text: '🔑' })); }
      });
      $('lLinCount').textContent = st.lin;
      $('lBinCount').textContent = st.binQ;
      document.querySelectorAll('#lTable tr').forEach((tr, i) => tr.classList.toggle('is-max', Boolean(st.lin || st.binQ) && i === st.key));
    }

    const tb = $('lTable');
    for (let k = 0; k < N; k++) tb.append(h('tr', {}, h('td', { text: k + '番' }), h('td', { class: 'num', text: BS.linearCount(k) + '回' }), h('td', { class: 'num', text: BS.searchPath(0, N - 1, k, 'half').length + '回' })));
    const avgLin = (N + 1) / 2;
    $('lFoot').append(
      h('tr', {}, h('th', { text: '最大' }), h('th', { class: 'num', text: N + '回' }), h('th', { class: 'num', text: BS.questionsNeeded(N) + '回' })),
      h('tr', {}, h('th', { text: '平均' }), h('th', { class: 'num', text: avgLin + '回' }), h('th', { class: 'num', text: BS.questionsNeeded(N) + '回' })));

    sel.addEventListener('change', reset);
    $('lStart').addEventListener('click', start);
    $('lStep').addEventListener('click', () => { if (st.timer) { clearInterval(st.timer); st.timer = null; $('lStart').textContent = '再開'; } if (!(st.linDone && st.binDone)) step(); });
    $('lReset').addEventListener('click', reset);
    pages.linear = { onShow() {} };
    reset();
  })();

  /* =========================================================
   * 4 決定木
   * ========================================================= */
  (function tree() {
    const st = { n: 8, strat: 'half', level: 0, key: null };
    const keySel = $('tKey');
    const nBoxes = $('tNBoxes');

    function fillKeys() {
      keySel.replaceChildren(h('option', { value: '', text: 'なし' }));
      for (let i = 0; i < st.n; i++) keySel.append(h('option', { value: i, text: i + '番' }));
      keySel.value = st.key == null ? '' : st.key;
    }
    const MAX = 16; // 常に16枠を横1列で表示し、n個目までを色付け・残りは灰色にする。タップでそこまでの個数を選べる
    function renderNBoxes() {
      nBoxes.replaceChildren();
      for (let i = 0; i < MAX; i++) {
        const b = h('button', { type: 'button', class: 'box' + (i >= st.n ? ' is-out' : ''), 'aria-label': (i + 1) + '個にする', onclick: () => setN(i + 1) }, String(i));
        nBoxes.append(b);
      }
    }
    function setN(n) {
      n = Math.max(2, Math.min(MAX, n));
      st.n = n;
      if (st.key != null && st.key >= st.n) st.key = null;
      st.level = 0;
      fillKeys(); render();
    }
    function render() {
      renderNBoxes();
      const t = BS.buildDecisionTree(0, st.n - 1, st.strat);
      const depth = BS.treeDepth(t);
      if (st.level !== Infinity && st.level > depth) st.level = 0;
      const info = BSTree.render($('tWrap'), t, {
        level: st.level, pathKey: st.key, levelLabels: 'q', terms: {},
        onPick: v => { st.key = st.key === v ? null : v; keySel.value = st.key == null ? '' : st.key; render(); },
      });
      $('tNMinus').disabled = st.n <= 2;
      $('tNPlus').disabled = st.n >= MAX;
      $('tNLabel').textContent = st.n;
      $('tCountLabel').textContent = '箱の数';
      $('tCountUnit').textContent = '個';
      $('treeIntro').textContent = 'すべての場合をまとめて1本の木にした図。上から質問に答えていくと、必ず1つの箱にたどりつきます。木の高さ（段の数）＝必ず当てられる質問回数。';
      $('tLeavesUnit').textContent = '個';
      $('tDepth').textContent = info.maxDepth;
      $('tLeaves').textContent = st.n;
      $('tQs').textContent = st.n - 1;
      $('tLevelLabel').textContent = st.level === Infinity ? '全部' : st.level + '段目まで';
      const chain = BS.halvingChain(st.n).map(c => c + '個').join(' → ');
      $('tNote').textContent = st.strat === 'half'
        ? '半分ずつ：' + chain + '。どの箱でも最大 ' + depth + ' 回。分かれ道の数はいつも「箱の数−1」（トーナメントの試合数と同じ）。' + (st.key != null ? '　' + st.key + '番への道すじは ' + BS.searchPath(0, st.n - 1, st.key, 'half').length + ' 回。' : '　箱（葉）をタップすると、そこへの道すじが光ります。')
        : '端から聞くと、木が片側にのびて高くなります。運が悪いと ' + depth + ' 回。これは線形探索と同じ考え方です。';
    }
    $('tNMinus').addEventListener('click', () => setN(st.n - 1));
    $('tNPlus').addEventListener('click', () => setN(st.n + 1));
    document.querySelectorAll('[data-tstrat]').forEach(b => b.addEventListener('click', () => { st.strat = b.dataset.tstrat; setPressed('[data-tstrat]', 'tstrat', st.strat); st.level = 0; render(); }));
    keySel.addEventListener('change', () => { st.key = keySel.value === '' ? null : +keySel.value; render(); });
    const depthNow = () => BS.treeDepth(BS.buildDecisionTree(0, st.n - 1, st.strat));
    $('tPrev').addEventListener('click', () => { const d = depthNow(); st.level = st.level === Infinity ? d - 1 : Math.max(0, st.level - 1); render(); });
    $('tNext').addEventListener('click', () => { if (st.level === Infinity) return; st.level = st.level + 1 >= depthNow() ? Infinity : st.level + 1; render(); });
    $('tAll').addEventListener('click', () => { st.level = Infinity; render(); });

    pages.tree = {
      onShow() {
        if (shared.toTree) {
          st.n = shared.toTree.n; st.key = shared.toTree.key; st.strat = 'half'; st.level = 0;
          setPressed('[data-tstrat]', 'tstrat', 'half');
          shared.toTree = null;
        }
        fillKeys(); render();
      },
    };
    fillKeys(); render();
  })();

  /* =========================================================
   * 5 n個・大きな数
   * ========================================================= */
  (function scale() {
    const MAXLOG = 6; // スライダーは 1〜100万
    const st = { n: 8 };

    const presetDefs = [
      { v: 2, plain: '2' },
      { v: 4, plain: '4' },
      { v: 8, plain: '8' },
      { v: 16, plain: '16' },
      { v: 32, plain: '32' },
      { v: 100, plain: '100' },
      { v: 365, plain: '365（誕生日）' },
      { v: 10000, plain: '1万' },
      { v: 1000000, plain: '100万' },
    ];
    presetDefs.forEach(d => {
      $('sPresets').append(h('button', { class: 'btn btn--sm', type: 'button', text: d.plain, onclick: () => set(d.v, true) }));
    });

    const pow = $('sPow');
    const powEls = [];
    for (let e = 1; e <= 20; e++) {
      const c = h('div', { class: 'pow__c' }, h('div', { class: 'pow__e', text: '2の' + e + '乗' }), h('div', { class: 'pow__v', text: BS.formatNum(2 ** e) }));
      powEls.push(c); pow.append(c);
    }

    function set(n, fromOutside) {
      n = Math.max(1, Math.min(1e9, Math.round(n) || 1));
      st.n = n;
      if (fromOutside) { $('sN').value = n; $('sSlider').value = Math.round(Math.log10(n) / MAXLOG * 1000); }
      const q = BS.questionsNeeded(n);
      $('sBin').textContent = BS.formatNum(q);
      $('sLin').textContent = BS.formatNum(n);
      $('sBinTime').textContent = '1回1秒なら ' + BS.humanDuration(q);
      $('sLinTime').textContent = '1回1秒なら ' + BS.humanDuration(n);
      const chain = $('sChain');
      chain.replaceChildren();
      BS.halvingChain(n).forEach((c, i) => {
        if (i) chain.append(h('span', { class: 'arr', text: '→' }));
        chain.append(h('span', { class: 'c', text: BS.formatNum(c) }));
      });
      chain.append(h('span', { class: 'arr', text: '　（矢印の数＝' + q + '回）' }));
      let hit = false;
      powEls.forEach((c, i) => {
        const p = 2 ** (i + 1);
        const isHit = !hit && p >= n && n > 1;
        if (isHit) hit = true;
        c.classList.toggle('is-hit', isHit);
        c.classList.toggle('is-under', p < n);
      });
    }

    $('sN').addEventListener('input', e => set(+e.target.value || 1, false));
    $('sN').addEventListener('change', e => set(+e.target.value || 1, true));
    $('sSlider').addEventListener('input', e => { const n = Math.round(10 ** (+e.target.value / 1000 * MAXLOG)); $('sN').value = n; set(n, false); });

    // ワークシートの表（タップで答え）
    const ans = v => h('td', { class: 'ans num' }, h('button', { type: 'button', 'aria-label': '答えを表示', 'data-v': v, onclick: e => { e.currentTarget.classList.add('is-shown'); e.currentTarget.textContent = v; } }));
    const s6 = $('s6');
    const ns6 = [2, 4, 8, 16, 32];
    s6.append(h('thead', {}, h('tr', {}, h('th', { text: '箱の数 n' }), ...ns6.map(n => h('th', { class: 'num', text: n + '個' })))));
    s6.append(h('tbody', {}, h('tr', {}, h('th', { text: '必要な質問回数' }), ...ns6.map(n => ans(BS.questionsNeeded(n) + '回')))));
    const s7 = $('s7');
    const ns7Defs = [
      { v: 100, plain: '100個' },
      { v: 10000, plain: '1万個' },
      { v: 1000000, plain: '100万個' },
      { v: 365, plain: '365個（誕生日）' },
    ];
    function renderS7() {
      s7.replaceChildren();
      s7.append(h('thead', {}, h('tr', {}, h('th', { text: '' }),
        ...ns7Defs.map(d => h('th', { class: 'num', style: 'white-space: pre-line;', text: d.plain })))));
      s7.append(h('tbody', {},
        h('tr', {}, h('th', { text: '線形探索（最大）' }), ...ns7Defs.map(d => ans(BS.formatNum(d.v) + '回'))),
        h('tr', {}, h('th', { text: '二分探索' }), ...ns7Defs.map(d => ans(BS.questionsNeeded(d.v) + '回')))));
      $('s7Note').textContent = '100個 → 100万個（1万倍）になっても、二分探索は 7回 → 20回（約3倍）。';
    }
    renderS7();
    document.querySelectorAll('[data-reveal]').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('#' + b.dataset.reveal + ' .ans button').forEach(x => { x.classList.add('is-shown'); x.textContent = x.dataset.v; });
    }));

    const tt = $('sTime');
    tt.append(h('thead', {}, h('tr', {}, h('th', { text: '件数' }), h('th', { class: 'num', text: '線形探索' }), h('th', { class: 'num', text: '二分探索' }))));
    const tbody = h('tbody', {});
    [[8, '8個'], [365, '365個'], [10000, '1万個'], [1000000, '100万個'], [100000000, '1億個']].forEach(([n, l]) =>
      tbody.append(h('tr', {}, h('td', { text: l }), h('td', { class: 'num', text: BS.humanDuration(n) }), h('td', { class: 'num', text: BS.humanDuration(BS.questionsNeeded(n)) }))));
    tt.append(tbody);

    set(8, true);
  })();

  /* =========================================================
   * 6 まとめ・豆知識（一致確認あり方式）
   * ========================================================= */
  (function summary() {
    const N = 8;
    let key = null;
    const tb = $('mTable');
    const a = [], b = [];
    for (let k = 0; k < N; k++) {
      a.push(BS.searchPath(0, N - 1, k, 'half').length);
      b.push(BS.matchCount(0, N - 1, k));
      const tr = h('tr', { style: 'cursor: pointer;' }, h('td', { text: k + '番' }), h('td', { class: 'num', text: a[k] + '回' }), h('td', { class: 'num', text: b[k] + '回' }));
      tr.addEventListener('click', () => { key = key === k ? null : k; render(); });
      tb.append(tr);
    }
    const sum = arr => arr.reduce((x, y) => x + y, 0);
    $('mFoot').append(
      h('tr', {}, h('th', { text: 'いちばん少ない' }), h('th', { class: 'num', text: Math.min(...a) + '回' }), h('th', { class: 'num', text: Math.min(...b) + '回' })),
      h('tr', {}, h('th', { text: 'いちばん多い' }), h('th', { class: 'num', text: Math.max(...a) + '回' }), h('th', { class: 'num', text: Math.max(...b) + '回' })),
      h('tr', {}, h('th', { text: '平均' }), h('th', { class: 'num', text: (sum(a) / N) + '回' }), h('th', { class: 'num', text: (sum(b) / N) + '回' })));
    function render() {
      document.querySelectorAll('#mTable tr').forEach((tr, i) => tr.classList.toggle('is-max', i === key));
      BSTree.render($('mTree'), BS.buildMatchTree(0, N - 1), { pathKey: key, levelLabels: 'm', onPick: v => { key = key === v ? null : v; render(); } });
    }
    render();
  })();

  route();
})();
