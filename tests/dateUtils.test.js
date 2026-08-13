import { describe, it, expect } from 'vitest';
import { tuesdayWeekRange } from '../js/dateUtils.js';

// 日付はnew Date(year, monthIndex, day)のローカルコンストラクタで指定する(UTC ISO文字列を使うと、
// テスト実行環境のタイムゾーンによって曜日がずれてテストが不安定になるため)。

describe('tuesdayWeekRange', () => {
  it('火曜日を渡すとその日始まり・翌週月曜終わりの期間を返す(2026-08-18は火曜日)', () => {
    expect(tuesdayWeekRange(new Date(2026, 7, 18))).toEqual({
      periodStart: '2026-08-18',
      periodEnd: '2026-08-24',
    });
  });

  it('週の途中(水曜日)を渡すと直近の火曜日始まりの期間を返す', () => {
    expect(tuesdayWeekRange(new Date(2026, 7, 19))).toEqual({
      periodStart: '2026-08-18',
      periodEnd: '2026-08-24',
    });
  });

  it('月曜日を渡すと前の火曜日始まり・その月曜終わりの期間を返す', () => {
    expect(tuesdayWeekRange(new Date(2026, 7, 17))).toEqual({
      periodStart: '2026-08-11',
      periodEnd: '2026-08-17',
    });
  });

  it('日曜日を渡すと前の火曜日始まり・翌日月曜終わりの期間を返す', () => {
    expect(tuesdayWeekRange(new Date(2026, 7, 16))).toEqual({
      periodStart: '2026-08-11',
      periodEnd: '2026-08-17',
    });
  });

  it('月をまたぐ場合も正しく計算する(2026-09-01は火曜日)', () => {
    expect(tuesdayWeekRange(new Date(2026, 7, 31))).toEqual({
      periodStart: '2026-08-25',
      periodEnd: '2026-08-31',
    });
  });

  it('深夜0時台の日付を渡しても、ローカル暦日として正しく扱う(タイムゾーン起因のオフバイワン回帰テスト)', () => {
    // 火曜日の00:00:00ちょうど。UTC/ローカルの混在バグがあると、UTCとの時差によっては
    // 前日(月曜)として扱われ、1週間前のperiodStartを返してしまう。
    expect(tuesdayWeekRange(new Date(2026, 7, 18, 0, 0, 0))).toEqual({
      periodStart: '2026-08-18',
      periodEnd: '2026-08-24',
    });
  });
});
