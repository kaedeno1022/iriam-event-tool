// ユーザーごとのポイント収支計算(メイド枠等、ギフト記録からポイントを貯めて特典と交換する企画で共用)。

// 指定segmentでそのユーザーが記録されたギフトから獲得した合計pt。
export function computeEarnedPoints(giftLogs, segmentId, userId) {
  return giftLogs
    .filter((l) => l.segmentId === segmentId && l.userId === userId)
    .reduce((sum, l) => sum + l.points * l.qty, 0);
}

// ポイントを消費する記録(お買い物特典の交換、ガチャ抽選など、userIdとpointsSpent
// を持つ配列であれば何でもよい)から消費合計ptを算出する。呼び出し側で複数の記録配列を
// まとめて渡してよい(例: [...shopLog, ...gachaLog])。
// pointsSpentがnull/undefinedの記録は0として扱う。
export function computeSpentPoints(spendLogs, userId) {
  return spendLogs
    .filter((l) => l.userId === userId)
    .reduce((sum, l) => sum + (l.pointsSpent ?? 0), 0);
}

// 獲得pt一覧に登場する全ユーザーIDのユニーク一覧(表示対象の洗い出し用)。
export function usersWithActivity(giftLogs, segmentId) {
  return [...new Set(giftLogs.filter((l) => l.segmentId === segmentId).map((l) => l.userId))];
}
