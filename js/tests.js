/* logic.js のテスト。`node js/tests.js` または tests.html で実行する。
 * 数値は 構成まとめ「0-4 数値関係の一覧」と一致していなければならない。 */
(function (global) {
  'use strict';
  const BS = global.BS || (typeof require !== 'undefined' ? require('./logic.js') : null);
  const results = [];
  function eq(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ name, ok, actual, expected });
  }

  // 0-4 の表
  [[2, 1], [4, 2], [8, 3], [16, 4], [32, 5], [100, 7], [365, 9], [10000, 14], [1000000, 20], [1, 0]]
    .forEach(([n, k]) => eq('questionsNeeded(' + n + ')', BS.questionsNeeded(n), k));

  // 0〜7番の全パターンは一律3回
  eq('箱0〜7 半分戦略は全部3回', [0, 1, 2, 3, 4, 5, 6, 7].map(k => BS.searchPath(0, 7, k, 'half').length), [3, 3, 3, 3, 3, 3, 3, 3]);
  eq('箱0〜7 最初の質問は「3番より後？」', BS.halfSplit(0, 7), 3);

  // 誕生日365日：どの日でも9回以内、最大ちょうど9回
  let maxQ = 0, minQ = 99;
  for (let d = 0; d < 365; d++) {
    const c = BS.searchPath(0, 364, d, 'half').length;
    maxQ = Math.max(maxQ, c); minQ = Math.min(minQ, c);
  }
  eq('誕生日 最大回数', maxQ, 9);
  eq('誕生日 最小回数（2の累乗でないので8回もある）', minQ, 8);

  // n が2の累乗でないとき：最大は ceil(log2 n)
  for (const n of [3, 5, 6, 7, 10, 13]) {
    let m = 0;
    for (let k = 0; k < n; k++) m = Math.max(m, BS.searchPath(0, n - 1, k, 'half').length);
    eq('n=' + n + ' の最大回数', m, BS.questionsNeeded(n));
  }

  // 決定木の深さ
  eq('決定木(0..7, 半分) 深さ', BS.treeDepth(BS.buildDecisionTree(0, 7, 'half')), 3);
  eq('決定木(0..7, 端から) 深さ', BS.treeDepth(BS.buildDecisionTree(0, 7, 'edge')), 7);

  // 一致確認あり方式（豆知識）：最良1・最悪 ceil(log2(n+1))=4・合計21（期待値 21/8）
  const mc = [0, 1, 2, 3, 4, 5, 6, 7].map(k => BS.matchCount(0, 7, k));
  eq('一致確認あり 最良', Math.min(...mc), 1);
  eq('一致確認あり 最悪', Math.max(...mc), 4);
  eq('一致確認あり 合計', mc.reduce((a, b) => a + b, 0), 21);
  eq('一致確認あり 木の深さ', BS.treeDepth(BS.buildMatchTree(0, 7)), 4);

  // 線形探索
  eq('線形探索 最大 = n', Math.max(...[0, 1, 2, 3, 4, 5, 6, 7].map(k => BS.linearCount(k))), 8);

  // 日付
  eq('dayToDate(0)', BS.dayToDate(0), { m: 1, d: 1 });
  eq('dayToDate(364)', BS.dayToDate(364), { m: 12, d: 31 });
  eq('dateToDay(7,2)', BS.dateToDay(7, 2), 182);
  eq('dayLabel(59)', BS.dayLabel(59), '3月1日');

  // 半分の連鎖
  eq('halvingChain(8)', BS.halvingChain(8), [8, 4, 2, 1]);
  eq('halvingChain(365) の長さ-1', BS.halvingChain(365).length - 1, 9);

  // 整列済みなら必ず見つかる
  eq('整列済み配列では見つかる', BS.binarySearchSteps([3, 8, 15, 21, 34, 50, 62, 90], 62).found, true);
  eq('整列していないと見つからないことがある', BS.binarySearchSteps([50, 3, 90, 21, 8, 62, 15, 34], 90).found, false);

  const failed = results.filter(r => !r.ok);
  global.BS_TEST_RESULTS = results;
  if (typeof module !== 'undefined' && module.exports && typeof window === 'undefined') {
    failed.forEach(r => console.log('NG', r.name, 'actual=', JSON.stringify(r.actual), 'expected=', JSON.stringify(r.expected)));
    console.log(results.length - failed.length + ' / ' + results.length + ' passed');
    if (failed.length) process.exitCode = 1;
  }
})(typeof window !== 'undefined' ? window : globalThis);
