// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { openPrizeModal } from '../js/views/prizeModal.js';
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

// クリックハンドラがshowAlert(Promiseベース)をawaitするようになったため、クリック後に
// マイクロタスクを十分にフラッシュしてから状態を検証する。
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('openPrizeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showAlert.mockResolvedValue(undefined);
    setupDom();
  });

  it('景品0件から新規追加すると、確率入力欄はdisabledで強制的に100%になる', () => {
    const prizes = [];
    const save = vi.fn();
    const onSaved = vi.fn();
    openPrizeModal({
      prizes, prize: null, save, onSaved,
    });

    expect(document.querySelector('#prize-probability').disabled).toBe(true);
    setInputValue('#prize-name', '景品A');
    clickButtonByText('追加する');

    expect(prizes).toHaveLength(1);
    expect(prizes[0]).toMatchObject({ name: '景品A', probability: 100, stock: null, allowDuplicate: false, guaranteedPoints: null });
    expect(save).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it('景品が既にある状態で追加すると、入力した確率分を確保し既存景品が比例縮小される', () => {
    const prizes = [{ id: 'p1', name: '既存', probability: 100, stock: null, allowDuplicate: false, guaranteedPoints: null }];
    const save = vi.fn();
    openPrizeModal({
      prizes, prize: null, save, onSaved: vi.fn(),
    });

    setInputValue('#prize-name', '新景品');
    setInputValue('#prize-probability', '30');
    setInputValue('#prize-stock', '10');
    document.querySelector('#prize-allow-duplicate').click();
    clickButtonByText('追加する');

    expect(prizes).toHaveLength(2);
    const added = prizes.find((p) => p.name === '新景品');
    expect(added).toMatchObject({
      probability: 30, stock: 10, allowDuplicate: true, guaranteedPoints: null,
    });
    expect(prizes.find((p) => p.id === 'p1').probability).toBe(70);
  });

  it('景品名が空なら保存されずアラートが出る', async () => {
    const prizes = [];
    const save = vi.fn();
    openPrizeModal({
      prizes, prize: null, save, onSaved: vi.fn(),
    });

    clickButtonByText('追加する');
    await flush();

    expect(prizes).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('景品名を入力してください');
  });

  it('確率が0〜100の範囲外なら保存されずアラートが出る', async () => {
    const prizes = [{ id: 'p1', name: '既存', probability: 100, stock: null, allowDuplicate: false, guaranteedPoints: null }];
    const save = vi.fn();
    openPrizeModal({
      prizes, prize: null, save, onSaved: vi.fn(),
    });

    setInputValue('#prize-name', '新景品');
    setInputValue('#prize-probability', '150');
    clickButtonByText('追加する');
    await flush();

    expect(prizes).toHaveLength(1);
    expect(showAlert).toHaveBeenCalledWith('確率は0〜100の整数で入力してください');
  });

  it('確定枠に0以下の値を入力すると保存されずアラートが出る', async () => {
    const prizes = [];
    const save = vi.fn();
    openPrizeModal({
      prizes, prize: null, save, onSaved: vi.fn(),
    });

    setInputValue('#prize-name', '新景品');
    setInputValue('#prize-guaranteed', '0');
    clickButtonByText('追加する');
    await flush();

    expect(prizes).toHaveLength(0);
    expect(showAlert).toHaveBeenCalledWith('確定枠の必要ptは正の数値で入力してください');
  });

  it('編集モードでは既存値がinputの初期値になる', () => {
    const prize = {
      id: 'p1', name: '既存景品', probability: 40, stock: 5, allowDuplicate: true, guaranteedPoints: 300,
    };
    const prizes = [prize, { id: 'p2', name: '他景品', probability: 60, stock: null, allowDuplicate: false, guaranteedPoints: null }];
    openPrizeModal({
      prizes, prize, save: vi.fn(), onSaved: vi.fn(),
    });

    expect(document.querySelector('#prize-name').value).toBe('既存景品');
    expect(document.querySelector('#prize-probability').value).toBe('40');
    expect(document.querySelector('#prize-stock').value).toBe('5');
    expect(document.querySelector('#prize-allow-duplicate').checked).toBe(true);
    expect(document.querySelector('#prize-guaranteed').value).toBe('300');
  });

  it('編集で確率を変更すると、対象自身は書き換わらず他の景品だけがredistributeされる', () => {
    const prize = {
      id: 'p1', name: '既存景品', probability: 40, stock: null, allowDuplicate: false, guaranteedPoints: null,
    };
    const other = {
      id: 'p2', name: '他景品', probability: 60, stock: null, allowDuplicate: false, guaranteedPoints: null,
    };
    const prizes = [prize, other];
    openPrizeModal({
      prizes, prize, save: vi.fn(), onSaved: vi.fn(),
    });

    setInputValue('#prize-probability', '80');
    clickButtonByText('保存する');

    expect(prize.probability).toBe(80);
    expect(other.probability).toBe(20);
  });

  it('景品が1件のみの編集では確率入力欄がdisabledで常に100%のまま保存される', () => {
    const prize = {
      id: 'p1', name: '既存景品', probability: 100, stock: null, allowDuplicate: false, guaranteedPoints: null,
    };
    const prizes = [prize];
    openPrizeModal({
      prizes, prize, save: vi.fn(), onSaved: vi.fn(),
    });

    expect(document.querySelector('#prize-probability').disabled).toBe(true);
    setInputValue('#prize-name', '改名後');
    clickButtonByText('保存する');

    expect(prize.name).toBe('改名後');
    expect(prize.probability).toBe(100);
  });

  it('initialValues(コピー用)を渡すと新規作成モードのままその値が初期表示される', () => {
    const prizes = [];
    openPrizeModal({
      prizes,
      prize: null,
      initialValues: { name: 'コピー元特典', stock: 3, allowDuplicate: true },
      save: vi.fn(),
      onSaved: vi.fn(),
    });

    expect(document.querySelector('#prize-name').value).toBe('コピー元特典');
    expect(document.querySelector('#prize-stock').value).toBe('3');
    expect(document.querySelector('#prize-allow-duplicate').checked).toBe(true);
  });

  it('バリアントを読点/カンマ区切りで入力すると、trimして空要素を除いた配列で保存される', () => {
    const prizes = [];
    openPrizeModal({
      prizes, prize: null, save: vi.fn(), onSaved: vi.fn(),
    });

    setInputValue('#prize-name', 'ランダムチェキ');
    setInputValue('#prize-variants', ' A、B,C ,,');
    clickButtonByText('追加する');

    expect(prizes[0].variants).toEqual(['A', 'B', 'C']);
  });

  it('バリアント欄が空欄なら空配列で保存される', () => {
    const prizes = [];
    openPrizeModal({
      prizes, prize: null, save: vi.fn(), onSaved: vi.fn(),
    });

    setInputValue('#prize-name', '通常景品');
    clickButtonByText('追加する');

    expect(prizes[0].variants).toEqual([]);
  });

  it('編集モードでは既存のvariantsが読点区切りで初期表示され、保存すると更新される', () => {
    const prize = {
      id: 'p1', name: '既存景品', probability: 100, stock: null, allowDuplicate: false, guaranteedPoints: null, variants: ['A', 'B'],
    };
    const prizes = [prize];
    openPrizeModal({
      prizes, prize, save: vi.fn(), onSaved: vi.fn(),
    });

    expect(document.querySelector('#prize-variants').value).toBe('A、B');

    setInputValue('#prize-variants', 'X、Y、Z');
    clickButtonByText('保存する');

    expect(prize.variants).toEqual(['X', 'Y', 'Z']);
  });

  it('キャンセルすると何も保存されずモーダルが閉じる', () => {
    const prizes = [];
    const save = vi.fn();
    openPrizeModal({
      prizes, prize: null, save, onSaved: vi.fn(),
    });

    clickButtonByText('キャンセル');

    expect(prizes).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
    expect(document.querySelector('.modal-box')).toBeNull();
  });

  // Number.isFinite に戻すと通ってしまうため、範囲内の小数で整数制約そのものを検証する。
  // 小数を許すと redistributeProbability の丸めで合計が100からわずかにずれ、
  // 合計100の判定(===)から外れて誤警告が出る。
  it('範囲内でも小数の確率は保存されずアラートが出る', async () => {
    const prizes = [
      { id: 'p1', name: '既存A', probability: 50, stock: null, allowDuplicate: true },
      { id: 'p2', name: '既存B', probability: 50, stock: null, allowDuplicate: true },
    ];
    const save = vi.fn();
    openPrizeModal({ prizes, prize: null, save, onSaved: vi.fn() });

    setInputValue('#prize-name', '新規景品');
    setInputValue('#prize-probability', '12.5');
    clickButtonByText('追加する');
    await flush();

    expect(showAlert).toHaveBeenCalledWith('確率は0〜100の整数で入力してください');
    expect(prizes).toHaveLength(2);
    expect(save).not.toHaveBeenCalled();
  });
});
