import { describe, it, expect, vi } from 'vitest';
import {
  remainingStock, eligiblePrizes, weightedRandomPick, splitPointsAcrossDraws, redistributeProbability,
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
    const prizes = [{ id: 'only', probability: 100 }];
    expect(weightedRandomPick(prizes)).toBe(prizes[0]);
  });

  it('確率に応じて選ばれる(累積境界の確認)', () => {
    const prizes = [
      { id: 'p1', probability: 25 }, // 累積0-25
      { id: 'p2', probability: 75 }, // 累積25-100
    ];
    const randomSpy = vi.spyOn(Math, 'random');

    randomSpy.mockReturnValue(0); // total=100, r=0 -> p1
    expect(weightedRandomPick(prizes).id).toBe('p1');

    randomSpy.mockReturnValue(0.999); // r=99.9 -> p2
    expect(weightedRandomPick(prizes).id).toBe('p2');

    randomSpy.mockRestore();
  });

  it('確率が全て0以下なら均等抽選にフォールバックする', () => {
    const prizes = [{ id: 'p1', probability: 0 }, { id: 'p2', probability: 0 }];
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(weightedRandomPick(prizes).id).toBe('p2'); // Math.floor(0.99*2)=1
    randomSpy.mockRestore();
  });
});

describe('redistributeProbability', () => {
  it('対象が空なら何もしない', () => {
    expect(() => redistributeProbability([], 100)).not.toThrow();
  });

  it('比率を保ったままtargetSumに再配分する', () => {
    const prizes = [{ id: 'p1', probability: 60 }, { id: 'p2', probability: 40 }];
    redistributeProbability(prizes, 80);
    expect(prizes[0].probability).toBe(48); // 60/100*80
    expect(prizes[1].probability).toBe(32); // targetSumとの差分(端数調整は最後の要素)
    expect(prizes[0].probability + prizes[1].probability).toBe(80);
  });

  it('現在の合計が0(新規景品のみ等)なら均等配分する', () => {
    const prizes = [{ id: 'p1', probability: 0 }, { id: 'p2', probability: 0 }, { id: 'p3', probability: 0 }];
    redistributeProbability(prizes, 100);
    expect(prizes.reduce((sum, p) => sum + p.probability, 0)).toBe(100);
  });

  it('丸め誤差は最後の要素に寄せ、合計が必ずtargetSumと一致する', () => {
    const prizes = [{ id: 'p1', probability: 33 }, { id: 'p2', probability: 33 }, { id: 'p3', probability: 34 }];
    redistributeProbability(prizes, 70);
    expect(prizes.reduce((sum, p) => sum + p.probability, 0)).toBe(70);
  });

  it('非最終要素の丸めが超過配分しても、最後の要素が負値にならない(clampで配分済み分に制限)', () => {
    // 50/50/0のような比率をtargetSum=1に圧縮すると、素朴な丸めでは[1,1,-1]になりうる。
    const prizes = [{ id: 'p1', probability: 50 }, { id: 'p2', probability: 50 }, { id: 'p3', probability: 0 }];
    redistributeProbability(prizes, 1);
    expect(prizes.every((p) => p.probability >= 0)).toBe(true);
    expect(prizes.reduce((sum, p) => sum + p.probability, 0)).toBe(1);
  });
});
