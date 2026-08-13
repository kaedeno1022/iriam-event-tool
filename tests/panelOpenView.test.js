import { describe, it, expect } from 'vitest';
import { computeConditionProgress, computeSegmentProgress } from '../js/views/panelOpenView.js';

describe('computeConditionProgress (giftPoints)', () => {
  const condition = { id: 'cond1', kind: 'giftPoints', target: 30000 };

  it('このconditionに紐づくログの点数(points*qty)を合算する', () => {
    const state = {
      giftLogs: [
        { conditionId: 'cond1', points: 10000, qty: 2 }, // 20000
        { conditionId: 'cond1', points: 5000, qty: 1 }, // 5000
        { conditionId: 'other', points: 99999, qty: 1 }, // 無関係なので無視
      ],
    };
    const progress = computeConditionProgress(state, condition);
    expect(progress.current).toBe(25000);
    expect(progress.achieved).toBe(false);
  });

  it('単発の高額ギフト1個でも閾値に届けば達成扱いになる(専用ショートカット不要)', () => {
    const state = { giftLogs: [{ conditionId: 'cond1', points: 30000, qty: 1 }] };
    const progress = computeConditionProgress(state, condition);
    expect(progress.achieved).toBe(true);
  });

  it('ログがなければ0/targetで未達成', () => {
    const state = { giftLogs: [] };
    const progress = computeConditionProgress(state, condition);
    expect(progress.current).toBe(0);
    expect(progress.achieved).toBe(false);
  });
});

describe('computeConditionProgress (giftCount)', () => {
  const condition = { id: 'cond2', kind: 'giftCount', giftId: 'gift-x', target: 3 };

  it('対象ギフトのqty合計で判定し、他ギフトの記録は無視する', () => {
    const state = {
      giftLogs: [
        { conditionId: 'cond2', giftId: 'gift-x', points: 500, qty: 2 },
        { conditionId: 'cond2', giftId: 'gift-y', points: 100, qty: 5 }, // 対象外ギフト
      ],
    };
    const progress = computeConditionProgress(state, condition);
    expect(progress.current).toBe(2);
    expect(progress.achieved).toBe(false);
  });

  it('目標個数に達すればachieved:true', () => {
    const state = {
      giftLogs: [{ conditionId: 'cond2', giftId: 'gift-x', points: 500, qty: 3 }],
    };
    const progress = computeConditionProgress(state, condition);
    expect(progress.achieved).toBe(true);
  });
});

describe('computeConditionProgress (manualCheck)', () => {
  it('ログを見ずcondition.achievedの値をそのまま返す', () => {
    const state = { giftLogs: [{ conditionId: 'cond3', points: 999999, qty: 1 }] };
    expect(computeConditionProgress(state, { id: 'cond3', kind: 'manualCheck', achieved: false }).achieved).toBe(false);
    expect(computeConditionProgress(state, { id: 'cond3', kind: 'manualCheck', achieved: true }).achieved).toBe(true);
  });
});

describe('computeSegmentProgress', () => {
  it('全条件がachievedのときのみパネル(segment)がachievedになる', () => {
    const segment = {
      config: {
        conditions: [
          { id: 'c1', kind: 'giftPoints', target: 100 },
          { id: 'c2', kind: 'manualCheck', achieved: true },
        ],
      },
    };
    const state = { giftLogs: [{ conditionId: 'c1', points: 100, qty: 1 }] };
    expect(computeSegmentProgress(state, segment).achieved).toBe(true);
  });

  it('1つでも未達成の条件があればachieved:false', () => {
    const segment = {
      config: {
        conditions: [
          { id: 'c1', kind: 'giftPoints', target: 100 },
          { id: 'c2', kind: 'manualCheck', achieved: false },
        ],
      },
    };
    const state = { giftLogs: [{ conditionId: 'c1', points: 100, qty: 1 }] };
    expect(computeSegmentProgress(state, segment).achieved).toBe(false);
  });

  it('条件が1つもない場合はachieved:false(空パネルを誤って開放扱いにしない)', () => {
    const segment = { config: { conditions: [] } };
    const state = { giftLogs: [] };
    expect(computeSegmentProgress(state, segment).achieved).toBe(false);
  });

  it('各conditionの進捗詳細をconditionsに含めて返す', () => {
    const segment = { config: { conditions: [{ id: 'c1', kind: 'giftPoints', target: 100 }] } };
    const state = { giftLogs: [{ conditionId: 'c1', points: 40, qty: 1 }] };
    const progress = computeSegmentProgress(state, segment);
    expect(progress.conditions[0]).toMatchObject({ id: 'c1', current: 40, target: 100, achieved: false });
  });
});
