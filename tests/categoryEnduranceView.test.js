// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { renderCategoryEndurance, resetCategoryEnduranceUiState } from '../js/views/categoryEnduranceView.js';
import { showPrompt } from '../js/views/dialogs.js';

vi.mock('../js/views/dialogs.js', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
}));

// クリックハンドラがdialogs(Promiseベース)をawaitするようになったため、クリック後に
// マイクロタスクを十分にフラッシュしてから状態を検証する。
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function buildState() {
  return {
    events: [{ id: 'event1' }],
    activeEventId: 'event1',
    segments: [{
      id: 'seg-endurance',
      eventId: 'event1',
      type: 'categoryEndurance',
      key: 'categoryEndurance',
      name: 'カテゴリ耐久',
      config: { category: 'LOVE', giftCounts: [] },
    }],
    users: [],
    giftLogs: [],
    giftMaster: [],
  };
}

function findByText(root, tag, text) {
  return [...root.querySelectorAll(tag)].find((el) => el.textContent === text);
}

function findByTextStartsWith(root, tag, text) {
  return [...root.querySelectorAll(tag)].find((el) => el.textContent.startsWith(text));
}

function openCollapsible(container, label) {
  findByTextStartsWith(container, 'button', `▼ ${label}`).click();
}

function findCountRow(container, text) {
  return [...container.querySelectorAll('.punishment-row')]
    .filter((row) => !row.closest('.collapsible'))
    .find((row) => [...row.querySelectorAll('span')].some((el) => el.textContent === text));
}

describe('renderCategoryEndurance', () => {
  let container;
  let rerender;
  let state;

  beforeEach(() => {
    vi.clearAllMocks();
    showPrompt.mockResolvedValue(null);
    resetCategoryEnduranceUiState();
    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div>';
    container = document.getElementById('root');
    state = buildState();
    rerender = () => {
      container.replaceChildren();
      renderCategoryEndurance({
        state, save: vi.fn(), rerender, container,
      });
    };
    rerender();
  });

  it('見出しとカードが表示される(既定カテゴリはLOVE)', () => {
    expect(container.querySelector('.segment-name-header').value).toBe('カテゴリ耐久');
    expect(findByText(container, 'h3', 'LOVEギフト記録')).toBeTruthy();
  });

  it('選択中カテゴリのギフトだけが一覧に表示される(他カテゴリは出てこない)', () => {
    state.giftMaster.push(
      { id: 'gift-1', name: '定番ギフト', points: 10, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
      { id: 'gift-2', name: 'あふれる想い', points: 30000, category: 'LOVE', lastUsedAt: null, useCount: 0, custom: false },
    );
    rerender();

    expect(findByText(container, 'span', 'あふれる想い (30000pt)')).toBeTruthy();
    expect(findByText(container, 'span', '定番ギフト (10pt)')).toBeUndefined();
  });

  describe('対象カテゴリ切替', () => {
    it('セレクトでカテゴリを切り替えると、segment.config.categoryが更新され対象ギフト一覧が切り替わる', () => {
      state.giftMaster.push(
        { id: 'gift-1', name: 'あふれる想い', points: 30000, category: 'LOVE', lastUsedAt: null, useCount: 0, custom: false },
        { id: 'gift-2', name: '拍手', points: 200, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
      );
      rerender();
      expect(container.textContent).toContain('あふれる想い');
      expect(container.textContent).not.toContain('拍手');

      const select = container.querySelector('select');
      select.value = '定番';
      select.dispatchEvent(new Event('change'));

      expect(state.segments[0].config.category).toBe('定番');
      expect(container.textContent).toContain('拍手');
      expect(container.textContent).not.toContain('あふれる想い');
    });

    it('ギフトマスタにまだ登録が無いカテゴリを選択中でも、セレクトの選択肢から消えない', () => {
      state.segments[0].config.category = '専用';
      rerender();

      const select = container.querySelector('select');
      expect([...select.options].map((o) => o.value)).toContain('専用');
      expect(select.value).toBe('専用');
    });
  });

  describe('初期値の一括設定', () => {
    it('カタログは既定で折りたたまれている', () => {
      state.giftMaster.push({ id: 'gift-1', name: 'あふれる想い', points: 30000, category: 'LOVE', lastUsedAt: null, useCount: 0, custom: false });
      rerender();

      expect(container.textContent).toContain('初期値の一括設定を編集');
      expect(container.querySelector('#endurance-bulk-initial')).toBeNull();
    });

    it('展開すると一括入力欄と適用ボタンが表示される', () => {
      openCollapsible(container, '初期値の一括設定');

      expect(container.querySelector('#endurance-bulk-initial')).toBeTruthy();
      expect(findByText(container, 'button', '一括適用')).toBeTruthy();
    });

    it('一括適用すると、対象カテゴリの全ギフトのinitialが同じ値に設定される', () => {
      state.giftMaster.push(
        { id: 'gift-1', name: 'あふれる想い', points: 30000, category: 'LOVE', lastUsedAt: null, useCount: 0, custom: false },
        { id: 'gift-2', name: 'すこ', points: 1000, category: 'LOVE', lastUsedAt: null, useCount: 0, custom: false },
      );
      rerender();
      openCollapsible(container, '初期値の一括設定');

      const input = document.getElementById('endurance-bulk-initial');
      input.value = '5';
      findByText(container, 'button', '一括適用').click();

      expect(state.segments[0].config.giftCounts).toContainEqual(expect.objectContaining({ giftId: 'gift-1', initial: 5 }));
      expect(state.segments[0].config.giftCounts).toContainEqual(expect.objectContaining({ giftId: 'gift-2', initial: 5 }));
      const row = findCountRow(container, 'あふれる想い (30000pt)');
      expect(findByText(row, 'span', '残り5')).toBeTruthy();
    });

    it('一括適用に負数を入力しても0未満にはならない', () => {
      state.giftMaster.push({ id: 'gift-1', name: 'あふれる想い', points: 30000, category: 'LOVE', lastUsedAt: null, useCount: 0, custom: false });
      rerender();
      openCollapsible(container, '初期値の一括設定');

      const input = document.getElementById('endurance-bulk-initial');
      input.value = '-5';
      findByText(container, 'button', '一括適用').click();

      expect(state.segments[0].config.giftCounts).toContainEqual(expect.objectContaining({ giftId: 'gift-1', initial: 0 }));
    });

    it('別カテゴリのギフトは一括適用の対象にならない', () => {
      state.giftMaster.push(
        { id: 'gift-1', name: 'あふれる想い', points: 30000, category: 'LOVE', lastUsedAt: null, useCount: 0, custom: false },
        { id: 'gift-2', name: '拍手', points: 200, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
      );
      rerender();
      openCollapsible(container, '初期値の一括設定');

      const input = document.getElementById('endurance-bulk-initial');
      input.value = '3';
      findByText(container, 'button', '一括適用').click();

      expect(state.segments[0].config.giftCounts.find((r) => r.giftId === 'gift-2')).toBeUndefined();
    });
  });

  describe('ギフト記録(残数カウンター)', () => {
    it('初期値が未設定のギフトは残り0から始まる', () => {
      state.giftMaster.push({ id: 'gift-1', name: 'あふれる想い', points: 30000, category: 'LOVE', lastUsedAt: null, useCount: 0, custom: false });
      rerender();

      const row = findByText(container, 'span', 'あふれる想い (30000pt)').closest('.punishment-row');
      expect(findByText(row, 'span', '残り0')).toBeTruthy();
    });

    it('「－」を押すと残数が1減る', () => {
      state.giftMaster.push({ id: 'gift-1', name: 'あふれる想い', points: 30000, category: 'LOVE', lastUsedAt: null, useCount: 0, custom: false });
      state.segments[0].config.giftCounts.push({ id: 'lg1', giftId: 'gift-1', initial: 3, given: 0 });
      rerender();

      const row = findByText(container, 'span', 'あふれる想い (30000pt)').closest('.punishment-row');
      findByText(row, 'button', '－').click();

      const record = state.segments[0].config.giftCounts.find((r) => r.giftId === 'gift-1');
      expect(record.given).toBe(1);
      const updatedRow = findByText(container, 'span', 'あふれる想い (30000pt)').closest('.punishment-row');
      expect(findByText(updatedRow, 'span', '残り2')).toBeTruthy();
    });

    it('残数が初期値を超えて投げられた場合はマイナス表示になる', () => {
      state.giftMaster.push({ id: 'gift-1', name: 'あふれる想い', points: 30000, category: 'LOVE', lastUsedAt: null, useCount: 0, custom: false });
      state.segments[0].config.giftCounts.push({ id: 'lg1', giftId: 'gift-1', initial: 0, given: 0 });
      rerender();

      const row = findByText(container, 'span', 'あふれる想い (30000pt)').closest('.punishment-row');
      findByText(row, 'button', '－').click();

      const updatedRow = findByText(container, 'span', 'あふれる想い (30000pt)').closest('.punishment-row');
      const countEl = findByText(updatedRow, 'span', '残り-1');
      expect(countEl).toBeTruthy();
      expect(countEl.classList.contains('points-negative')).toBe(true);
    });

    it('「＋」を押すと直前の記録が取り消され、残数が1増える', () => {
      state.giftMaster.push({ id: 'gift-1', name: 'あふれる想い', points: 30000, category: 'LOVE', lastUsedAt: null, useCount: 0, custom: false });
      state.segments[0].config.giftCounts.push({ id: 'lg1', giftId: 'gift-1', initial: 3, given: 2 });
      rerender();

      const row = findByText(container, 'span', 'あふれる想い (30000pt)').closest('.punishment-row');
      findByText(row, 'button', '＋').click();

      const record = state.segments[0].config.giftCounts.find((r) => r.giftId === 'gift-1');
      expect(record.given).toBe(1);
    });

    it('given=0の状態で「＋」を押しても0未満にはならない', () => {
      state.giftMaster.push({ id: 'gift-1', name: 'あふれる想い', points: 30000, category: 'LOVE', lastUsedAt: null, useCount: 0, custom: false });
      rerender();

      const row = findByText(container, 'span', 'あふれる想い (30000pt)').closest('.punishment-row');
      findByText(row, 'button', '＋').click();

      expect(state.segments[0].config.giftCounts).toHaveLength(0);
    });
  });

  describe('ギフトの新規登録', () => {
    it('「＋ LOVEギフトを追加」でprompt入力した内容がギフトマスタに現在のカテゴリで追加され、一覧にも表示される', async () => {
      showPrompt.mockResolvedValueOnce('新規あふおも2').mockResolvedValueOnce('25000');

      findByText(container, 'button', '＋ LOVEギフトを追加').click();
      await flush();

      const gift = state.giftMaster.find((g) => g.name === '新規あふおも2');
      expect(gift).toMatchObject({ name: '新規あふおも2', points: 25000, category: 'LOVE', custom: true });
      expect(findByText(container, 'span', '新規あふおも2 (25000pt)')).toBeTruthy();
    });

    it('カテゴリを切り替えた状態で追加すると、そのカテゴリでギフトマスタに登録される', async () => {
      state.giftMaster.push({ id: 'gift-1', name: '拍手', points: 200, category: '定番', lastUsedAt: null, useCount: 0, custom: false });
      state.segments[0].config.category = '定番';
      rerender();

      showPrompt.mockResolvedValueOnce('新規定番ギフト').mockResolvedValueOnce('300');

      findByText(container, 'button', '＋ 定番ギフトを追加').click();
      await flush();

      const gift = state.giftMaster.find((g) => g.name === '新規定番ギフト');
      expect(gift).toMatchObject({ category: '定番' });
    });

    it('ギフト名を空欄でキャンセルすると何も追加されない', async () => {
      showPrompt.mockResolvedValueOnce(null);

      findByText(container, 'button', '＋ LOVEギフトを追加').click();
      await flush();

      expect(state.giftMaster).toHaveLength(0);
    });

    it('ポイント数を空欄で登録すると、登録された値は「不明」扱い(null)になる', async () => {
      showPrompt.mockResolvedValueOnce('新規景品').mockResolvedValueOnce('');

      findByText(container, 'button', '＋ LOVEギフトを追加').click();
      await flush();

      const gift = state.giftMaster.find((g) => g.name === '新規景品');
      expect(gift.points).toBeNull();
      expect(findByText(container, 'span', '新規景品')).toBeTruthy();
    });
  });
});

describe('renderCategoryEndurance - segmentId指定(日付ベースの非既定インスタンス)', () => {
  it('segmentId指定時は、key==="categoryEndurance"でなくてもそのsegmentを直接表示する', () => {
    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div>';
    const container = document.getElementById('root');
    const state = buildState();
    state.segments.push({
      id: 'seg-extra', eventId: 'event1', type: 'categoryEndurance', key: null, name: '2周目の耐久', config: { category: '定番', giftCounts: [] },
    });

    renderCategoryEndurance({
      state, save: vi.fn(), rerender: () => {}, container, segmentId: 'seg-extra',
    });

    expect(container.querySelector('.segment-name-header').value).toBe('2周目の耐久');
    expect(container.querySelector('select').value).toBe('定番');
  });
});
