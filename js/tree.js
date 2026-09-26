/* 決定木の SVG 描画。logic.js の木（'q' / 'leaf' / 'm'）を受け取り、
 * 全体のレイアウトを先に決めてから「何段目まで見せるか」で表示を切り替える（段送りで位置がずれない）。 */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const UNIT_X = 62, LEVEL_H = 88, MARGIN_L = 92, MARGIN_T = 24, PAD_R = 20;

  function el(name, attrs, text) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  /** 用語セット。opts.terms で上書きすると、箱の言い回しを別の場面（企業活動など）に言い換えられる。 */
  const DEFAULT_TERMS = {
    question: q => q + '番より後？',
    leafAria: v => v + '番',
    mLabel: v => v + '番？',
    rangeSuffix: '番',
    countUnit: '個',
  };

  /** logic の木を描画用の汎用ノードに変換。 */
  function normalize(node, depth, terms) {
    if (!node) return null;
    if (node.type === 'leaf') return { kind: 'leaf', label: terms.leafAria(node.value), value: node.value, lo: node.lo, hi: node.hi, depth, kids: [] };
    if (node.type === 'q') {
      return {
        kind: 'q', label: terms.question(node.q), lo: node.lo, hi: node.hi, depth,
        kids: [
          { edge: 'いいえ', side: 'no', node: normalize(node.no, depth + 1, terms) },
          { edge: 'はい', side: 'yes', node: normalize(node.yes, depth + 1, terms) },
        ],
      };
    }
    // 'm'：一致確認あり方式（二分探索木）
    const kids = [];
    const l = normalize(node.left, depth + 1, terms), r = normalize(node.right, depth + 1, terms);
    if (l) kids.push({ edge: '前', side: 'L', node: l });
    if (r) kids.push({ edge: '後', side: 'R', node: r });
    return { kind: 'm', label: terms.mLabel(node.value), value: node.value, lo: node.lo, hi: node.hi, depth, kids, inorder: true };
  }

  function layout(root) {
    let counter = 0, maxDepth = 0;
    const all = [];
    (function place(n) {
      all.push(n);
      maxDepth = Math.max(maxDepth, n.depth);
      if (n.inorder) {
        const L = n.kids.find(k => k.side === 'L'), R = n.kids.find(k => k.side === 'R');
        if (L) place(L.node);
        n.x = counter++;
        if (R) place(R.node);
      } else if (!n.kids.length) {
        n.x = counter++;
      } else {
        n.kids.forEach(k => place(k.node));
        n.x = (n.kids[0].node.x + n.kids[n.kids.length - 1].node.x) / 2;
      }
    })(root);
    return { all, width: counter, maxDepth };
  }

  const px = x => MARGIN_L + x * UNIT_X + UNIT_X / 2;
  const py = d => MARGIN_T + d * LEVEL_H + 20;

  /**
   * @param container 描画先
   * @param tree logic.buildDecisionTree / buildMatchTree の戻り値
   * @param opts { level: 表示する段数（Infinity で全部）, pathKey: 強調する値 or null, onPick(value), levelLabels: 'q'|'m' }
   */
  function render(container, tree, opts) {
    opts = opts || {};
    const terms = Object.assign({}, DEFAULT_TERMS, opts.terms);
    const level = opts.level == null ? Infinity : opts.level;
    const root = normalize(tree, 0, terms);
    const { all, width, maxDepth } = layout(root);
    const W = MARGIN_L + width * UNIT_X + PAD_R;
    const H = MARGIN_T + (maxDepth + 1) * LEVEL_H;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '決定木' });
    svg.style.width = '100%';
    svg.style.minWidth = Math.round(W * 0.72) + 'px';
    svg.style.maxWidth = Math.round(W * 1.7) + 'px';

    const key = opts.pathKey;
    const onPath = n => key != null && key >= n.lo && key <= n.hi;

    // 段ラベル
    const gLevels = el('g', {});
    for (let d = 0; d <= maxDepth; d++) {
      if (d > level) break;
      const y = py(d);
      gLevels.appendChild(el('line', { class: 't-level-line', x1: 8, x2: W - 8, y1: y, y2: y }));
      const atD = all.filter(n => n.depth === d);
      const isQuestionLevel = atD.some(n => n.kind === 'q' || n.kind === 'm');
      let t1 = '', t2 = '';
      if (opts.levelLabels === 'm') { t1 = (d + 1) + '回目'; }
      else if (isQuestionLevel && d < level) {
        t1 = (d + 1) + '回目';
        const maxC = Math.max(...atD.map(n => n.hi - n.lo + 1));
        t2 = '候補' + maxC + terms.countUnit;
      } else if (d === level && isQuestionLevel) {
        t1 = 'のこり';
        t2 = '最大' + Math.max(...atD.map(n => n.hi - n.lo + 1)) + terms.countUnit;
      } else { t1 = '宣言'; }
      gLevels.appendChild(el('text', { class: 't-level', x: 10, y: y - 2 }, t1));
      if (t2) gLevels.appendChild(el('text', { class: 't-level', x: 10, y: y + 14 }, t2));
    }
    svg.appendChild(gLevels);

    // 辺
    const gEdges = el('g', {}), gNodes = el('g', {});
    all.forEach(n => {
      if (n.depth >= level) return;
      n.kids.forEach(k => {
        const c = k.node;
        const x1 = px(n.x), y1 = py(n.depth) + 17, x2 = px(c.x), y2 = py(c.depth) - 20;
        const my = (y1 + y2) / 2;
        const path = onPath(c) && (n.kind !== 'm' || n.value !== key);
        gEdges.appendChild(el('path', { class: 't-edge' + (path ? ' is-path' : ''), d: `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}` }));
        const lx = (x1 + x2) / 2 + (k.side === 'no' || k.side === 'L' ? -6 : 6);
        gEdges.appendChild(el('text', {
          class: 't-edge-label' + (k.side === 'yes' ? ' is-yes' : '') + (path ? ' is-path' : ''),
          x: lx, y: my + 4, 'text-anchor': k.side === 'no' || k.side === 'L' ? 'end' : 'start',
        }, k.edge));
      });
    });
    svg.appendChild(gEdges);

    // ノード
    all.forEach(n => {
      if (n.depth > level) return;
      const x = px(n.x), y = py(n.depth);
      const path = onPath(n);
      let g;
      if (n.depth === level && n.kind === 'q') {
        g = el('g', { class: 't-node t-range' });
        g.appendChild(el('rect', { x: x - 42, y: y - 20, width: 84, height: 40, rx: 10 }));
        g.appendChild(el('text', { x, y: y - 3, 'text-anchor': 'middle' }, n.lo + '〜' + n.hi + terms.rangeSuffix));
        g.appendChild(el('text', { x, y: y + 13, 'text-anchor': 'middle' }, (n.hi - n.lo + 1) + terms.countUnit));
      } else if (n.kind === 'q') {
        g = el('g', { class: 't-node t-q' + (path ? ' is-path' : '') });
        g.appendChild(el('rect', { x: x - 48, y: y - 17, width: 96, height: 34, rx: 17 }));
        g.appendChild(el('text', { x, y: y + 5, 'text-anchor': 'middle' }, n.label));
      } else if (n.kind === 'leaf') {
        g = el('g', { class: 't-node t-leaf' + (path ? ' is-path' : ''), tabindex: 0, role: 'button', 'aria-label': n.label + 'への道すじ' });
        g.appendChild(el('rect', { x: x - 24, y: y - 20, width: 48, height: 40, rx: 9 }));
        g.appendChild(el('text', { x, y: y + 6, 'text-anchor': 'middle' }, String(n.value)));
        if (opts.onPick) {
          g.addEventListener('click', () => opts.onPick(n.value));
          g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onPick(n.value); } });
        }
      } else {
        const found = key === n.value;
        g = el('g', { class: 't-node t-m' + (found ? ' t-leaf is-path' : '') });
        g.appendChild(el('rect', { x: x - 28, y: y - 17, width: 56, height: 34, rx: 17 }));
        g.appendChild(el('text', { x, y: y + 5, 'text-anchor': 'middle' }, n.label));
        if (opts.onPick) {
          g.style.cursor = 'pointer';
          g.addEventListener('click', () => opts.onPick(n.value));
        }
      }
      gNodes.appendChild(g);
    });
    svg.appendChild(gNodes);

    container.replaceChildren(svg);
    return { maxDepth, leaves: all.filter(n => n.kind === 'leaf').length, questions: all.filter(n => n.kind === 'q').length };
  }

  global.BSTree = { render };
})(window);
