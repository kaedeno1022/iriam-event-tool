// @vitest-environment jsdom
import {
  describe, it, expect, vi,
} from 'vitest';
import { segmentNameHeader } from '../js/views/segmentHeader.js';

describe('segmentNameHeader', () => {
  it('segment.nameを初期値としたtext inputを返す', () => {
    const segment = { name: 'パネル開け' };
    const input = segmentNameHeader(segment, vi.fn());

    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('text');
    expect(input.value).toBe('パネル開け');
  });

  it('入力するとsegment.nameが更新されsaveが呼ばれる', () => {
    const segment = { name: '旧名称' };
    const save = vi.fn();
    const input = segmentNameHeader(segment, save);

    input.value = '新名称';
    input.dispatchEvent(new Event('input'));

    expect(segment.name).toBe('新名称');
    expect(save).toHaveBeenCalledTimes(1);
  });
});
