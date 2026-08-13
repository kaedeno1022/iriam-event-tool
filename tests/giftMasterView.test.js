// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { renderGiftMaster } from '../js/views/giftMasterView.js';
import { showAlert, showConfirm } from '../js/views/dialogs.js';

vi.mock('../js/views/dialogs.js', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
}));

// クリックハンドラがdialogs(Promiseベース)をawaitするようになったため、クリック後に
// マイクロタスクを十分にフラッシュしてから状態を検証する(他のview testと同じ方式)。
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function buildState() {
  return {
    giftMaster: [
      {
        id: 'g1', name: 'しらすまん', points: 200, category: '定番', memo: '', lastUsedAt: null, useCount: 0, custom: false,
      },
      {
        id: 'g2', name: 'あふれる想い', points: 30000, category: 'LOVE', memo: '', lastUsedAt: null, useCount: 3, custom: false,
      },
      {
        id: 'g3', name: 'パイ投げ', points: 500, category: 'ネタ', memo: '', lastUsedAt: null, useCount: 10, custom: false,
      },
    ],
  };
}

function findByText(root, tag, text) {
  return [...root.querySelectorAll(tag)].find((el) => el.textContent === text);
}

function clickByText(root, tag, text) {
  const el = findByText(root, tag, text);
  if (!el) throw new Error(`${tag} not found: ${text}`);
  el.click();
}

// ギフト名・pt・カテゴリはいずれもinputなのでtextContentに現れない。名前セル(1列目)の
// input.valueで行を特定する。
function rowNames(root) {
  return [...root.querySelectorAll('.gift-master-table tbody tr')].map((r) => r.querySelector('td:first-child input').value);
}

function findRowByName(root, name) {
  return [...root.querySelectorAll('.gift-master-table tbody tr')].find((r) => r.querySelector('td:first-child input').value === name);
}

describe('renderGiftMaster', () => {
  let container;
  let rerender;
  let state;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="root"></div>';
    container = document.getElementById('root');
    state = buildState();
    rerender = () => {
      container.replaceChildren();
      renderGiftMaster({
        state, save: vi.fn(), rerender, container,
      });
    };
    rerender();
  });

  it('登録済みギフトが一覧表示される', () => {
    const rows = container.querySelectorAll('.gift-master-table tbody tr');
    expect(rows).toHaveLength(3);
  });

  it('カテゴリタブに「すべて」+実在カテゴリが表示される', () => {
    const tabs = [...container.querySelectorAll('.category-tabs .tab')].map((t) => t.textContent);
    expect(tabs).toEqual(['すべて', '定番', 'ネタ', 'LOVE']);
  });

  it('カテゴリタブをクリックすると一覧がそのカテゴリだけに絞り込まれる', () => {
    clickByText(container, '.category-tabs button', 'ネタ');
    expect(rowNames(container)).toEqual(['パイ投げ']);
  });

  it('検索語を入力すると名前の部分一致で絞り込まれる', () => {
    const searchInput = container.querySelector('input[type="search"]');
    searchInput.value = 'たらい';
    searchInput.dispatchEvent(new Event('input'));
    expect(container.querySelector('.gift-master-list').textContent).toContain('該当ギフトなし');
  });

  it('該当ギフトが無い場合は「該当ギフトなし」と表示される', () => {
    const searchInput = container.querySelector('input[type="search"]');
    searchInput.value = '存在しない名前';
    searchInput.dispatchEvent(new Event('input'));
    expect(container.querySelector('.gift-master-list').textContent).toContain('該当ギフトなし');
  });

  it('名前・pt・カテゴリの入力欄を編集するとstateに反映されsaveが呼ばれる', () => {
    const nameInput = container.querySelector('.gift-master-table tbody tr input[type="text"]');
    nameInput.value = '改名後';
    nameInput.dispatchEvent(new Event('input'));
    expect(state.giftMaster.find((g) => g.id === 'g1').name).toBe('改名後');
  });

  it('ptを空欄にするとnullになる', () => {
    const ptInput = container.querySelector('.gift-master-table tbody tr input[type="number"]');
    ptInput.value = '';
    ptInput.dispatchEvent(new Event('input'));
    expect(state.giftMaster.find((g) => g.id === 'g1').points).toBeNull();
  });

  it('↑↓ボタンで同カテゴリ内の並び替えができる(moveGiftInCategoryの結果が再描画に反映される)', () => {
    // ネタカテゴリに2件目のギフトを追加し、隣接入れ替えの効果を確認できるようにする。
    // sort:manual(配列の物理的な並び順をそのまま表示)にすることで、moveGiftInCategoryが
    // giftMaster配列自体を書き換えたことを直接確認できる。
    state.giftMaster.push({
      id: 'g4', name: 'たらい落とし', points: 500, category: 'ネタ', memo: '', lastUsedAt: null, useCount: 1, custom: false,
    });
    rerender();
    clickByText(container, '.category-tabs button', 'ネタ');
    container.querySelector('select').value = 'manual';
    container.querySelector('select').dispatchEvent(new Event('change'));

    expect(rowNames(container)).toEqual(['パイ投げ', 'たらい落とし']);

    findRowByName(container, 'たらい落とし').querySelector('button[title="上へ"]').click();
    expect(rowNames(container)).toEqual(['たらい落とし', 'パイ投げ']);
  });

  it('削除ボタンでconfirmするとギフトが削除される', async () => {
    showConfirm.mockResolvedValueOnce(true);
    findRowByName(container, 'しらすまん').querySelector('button[title="削除"]').click();
    await flush();
    expect(state.giftMaster.find((g) => g.id === 'g1')).toBeUndefined();
  });

  it('削除ボタンでキャンセルするとギフトは残る', async () => {
    showConfirm.mockResolvedValueOnce(false);
    findRowByName(container, 'しらすまん').querySelector('button[title="削除"]').click();
    await flush();
    expect(state.giftMaster.find((g) => g.id === 'g1')).toBeTruthy();
  });

  it('新規登録: 名前・カテゴリを入力して追加すると一覧に反映される', async () => {
    const [nameInput, , categoryInput] = container.querySelectorAll('.form-row.inline input');
    nameInput.value = '新規ギフト';
    nameInput.dispatchEvent(new Event('input'));
    categoryInput.value = 'その他';
    categoryInput.dispatchEvent(new Event('input'));
    clickByText(container, 'button', '追加');
    await flush();

    expect(state.giftMaster).toHaveLength(4);
    const added = state.giftMaster.find((g) => g.name === '新規ギフト');
    expect(added).toMatchObject({ category: 'その他', custom: true });
  });

  it('新規登録: 名前・カテゴリが両方空欄だとshowAlertを出して追加しない', async () => {
    showAlert.mockResolvedValueOnce(undefined);
    clickByText(container, 'button', '追加');
    await flush();

    expect(showAlert).toHaveBeenCalled();
    expect(state.giftMaster).toHaveLength(3);
  });

  it('新規登録: 名前のみ入力しカテゴリが空欄だとshowAlertを出して追加しない', async () => {
    showAlert.mockResolvedValueOnce(undefined);
    const [nameInput] = container.querySelectorAll('.form-row.inline input');
    nameInput.value = '新規ギフト';
    nameInput.dispatchEvent(new Event('input'));
    clickByText(container, 'button', '追加');
    await flush();

    expect(showAlert).toHaveBeenCalled();
    expect(state.giftMaster).toHaveLength(3);
  });

  it('新規登録: カテゴリのみ入力し名前が空欄だとshowAlertを出して追加しない', async () => {
    showAlert.mockResolvedValueOnce(undefined);
    const [, , categoryInput] = container.querySelectorAll('.form-row.inline input');
    categoryInput.value = 'その他';
    categoryInput.dispatchEvent(new Event('input'));
    clickByText(container, 'button', '追加');
    await flush();

    expect(showAlert).toHaveBeenCalled();
    expect(state.giftMaster).toHaveLength(3);
  });
});
