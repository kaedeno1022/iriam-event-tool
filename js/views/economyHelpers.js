import { el } from '../render.js';
import { computeEarnedPoints, computeSpentPoints } from '../points.js';

// 買い物orガチャ枠(旧メイド枠・役職)など、「ギフト記録でpt獲得→お買い物形式特典/ガチャでpt消費」
// という共通の経済モデルを持つ企画セグメントで使い回す表示ヘルパー群。

export function userName(state, userId) {
  const user = state.users.find((u) => u.id === userId);
  return user ? user.displayName : '(削除済みユーザー)';
}

export function stockLabel(stock) {
  return stock === null ? '無制限' : `残り${stock}`;
}

export function remainingShopStock(item, log) {
  if (item.stock === null || item.stock === undefined) return null;
  const used = log.filter((l) => l.itemId === item.id).length;
  return Math.max(0, item.stock - used);
}

// 在庫・被り可否のみで絞り込む。ポイント残高不足のブロックは呼び出し側(交換ボタンのonclick)で
// requiredPointsが設定されている場合のみ行う(requiredPoints未設定=無料進呈などの裁量枠はここでは弾かない)。
export function eligibleShopItems(items, log, userId) {
  return items.filter((item) => {
    const stock = remainingShopStock(item, log);
    if (stock !== null && stock <= 0) return false;
    if (!item.allowDuplicate && log.some((l) => l.userId === userId && l.itemId === item.id)) return false;
    return true;
  });
}

// 対象ユーザーが選択されていればそのユーザーの記録だけに絞り込む。未選択(空文字)なら
// 全員分をそのまま返す(「全体表示」)。履歴系のテーブル全てで共通して使う。
export function filterByUser(logs, userId) {
  return userId ? logs.filter((l) => l.userId === userId) : logs;
}

export function historyTitle(state, baseTitle, userId) {
  return userId ? `${baseTitle}(${userName(state, userId)})` : `${baseTitle}(全体)`;
}

export function pointsBalance(state, segment, userId) {
  const earned = computeEarnedPoints(state.giftLogs, segment.id, userId);
  // ランダム抽選・確定枠はいずれもgachaLog自体にpointsSpentを持つ(無料枠消化分は0扱いで自然に相殺される)
  const spent = computeSpentPoints(
    [...segment.config.shopLog, ...segment.config.gachaLog],
    userId,
  );
  return { earned, spent, available: earned - spent };
}

// 手動付与された無料ガチャ回数の合計 - 実際に無料枠を使って引いた回数(mode==='free') = 残り無料回数
export function freeDrawBalance(grants, gachaLog, userId) {
  const granted = grants.filter((g) => g.userId === userId).reduce((sum, g) => sum + g.count, 0);
  const used = gachaLog.filter((l) => l.userId === userId && l.mode === 'free').length;
  return granted - used;
}

export function balanceText(balance) {
  return `残りpt: ${balance.available}pt(獲得${balance.earned}pt - 使用済み${balance.spent}pt)`;
}

// 折りたたみ可能な設定エリア(特典/景品の追加・削除)。運用中に頻繁に使う操作ではないため、
// 既定では閉じておき、必要な時だけ展開する(常時表示による情報過多を避けるため)。
export function collapsibleSection({
  title, isOpen, onToggle, content,
}) {
  return el('div', { class: 'collapsible' }, [
    el('button', { type: 'button', class: 'btn-secondary', onclick: onToggle }, isOpen ? `▲ ${title}を閉じる` : `▼ ${title}を編集`),
    isOpen ? content : null,
  ]);
}
