import {
  describe, it, expect, vi, afterEach,
} from 'vitest';
import { genId } from '../js/id.js';

describe('genId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('接頭辞付きのIDを返す', () => {
    expect(genId('giftlog')).toMatch(/^giftlog_[0-9a-f]{12}$/);
  });

  it('連続生成しても重複しない', () => {
    const ids = new Set(Array.from({ length: 10000 }, () => genId('giftlog')));
    expect(ids.size).toBe(10000);
  });

  it('crypto.getRandomValuesが無い環境でも、同一時刻に連続生成したIDが重複しない', () => {
    // 以前はDate.now()の上位桁を切り出していたため、フォールバック時に100秒間まったく
    // 同じIDを返していた。取り消しはIDの一致で対象を絞るため、重複すると無関係な記録まで
    // 巻き添えで削除される。時刻に依存しないことを保証する。
    vi.stubGlobal('crypto', {});
    vi.spyOn(Date, 'now').mockReturnValue(1786629651915);

    const ids = new Set(Array.from({ length: 1000 }, () => genId('giftlog')));
    expect(ids.size).toBe(1000);

    Date.now.mockRestore();
  });

  it('接頭辞が違えば衝突の心配なく区別できる', () => {
    expect(genId('user').startsWith('user_')).toBe(true);
    expect(genId('segment').startsWith('segment_')).toBe(true);
  });
});
