// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openConditionModal } from '../js/views/conditionModal.js';
import { showAlert } from '../js/views/dialogs.js';

vi.mock('../js/views/dialogs.js', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
}));

// クリックハンドラがdialogs(Promiseベース)をawaitするようになったため、クリック後に
// マイクロタスクを十分にフラッシュしてから状態を検証する。
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function setupDom() {
  document.body.innerHTML = '<div id="modal-root"></div>';
}

function baseState() {
  return {
    users: [],
    giftMaster: [{ id: 'gift-1', name: 'テストギフト', points: 100, category: '定番', lastUsedAt: null, useCount: 0, custom: false }],
    giftLogs: [],
  };
}

function clickButtonByText(text) {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!btn) throw new Error(`button not found: ${text}`);
  btn.click();
}

function setInputValue(selector, value) {
  const input = document.querySelector(selector);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('openConditionModal', () => {
  let state;
  let item;

  beforeEach(() => {
    vi.clearAllMocks();
    showAlert.mockResolvedValue(undefined);
    setupDom();
    state = baseState();
    item = { id: 'item1', name: 'パネル1', imageUrl: '', conditions: [] };
  });

  it('既定(giftPoints)のまま条件名と目標ptを入力すると保存できる', () => {
    const save = vi.fn();
    const onSaved = vi.fn();
    openConditionModal({ state, save, item, onSaved });

    document.querySelector('input[type="text"]').value = '累計30,000pt';
    document.querySelector('input[type="text"]').dispatchEvent(new Event('input'));
    setInputValue('#cond-target', '30000');
    clickButtonByText('追加する');

    expect(item.conditions).toHaveLength(1);
    expect(item.conditions[0]).toMatchObject({ label: '累計30,000pt', kind: 'giftPoints', target: 30000 });
    expect(save).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it('手動チェックを選ぶと目標値入力欄がなく、achieved:falseで保存される', () => {
    const save = vi.fn();
    const onSaved = vi.fn();
    openConditionModal({ state, save, item, onSaved });

    clickButtonByText('手動チェック(スター・同接など)');
    document.querySelector('input[type="text"]').value = 'スター300,000';
    document.querySelector('input[type="text"]').dispatchEvent(new Event('input'));
    expect(document.querySelector('#cond-target')).toBeNull();

    clickButtonByText('追加する');

    expect(item.conditions).toHaveLength(1);
    expect(item.conditions[0]).toMatchObject({ label: 'スター300,000', kind: 'manualCheck', achieved: false });
  });

  it('特定ギフトの個数を選ぶとピッカーからギフトを選択でき、giftIdが保存される', () => {
    const save = vi.fn();
    const onSaved = vi.fn();
    openConditionModal({ state, save, item, onSaved });

    clickButtonByText('特定ギフトの個数');
    document.querySelector('input[type="text"]').value = 'その他ギフト5個';
    document.querySelector('input[type="text"]').dispatchEvent(new Event('input'));
    clickButtonByText('テストギフト (100pt)');
    setInputValue('#cond-target', '5');
    clickButtonByText('追加する');

    expect(item.conditions).toHaveLength(1);
    expect(item.conditions[0]).toMatchObject({ label: 'その他ギフト5個', kind: 'giftCount', giftId: 'gift-1', target: 5 });
  });

  it('条件名が空だとアラートを出して保存しない', async () => {
    const save = vi.fn();
    openConditionModal({ state, save, item, onSaved: vi.fn() });

    setInputValue('#cond-target', '1000');
    clickButtonByText('追加する');
    await flush();

    expect(showAlert).toHaveBeenCalled();
    expect(item.conditions).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('giftCountでギフト未選択のまま保存しようとするとアラートを出す', async () => {
    openConditionModal({ state, save: vi.fn(), item, onSaved: vi.fn() });

    clickButtonByText('特定ギフトの個数');
    document.querySelector('input[type="text"]').value = 'ラベル';
    document.querySelector('input[type="text"]').dispatchEvent(new Event('input'));
    clickButtonByText('追加する');
    await flush();

    expect(showAlert).toHaveBeenCalled();
    expect(item.conditions).toHaveLength(0);
  });

  it('回帰: 目標値を入力後、選択中と同じ種類ボタンを再クリックしても入力値は保持される', () => {
    openConditionModal({ state, save: vi.fn(), item, onSaved: vi.fn() });

    setInputValue('#cond-target', '12345');
    clickButtonByText('累計pt(ギフト種類問わず)'); // 既に選択中のkindを再クリック

    expect(document.querySelector('#cond-target').value).toBe('12345');
  });
});
