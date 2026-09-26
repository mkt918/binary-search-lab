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
    const st = { mode: 'human', lo: 0, hi: N - 1, q: 0, hist: [], secret: 0, over: null, pending: null, scenario: 'plain' };
    const cells = [];

    // 企業活動の場面への置き換え（学習指導要領「企業活動の改善」との接続。docs 6-1）
    const BSCEN = {
      plain: {
        unit: '日', noun: '誕生日',
        intro: 'カレンダーの日付をタップすると「その日より後ですか？」の質問になります。',
        hint: '',
      },
      biz: {
        unit: '件', noun: '会員の誕生日',
        intro: 'カレンダーの日付をタップすると「その日より後ですか？」の質問になります。会員データベースから、誕生日特典を送りたい会員の誕生日を確認する場面だと考えよう。',
        hint: '商業科の「顧客管理（CRM）」につなげて、会員データベースの中から会員の誕生日を絞りこむ場面として考えます。',
      },
    };

    // カレンダー
    const cal = $('bCal');
    for (let m = 1; m <= 12; m++) {
      const row = h('div', { class: 'cal__row' }, h('span', { class: 'cal__m', text: m + '月' }));
      for (let d = 1; d <= 31; d++) {
        if (d > BS.MONTH_DAYS[m - 1]) { row.append(h('span', { class: 'cal__d cal__d--none' })); continue; }
        const day = BS.dateToDay(m, d);
        const b = h('button', { type: 'button', class: 'cal__d', title: m + '月' + d + '日', 'aria-label': m + '月' + d + '日' });
        b.addEventListener('click', () => { if (!st.over) { st.q = day; render(); } });
        cells[day] = b;
        row.append(b);
      }
      cal.append(row);
    }
    // 月・日セレクト
    const selM = $('bMonth'), selD = $('bDay');
    for (let m = 1; m <= 12; m++) selM.append(h('option', { value: m, text: m + '月' }));
    function fillDays(m) {
      selD.replaceChildren();
      for (let d = 1; d <= BS.MONTH_DAYS[m - 1]; d++) selD.append(h('option', { value: d, text: d + '日' }));
    }
    selM.addEventListener('change', () => { fillDays(+selM.value); st.q = BS.dateToDay(+selM.value, +selD.value); render(); });
    selD.addEventListener('change', () => { st.q = BS.dateToDay(+selM.value, +selD.value); render(); });

    function reset() {
      Object.assign(st, { lo: 0, hi: N - 1, hist: [], over: null, pending: null, secret: randInt(N) });
      st.q = BS.halfSplit(st.lo, st.hi);
      render();
    }

    function answer(isAfter) {
      if (st.over || st.pending != null) return;
      st.hist.push({ lo: st.lo, hi: st.hi, q: st.q, isAfter });
      Object.assign(st, BS.applyAnswer(st.lo, st.hi, st.q, isAfter));
      st.q = BS.halfSplit(st.lo, st.hi);
      render();
    }

    const declTarget = () => (st.lo === st.hi ? st.lo : st.q);

    function finish(hit, day) {
      st.over = { hit, day };
      st.pending = null;
      const recs = store.get('bs.records', []);
      recs.push({ asker: $('bAsker').value.trim() || '—', guess: $('bGuess').value || '', count: st.hist.length, hit });
      store.set('bs.records', recs);
      render();
    }

    function declare() {
      if (st.over) return;
      const day = declTarget();
      if (st.mode === 'cpu') finish(day === st.secret, day);
      else { st.pending = day; render(); }
    }

    function undo() {
      if (st.over) {
        st.over = null;
        const recs = store.get('bs.records', []); recs.pop(); store.set('bs.records', recs);
      } else if (st.pending != null) st.pending = null;
      else if (st.hist.length) { const last = st.hist.pop(); Object.assign(st, { lo: last.lo, hi: last.hi, q: last.q }); }
      render();
    }

    function render() {
      const sc = BSCEN[st.scenario];
      $('bCountUnit').textContent = sc.unit;
      const count = st.hi - st.lo + 1;
      $('bCount').textContent = count;
      $('bAsked').textContent = st.hist.length;
      $('bLeft').textContent = BS.questionsNeeded(count);
      $('bRange').textContent = count === 1 ? BS.dayLabel(st.lo) + ' にしぼれた！' : BS.dayLabel(st.lo) + ' 〜 ' + BS.dayLabel(st.hi);

      // カレンダー色
      const ans = st.over ? st.over.day : null;
      cells.forEach((c, i) => {
        const inR = i >= st.lo && i <= st.hi;
        c.classList.toggle('is-out', !inR);
        c.classList.toggle('is-yesside', inR && !st.over && count > 1 && i > st.q);
        c.classList.toggle('is-q', !st.over && i === st.q && count > 1);
        c.classList.toggle('is-answer', i === ans || (st.mode === 'cpu' && st.over && i === st.secret));
      });

      // 質問
      const t = BS.dayToDate(st.q);
      selM.value = t.m; fillDays(t.m); selD.value = t.d;
      const canAsk = !st.over && st.pending == null && count > 1;
      ['bYes', 'bNo', 'bAsk'].forEach(id => ($(id).disabled = !canAsk));
      $('bAnswerHuman').classList.toggle('hide', st.mode !== 'human');
      $('bAnswerCpu').classList.toggle('hide', st.mode !== 'cpu');
      $('bVerdict').textContent = (!st.over && count === 1) ? '候補は1つ。もう質問はいりません。宣言しよう！' : '';

      // 宣言
      $('bDeclare').textContent = '「' + BS.dayLabel(declTarget()) + '」と宣言';
      $('bDeclare').disabled = !!st.over || st.pending != null;
      $('bDeclareHint').textContent = count === 1
        ? '候補が1つになりました。自信をもって宣言しよう！'
        : 'まだ候補が' + count + sc.unit + 'あります。いま宣言すると、選んでいる日付で運まかせの一発勝負！';
      $('bJudge').classList.toggle('hide', st.pending == null);

      const res = $('bResult');
      res.replaceChildren();
      if (st.over) {
        const n = st.hist.length;
        const g = $('bGuess').value;
        const b = h('div', { class: 'banner ' + (st.over.hit ? 'banner--ok' : 'banner--ng') });
        if (st.over.hit) b.append(h('strong', { text: '当たり！ ' }), '質問 ' + n + ' 回で当てました。');
        else b.append(h('strong', { text: 'はずれ… ' }), st.mode === 'cpu' ? '正解は ' + BS.dayLabel(st.secret) + ' でした。' : '宣言は1回だけ。');
        if (g) b.append(h('br'), '予想は ' + g + ' 回でした。');
        b.append(h('br'), '（ちょうど半分ずつなら、どの' + sc.noun + 'でも 9 回以内で必ず当たる）');
        res.append(b, h('div', { class: 'row', style: 'margin-top: var(--space-2xs);' }, h('button', { class: 'btn btn--primary', text: '次の人へ（はじめから）', onclick: reset })));
      }

      // 記録
      const log = $('bLog');
      log.replaceChildren();
      if (!st.hist.length) log.append(h('tr', {}, h('td', { colspan: 5, class: 'muted', text: 'まだ質問していません' })));
      st.hist.forEach((s, i) => {
        const r = BS.applyAnswer(s.lo, s.hi, s.q, s.isAfter);
        log.append(h('tr', {},
          h('td', { class: 'num', text: i + 1 }),
          h('td', { text: BS.dayLabel(s.q) + 'より後？' }),
          h('td', {}, h('span', { class: 'tag ' + (s.isAfter ? 'tag--yes' : 'tag--no'), text: s.isAfter ? 'はい' : 'いいえ' })),
          h('td', { text: r.lo === r.hi ? BS.dayLabel(r.lo) : BS.dayLabel(r.lo) + '〜' + BS.dayLabel(r.hi) }),
          h('td', { class: 'num', text: (r.hi - r.lo + 1) + sc.unit })));
      });
      renderRecords();
    }

    function renderRecords() {
      const recs = store.get('bs.records', []);
      const tb = $('bRecords');
      tb.replaceChildren();
      if (!recs.length) { tb.append(h('tr', {}, h('td', { colspan: 5, class: 'muted', text: 'まだ記録はありません' }))); return; }
      recs.forEach((r, i) => tb.append(h('tr', {},
        h('td', { class: 'num', text: i + 1 }),
        h('td', { text: r.asker }),
        h('td', { class: 'num', text: r.guess ? r.guess + '回' : '—' }),
        h('td', { class: 'num', text: r.count + '回' }),
        h('td', {}, h('span', { class: 'tag ' + (r.hit ? 'tag--ok' : 'tag--ng'), text: r.hit ? '当たり' : 'はずれ' })))));
    }

    document.querySelectorAll('[data-bmode]').forEach(b => b.addEventListener('click', () => {
      st.mode = b.dataset.bmode; setPressed('[data-bmode]', 'bmode', st.mode); reset();
    }));
    document.querySelectorAll('[data-bscen]').forEach(b => b.addEventListener('click', () => {
      st.scenario = b.dataset.bscen; setPressed('[data-bscen]', 'bscen', st.scenario);
      const sc = BSCEN[st.scenario];
      $('birthdayIntro').textContent = sc.intro;
      $('bScenarioHint').textContent = sc.hint;
      render();
    }));
    $('bYes').addEventListener('click', () => answer(true));
    $('bNo').addEventListener('click', () => answer(false));
    $('bAsk').addEventListener('click', () => answer(st.secret > st.q));
    $('bDeclare').addEventListener('click', declare);
    $('bHit').addEventListener('click', () => finish(true, st.pending));
    $('bMiss').addEventListener('click', () => finish(false, st.pending));
    $('bUndo').addEventListener('click', undo);
    $('bReset').addEventListener('click', reset);
    $('bGuess').addEventListener('input', () => { if (st.over) render(); });
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
    const st = { n: 8, key: 0, lo: 0, hi: 7, sel: null, hist: [], over: null, table: {}, scenario: 'plain' };
    const boxEls = [];

    // 企業活動の場面への置き換え（学習指導要領「企業活動の改善」との接続。docs 6-1）
    const XSCEN = {
      plain: {
        intro: 'どれか1つの箱に鍵が入っています。箱をタップして選び、「〇番より後ですか？」と質問しよう。鍵がどの箱でも、ちょうど半分に分ければ同じ回数で見つかるかな？',
        hint: '', newBtn: '新しく鍵をかくす', verdictIdle: '箱をタップして選んでください', declareIdle: 'この箱だと宣言',
        tableIntro: '鍵を見つけるたびに、その箱の欄に質問回数が入ります。全部の箱を試してみよう。', tableHead: '鍵が入っていた箱',
        found: n => '質問 ' + n + ' 回で ' + st.key + '番の鍵を見つけました。', missed: () => '鍵は ' + st.key + '番にありました。',
        again: 'もう一回（鍵をかくし直す）',
      },
      biz: {
        intro: '倉庫の棚のどれか1つに、目的の商品が置かれています。棚をタップして選び、「〇番より後ですか？」と質問しよう。商品がどの棚にあっても、ちょうど半分に分ければ同じ回数で見つかるかな？',
        hint: '商業科の「企業活動の改善」につなげて、倉庫の棚から目的の商品を探す場面として考えます。',
        newBtn: '商品を置き直す', verdictIdle: '棚をタップして選んでください', declareIdle: 'この棚だと宣言',
        tableIntro: '商品を見つけるたびに、その棚の欄に質問回数が入ります。全部の棚を試してみよう。', tableHead: '商品があった棚',
        found: n => '質問 ' + n + ' 回で ' + st.key + '番の棚から商品を見つけました。', missed: () => '商品は ' + st.key + '番の棚にありました。',
        again: 'もう一回（商品を置き直す）',
      },
    };

    function newGame() {
      Object.assign(st, { key: randInt(st.n), lo: 0, hi: st.n - 1, sel: null, hist: [], over: null });
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

    function ask() {
      if (st.sel == null || st.over) return;
      const isAfter = st.key > st.sel;
      st.hist.push({ lo: st.lo, hi: st.hi, q: st.sel, isAfter });
      Object.assign(st, BS.applyAnswer(st.lo, st.hi, st.sel, isAfter));
      st.sel = st.lo === st.hi ? st.lo : null;
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
      const sc = XSCEN[st.scenario];
      const count = st.hi - st.lo + 1;
      $('xCount').textContent = count;
      $('xAsked').textContent = st.hist.length;
      $('xLeft').textContent = BS.questionsNeeded(count);
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
        }
        b.replaceChildren(String(i));
      });

      const sel = st.sel;
      $('xVerdict').textContent = st.over ? '' : count === 1 ? '候補は1つ。宣言しよう！' : sel == null ? sc.verdictIdle : '';
      $('xAsk').disabled = sel == null || !!st.over || count === 1;
      $('xAsk').textContent = sel == null ? '選んだ番号より後ですか？' : sel + '番より後ですか？';
      $('xDeclare').disabled = sel == null || !!st.over;
      $('xDeclare').textContent = sel == null ? sc.declareIdle : sel + '番だと宣言';

      const res = $('xResult');
      res.replaceChildren();
      if (st.over) {
        const b = h('div', { class: 'banner ' + (st.over.hit ? 'banner--ok' : 'banner--ng') });
        if (st.over.hit) b.append(h('strong', { text: '見つけた！ ' }), sc.found(st.hist.length));
        else b.append(h('strong', { text: 'はずれ… ' }), sc.missed());
        res.append(b, h('div', { class: 'row', style: 'margin-top: var(--space-2xs);' }, h('button', { class: 'btn btn--primary', text: sc.again, onclick: newGame })));
      }

      const log = $('xLog');
      log.replaceChildren();
      if (!st.hist.length) log.append(h('li', { text: 'まだ質問していません' }));
      st.hist.forEach(s => {
        const r = BS.applyAnswer(s.lo, s.hi, s.q, s.isAfter);
        log.append(h('li', {}, s.q + '番より後？ → ', h('span', { class: 'tag ' + (s.isAfter ? 'tag--yes' : 'tag--no'), text: s.isAfter ? 'はい' : 'いいえ' }),
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
      st.n = +b.dataset.xn; setPressed('[data-xn]', 'xn', st.n); newGame();
    }));
    document.querySelectorAll('[data-xscen]').forEach(b => b.addEventListener('click', () => {
      st.scenario = b.dataset.xscen; setPressed('[data-xscen]', 'xscen', st.scenario);
      const sc = XSCEN[st.scenario];
      $('boxesIntro').textContent = sc.intro;
      $('xScenarioHint').textContent = sc.hint;
      $('xNew').textContent = sc.newBtn;
      $('xTableIntro').textContent = sc.tableIntro;
      $('xTableHeadKey').textContent = sc.tableHead;
      render();
    }));
    $('xNew').addEventListener('click', newGame);
    $('xAsk').addEventListener('click', ask);
    $('xDeclare').addEventListener('click', declare);
    $('xClearTable').addEventListener('click', () => { st.table[st.n] = {}; renderTable(); });
    $('xToTree').addEventListener('click', () => { shared.toTree = { n: st.n, key: st.over ? st.key : null }; });
    newGame();
  })();

  /* =========================================================
   * 3 線形探索と比較
   * ========================================================= */
  (function linear() {
    const N = 8;
    const st = { key: 0, lin: 0, linDone: false, lo: 0, hi: N - 1, binQ: 0, binDone: false, timer: null, scenario: 'plain' };
    const linEls = [], binEls = [];
    const sel = $('lKey');
    sel.append(h('option', { value: 'r', text: 'ランダム（ひみつ）' }));
    for (let i = 0; i < N; i++) sel.append(h('option', { value: i, text: i + '番' }));

    // 企業活動の場面への置き換え（学習指導要領「企業活動の改善」との接続。docs 6-1）
    const LSCEN = {
      plain: {
        keyLabel: '鍵の場所', linName: '線形探索（端から開ける）', binName: '二分探索（半分に分ける）',
        tableHead: '鍵の箱', hint: '',
        introHTML: '同じ8個の箱を、0番から順番に開けて調べるのが<b>線形探索</b>。同じ場所に鍵をかくして、二分探索と同時にスタートしてみよう。',
        footNote: '線形探索は「調べた箱の数」で数えます。8個なら最大8回。二分探索は比較質問3回で必ず1つにしぼれます。',
        found: (key, lin, bin) => '鍵は ' + key + '番。線形探索は ' + lin + ' 回、二分探索は ' + bin + ' 回でした。',
      },
      biz: {
        keyLabel: '商品の場所', linName: '線形探索（端の棚から順に見る）', binName: '二分探索（半分に分ける）',
        tableHead: '商品がある棚', hint: '商業科の「企業活動の改善」につなげて、倉庫の棚から目的の商品を探す場面として考えます。',
        introHTML: '同じ8個の棚を、0番から順番に見て調べるのが<b>線形探索</b>。同じ場所に商品を置いて、二分探索と同時にスタートしてみよう。',
        footNote: '線形探索は「調べた棚の数」で数えます。8個なら最大8回。二分探索は比較質問3回で必ず1つにしぼれます。',
        found: (key, lin, bin) => '商品は ' + key + '番の棚。線形探索は ' + lin + ' 回、二分探索は ' + bin + ' 回でした。',
      },
    };

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
        $('lMsg').textContent = LSCEN[st.scenario].found(st.key, st.lin, st.binQ);
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
    document.querySelectorAll('[data-lscen]').forEach(b => b.addEventListener('click', () => {
      st.scenario = b.dataset.lscen; setPressed('[data-lscen]', 'lscen', st.scenario);
      const sc = LSCEN[st.scenario];
      $('lKeyLabel').textContent = sc.keyLabel;
      $('lLinName').textContent = sc.linName;
      $('lBinName').textContent = sc.binName;
      $('lTableHeadKey').textContent = sc.tableHead;
      $('lScenarioHint').textContent = sc.hint;
      $('linearIntro').innerHTML = sc.introHTML;
      $('lFootNote').textContent = sc.footNote;
      reset();
    }));
    pages.linear = { onShow() {} };
    reset();
  })();

  /* =========================================================
   * 4 決定木
   * ========================================================= */
  (function tree() {
    const st = { n: 8, strat: 'half', level: Infinity, key: null, scenario: 'plain' };
    const keySel = $('tKey');

    // 企業活動の場面への置き換え（学習指導要領「企業活動の改善」との接続。docs 6-1）
    const SCEN = {
      plain: {
        countLabel: '箱の数', countUnit: '個', itemLabel: i => i + '番',
        intro: 'すべての場合をまとめて1本の木にした図。上から質問に答えていくと、必ず1つの箱にたどりつきます。木の高さ（段の数）＝必ず当てられる質問回数。',
        leafTapNote: '箱（葉）をタップすると、そこへの道すじが光ります。',
        terms: {},
      },
      biz: {
        countLabel: '名簿の人数', countUnit: '人', itemLabel: i => i + '番の社員',
        intro: 'すべての場合をまとめて1本の木にした図。上から質問に答えていくと、必ず1人の社員にたどりつきます。木の高さ（段の数）＝必ず当てられる質問回数。',
        leafTapNote: '社員（葉）をタップすると、そこへの道すじが光ります。',
        terms: {
          question: q => q + '番の社員より後ですか？',
          leafAria: v => v + '番の社員',
          countUnit: '人',
        },
      },
    };

    function fillKeys() {
      const sc = SCEN[st.scenario];
      keySel.replaceChildren(h('option', { value: '', text: 'なし' }));
      for (let i = 0; i < st.n; i++) keySel.append(h('option', { value: i, text: sc.itemLabel(i) }));
      keySel.value = st.key == null ? '' : st.key;
    }
    function render() {
      const sc = SCEN[st.scenario];
      const t = BS.buildDecisionTree(0, st.n - 1, st.strat);
      const depth = BS.treeDepth(t);
      if (st.level > depth) st.level = Infinity;
      const info = BSTree.render($('tWrap'), t, {
        level: st.level, pathKey: st.key, levelLabels: 'q', terms: sc.terms,
        onPick: v => { st.key = st.key === v ? null : v; keySel.value = st.key == null ? '' : st.key; render(); },
      });
      $('tNLabel').textContent = st.n;
      $('tCountLabel').textContent = sc.countLabel;
      $('tCountUnit').textContent = sc.countUnit;
      $('treeIntro').textContent = sc.intro;
      $('tLeavesUnit').textContent = sc.countUnit;
      $('tDepth').textContent = info.maxDepth;
      $('tLeaves').textContent = st.n;
      $('tQs').textContent = st.n - 1;
      $('tLevelLabel').textContent = st.level === Infinity ? '全部' : st.level + '段目まで';
      const chain = BS.halvingChain(st.n).map(c => c + sc.countUnit).join(' → ');
      const countNoun = st.scenario === 'biz' ? '社員' : '箱';
      $('tNote').textContent = st.strat === 'half'
        ? '半分ずつ：' + chain + '。どの' + countNoun + 'でも最大 ' + depth + ' 回。分かれ道の数はいつも「' + sc.countLabel + '−1」（トーナメントの試合数と同じ）。' + (st.key != null ? '　' + sc.itemLabel(st.key) + 'への道すじは ' + BS.searchPath(0, st.n - 1, st.key, 'half').length + ' 回。' : '　' + sc.leafTapNote)
        : '端から聞くと、木が片側にのびて高くなります。運が悪いと ' + depth + ' 回。これは線形探索と同じ考え方です。';
      $('tScenarioHint').textContent = st.scenario === 'biz'
        ? '商業科の「企業活動の改善」につなげて、社員名簿の中から目的の社員をどう絞り込むか考えます。'
        : '';
    }
    $('tN').addEventListener('input', e => { st.n = +e.target.value; if (st.key != null && st.key >= st.n) st.key = null; st.level = Infinity; fillKeys(); render(); });
    document.querySelectorAll('[data-tstrat]').forEach(b => b.addEventListener('click', () => { st.strat = b.dataset.tstrat; setPressed('[data-tstrat]', 'tstrat', st.strat); st.level = Infinity; render(); }));
    document.querySelectorAll('[data-tscen]').forEach(b => b.addEventListener('click', () => { st.scenario = b.dataset.tscen; setPressed('[data-tscen]', 'tscen', st.scenario); fillKeys(); render(); }));
    keySel.addEventListener('change', () => { st.key = keySel.value === '' ? null : +keySel.value; render(); });
    const depthNow = () => BS.treeDepth(BS.buildDecisionTree(0, st.n - 1, st.strat));
    $('tPrev').addEventListener('click', () => { const d = depthNow(); st.level = st.level === Infinity ? d - 1 : Math.max(0, st.level - 1); render(); });
    $('tNext').addEventListener('click', () => { if (st.level === Infinity) return; st.level = st.level + 1 >= depthNow() ? Infinity : st.level + 1; render(); });
    $('tAll').addEventListener('click', () => { st.level = Infinity; render(); });

    pages.tree = {
      onShow() {
        if (shared.toTree) {
          st.n = shared.toTree.n; st.key = shared.toTree.key; st.strat = 'half'; st.level = Infinity;
          $('tN').value = st.n; setPressed('[data-tstrat]', 'tstrat', 'half');
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
    const st = { n: 8, scenario: 'plain' };

    // 企業活動の場面への置き換え（学習指導要領「企業活動の改善」との接続。docs 6-1）
    const presetDefs = [
      { v: 2, plain: '2' },
      { v: 4, plain: '4' },
      { v: 8, plain: '8' },
      { v: 16, plain: '16' },
      { v: 32, plain: '32' },
      { v: 100, plain: '100', biz: '社員100人' },
      { v: 365, plain: '365（誕生日）' },
      { v: 10000, plain: '1万', biz: '顧客1万人' },
      { v: 1000000, plain: '100万', biz: '商品100万件' },
    ];
    const bizFull = { 100: '社員100人の名簿', 10000: '顧客1万人の会員番号', 1000000: '商品100万件の商品コード' };
    const presetLabel = d => (st.scenario === 'biz' && d.biz) ? d.biz : d.plain;
    const presetBtns = presetDefs.map(d => {
      const b = h('button', { class: 'btn btn--sm', type: 'button', text: presetLabel(d), onclick: () => set(d.v, true) });
      $('sPresets').append(b);
      return { d, b };
    });
    function refreshPresetLabels() { presetBtns.forEach(({ d, b }) => { b.textContent = presetLabel(d); }); }

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
      const note = $('sScenarioNote');
      if (st.scenario === 'biz' && bizFull[n]) note.textContent = '（' + bizFull[n] + 'から探しているとして）';
      else note.textContent = '';
    }

    $('sN').addEventListener('input', e => set(+e.target.value || 1, false));
    $('sN').addEventListener('change', e => set(+e.target.value || 1, true));
    $('sSlider').addEventListener('input', e => { const n = Math.round(10 ** (+e.target.value / 1000 * MAXLOG)); $('sN').value = n; set(n, false); });
    document.querySelectorAll('[data-scen]').forEach(b => b.addEventListener('click', () => {
      st.scenario = b.dataset.scen; setPressed('[data-scen]', 'scen', st.scenario);
      refreshPresetLabels(); renderS7();
      $('sScenarioHint').textContent = st.scenario === 'biz'
        ? '商業科の「企業活動の改善」につなげて、社員名簿・顧客の会員番号・商品コードで探索を考えます。'
        : '';
      set(st.n, false);
    }));

    // ワークシートの表（タップで答え）
    const ans = v => h('td', { class: 'ans num' }, h('button', { type: 'button', 'aria-label': '答えを表示', 'data-v': v, onclick: e => { e.currentTarget.classList.add('is-shown'); e.currentTarget.textContent = v; } }));
    const s6 = $('s6');
    const ns6 = [2, 4, 8, 16, 32];
    s6.append(h('thead', {}, h('tr', {}, h('th', { text: '箱の数 n' }), ...ns6.map(n => h('th', { class: 'num', text: n + '個' })))));
    s6.append(h('tbody', {}, h('tr', {}, h('th', { text: '必要な質問回数' }), ...ns6.map(n => ans(BS.questionsNeeded(n) + '回')))));
    const s7 = $('s7');
    const ns7Defs = [
      { v: 100, plain: '100個', biz: '社員100人\n（名簿）' },
      { v: 10000, plain: '1万個', biz: '顧客1万人\n（会員番号）' },
      { v: 1000000, plain: '100万個', biz: '商品100万件\n（商品コード）' },
      { v: 365, plain: '365個（誕生日）' },
    ];
    const s7Label = d => (st.scenario === 'biz' && d.biz) ? d.biz : d.plain;
    function renderS7() {
      s7.replaceChildren();
      s7.append(h('thead', {}, h('tr', {}, h('th', { text: '' }),
        ...ns7Defs.map(d => h('th', { class: 'num', style: 'white-space: pre-line;', text: s7Label(d) })))));
      s7.append(h('tbody', {},
        h('tr', {}, h('th', { text: '線形探索（最大）' }), ...ns7Defs.map(d => ans(BS.formatNum(d.v) + '回'))),
        h('tr', {}, h('th', { text: '二分探索' }), ...ns7Defs.map(d => ans(BS.questionsNeeded(d.v) + '回')))));
      $('s7Note').textContent = st.scenario === 'biz'
        ? '社員100人の名簿 → 商品100万件の商品コード（1万倍）になっても、二分探索は 7回 → 20回（約3倍）。'
        : '100個 → 100万個（1万倍）になっても、二分探索は 7回 → 20回（約3倍）。';
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
   * 6 並びが大事
   * ========================================================= */
  (function sorted() {
    const N = 8;
    const st = { base: [], order: 'shuffle', arr: [], target: 0, steps: null, idx: 0, scenario: 'plain' };
    const cardEls = [];
    const w = $('oCards');
    for (let i = 0; i < N; i++) { const c = h('div', { class: 'ncard' }); cardEls.push(c); w.append(c); }

    // 企業活動の場面への置き換え（学習指導要領「企業活動の改善」との接続。docs 6-1）
    const OSCEN = {
      plain: {
        intro: 'カードに数が書いてあります。真ん中のカードとくらべて「探す数のほうが大きいから右半分へ」と進めるのが二分探索。数がバラバラに並んでいたら、どうなるかな？',
        targetLabel: '探す数', hint: '', noun: '数 ',
      },
      biz: {
        intro: '商品コードが書かれたカードがあります。真ん中のカードとくらべて「探す商品コードのほうが大きいから右半分へ」と進めるのが二分探索。商品コードがバラバラに並んでいたら、どうなるかな？',
        targetLabel: '探す商品コード', hint: '商業科の「企業活動の改善」につなげて、商品コードの一覧から目的の商品を探す場面として考えます。', noun: '商品コード ',
      },
    };

    function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

    function newCards() {
      // バラバラのとき二分探索で見つからない数があるような並びを作る
      for (let tries = 0; tries < 200; tries++) {
        const set = new Set();
        while (set.size < N) set.add(1 + randInt(99));
        const vals = [...set];
        const sh = shuffle(vals);
        const fails = vals.filter(v => !BS.binarySearchSteps(sh, v).found);
        if (fails.length) { st.base = sh; st.target = fails[randInt(fails.length)]; break; }
      }
      st.order = 'shuffle'; setPressed('[data-sorder]', 'sorder', 'shuffle');
      fillTargets(); restart();
    }
    function fillTargets() {
      const sel = $('oTarget');
      sel.replaceChildren();
      st.base.slice().sort((a, b) => a - b).forEach(v => sel.append(h('option', { value: v, text: v })));
      sel.value = st.target;
    }
    function restart() {
      st.arr = st.order === 'sorted' ? st.base.slice().sort((a, b) => a - b) : st.base.slice();
      st.steps = BS.binarySearchSteps(st.arr, st.target);
      st.idx = 0;
      render();
    }
    function render() {
      const cur = st.idx > 0 ? st.steps.steps[st.idx - 1] : null;
      const done = st.idx >= st.steps.steps.length && st.idx > 0;
      const trueIdx = st.arr.indexOf(st.target);
      cardEls.forEach((c, i) => {
        c.className = 'ncard';
        c.textContent = st.arr[i];
        if (i === trueIdx) c.classList.add('is-target');
        if (cur) {
          // 現在の比較のあとに残る範囲を表示
          let lo = cur.lo, hi = cur.hi;
          if (cur.cmp > 0) lo = cur.mid + 1; else if (cur.cmp < 0) hi = cur.mid - 1;
          if (cur.cmp !== 0 && (i < lo || i > hi) && i !== cur.mid) c.classList.add('is-out');
          if (i === cur.mid) c.classList.add(cur.cmp === 0 ? 'is-found' : 'is-mid');
        }
        if (done && !st.steps.found && i === trueIdx) c.classList.add('is-missed');
      });
      const sc = OSCEN[st.scenario];
      const msg = $('oMsg');
      msg.replaceChildren();
      $('oStep').disabled = done;
      if (!cur) { msg.append(h('p', { class: 'muted', text: '「次の比較」を押すと、真ん中のカードとくらべていきます。探す' + sc.noun + st.target + ' のカードには下に赤い線がついています。' })); return; }
      const dir = cur.cmp > 0 ? '大きい → 右側だけ残す' : cur.cmp < 0 ? '小さい → 左側だけ残す' : '同じ！';
      msg.append(h('p', { style: 'font-weight: 700;', text: st.idx + '回目：真ん中のカードは ' + cur.value + '。探す' + sc.noun + st.target + ' は ' + cur.value + ' より ' + dir }));
      if (done) {
        const b = st.steps.found
          ? h('div', { class: 'banner banner--ok' }, h('strong', { text: '見つかった！ ' }), st.steps.steps.length + '回の比較で見つかりました。')
          : h('div', { class: 'banner banner--ng' }, h('strong', { text: '見つからない…！ ' }), (st.scenario === 'biz' ? sc.noun : '') + st.target + ' は本当は左から' + (trueIdx + 1) + '枚目にあったのに、半分を捨てたときにいっしょに捨ててしまいました。',
            st.order === 'shuffle' ? h('div', { class: 'row', style: 'margin-top: var(--space-2xs);' }, h('button', { class: 'btn btn--primary', text: '小さい順に並べてやり直す', onclick: () => { st.order = 'sorted'; setPressed('[data-sorder]', 'sorder', 'sorted'); restart(); } })) : null);
        msg.append(b);
      }
    }
    document.querySelectorAll('[data-sorder]').forEach(b => b.addEventListener('click', () => { st.order = b.dataset.sorder; setPressed('[data-sorder]', 'sorder', st.order); restart(); }));
    $('oTarget').addEventListener('change', e => { st.target = +e.target.value; restart(); });
    $('oStep').addEventListener('click', () => { if (st.idx < st.steps.steps.length) { st.idx++; render(); } });
    $('oRestart').addEventListener('click', restart);
    $('oNew').addEventListener('click', newCards);
    document.querySelectorAll('[data-oscen]').forEach(b => b.addEventListener('click', () => {
      st.scenario = b.dataset.oscen; setPressed('[data-oscen]', 'oscen', st.scenario);
      const sc = OSCEN[st.scenario];
      $('sortedIntro').textContent = sc.intro;
      $('oTargetLabel').textContent = sc.targetLabel;
      $('oScenarioHint').textContent = sc.hint;
      render();
    }));
    newCards();
  })();

  /* =========================================================
   * 7 まとめ・豆知識（一致確認あり方式）
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
