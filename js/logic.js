/* 二分探索 授業アシスト — 純粋ロジック（DOM非依存・node でもテスト可能）
 *
 * 授業のルール（構成まとめ 0-1）:
 *   質問は「〇より後ですか？」の比較質問だけ。宣言は1回・外れたら失敗・回数に数えない。
 *   → 候補 n 個を必ず当てられる質問回数は ceil(log2 n)。
 *
 * 範囲はすべて閉区間 [lo, hi]（整数）。「q より後ですか？」は はい → [q+1, hi] / いいえ → [lo, q]。
 */
(function (global) {
  'use strict';

  /** 候補 n 個を必ず特定できる比較質問の回数 = ceil(log2 n)。n<=1 は 0。 */
  function questionsNeeded(n) {
    if (n <= 1) return 0;
    let k = 0, p = 1;
    while (p < n) { p *= 2; k++; }
    return k;
  }

  /** 範囲 [lo,hi] をちょうど半分に分ける質問位置。いいえ側（前半）を ceil(c/2) 個にする。 */
  function halfSplit(lo, hi) {
    const c = hi - lo + 1;
    return lo + Math.ceil(c / 2) - 1;
  }

  /** 「q より後ですか？」を [lo,hi] に投げたときの はい／いいえ 各側の候補数。 */
  function splitSizes(lo, hi, q) {
    const no = Math.max(0, Math.min(q, hi) - lo + 1);
    const yes = Math.max(0, hi - Math.max(q + 1, lo) + 1);
    return { yes, no };
  }

  /** 回答を反映した新しい範囲。 */
  function applyAnswer(lo, hi, q, isAfter) {
    return isAfter ? { lo: Math.max(lo, q + 1), hi } : { lo, hi: Math.min(hi, q) };
  }

  /** 分け方の評価（気づき用）。'half' | 'near' | 'skew' | 'useless' */
  function splitQuality(yes, no) {
    if (yes === 0 || no === 0) return 'useless';
    const big = Math.max(yes, no), small = Math.min(yes, no);
    if (big - small <= 1) return 'half';
    if (small / big >= 0.6) return 'near';
    return 'skew';
  }

  /** 戦略 strategy('half' | 'edge') で key を探したときの質問の列。 */
  function searchPath(lo, hi, key, strategy) {
    const steps = [];
    while (lo < hi) {
      const q = strategy === 'edge' ? lo : halfSplit(lo, hi);
      const isAfter = key > q;
      steps.push({ lo, hi, q, isAfter });
      ({ lo, hi } = applyAnswer(lo, hi, q, isAfter));
    }
    return steps;
  }

  /** 線形探索（0番から順に開ける）で key を見つけるまでに開ける箱の数。 */
  function linearCount(key, lo) { return key - (lo || 0) + 1; }

  /* ---------- 決定木 ---------- */

  /** 比較のみ方式の決定木。内部ノード {type:'q', q, lo, hi, no, yes} / 葉 {type:'leaf', value}。 */
  function buildDecisionTree(lo, hi, strategy) {
    if (lo === hi) return { type: 'leaf', value: lo, lo, hi };
    const q = strategy === 'edge' ? lo : halfSplit(lo, hi);
    return {
      type: 'q', q, lo, hi,
      no: buildDecisionTree(lo, q, strategy),
      yes: buildDecisionTree(q + 1, hi, strategy),
    };
  }

  /** 一致確認あり方式（実際のプログラム）の木。各ノードで mid と比べ、一致なら終了。 */
  function buildMatchTree(lo, hi) {
    if (lo > hi) return null;
    const mid = Math.floor((lo + hi) / 2);
    return { type: 'm', value: mid, lo, hi, left: buildMatchTree(lo, mid - 1), right: buildMatchTree(mid + 1, hi) };
  }

  /** 一致確認あり方式で key を見つけるまでの比較回数（mid との比較1回＝1回と数える）。 */
  function matchCount(lo, hi, key) {
    let c = 0;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      c++;
      if (mid === key) return c;
      if (key < mid) hi = mid - 1; else lo = mid + 1;
    }
    return c;
  }

  function treeDepth(node) {
    if (!node) return 0;
    if (node.type === 'leaf') return 0;
    if (node.type === 'q') return 1 + Math.max(treeDepth(node.no), treeDepth(node.yes));
    return 1 + Math.max(treeDepth(node.left), treeDepth(node.right));
  }

  /** 最悪経路で半分ずつ減っていく候補数の列（例 365 → 183 → 92 → … → 1）。 */
  function halvingChain(n) {
    const chain = [n];
    while (n > 1) { n = Math.ceil(n / 2); chain.push(n); }
    return chain;
  }

  /* ---------- 誕生日 ---------- */

  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const DAYS_IN_YEAR = 365;

  /** 0始まりの通し日番号 → {m:1-12, d:1-31} */
  function dayToDate(i) {
    let m = 0;
    while (i >= MONTH_DAYS[m]) { i -= MONTH_DAYS[m]; m++; }
    return { m: m + 1, d: i + 1 };
  }
  function dateToDay(m, d) {
    let i = 0;
    for (let k = 0; k < m - 1; k++) i += MONTH_DAYS[k];
    return i + d - 1;
  }
  function dayLabel(i) { const t = dayToDate(i); return t.m + '月' + t.d + '日'; }

  /* ---------- その他 ---------- */

  /** 並びに関係なく「二分探索の手順」を実行する（整列の前提を確かめるデモ用）。 */
  function binarySearchSteps(arr, target) {
    let lo = 0, hi = arr.length - 1;
    const steps = [];
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const v = arr[mid];
      const cmp = target === v ? 0 : (target > v ? 1 : -1);
      steps.push({ lo, hi, mid, value: v, cmp });
      if (cmp === 0) return { found: true, index: mid, steps };
      if (cmp > 0) lo = mid + 1; else hi = mid - 1;
    }
    return { found: false, index: -1, steps };
  }

  /** 秒数を「約〇日」のような読みやすい形に。 */
  function humanDuration(sec) {
    if (sec < 60) return sec + '秒';
    if (sec < 3600) return '約' + Math.round(sec / 60) + '分';
    if (sec < 86400) return '約' + (Math.round(sec / 360) / 10) + '時間';
    return '約' + (Math.round(sec / 8640) / 10) + '日';
  }

  function formatNum(n) { return n.toLocaleString('ja-JP'); }

  const api = {
    questionsNeeded, halfSplit, splitSizes, applyAnswer, splitQuality, searchPath, linearCount,
    buildDecisionTree, buildMatchTree, matchCount, treeDepth, halvingChain,
    MONTH_DAYS, DAYS_IN_YEAR, dayToDate, dateToDay, dayLabel,
    binarySearchSteps, humanDuration, formatNum,
  };
  global.BS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
