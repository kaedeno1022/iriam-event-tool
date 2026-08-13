import { describe, it, expect } from 'vitest';
import { computeEarnedPoints, computeSpentPoints, usersWithActivity } from '../js/points.js';

describe('computeEarnedPoints', () => {
  it('指定segment・userの記録のみ合計する(points*qty)', () => {
    const giftLogs = [
      { segmentId: 'seg1', userId: 'u1', points: 100, qty: 2 }, // 200
      { segmentId: 'seg1', userId: 'u1', points: 10, qty: 1 }, // 10
      { segmentId: 'seg1', userId: 'u2', points: 999, qty: 1 }, // 別ユーザーなので無視
      { segmentId: 'seg2', userId: 'u1', points: 999, qty: 1 }, // 別segmentなので無視
    ];
    expect(computeEarnedPoints(giftLogs, 'seg1', 'u1')).toBe(210);
  });

  it('該当ログが無ければ0', () => {
    expect(computeEarnedPoints([], 'seg1', 'u1')).toBe(0);
  });
});

describe('computeSpentPoints', () => {
  it('指定ユーザーのpointsSpentを合計する', () => {
    const shopLog = [
      { userId: 'u1', pointsSpent: 500 },
      { userId: 'u1', pointsSpent: 300 },
      { userId: 'u2', pointsSpent: 999 },
    ];
    expect(computeSpentPoints(shopLog, 'u1')).toBe(800);
  });

  it('pointsSpentがnull/undefinedの記録は0として扱う', () => {
    const shopLog = [{ userId: 'u1', pointsSpent: null }, { userId: 'u1' }];
    expect(computeSpentPoints(shopLog, 'u1')).toBe(0);
  });
});

describe('usersWithActivity', () => {
  it('指定segmentに記録があるユーザーIDのユニーク一覧を返す', () => {
    const giftLogs = [
      { segmentId: 'seg1', userId: 'u1' },
      { segmentId: 'seg1', userId: 'u1' },
      { segmentId: 'seg1', userId: 'u2' },
      { segmentId: 'seg2', userId: 'u3' },
    ];
    expect(usersWithActivity(giftLogs, 'seg1').sort()).toEqual(['u1', 'u2']);
  });
});
