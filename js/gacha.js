// 共通ガチャロジック(メイド枠・役職・デジガチャ/ボイスガチャで共用)。
// 在庫・被り可否は実行ログから都度算出する(ギフト記録・パネル開けのcondition集計と同じ思想で、
// ログを削除するだけで在庫が自動的に戻る)。

// prizeの残り在庫。stockがnull(無制限)ならnullを返す。
export function remainingStock(prize, log) {
  if (prize.stock === null || prize.stock === undefined) return null;
  const used = log.filter((l) => l.prizeId === prize.id).length;
  return Math.max(0, prize.stock - used);
}

// 指定ユーザーが今このタイミングで引ける(選べる)景品の一覧。
// 在庫切れ、または被り禁止でそのユーザーが既に獲得済みのものは除外する。
export function eligiblePrizes(prizes, log, userId) {
  return prizes.filter((p) => {
    const stock = remainingStock(p, log);
    if (stock !== null && stock <= 0) return false;
    if (!p.allowDuplicate && log.some((l) => l.userId === userId && l.prizeId === p.id)) return false;
    return true;
  });
}

// レート(合計pt・回数)を1回あたりのpt消費額に分割する。割り切れない端数は先頭の要素から順に1ptずつ乗せる
// (合計が必ずtotalPointsと一致するようにするため)。
export function splitPointsAcrossDraws(totalPoints, draws) {
  const base = Math.floor(totalPoints / draws);
  const remainder = totalPoints % draws;
  return Array.from({ length: draws }, (_, i) => base + (i < remainder ? 1 : 0));
}

// 確率(probability, %)に応じたランダム抽選。候補が空ならnullを返す。確率が全て0以下の場合は均等抽選として扱う。
export function weightedRandomPick(prizes) {
  if (prizes.length === 0) return null;
  const weights = prizes.map((p) => Math.max(0, Number(p.probability) || 0));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    return prizes[Math.floor(Math.random() * prizes.length)];
  }
  let r = Math.random() * total;
  for (let i = 0; i < prizes.length; i += 1) {
    r -= weights[i];
    if (r < 0) return prizes[i];
  }
  return prizes[prizes.length - 1];
}

// otherPrizesのprobability合計がtargetSumになるよう、現在の比率を保ったまま比例配分し直す。
// 景品の追加・編集・削除のたびに呼び、常に全景品の確率合計が100であることを保証するために使う。
// 端数の丸め誤差は最後の要素に寄せてtargetSumちょうどになるよう調整する。非最終要素は
// 残り予算(targetSum - 配分済み)を超えないようclampする。これが無いと、丸めで複数要素が
// 超過配分され、最後の要素(targetSum - 配分済み)が負値になりうる
// (例: [50,50,0]をtargetSum=1に再配分すると、clamp無しでは[1,1,-1]になってしまう)。
export function redistributeProbability(otherPrizes, targetSum) {
  if (otherPrizes.length === 0) return;
  const currentSum = otherPrizes.reduce((sum, p) => sum + (Number(p.probability) || 0), 0);
  let allocated = 0;
  otherPrizes.forEach((p, i) => {
    if (i === otherPrizes.length - 1) {
      p.probability = targetSum - allocated;
      return;
    }
    const share = currentSum > 0 ? (Number(p.probability) || 0) / currentSum : 1 / otherPrizes.length;
    const raw = Math.min(Math.max(Math.round(share * targetSum), 0), targetSum - allocated);
    p.probability = raw;
    allocated += raw;
  });
}
