// 共通ガチャロジック(メイド枠・役職・デジガチャ/ボイスガチャで共用)。
// 在庫・被り可否は実行ログから都度算出する(ギフト記録・パネル明けのcondition集計と同じ思想で、
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

// 重み付きランダム抽選。候補が空ならnullを返す。重みが全て0以下の場合は均等抽選として扱う。
export function weightedRandomPick(prizes) {
  if (prizes.length === 0) return null;
  const weights = prizes.map((p) => Math.max(0, Number(p.weight) || 0));
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
