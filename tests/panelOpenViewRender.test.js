// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderPanelOpen } from '../js/views/panelOpenView.js';
import { showAlert, showConfirm, showPrompt } from '../js/views/dialogs.js';

vi.mock('../js/views/dialogs.js', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
}));

function buildState() {
  return {
    events: [{ id: 'event1' }],
    activeEventId: 'event1',
    segments: [{
      id: 'seg1',
      eventId: 'event1',
      type: 'panelOpen',
      key: 'panelOpen',
      name: 'パネル開け',
      config: {
        imageUrl: '',
        conditions: [
          { id: 'c1', label: 'スター300,000', kind: 'manualCheck', achieved: false },
        ],
      },
    }],
    giftLogs: [],
    users: [],
    giftMaster: [],
  };
}

// クリックハンドラがdialogs(Promiseベース)をawaitするようになったため、クリック後に
// マイクロタスクを十分にフラッシュしてから状態を検証する。
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function clickButtonByText(text, root = document) {
  const btn = [...root.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!btn) throw new Error(`button not found: ${text}`);
  btn.click();
}

describe('renderPanelOpen - manualCheck条件', () => {
  let container;
  let rerender;
  let state;

  beforeEach(() => {
    vi.clearAllMocks();
    showAlert.mockResolvedValue(undefined);
    showConfirm.mockResolvedValue(true);
    showPrompt.mockResolvedValue(null);

    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div><div id="dialog-root"></div>';
    container = document.getElementById('root');
    state = buildState();
    rerender = () => {
      container.replaceChildren();
      renderPanelOpen({ state, save: vi.fn(), rerender, container });
    };
    rerender();
  });

  it('チェックをONにすると達成バッジが表示される', () => {
    const checkbox = container.querySelector('input[type="checkbox"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    const badges = [...container.querySelectorAll('.badge-done')];
    expect(badges.some((b) => b.textContent === '達成')).toBe(true);
    expect(state.segments[0].config.conditions[0].achieved).toBe(true);
  });

  it('記録ボタンからモーダルを開き、メモと現在値を入力すると履歴に追加され画面に表示される', () => {
    clickButtonByText('記録', container);

    document.querySelector('#note-value').value = '182000';
    document.querySelector('#note-memo').value = '公式アプリで確認';
    clickButtonByText('記録する');

    const condition = state.segments[0].config.conditions[0];
    expect(condition.notes).toHaveLength(1);
    expect(condition.notes[0]).toMatchObject({ value: 182000, memo: '公式アプリで確認' });
    expect(container.textContent).toContain('182000');
    expect(container.textContent).toContain('公式アプリで確認');
  });

  it('現在値を空欄のまま確定するとvalueはnullでメモだけ記録される', () => {
    clickButtonByText('記録', container);

    document.querySelector('#note-memo').value = 'メモのみ';
    clickButtonByText('記録する');

    const condition = state.segments[0].config.conditions[0];
    expect(condition.notes[0]).toMatchObject({ value: null, memo: 'メモのみ' });
  });

  it('現在値に"0"を入力した場合、falsy値トラップでnull扱いにならず0として保存される', () => {
    clickButtonByText('記録', container);

    document.querySelector('#note-value').value = '0';
    document.querySelector('#note-memo').value = 'ゼロ確認';
    clickButtonByText('記録する');

    const condition = state.segments[0].config.conditions[0];
    expect(condition.notes[0]).toMatchObject({ value: 0, memo: 'ゼロ確認' });
  });

  it('メモ・現在値とも空欄のまま確定しようとするとアラートを出して記録を追加しない', async () => {
    clickButtonByText('記録', container);

    clickButtonByText('記録する');
    await flush();

    const condition = state.segments[0].config.conditions[0];
    expect(condition.notes ?? []).toHaveLength(0);
    expect(showAlert).toHaveBeenCalled();
  });

  it('キャンセルすると入力内容を破棄しモーダルを閉じる(記録は追加されない)', () => {
    clickButtonByText('記録', container);

    document.querySelector('#note-memo').value = '破棄されるはずのメモ';
    clickButtonByText('キャンセル');

    const condition = state.segments[0].config.conditions[0];
    expect(condition.notes ?? []).toHaveLength(0);
    expect(document.querySelector('#note-memo')).toBeNull(); // モーダルが閉じている
  });
});

describe('renderPanelOpen - 画像URL・条件追加', () => {
  let container;
  let rerender;
  let state;

  beforeEach(() => {
    vi.clearAllMocks();
    showAlert.mockResolvedValue(undefined);
    showConfirm.mockResolvedValue(true);
    showPrompt.mockResolvedValue(null);

    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div><div id="dialog-root"></div>';
    container = document.getElementById('root');
    state = buildState();
    rerender = () => {
      container.replaceChildren();
      renderPanelOpen({ state, save: vi.fn(), rerender, container });
    };
    rerender();
  });

  it('画像URL欄を編集するとsegment.config.imageUrlに保存され、サムネイルが表示される', () => {
    const input = [...container.querySelectorAll('input[type="text"]')].find((el) => el.placeholder === '画像URL(任意)');
    input.value = 'https://example.com/panel.png';
    input.dispatchEvent(new Event('input'));

    expect(state.segments[0].config.imageUrl).toBe('https://example.com/panel.png');
    rerender();
    expect(container.querySelector('img.panel-item-thumb').src).toBe('https://example.com/panel.png');
  });

  it('「＋ 条件を追加」でconditionModalが開き、追加した条件がsegment.config.conditionsに反映される', () => {
    clickButtonByText('＋ 条件を追加', container);
    expect(document.querySelector('.modal-box')).not.toBeNull();

    // 手動チェック条件を追加する(デフォルトのgiftPointsから切り替え)
    clickButtonByText('手動チェック(スター・同接など)');
    const labelInput = document.querySelector('.modal-box input[type="text"]');
    labelInput.value = '同接20人';
    labelInput.dispatchEvent(new Event('input'));
    clickButtonByText('追加する');

    expect(state.segments[0].config.conditions).toHaveLength(2);
    expect(state.segments[0].config.conditions[1]).toMatchObject({ label: '同接20人', kind: 'manualCheck' });
  });
});

describe('renderPanelOpen - 直近の記録一覧: 個数編集', () => {
  let container;
  let rerender;
  let state;

  function buildStateWithLog() {
    const s = buildState();
    s.giftMaster.push({ id: 'gift-1', name: 'テストギフト', points: 100, category: '定番', lastUsedAt: null, useCount: 1, custom: false });
    s.users.push({ id: 'u1', displayName: 'テストユーザー' });
    s.giftLogs.push({
      id: 'log1', timestamp: new Date().toISOString(), userId: 'u1', giftId: 'gift-1', points: 100, qty: 2, segmentId: 'seg1', conditionId: null,
    });
    return s;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    showAlert.mockResolvedValue(undefined);
    showConfirm.mockResolvedValue(true);
    showPrompt.mockResolvedValue(null);

    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div><div id="dialog-root"></div>';
    container = document.getElementById('root');
    state = buildStateWithLog();
    rerender = () => {
      container.replaceChildren();
      renderPanelOpen({ state, save: vi.fn(), rerender, container });
    };
    rerender();
  });

  function clickEditButton() {
    const btn = [...container.querySelectorAll('button')].find((b) => b.title === '個数を編集');
    btn.click();
  }

  it('編集ボタンで正しい個数を入力すると記録のqtyが更新される', async () => {
    showPrompt.mockResolvedValueOnce('5');
    clickEditButton();
    await flush();

    expect(state.giftLogs[0].qty).toBe(5);
    expect(container.textContent).toContain('×5');
  });

  it('promptに現在の個数が初期値として渡される', async () => {
    showPrompt.mockResolvedValueOnce(null);
    clickEditButton();
    await flush();

    expect(showPrompt).toHaveBeenCalledWith('新しい個数を入力', '2');
  });

  it('0以下や非整数を入力するとアラートを出しqtyを変更しない', async () => {
    showPrompt.mockResolvedValueOnce('0');
    clickEditButton();
    await flush();
    expect(state.giftLogs[0].qty).toBe(2);
    expect(showAlert).toHaveBeenCalled();

    showAlert.mockClear();
    showPrompt.mockResolvedValueOnce('1.5');
    clickEditButton();
    await flush();
    expect(state.giftLogs[0].qty).toBe(2);
    expect(showAlert).toHaveBeenCalled();
  });

  it('キャンセルするとqtyを変更しない', async () => {
    showPrompt.mockResolvedValueOnce(null);
    clickEditButton();
    await flush();

    expect(state.giftLogs[0].qty).toBe(2);
  });

  it('記録が複数ある場合、編集した行のログだけが更新され他のログは変わらない(クロージャ捕捉の回帰)', async () => {
    state.giftLogs.push({
      id: 'log2', timestamp: new Date().toISOString(), userId: 'u1', giftId: 'gift-1', points: 100, qty: 9, segmentId: 'seg1', conditionId: null,
    });
    rerender();

    const editButtons = [...container.querySelectorAll('button')].filter((b) => b.title === '個数を編集');
    expect(editButtons).toHaveLength(2);

    // 表示順(タイムスタンプでの並び)に依存せず、qty=9(log2)の行を内容で特定する
    const log2Row = [...container.querySelectorAll('tr')].find((tr) => tr.textContent.includes('×9'));
    const log2EditBtn = [...log2Row.querySelectorAll('button')].find((b) => b.title === '個数を編集');

    showPrompt.mockResolvedValueOnce('20');
    log2EditBtn.click();
    await flush();

    const log1 = state.giftLogs.find((l) => l.id === 'log1');
    const log2 = state.giftLogs.find((l) => l.id === 'log2');
    expect(log2.qty).toBe(20);
    expect(log1.qty).toBe(2); // 編集していない側は元のまま
  });
});

describe('renderPanelOpen - segmentId指定(日付ベースの非既定インスタンス)', () => {
  it('segmentId指定時は、key==="panelOpen"でなくてもそのsegmentを直接表示する', () => {
    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div><div id="dialog-root"></div>';
    const container = document.getElementById('root');
    const state = buildState();
    state.segments.push({
      id: 'seg-extra',
      eventId: 'event1',
      type: 'panelOpen',
      key: null,
      name: '土曜のパネル',
      config: { imageUrl: '', conditions: [] },
    });

    renderPanelOpen({
      state, save: vi.fn(), rerender: vi.fn(), container, segmentId: 'seg-extra',
    });

    expect(container.textContent).toContain('土曜のパネル');
    expect(container.textContent).not.toContain('スター300,000'); // 既定枠(seg1)側の条件は表示されない
  });

  it('segmentId未指定時は従来通り既定枠(key==="panelOpen")を表示する', () => {
    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div><div id="dialog-root"></div>';
    const container = document.getElementById('root');
    const state = buildState();
    state.segments.push({
      id: 'seg-extra', eventId: 'event1', type: 'panelOpen', key: null, name: '土曜のパネル', config: { imageUrl: '', conditions: [] },
    });

    renderPanelOpen({
      state, save: vi.fn(), rerender: vi.fn(), container,
    });

    expect(container.textContent).toContain('スター300,000');
    expect(container.textContent).not.toContain('土曜のパネル');
  });
});
