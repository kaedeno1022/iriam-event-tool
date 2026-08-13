import { describe, it, expect } from 'vitest';
import {
  filterByUser, historyTitle, pointsBalance, freeDrawBalance, balanceText, remainingShopStock, eligibleShopItems, stockLabel,
} from '../js/views/economyHelpers.js';

function buildState() {
  return {
    users: [{ id: 'u1', displayName: 'ユーザーA' }],
  };
}

describe('filterByUser', () => {
  it('userId未指定(空文字)なら全件そのまま返す', () => {
    const logs = [{ userId: 'u1' }, { userId: 'u2' }];
    expect(filterByUser(logs, '')).toBe(logs);
  });

  it('userId指定時はそのユーザーの記録だけに絞り込む', () => {
    const logs = [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u1' }];
    expect(filterByUser(logs, 'u1')).toHaveLength(2);
  });
});

describe('historyTitle', () => {
  it('userId未指定なら「(全体)」を付与する', () => {
    expect(historyTitle(buildState(), 'ガチャ履歴', '')).toBe('ガチャ履歴(全体)');
  });

  it('userId指定時はそのユーザーの表示名を付与する', () => {
    expect(historyTitle(buildState(), 'ガチャ履歴', 'u1')).toBe('ガチャ履歴(ユーザーA)');
  });

  it('削除済みユーザーIDの場合は「(削除済みユーザー)」になる', () => {
    expect(historyTitle(buildState(), 'ガチャ履歴', 'ghost')).toBe('ガチャ履歴((削除済みユーザー))');
  });
});

describe('pointsBalance', () => {
  it('shopLog・gachaLogのpointsSpentを合算して使用済みptを算出する', () => {
    const state = {
      ...buildState(),
      giftLogs: [{
        segmentId: 'seg1', userId: 'u1', points: 1000, qty: 1,
      }],
    };
    const segment = {
      id: 'seg1',
      config: {
        shopLog: [{ userId: 'u1', pointsSpent: 100 }],
        gachaLog: [{ userId: 'u1', pointsSpent: 300 }, { userId: 'u1' }], // pointsSpent無しは0扱い(無料枠消化分相当)
      },
    };
    expect(pointsBalance(state, segment, 'u1')).toEqual({ earned: 1000, spent: 400, available: 600 });
  });
});

describe('freeDrawBalance', () => {
  it('付与合計count - mode===freeのgachaLog件数 = 残り無料回数', () => {
    const grants = [{ userId: 'u1', count: 3 }];
    const gachaLog = [
      { userId: 'u1', mode: 'free' },
      { userId: 'u1', mode: 'random' }, // pt消費の抽選は無料枠を消費しない
      { userId: 'u2', mode: 'free' }, // 他ユーザーの消費は数えない
    ];
    expect(freeDrawBalance(grants, gachaLog, 'u1')).toBe(2);
  });
});

describe('balanceText', () => {
  it('獲得・使用済み・残りを整形して表示する', () => {
    expect(balanceText({ earned: 1000, spent: 300, available: 700 })).toBe('残りpt: 700pt(獲得1000pt - 使用済み300pt)');
  });
});

describe('remainingShopStock / eligibleShopItems', () => {
  it('在庫が無制限(null)ならnullを返す', () => {
    expect(remainingShopStock({ id: 'i1', stock: null }, [])).toBeNull();
  });

  it('在庫からitemId一致のログ件数を引いた値を返す', () => {
    const log = [{ itemId: 'i1' }, { itemId: 'i1' }];
    expect(remainingShopStock({ id: 'i1', stock: 5 }, log)).toBe(3);
  });

  it('在庫切れ・被り禁止で既に交換済みの項目は除外する', () => {
    const items = [
      { id: 'i1', stock: 0, allowDuplicate: true },
      { id: 'i2', stock: null, allowDuplicate: false },
      { id: 'i3', stock: null, allowDuplicate: true },
    ];
    const log = [{ userId: 'u1', itemId: 'i2' }];
    expect(eligibleShopItems(items, log, 'u1').map((i) => i.id)).toEqual(['i3']);
  });
});

describe('stockLabel', () => {
  it('null(無制限)なら「無制限」を返す', () => {
    expect(stockLabel(null)).toBe('無制限');
  });

  it('数値ならその残数を表示する', () => {
    expect(stockLabel(3)).toBe('残り3');
  });
});
