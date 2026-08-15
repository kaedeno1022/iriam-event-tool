// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { openStockItemModal } from '../js/views/stockItemModal.js';
import { showAlert } from '../js/views/dialogs.js';

vi.mock('../js/views/dialogs.js', () => ({
  showAlert: vi.fn(),
}));

function setupDom() {
  document.body.innerHTML = '<div id="modal-root"></div>';
}

function setInputValue(selector, value) {
  const input = document.querySelector(selector);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function clickButtonByText(text) {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!btn) throw new Error(`button not found: ${text}`);
  btn.click();
}

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('openStockItemModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showAlert.mockResolvedValue(undefined);
    setupDom();
  });

  it('新規追加: 全項目を入力すると追加される', () => {
    const items = [];
    const save = vi.fn();
    const onSaved = vi.fn();
    openStockItemModal({
      items, item: null, kind: '特典', save, onSaved,
    });

    setInputValue('#stockitem-name', 'オムライスらくがき');
    setInputValue('#stockitem-points', '200');
    setInputValue('#stockitem-stock', '5');
    document.querySelector('#stockitem-allow-duplicate').click();
    clickButtonByText('追加する');

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: 'オムライスらくがき', requiredPoints: 200, stock: 5, allowDuplicate: true,
    });
    expect(save).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it('必要ポイント・在庫を空欄にすると、null(不明/無制限)で追加される', () => {
    const items = [];
    openStockItemModal({
      items, item: null, kind: '特典', save: vi.fn(), onSaved: vi.fn(),
    });

    setInputValue('#stockitem-name', '無料特典');
    clickButtonByText('追加する');

    expect(items[0]).toMatchObject({ requiredPoints: null, stock: null, allowDuplicate: false });
  });

  it('特典名が空なら保存されずアラートが出る', async () => {
    const items = [];
    const save = vi.fn();
    openStockItemModal({
      items, item: null, kind: '特典', save, onSaved: vi.fn(),
    });

    clickButtonByText('追加する');
    await flush();

    expect(items).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('特典名を入力してください');
  });

  it('編集モードでは既存値がinputの初期値になり、保存すると同じオブジェクトが更新される', () => {
    const item = {
      id: 'i1', name: '旧名称', requiredPoints: 100, stock: 2, allowDuplicate: false,
    };
    const items = [item];
    openStockItemModal({
      items, item, kind: '特典', save: vi.fn(), onSaved: vi.fn(),
    });

    expect(document.querySelector('#stockitem-name').value).toBe('旧名称');
    expect(document.querySelector('#stockitem-points').value).toBe('100');
    expect(document.querySelector('#stockitem-stock').value).toBe('2');

    setInputValue('#stockitem-name', '新名称');
    clickButtonByText('保存する');

    expect(items).toHaveLength(1); // idが変わらず同じオブジェクトが更新される
    expect(item.name).toBe('新名称');
  });

  it('バリアントを読点/カンマ区切りで入力すると、trimして空要素を除いた配列で保存される', () => {
    const items = [];
    openStockItemModal({
      items, item: null, kind: '特典', save: vi.fn(), onSaved: vi.fn(),
    });

    setInputValue('#stockitem-name', 'ランダムグッズ');
    setInputValue('#stockitem-variants', ' X、Y,Z ,,');
    clickButtonByText('追加する');

    expect(items[0].variants).toEqual(['X', 'Y', 'Z']);
  });

  it('編集モードでは既存のvariantsが読点区切りで初期表示され、保存すると更新される', () => {
    const item = {
      id: 'i1', name: '旧名称', requiredPoints: 100, stock: 2, allowDuplicate: false, variants: ['A', 'B'],
    };
    const items = [item];
    openStockItemModal({
      items, item, kind: '特典', save: vi.fn(), onSaved: vi.fn(),
    });

    expect(document.querySelector('#stockitem-variants').value).toBe('A、B');

    setInputValue('#stockitem-variants', 'X、Y');
    clickButtonByText('保存する');

    expect(item.variants).toEqual(['X', 'Y']);
  });

  it('キャンセルすると何も保存されずモーダルが閉じる', () => {
    const items = [];
    const save = vi.fn();
    openStockItemModal({
      items, item: null, kind: '特典', save, onSaved: vi.fn(),
    });

    clickButtonByText('キャンセル');

    expect(items).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
    expect(document.querySelector('.modal-box')).toBeNull();
  });
});
