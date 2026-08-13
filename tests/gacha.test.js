import { describe, it, expect, vi } from 'vitest';
import {
  remainingStock, eligiblePrizes, weightedRandomPick, splitPointsAcrossDraws,
} from '../js/gacha.js';

describe('remainingStock', () => {
  it('stockがnull(無制限)ならnullを返す', () => {
    expect(remainingStock({ id: 'p1', stock: null }, [])).toBeNull();
  });

  it('stockから該当prizeIdのログ件数を引いた値を返す', () => {
    const log = [
      { prizeId: 'p1' }, { prizeId: 'p1' }, { prizeId: 'p2' },
    ];
    expect(remainingStock({ id: 'p1', stock: 5 }, log)).toBe(3);
  });

  it('消費しすぎても負数にはならず0でクランプする', () => {
    const log = [{ prizeId: 'p1' }, { prizeId: 'p1' }, { prizeId: 'p1' }];
    expect(remainingStock({ id: 'p1', stock: 2 }, log)).toBe(0);
  });
});

describe('eligiblePrizes', () => {
  it('在庫切れの景品は除外する', () => {
    const prizes = [
      { id: 'p1', stock: 0, allowDuplicate: true },
      { id: 'p2', stock: 1, allowDuplicate: true },
    ];
    const result = eligiblePrizes(prizes, [], 'u1');
    expect(result.map((p) => p.id)).toEqual(['p2']);
  });

  it('被り禁止で本人が既に獲得済みの景品は除外する', () => {
    const prizes = [{ id: 'p1', stock: null, allowDuplicate: false }];
    const log = [{ userId: 'u1', prizeId: 'p1' }];
    expect(eligiblePrizes(prizes, log, 'u1')).toHaveLength(0);
  });

  it('被り禁止でも、獲得済みなのが別ユーザーなら本人はまだ引ける', () => {
    const prizes = [{ id: 'p1', stock: null, allowDuplicate: false }];
    const log = [{ userId: 'u2', prizeId: 'p1' }];
    expect(eligiblePrizes(prizes, log, 'u1')).toHaveLength(1);
  });

  it('被り許可の景品は本人が既に獲得済みでも引ける', () => {
    const prizes = [{ id: 'p1', stock: null, allowDuplicate: true }];
    const log = [{ userId: 'u1', prizeId: 'p1' }];
    expect(eligiblePrizes(prizes, log, 'u1')).toHaveLength(1);
  });
});

describe('splitPointsAcrossDraws', () => {
  it('割り切れる場合は均等に分割する', () => {
    expect(splitPointsAcrossDraws(300, 3)).toEqual([100, 100, 100]);
  });

  it('割り切れない場合は端数を先頭から1ptずつ乗せ、合計が一致する', () => {
    const result = splitPointsAcrossDraws(100, 3);
    expect(result).toEqual([34, 33, 33]);
    expect(result.reduce((sum, v) => sum + v, 0)).toBe(100);
  });

  it('回数が1件なら全額がそのまま入る', () => {
    expect(splitPointsAcrossDraws(300, 1)).toEqual([300]);
  });
});

describe('weightedRandomPick', () => {
  it('候補が空ならnullを返す', () => {
    expect(weightedRandomPick([])).toBeNull();
  });

  it('候補が1件ならそれを返す', () => {
    const prizes = [{ id: 'only', weight: 1 }];
    expect(weightedRandomPick(prizes)).toBe(prizes[0]);
  });

  it('重みに応じて選ばれる(累積境界の確認)', () => {
    const prizes = [
      { id: 'p1', weight: 1 }, // 累積0-1
      { id: 'p2', weight: 3 }, // 累積1-4
    ];
    const randomSpy = vi.spyOn(Math, 'random');

    randomSpy.mockReturnValue(0); // total=4, r=0 -> p1
    expect(weightedRandomPick(prizes).id).toBe('p1');

    randomSpy.mockReturnValue(0.999); // r=3.996 -> p2
    expect(weightedRandomPick(prizes).id).toBe('p2');

    randomSpy.mockRestore();
  });

  it('重みが全て0以下なら均等抽選にフォールバックする', () => {
    const prizes = [{ id: 'p1', weight: 0 }, { id: 'p2', weight: 0 }];
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(weightedRandomPick(prizes).id).toBe('p2'); // Math.floor(0.99*2)=1
    randomSpy.mockRestore();
  });
});
