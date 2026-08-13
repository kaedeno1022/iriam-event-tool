// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { renderCounter } from '../js/views/counterView.js';
import { showAlert, showConfirm, showPrompt } from '../js/views/dialogs.js';

vi.mock('../js/views/dialogs.js', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
}));

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function clickButtonByText(text, root = document) {
  const btn = [...root.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!btn) throw new Error(`button not found: ${text}`);
  btn.click();
}

function buildState() {
  return {
    events: [{ id: 'event1' }],
    activeEventId: 'event1',
    segments: [{
      id: 'seg1',
      eventId: 'event1',
      type: 'counter',
      key: 'counter',
      name: 'カウンター',
      config: { count: 5, rules: [] },
    }],
    giftLogs: [],
    users: [{ id: 'u1', displayName: 'テストユーザー' }],
    giftMaster: [
      { id: 'gift-1', name: 'テストギフト', points: 100, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
    ],
  };
}

describe('renderCounter - 手動操作', () => {
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
      renderCounter({
        state, save: vi.fn(), rerender, container,
      });
    };
    rerender();
  });

  it('＋ボタンでcountが1増える', () => {
    clickButtonByText('＋', container);
    expect(state.segments[0].config.count).toBe(6);
  });

  it('－ボタンでcountが1減り、0未満にはならない', () => {
    state.segments[0].config.count = 0;
    rerender();
    clickButtonByText('－', container);
    expect(state.segments[0].config.count).toBe(0);
  });

  it('直接入力するとその値がcountに反映される', () => {
    const input = container.querySelector('input[type="number"]');
    input.value = '42';
    input.dispatchEvent(new Event('input'));
    expect(state.segments[0].config.count).toBe(42);
  });

  it('増減値を入力して「適用」を押すとcountに加算される(負値も可)', () => {
    const deltaInput = [...container.querySelectorAll('input[type="number"]')][1];
    deltaInput.value = '-3';
    clickButtonByText('適用', container);
    expect(state.segments[0].config.count).toBe(2);
  });

  it('適用後、0未満にはならない(下限クランプ)', () => {
    const deltaInput = [...container.querySelectorAll('input[type="number"]')][1];
    deltaInput.value = '-999';
    clickButtonByText('適用', container);
    expect(state.segments[0].config.count).toBe(0);
  });

  it('増減値0のまま適用してもcountは変化しない', () => {
    clickButtonByText('適用', container);
    expect(state.segments[0].config.count).toBe(5);
  });
});

describe('renderCounter - ルール管理', () => {
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
      renderCounter({
        state, save: vi.fn(), rerender, container,
      });
    };
    rerender();
  });

  function addRule(deltaValue) {
    clickButtonByText('＋ ルールを追加', container);
    clickButtonByText('テストギフト (100pt)');
    const deltaInput = document.querySelector('.modal-box input[type="number"]');
    deltaInput.value = String(deltaValue);
    clickButtonByText('追加する');
  }

  it('ギフトと増減値を指定してルールを追加すると一覧に表示される', () => {
    addRule(10);
    expect(state.segments[0].config.rules).toHaveLength(1);
    expect(state.segments[0].config.rules[0]).toMatchObject({ giftId: 'gift-1', delta: 10 });
    expect(container.textContent).toContain('テストギフト → +10');
  });

  it('マイナスの増減値も登録できる', () => {
    addRule(-5);
    expect(state.segments[0].config.rules[0].delta).toBe(-5);
    expect(container.textContent).toContain('テストギフト → -5');
  });

  it('ギフト未選択のまま追加しようとするとアラートを出しルールを追加しない', async () => {
    clickButtonByText('＋ ルールを追加', container);
    clickButtonByText('追加する');
    await flush();

    expect(showAlert).toHaveBeenCalled();
    expect(state.segments[0].config.rules).toHaveLength(0);
  });

  it('増減値0のまま追加しようとするとアラートを出しルールを追加しない', async () => {
    clickButtonByText('＋ ルールを追加', container);
    clickButtonByText('テストギフト (100pt)');
    const deltaInput = document.querySelector('.modal-box input[type="number"]');
    deltaInput.value = '0';
    clickButtonByText('追加する');
    await flush();

    expect(showAlert).toHaveBeenCalled();
    expect(state.segments[0].config.rules).toHaveLength(0);
  });

  it('増減値に非整数(小数)を入力しようとするとアラートを出しルールを追加しない', async () => {
    clickButtonByText('＋ ルールを追加', container);
    clickButtonByText('テストギフト (100pt)');
    const deltaInput = document.querySelector('.modal-box input[type="number"]');
    deltaInput.value = '1.5';
    clickButtonByText('追加する');
    await flush();

    expect(showAlert).toHaveBeenCalled();
    expect(state.segments[0].config.rules).toHaveLength(0);
  });

  it('削除ボタンでルールが一覧から消える', async () => {
    addRule(10);
    clickButtonByText('🗑', container);
    await flush();

    expect(state.segments[0].config.rules).toHaveLength(0);
  });
});

describe('renderCounter - ギフト記録との連動(共通記録欄からの自動適用)', () => {
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
    state.giftMaster.push({ id: 'gift-2', name: '無関係ギフト', points: 50, category: '定番', lastUsedAt: null, useCount: 0, custom: false });
    state.segments[0].config.rules = [{ id: 'rule1', giftId: 'gift-1', delta: 10 }];
    rerender = () => {
      container.replaceChildren();
      renderCounter({
        state, save: vi.fn(), rerender, container,
      });
    };
    rerender();
  });

  // 記録はルール固定ではない共通カート方式(giftRecordModalの通常のギフト選択)。
  // ギフトチップをqty回クリックしてカートに積んでから保存する。
  function recordGift(giftChipText, qty) {
    clickButtonByText('ギフトを記録', container);
    document.querySelector('#grm-user').value = 'u1';
    for (let i = 0; i < qty; i += 1) clickButtonByText(giftChipText);
    const saveBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('記録する'));
    saveBtn.click();
  }

  it('ルールに一致するギフトを記録すると、giftLogsに追加されcountがdelta×qtyぶん増える(conditionIdは特定ルールに紐づかずnull)', () => {
    recordGift('テストギフト (100pt)', 2);
    expect(state.giftLogs).toHaveLength(1);
    expect(state.giftLogs[0]).toMatchObject({
      giftId: 'gift-1', qty: 2, segmentId: 'seg1', conditionId: null, appliedDelta: 10,
    });
    expect(state.segments[0].config.count).toBe(25); // 5 + 10*2
  });

  it('ルールに一致しないギフトを記録すると、ログには残るがcountは変化しない', () => {
    recordGift('無関係ギフト (50pt)', 3);
    expect(state.giftLogs).toHaveLength(1);
    expect(state.giftLogs[0].appliedDelta).toBe(0);
    expect(state.segments[0].config.count).toBe(5); // 変化なし
    expect(container.textContent).toContain('無関係ギフト');
  });

  it('同じギフトに複数ルールが登録されていれば合算して適用される', () => {
    state.segments[0].config.rules.push({ id: 'rule2', giftId: 'gift-1', delta: 5 });
    rerender();
    recordGift('テストギフト (100pt)', 1);
    expect(state.segments[0].config.count).toBe(20); // 5 + (10+5)*1
  });

  it('直近の記録一覧にギフト名とカウントへの反映値が表示される', () => {
    recordGift('テストギフト (100pt)', 1);
    expect(container.textContent).toContain('テストギフト');
    expect(container.textContent).toContain('+10');
  });

  it('記録した個数を編集すると、記録時に適用したdeltaを使って差分ぶんcountが補正される', async () => {
    recordGift('テストギフト (100pt)', 2); // count: 5 + 20 = 25
    showPrompt.mockResolvedValueOnce('5');
    const editBtn = [...container.querySelectorAll('button')].find((b) => b.title === '個数を編集');
    editBtn.click();
    await flush();

    expect(state.giftLogs[0].qty).toBe(5);
    expect(state.segments[0].config.count).toBe(55); // 25 + 10*(5-2)
  });

  it('記録を取り消すと、記録時に適用したdeltaを使ってcountが戻る', async () => {
    recordGift('テストギフト (100pt)', 3); // count: 5 + 30 = 35
    const undoBtn = [...container.querySelectorAll('button')].find((b) => b.title === '取り消し');
    undoBtn.click();
    await flush();

    expect(state.giftLogs).toHaveLength(0);
    expect(state.segments[0].config.count).toBe(5);
  });

  it('記録後にルールの増減値を変更しても、過去の記録の個数編集時の補正は記録時のdeltaのまま変わらない', async () => {
    recordGift('テストギフト (100pt)', 2); // count: 5 + 10*2 = 25 (appliedDelta=10で記憶)
    state.segments[0].config.rules[0].delta = 999; // 事後にルールを変更
    rerender();

    showPrompt.mockResolvedValueOnce('3');
    const editBtn = [...container.querySelectorAll('button')].find((b) => b.title === '個数を編集');
    editBtn.click();
    await flush();

    expect(state.giftLogs[0].qty).toBe(3);
    expect(state.segments[0].config.count).toBe(35); // 25 + 10*(3-2)、999は使われない
  });

  it('記録後にルール自体を削除しても、そのログの個数編集は記録時のdeltaで正しく補正される(過去の記録は遡及不変)', async () => {
    recordGift('テストギフト (100pt)', 2); // count: 5 + 20 = 25 (appliedDelta=10で記憶)
    state.segments[0].config.rules = [];
    rerender();

    showPrompt.mockResolvedValueOnce('9');
    const editBtn = [...container.querySelectorAll('button')].find((b) => b.title === '個数を編集');
    editBtn.click();
    await flush();

    expect(state.giftLogs[0].qty).toBe(9);
    expect(state.segments[0].config.count).toBe(95); // 25 + 10*(9-2)、ルール削除後も記憶したdeltaで補正される
  });

  it('記録後にルール自体を削除しても、そのログの取り消しは記録時のdeltaで正しく補正される(過去の記録は遡及不変)', async () => {
    recordGift('テストギフト (100pt)', 3); // count: 5 + 30 = 35 (appliedDelta=10で記憶)
    state.segments[0].config.rules = [];
    rerender();

    const undoBtn = [...container.querySelectorAll('button')].find((b) => b.title === '取り消し');
    undoBtn.click();
    await flush();

    expect(state.giftLogs).toHaveLength(0);
    expect(state.segments[0].config.count).toBe(5); // 35 - 10*3、ルール削除後も記憶したdeltaで補正される
  });

  it('ルールが一切登録されていない状態で記録したログは、後からルールを追加しても取り消し時に補正されない(appliedDelta=0を記憶)', async () => {
    state.segments[0].config.rules = [];
    rerender();
    recordGift('テストギフト (100pt)', 2); // 一致ルールが無いのでcountは5のまま、appliedDelta=0で記憶

    state.segments[0].config.rules = [{ id: 'rule-new', giftId: 'gift-1', delta: 10 }];
    rerender();

    const undoBtn = [...container.querySelectorAll('button')].find((b) => b.title === '取り消し');
    undoBtn.click();
    await flush();

    expect(state.giftLogs).toHaveLength(0);
    expect(state.segments[0].config.count).toBe(5); // 記録時にappliedDelta=0で記憶済みなので、後からルールが増えても影響しない
  });

  it('マイナスのルールを記録するとcountが減り、0未満にはならない', () => {
    state.segments[0].config.rules[0].delta = -10;
    rerender();
    recordGift('テストギフト (100pt)', 1); // count: 5 - 10 → 0クランプ
    expect(state.segments[0].config.count).toBe(0);
  });

  it('1回の記録操作で符号違いの複数ギフトを同時に記録すると、ログ単位ではなく合算してから一度だけクランプされる', () => {
    state.segments[0].config.rules = [
      { id: 'rule1', giftId: 'gift-1', delta: -100 },
      { id: 'rule2', giftId: 'gift-2', delta: 1 },
    ];
    rerender();

    clickButtonByText('ギフトを記録', container);
    document.querySelector('#grm-user').value = 'u1';
    clickButtonByText('テストギフト (100pt)'); // gift-1, delta -100
    clickButtonByText('無関係ギフト (50pt)'); // gift-2, delta +1
    const saveBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('記録する'));
    saveBtn.click();

    // ログ単位で都度クランプするなら 5-100→0クランプ→+1=1 になってしまうが、
    // 合算(5-100+1=-94)してから一度だけクランプするので0になる
    expect(state.segments[0].config.count).toBe(0);
  });

  it('ポイント直接入力で記録した場合(giftId無し)は、どのルールにも一致せずcountが変化しない', () => {
    clickButtonByText('ギフトを記録', container);
    document.querySelector('#grm-user').value = 'u1';
    clickButtonByText('ポイント直接入力');
    document.querySelector('#grm-points').value = '500';
    clickButtonByText('記録する');

    expect(state.giftLogs).toHaveLength(1);
    expect(state.giftLogs[0]).toMatchObject({ giftId: null, points: 500, appliedDelta: 0 });
    expect(state.segments[0].config.count).toBe(5);
  });
});

describe('renderCounter - segmentId指定(日付ベースの非既定インスタンス)', () => {
  it('segmentId指定時は、key==="counter"でなくてもそのsegmentを直接表示する', () => {
    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div><div id="dialog-root"></div>';
    const container = document.getElementById('root');
    const state = buildState();
    state.segments.push({
      id: 'seg-extra', eventId: 'event1', type: 'counter', key: null, name: '入室カウンター', config: { count: 3, rules: [] },
    });

    renderCounter({
      state, save: vi.fn(), rerender: vi.fn(), container, segmentId: 'seg-extra',
    });

    expect(container.querySelector('.segment-name-header').value).toBe('入室カウンター');
    expect(container.querySelector('input[type="number"]').value).toBe('3');
  });

  it('segmentId未指定時は従来通り既定枠(key==="counter")を表示する', () => {
    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div><div id="dialog-root"></div>';
    const container = document.getElementById('root');
    const state = buildState();
    state.segments.push({
      id: 'seg-extra', eventId: 'event1', type: 'counter', key: null, name: '入室カウンター', config: { count: 3, rules: [] },
    });

    renderCounter({
      state, save: vi.fn(), rerender: vi.fn(), container,
    });

    expect(container.querySelector('.segment-name-header').value).toContain('カウンター');
    expect(container.querySelector('.segment-name-header').value).not.toBe('入室カウンター');
  });

  it('該当segmentが無ければ「見つかりません」を表示する', () => {
    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div><div id="dialog-root"></div>';
    const container = document.getElementById('root');
    const state = buildState();

    renderCounter({
      state, save: vi.fn(), rerender: vi.fn(), container, segmentId: 'no-such-id',
    });

    expect(container.textContent).toContain('カウンターが見つかりません。');
  });
});
