// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createGiftPicker } from '../js/views/giftPicker.js';
import { showPrompt } from '../js/views/dialogs.js';

vi.mock('../js/views/dialogs.js', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
}));

// クリックハンドラがdialogs(Promiseベース)をawaitするようになったため、クリック後に
// マイクロタスクを十分にフラッシュしてから状態を検証する。
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function baseState() {
  return {
    giftMaster: [
      { id: 'gift-1', name: 'ギフトA', points: 10, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
      { id: 'gift-2', name: 'ギフトB', points: 200, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
    ],
  };
}

function findChip(root, text) {
  return [...root.querySelectorAll('button')].find((b) => b.textContent === text);
}

describe('createGiftPicker', () => {
  it('ギフトを選択してもgift-list要素は同一ノードのまま(スクロール位置を保つため作り直さない)', () => {
    const state = baseState();
    const picker = createGiftPicker({ state, save: vi.fn() });
    document.body.append(picker.element);

    const listBefore = picker.element.querySelector('.gift-list');
    findChip(picker.element, 'ギフトA (10pt)').click();
    const listAfter = picker.element.querySelector('.gift-list');

    expect(listAfter).toBe(listBefore);
  });

  it('選択したチップだけにselectedクラスが付き、以前の選択は外れる', () => {
    const state = baseState();
    const picker = createGiftPicker({ state, save: vi.fn() });
    document.body.append(picker.element);

    findChip(picker.element, 'ギフトA (10pt)').click();
    expect(findChip(picker.element, 'ギフトA (10pt)').classList.contains('selected')).toBe(true);
    expect(findChip(picker.element, 'ギフトB (200pt)').classList.contains('selected')).toBe(false);

    findChip(picker.element, 'ギフトB (200pt)').click();
    expect(findChip(picker.element, 'ギフトA (10pt)').classList.contains('selected')).toBe(false);
    expect(findChip(picker.element, 'ギフトB (200pt)').classList.contains('selected')).toBe(true);
  });

  it('選択するとonChangeが選択したgiftIdで呼ばれ、getSelectedGiftIdにも反映される', () => {
    const state = baseState();
    const onChange = vi.fn();
    const picker = createGiftPicker({ state, save: vi.fn(), onChange });
    document.body.append(picker.element);

    findChip(picker.element, 'ギフトB (200pt)').click();

    expect(onChange).toHaveBeenCalledWith('gift-2');
    expect(picker.getSelectedGiftId()).toBe('gift-2');
  });

  it('カテゴリを切り替えると一覧の中身が絞り込まれる', () => {
    const state = baseState();
    state.giftMaster.push({ id: 'gift-3', name: 'ギフトC', points: 5000, category: 'LOVE', lastUsedAt: null, useCount: 0, custom: false });
    const picker = createGiftPicker({ state, save: vi.fn() });
    document.body.append(picker.element);

    expect(findChip(picker.element, 'ギフトC (5000pt)')).toBeTruthy();
    [...picker.element.querySelectorAll('.tab')].find((b) => b.textContent === '定番').click();

    expect(findChip(picker.element, 'ギフトC (5000pt)')).toBeUndefined();
    expect(findChip(picker.element, 'ギフトA (10pt)')).toBeTruthy();
  });

  it('その他クイック登録で新規ギフトが一覧に追加され自動選択される', async () => {
    const state = baseState();
    showPrompt.mockResolvedValueOnce('新規ギフト').mockResolvedValueOnce('999').mockResolvedValueOnce('その他');
    const onChange = vi.fn();
    const save = vi.fn();
    const picker = createGiftPicker({ state, save, onChange });
    document.body.append(picker.element);

    findChip(picker.element, '＋ その他(新規登録)').click();
    await flush();

    const newGift = state.giftMaster.find((g) => g.name === '新規ギフト' && g.points === 999);
    expect(newGift).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith(newGift.id);
    expect(save).toHaveBeenCalled();
    expect(picker.getSelectedGiftId()).toBe(newGift.id);

    const newChip = findChip(picker.element, '新規ギフト (999pt)');
    expect(newChip).toBeTruthy(); // 一覧のDOMに実際に現れている
    expect(newChip.classList.contains('selected')).toBe(true); // 自動選択のハイライトも付いている
  });
});
