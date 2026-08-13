import { el, formatDateTime } from '../render.js';
import { genId } from '../id.js';
import {
  remainingStock as remainingPrizeStock, eligiblePrizes, weightedRandomPick, splitPointsAcrossDraws,
} from '../gacha.js';
import { usersWithActivity } from '../points.js';
import { getActiveEventId } from '../storage.js';
import { createUserSelect } from './userSelect.js';
import { openGiftRecordModal } from './giftRecordModal.js';
import {
  userName, stockLabel, promptNewStockItem, promptEditStockItem, remainingShopStock, eligibleShopItems,
  filterByUser, historyTitle, pointsBalance, freeDrawBalance, balanceText, collapsibleSection,
} from './economyHelpers.js';
import {
  showAlert, showConfirm, showPrompt, showSelect,
} from './dialogs.js';

const MODE_LABEL = {
  random: '抽選', guaranteed: '確定', free: '無料', select: '選択(旧)',
};

// segmentId指定時はそのsegmentを直接表示する(ダッシュボードのカレンダーから日付ベースの
// 非既定インスタンスを開く場合)。未指定時は従来通りタブ用の既定枠(key===segmentKey)を表示する。
function findSegment(state, { segmentKey, segmentId }) {
  if (segmentId) return state.segments.find((s) => s.id === segmentId);
  return state.segments.find((s) => s.key === segmentKey && s.eventId === getActiveEventId(state));
}

// gachaLog(全モード)を対象ユーザーごとに集計し、現在の獲得一覧(重複は件数でまとめる)を返す。
// 被り許可の景品は複数回獲得しうるため、上書きせずログの累積そのものが「獲得一覧」になる。
function holdingsByUser(log) {
  const byUser = new Map();
  for (const entry of log) {
    if (!byUser.has(entry.userId)) byUser.set(entry.userId, new Map());
    const counts = byUser.get(entry.userId);
    counts.set(entry.prizeName, (counts.get(entry.prizeName) ?? 0) + 1);
  }
  return byUser;
}

function formatHoldings(counts) {
  return [...counts.entries()].map(([name, count]) => (count > 1 ? `${name}×${count}` : name)).join('、');
}

// --- 画面ごとのUI状態(選択中タブ・ユーザー・折りたたみ開閉) ---
// renderShopGachaはページ遷移や他画面での操作のたびに(app.jsのグローバルrerender経由で)
// 毎回ゼロから呼び直されるため、通常の関数内ローカル変数では操作のたびにリセットされてしまう。
// segment.id(常に一意)ごとに状態を分けて保持することで、メイド枠タブ・役職タブに加え、
// 日付ベースで追加された複数の非既定インスタンス(いずれもkeyはnullで共有される)の
// UI状態も互いに混ざらないようにする。
const uiStateBySegmentId = new Map();
function getUiState(segmentId) {
  if (!uiStateBySegmentId.has(segmentId)) {
    uiStateBySegmentId.set(segmentId, {
      activeSection: 'points',
      currentUserId: '',
      shopCatalogOpen: false,
      gachaCatalogOpen: false,
      gachaTierCatalogOpen: false,
      freeGrantCatalogOpen: false,
    });
  }
  return uiStateBySegmentId.get(segmentId);
}

// テスト専用。モジュールはテストファイル内で使い回されるため、テスト間でUI状態が
// 漏れないようにリセットする(本番のページ読み込みでは呼ぶ必要はない)。
export function resetShopGachaUiState() {
  uiStateBySegmentId.clear();
}

// --- ポイント管理 ---

function renderPointsSection({
  state, save, rerender, segment, userId,
}) {
  const recordBtn = el('button', {
    type: 'button',
    class: 'btn-primary',
    onclick: () => openGiftRecordModal({
      state,
      segmentId: segment.id,
      initialUserId: userId,
      save,
      onSaved: (savedUserId) => { if (savedUserId) getUiState(segment.id).currentUserId = savedUserId; rerender(); },
    }),
  }, 'ギフトを記録する');

  const userIds = usersWithActivity(state.giftLogs, segment.id);
  const balanceRows = userIds.map((uid) => {
    const balance = pointsBalance(state, segment, uid);
    return el('tr', {}, [
      el('td', {}, userName(state, uid)),
      el('td', {}, `${balance.earned}pt`),
      el('td', {}, `${balance.spent}pt`),
      el('td', { class: balance.available < 0 ? 'points-negative' : '' }, `${balance.available}pt`),
    ]);
  });

  const logs = filterByUser(state.giftLogs.filter((l) => l.segmentId === segment.id), userId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20);
  const logRows = logs.map((l) => {
    const gift = l.giftId ? state.giftMaster.find((g) => g.id === l.giftId) : null;
    return el('tr', {}, [
      el('td', {}, formatDateTime(l.timestamp)),
      el('td', {}, userName(state, l.userId)),
      el('td', {}, gift ? gift.name : `直接入力 ${l.points}pt`),
      el('td', {}, `×${l.qty}`),
      el('td', {}, [
        el('button', {
          type: 'button', class: 'btn-icon', title: '取り消し',
          onclick: async () => {
            if (!(await showConfirm('この記録を取り消しますか？'))) return;
            state.giftLogs = state.giftLogs.filter((x) => x.id !== l.id);
            save();
            rerender();
          },
        }, '↩'),
      ]),
    ]);
  });

  return el('div', {}, [
    el('p', { class: 'empty-hint' }, 'ここに記録したギフトから、ユーザーごとの獲得pt・使用済みpt・残りptを自動集計します。'),
    recordBtn,
    el('h4', {}, 'ユーザー別ポイント'),
    el('table', { class: 'log-table' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, 'ユーザー'), el('th', {}, '獲得'), el('th', {}, '使用済み'), el('th', {}, '残り')])),
      el('tbody', {}, balanceRows.length ? balanceRows : el('tr', {}, el('td', { colspan: '4' }, '記録なし'))),
    ]),
    el('h4', {}, historyTitle(state, '直近のギフト記録', userId)),
    el('table', { class: 'log-table' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, '日時'), el('th', {}, 'ユーザー'), el('th', {}, 'ギフト'), el('th', {}, '個数'), el('th', {}, '')])),
      el('tbody', {}, logRows.length ? logRows : el('tr', {}, el('td', { colspan: '5' }, '記録なし'))),
    ]),
  ]);
}

// --- お買い物形式特典 ---

function renderShopSection({
  state, save, rerender, segment, userId, ui,
}) {
  const items = segment.config.shopItems;
  const log = segment.config.shopLog;

  const balance = userId ? pointsBalance(state, segment, userId) : null;
  const eligible = userId ? eligibleShopItems(items, log, userId) : [];
  const exchangeButtons = eligible.map((item) => el('button', {
    type: 'button',
    class: 'gift-chip',
    onclick: async () => {
      if (item.requiredPoints != null) {
        const currentBalance = pointsBalance(state, segment, userId);
        if (currentBalance.available < item.requiredPoints) {
          await showAlert(`ptが不足しています(残り${currentBalance.available}pt / 必要${item.requiredPoints}pt)`);
          return;
        }
      }
      if (!(await showConfirm(`「${item.name}」と交換しますか？`))) return;
      log.push({
        id: genId('shoplog'), timestamp: new Date().toISOString(), userId, itemId: item.id, itemName: item.name, pointsSpent: item.requiredPoints,
      });
      save();
      rerender();
    },
  }, `${item.name}${item.requiredPoints != null ? `(${item.requiredPoints}pt)` : ''}`));

  const exchangeArea = el('div', {}, [
    balance ? el('p', { class: balance.available < 0 ? 'points-negative' : 'empty-hint' }, balanceText(balance)) : null,
    userId
      ? el('div', { class: 'gift-list' }, exchangeButtons.length ? exchangeButtons : [el('p', { class: 'empty-hint' }, '交換可能な特典がありません')])
      : el('p', { class: 'empty-hint' }, '上の「対象ユーザー」で選択してください'),
  ]);

  const itemRows = items.map((item) => {
    const stock = remainingShopStock(item, log);
    return el('div', { class: 'card punishment-row' }, [
      el('span', { class: 'punishment-name' }, `${item.name}${item.requiredPoints != null ? ` (${item.requiredPoints}pt)` : ''} - ${stockLabel(stock)}${item.allowDuplicate ? '' : ' / 被り不可'}`),
      el('button', {
        type: 'button',
        class: 'btn-icon',
        title: '編集',
        onclick: async () => {
          const result = await promptEditStockItem('特典', item);
          if (!result) return;
          item.name = result.name;
          item.requiredPoints = result.requiredPoints;
          item.stock = result.stock;
          item.allowDuplicate = result.allowDuplicate;
          save();
          rerender();
        },
      }, '✎'),
      el('button', {
        type: 'button',
        class: 'btn-icon',
        title: '削除',
        onclick: async () => {
          if (!(await showConfirm(`「${item.name}」を削除しますか？`))) return;
          segment.config.shopItems = segment.config.shopItems.filter((x) => x.id !== item.id);
          save();
          rerender();
        },
      }, '🗑'),
    ]);
  });
  const addItemBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: async () => {
      const result = await promptNewStockItem('特典');
      if (!result) return;
      items.push({
        id: genId('shopitem'), name: result.name, requiredPoints: result.requiredPoints, stock: result.stock, allowDuplicate: result.allowDuplicate,
      });
      save();
      rerender();
    },
  }, '＋ 特典を追加');

  const logRows = filterByUser(log, userId).slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20).map((entry) => el('tr', {}, [
    el('td', {}, formatDateTime(entry.timestamp)),
    el('td', {}, userName(state, entry.userId)),
    el('td', {}, entry.itemName),
    el('td', {}, [
      el('button', {
        type: 'button', class: 'btn-icon', title: '取り消し',
        onclick: async () => {
          if (!(await showConfirm('この交換記録を取り消しますか？'))) return;
          segment.config.shopLog = log.filter((h) => h.id !== entry.id);
          save();
          rerender();
        },
      }, '↩'),
    ]),
  ]));

  return el('div', {}, [
    exchangeArea,
    collapsibleSection({
      title: '特典一覧',
      isOpen: ui.shopCatalogOpen,
      onToggle: () => { ui.shopCatalogOpen = !ui.shopCatalogOpen; rerender(); },
      content: el('div', {}, [
        el('div', { class: 'punishment-list' }, itemRows.length ? itemRows : [el('p', { class: 'empty-hint' }, '特典未登録')]),
        addItemBtn,
      ]),
    }),
    el('h4', {}, historyTitle(state, '交換履歴', userId)),
    el('table', { class: 'log-table' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, '日時'), el('th', {}, 'ユーザー'), el('th', {}, '特典'), el('th', {}, '')])),
      el('tbody', {}, logRows.length ? logRows : el('tr', {}, el('td', { colspan: '4' }, '記録なし'))),
    ]),
  ]);
}

// --- ガチャ ---

function renderGachaSection({
  state, save, rerender, segment, userId, ui,
}) {
  const gacha = segment.config.gacha;
  const log = segment.config.gachaLog;
  const grants = segment.config.freeDrawGrants;

  // --- pt消費の即時抽選: レートボタンがそのまま抽選ボタンになる ---
  const randomTierButtons = gacha.rateTiers.map((tier) => el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: async () => {
      const balance = pointsBalance(state, segment, userId);
      if (balance.available < tier.points) {
        await showAlert(`ptが不足しています(残り${balance.available}pt / 必要${tier.points}pt)`);
        return;
      }
      if (!(await showConfirm(`${tier.points}ptを消費して${tier.draws}回抽選しますか？`))) return;
      const costs = splitPointsAcrossDraws(tier.points, tier.draws);
      const results = [];
      for (let i = 0; i < tier.draws; i += 1) {
        const eligible = eligiblePrizes(gacha.prizes, log, userId);
        if (eligible.length === 0) break;
        const chosen = weightedRandomPick(eligible);
        log.push({
          id: genId('gachalog'), timestamp: new Date().toISOString(), userId, prizeId: chosen.id, prizeName: chosen.name, mode: 'random', pointsSpent: costs[i],
        });
        results.push(chosen.name);
      }
      save();
      rerender();
      if (results.length === 0) {
        await showAlert('引ける景品がありません');
      } else {
        const shortage = results.length < tier.draws ? `\n(引ける景品が無くなったため${results.length}/${tier.draws}回で終了しました)` : '';
        await showAlert(`🎰 ガチャ結果: ${results.join('、')}${shortage}`);
      }
    },
  }, `${tier.points}ptで${tier.draws}回分`));

  const paidDrawArea = !userId
    ? el('p', { class: 'empty-hint' }, '上の「対象ユーザー」で選択してください')
    : (gacha.rateTiers.length
      ? el('div', { class: 'gift-list' }, randomTierButtons)
      : el('p', { class: 'empty-hint' }, 'レートが未設定です(下の「レート設定」から追加してください)'));

  // --- 無料ガチャ: 手動で付与された無料抽選権をpt消費なしで1回消化する ---
  const freeDraws = userId ? freeDrawBalance(grants, log, userId) : 0;
  const freeDrawBtn = el('button', {
    type: 'button',
    class: 'btn-primary',
    disabled: freeDraws <= 0,
    onclick: async () => {
      const eligible = eligiblePrizes(gacha.prizes, log, userId);
      if (eligible.length === 0) { await showAlert('引ける景品がありません'); return; }
      const chosen = weightedRandomPick(eligible);
      log.push({
        id: genId('gachalog'), timestamp: new Date().toISOString(), userId, prizeId: chosen.id, prizeName: chosen.name, mode: 'free', pointsSpent: 0,
      });
      save();
      rerender();
      await showAlert(`🎁 無料ガチャ結果: ${chosen.name}`);
    },
  }, '無料で引く');
  const freeDrawArea = el('div', {}, [
    el('h4', {}, '無料ガチャ'),
    userId
      ? el('p', {}, [`残り${freeDraws}回`, ' ', freeDrawBtn])
      : el('p', { class: 'empty-hint' }, '上の「対象ユーザー」で選択してください'),
  ]);

  // --- 確定枠: 抽選を挟まず、景品ごとに設定した確定枠専用ptを消費して直接獲得する ---
  const guaranteedPrizes = eligiblePrizes(gacha.prizes.filter((p) => p.guaranteedPoints != null), log, userId);
  const guaranteedButtons = guaranteedPrizes.map((prize) => el('button', {
    type: 'button',
    class: 'gift-chip',
    onclick: async () => {
      const balance = pointsBalance(state, segment, userId);
      if (balance.available < prize.guaranteedPoints) {
        await showAlert(`ptが不足しています(残り${balance.available}pt / 必要${prize.guaranteedPoints}pt)`);
        return;
      }
      if (!(await showConfirm(`${prize.guaranteedPoints}ptを消費して「${prize.name}」を確定で獲得しますか？`))) return;
      log.push({
        id: genId('gachalog'), timestamp: new Date().toISOString(), userId, prizeId: prize.id, prizeName: prize.name, mode: 'guaranteed', pointsSpent: prize.guaranteedPoints,
      });
      save();
      rerender();
    },
  }, `${prize.name}(${prize.guaranteedPoints}pt)`));
  const guaranteedArea = !userId
    ? null
    : el('div', {}, [
      el('h4', {}, '確定枠(pt消費で直接獲得)'),
      guaranteedButtons.length
        ? el('div', { class: 'gift-list' }, guaranteedButtons)
        : el('p', { class: 'empty-hint' }, '確定枠に設定された景品がありません'),
    ]);

  const tierRows = gacha.rateTiers.map((tier) => el('div', { class: 'card punishment-row' }, [
    el('span', { class: 'punishment-name' }, `${tier.points}ptで${tier.draws}回分`),
    el('button', {
      type: 'button',
      class: 'btn-icon',
      title: '削除',
      onclick: async () => {
        if (!(await showConfirm('このレートを削除しますか？'))) return;
        gacha.rateTiers = gacha.rateTiers.filter((x) => x.id !== tier.id);
        save();
        rerender();
      },
    }, '🗑'),
  ]));
  const addTierBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: async () => {
      const pointsStr = await showPrompt('必要ポイントを入力(例: 300)');
      const points = Number(pointsStr);
      if (!points || points <= 0) return;
      const drawsStr = await showPrompt('獲得回数を入力(例: 1)', '1');
      const draws = Number(drawsStr);
      if (!draws || draws <= 0) return;
      gacha.rateTiers.push({ id: genId('tier'), points, draws });
      save();
      rerender();
    },
  }, '＋ レートを追加');

  const prizeRows = gacha.prizes.map((prize) => {
    const stock = remainingPrizeStock(prize, log);
    return el('div', { class: 'card punishment-row' }, [
      el('span', { class: 'punishment-name' }, `${prize.name}(重み${prize.weight}) - ${stockLabel(stock)}${prize.allowDuplicate ? '' : ' / 被り不可'}${prize.guaranteedPoints != null ? ` / 確定枠${prize.guaranteedPoints}pt` : ''}`),
      el('button', {
        type: 'button',
        class: 'btn-icon',
        title: '削除',
        onclick: async () => {
          if (!(await showConfirm(`「${prize.name}」を削除しますか？`))) return;
          gacha.prizes = gacha.prizes.filter((x) => x.id !== prize.id);
          save();
          rerender();
        },
      }, '🗑'),
    ]);
  });
  const addPrizeBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: async () => {
      const name = await showPrompt('景品名を入力');
      if (!name || !name.trim()) return;
      const weightStr = await showPrompt('重み(抽選の出やすさ)を入力', '1');
      const weight = Number(weightStr) || 1;
      const stockStr = await showPrompt('在庫数を入力(無制限なら空欄)');
      const stock = stockStr && stockStr.trim() !== '' ? Number(stockStr) : null;
      const allowDuplicate = await showConfirm('同じユーザーの被り(複数回当選)を許可しますか？\nOK=許可 / キャンセル=不可');
      const guaranteedStr = await showPrompt('確定枠の必要ptを入力(抽選を挟まず直接選べるようにする場合のみ。不要なら空欄)');
      let guaranteedPoints = null;
      if (guaranteedStr && guaranteedStr.trim() !== '') {
        guaranteedPoints = Number(guaranteedStr);
        if (!Number.isFinite(guaranteedPoints) || guaranteedPoints <= 0) {
          await showAlert('確定枠の必要ptは正の数値で入力してください');
          return;
        }
      }
      gacha.prizes.push({
        id: genId('prize'), name: name.trim(), weight, stock, allowDuplicate, guaranteedPoints,
      });
      save();
      rerender();
    },
  }, '＋ 景品を追加');

  // お買い物の特典一覧から名前・在庫・被り可否をコピーして景品を新規作成する。特典側にはweight/
  // guaranteedPointsが無いため、weightは既定の1、guaranteedPoints(確定枠)はなしで作成する。
  const copyFromShopBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: async () => {
      const shopItems = segment.config.shopItems;
      if (shopItems.length === 0) { await showAlert('コピー元の特典が登録されていません(「お買い物」タブで先に登録してください)'); return; }
      const itemId = await showSelect('コピー元の特典を選択', shopItems.map((item) => ({
        value: item.id,
        label: `${item.name}${item.requiredPoints != null ? `(${item.requiredPoints}pt)` : ''}`,
      })));
      if (!itemId) return;
      const source = shopItems.find((item) => item.id === itemId);
      if (!source) return;
      gacha.prizes.push({
        id: genId('prize'), name: source.name, weight: 1, stock: source.stock, allowDuplicate: source.allowDuplicate, guaranteedPoints: null,
      });
      save();
      rerender();
    },
  }, '＋ お買い物からコピー');

  const grantRows = grants.map((grant) => el('div', { class: 'card punishment-row' }, [
    el('span', { class: 'punishment-name' }, `${userName(state, grant.userId)} に${grant.count}回付与(${formatDateTime(grant.timestamp)})`),
    el('button', {
      type: 'button',
      class: 'btn-icon',
      title: '取り消し',
      onclick: async () => {
        if (!(await showConfirm('この付与を取り消しますか？'))) return;
        segment.config.freeDrawGrants = grants.filter((g) => g.id !== grant.id);
        save();
        rerender();
      },
    }, '↩'),
  ]));
  const addGrantBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: async () => {
      if (!userId) { await showAlert('上の「対象ユーザー」で選択してください'); return; }
      const countStr = await showPrompt('付与する無料ガチャ回数を入力', '1');
      const count = Number(countStr);
      if (!Number.isInteger(count) || count <= 0) return;
      grants.push({
        id: genId('freegrant'), timestamp: new Date().toISOString(), userId, count,
      });
      save();
      rerender();
    },
  }, '＋ 無料ガチャを付与');

  // 6.7: 配信ポストを実施済み(users[].streamPostDone)のユーザーに、無料ガチャ1回を一括付与する。
  // segment.config.streamPostGrantedUserIdsで既付与ユーザーを記録し、二重付与を防ぐ。
  const grantedIds = segment.config.streamPostGrantedUserIds;
  const streamPostEligible = state.users.filter((u) => u.streamPostDone && !grantedIds.includes(u.id));
  const streamPostGrantBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: async () => {
      if (streamPostEligible.length === 0) { await showAlert('配信ポスト特典の対象ユーザーがいません(全員付与済み、または配信ポスト未実施)'); return; }
      if (!(await showConfirm(`配信ポスト実施済みの${streamPostEligible.length}人に無料ガチャを1回ずつ付与しますか？`))) return;
      const timestamp = new Date().toISOString();
      for (const u of streamPostEligible) {
        grants.push({
          id: genId('freegrant'), timestamp, userId: u.id, count: 1,
        });
        grantedIds.push(u.id);
      }
      save();
      rerender();
    },
  }, `＋ 配信ポスト特典を一括付与(対象${streamPostEligible.length}人)`);

  // 「配信ポスト実施済み」チェックはユーザーごとにグローバルなフラグ(user.streamPostDone)。
  // 元々デジガチャ・ボイスガチャ企画(6.7)の一括付与機能専用としてsegment.key==='digiVoiceGacha'
  // でのみ表示していたが、既定企画の概念廃止によりkeyは新規作成segmentでは常にnullになり
  // digiVoiceGachaという特別な枠は存在しなくなったため、買い物orガチャ枠(shopGacha)全般で
  // 表示するようにした(下の一括付与ボタン自体は元々type全体に対して動く実装だったため、
  // このチェックリストUIだけが特定segmentに紐づいていたのはズレていた)。
  const streamPostChecklistRows = state.users.map((u) => el('label', { class: 'checkbox-row' }, [
    el('input', {
      type: 'checkbox',
      checked: u.streamPostDone,
      onchange: (e) => { u.streamPostDone = e.target.checked; save(); rerender(); },
    }),
    u.displayName,
  ]));
  const streamPostChecklist = el('div', {}, [
    el('h4', {}, '配信ポスト実施済みユーザー'),
    streamPostChecklistRows.length ? el('div', { class: 'punishment-list' }, streamPostChecklistRows) : el('p', { class: 'empty-hint' }, 'ユーザー未登録'),
  ]);

  const holdings = holdingsByUser(log);
  const holdingRows = [...holdings.entries()].map(([uid, counts]) => el('tr', {}, [
    el('td', {}, userName(state, uid)),
    el('td', {}, formatHoldings(counts)),
  ]));

  const logRows = filterByUser(log, userId).slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20).map((entry) => el('tr', {}, [
    el('td', {}, formatDateTime(entry.timestamp)),
    el('td', {}, userName(state, entry.userId)),
    el('td', {}, entry.prizeName),
    el('td', {}, MODE_LABEL[entry.mode] ?? entry.mode),
    el('td', {}, [
      el('button', {
        type: 'button', class: 'btn-icon', title: '取り消し',
        onclick: async () => {
          if (!(await showConfirm('この結果を取り消しますか？'))) return;
          segment.config.gachaLog = log.filter((h) => h.id !== entry.id);
          save();
          rerender();
        },
      }, '↩'),
    ]),
  ]));

  return el('div', {}, [
    paidDrawArea,
    freeDrawArea,
    guaranteedArea,
    collapsibleSection({
      title: 'レート設定',
      isOpen: ui.gachaTierCatalogOpen,
      onToggle: () => { ui.gachaTierCatalogOpen = !ui.gachaTierCatalogOpen; rerender(); },
      content: el('div', {}, [
        el('div', { class: 'punishment-list' }, tierRows.length ? tierRows : [el('p', { class: 'empty-hint' }, 'レート未設定')]),
        addTierBtn,
      ]),
    }),
    collapsibleSection({
      title: '景品一覧',
      isOpen: ui.gachaCatalogOpen,
      onToggle: () => { ui.gachaCatalogOpen = !ui.gachaCatalogOpen; rerender(); },
      content: el('div', {}, [
        el('div', { class: 'punishment-list' }, prizeRows.length ? prizeRows : [el('p', { class: 'empty-hint' }, '景品未登録')]),
        addPrizeBtn,
        copyFromShopBtn,
      ]),
    }),
    collapsibleSection({
      title: '無料ガチャ付与',
      isOpen: ui.freeGrantCatalogOpen,
      onToggle: () => { ui.freeGrantCatalogOpen = !ui.freeGrantCatalogOpen; rerender(); },
      content: el('div', {}, [
        el('div', { class: 'punishment-list' }, grantRows.length ? grantRows : [el('p', { class: 'empty-hint' }, '付与履歴なし')]),
        addGrantBtn,
        streamPostGrantBtn,
        streamPostChecklist,
      ]),
    }),
    el('h4', {}, '現在の獲得一覧'),
    el('table', { class: 'log-table' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, 'ユーザー'), el('th', {}, '獲得した景品')])),
      el('tbody', {}, holdingRows.length ? holdingRows : el('tr', {}, el('td', { colspan: '2' }, '記録なし'))),
    ]),
    el('h4', {}, historyTitle(state, 'ガチャ履歴', userId)),
    el('table', { class: 'log-table' }, [
      el('thead', {}, el('tr', {}, [el('th', {}, '日時'), el('th', {}, 'ユーザー'), el('th', {}, '景品'), el('th', {}, '方式'), el('th', {}, '')])),
      el('tbody', {}, logRows.length ? logRows : el('tr', {}, el('td', { colspan: '5' }, '記録なし'))),
    ]),
  ]);
}

export function renderShopGacha({
  state, save, rerender, container, segmentKey, segmentId,
}) {
  const segment = findSegment(state, { segmentKey, segmentId });
  if (!segment) {
    container.append(el('p', {}, '企画が見つかりません。'));
    return;
  }
  segment.config.shopItems = segment.config.shopItems ?? [];
  segment.config.shopLog = segment.config.shopLog ?? [];
  segment.config.gacha = segment.config.gacha ?? { prizes: [] };
  segment.config.gacha.rateTiers = segment.config.gacha.rateTiers ?? [];
  segment.config.gachaLog = segment.config.gachaLog ?? [];
  segment.config.freeDrawGrants = segment.config.freeDrawGrants ?? [];
  segment.config.streamPostGrantedUserIds = segment.config.streamPostGrantedUserIds ?? [];

  const ui = getUiState(segment.id);

  const userSelect = createUserSelect({
    state,
    save,
    initialUserId: ui.currentUserId,
    labelFor: (u) => `${u.displayName} (残り${pointsBalance(state, segment, u.id).available}pt)`,
    onChange: (userId) => { ui.currentUserId = userId; rerender(); },
  });

  const sectionTabs = el('div', { class: 'mode-toggle' }, [
    el('button', {
      type: 'button', class: ui.activeSection === 'points' ? 'btn-toggle active' : 'btn-toggle',
      onclick: () => { if (ui.activeSection === 'points') return; ui.activeSection = 'points'; rerender(); },
    }, 'ポイント'),
    el('button', {
      type: 'button', class: ui.activeSection === 'shop' ? 'btn-toggle active' : 'btn-toggle',
      onclick: () => { if (ui.activeSection === 'shop') return; ui.activeSection = 'shop'; rerender(); },
    }, 'お買い物'),
    el('button', {
      type: 'button', class: ui.activeSection === 'gacha' ? 'btn-toggle active' : 'btn-toggle',
      onclick: () => { if (ui.activeSection === 'gacha') return; ui.activeSection = 'gacha'; rerender(); },
    }, 'ガチャ'),
  ]);

  const sectionArgs = {
    state, save, rerender, segment, userId: ui.currentUserId, ui,
  };
  let sectionContent;
  if (ui.activeSection === 'shop') sectionContent = renderShopSection(sectionArgs);
  else if (ui.activeSection === 'gacha') sectionContent = renderGachaSection(sectionArgs);
  else sectionContent = renderPointsSection(sectionArgs);

  container.append(el('section', {}, [
    el('h2', {}, segment.name),
    el('div', { class: 'card' }, [
      el('h3', {}, '対象ユーザー'),
      el('p', { class: 'empty-hint' }, '選択したユーザーで、下のどのタブでも操作できます。'),
      userSelect.element,
    ]),
    sectionTabs,
    el('div', { class: 'card' }, [sectionContent]),
  ]));
}
