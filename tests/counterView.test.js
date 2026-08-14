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
    const input = container.querySelector('.viewer-counter-input:not(.counter-delta-input)');
    input.value = '42';
    input.dispatchEvent(new Event('input'));
    expect(state.segments[0].config.count).toBe(42);
  });

  it('増減値を入力して「適用」を押すとcountに加算される(負値も可)', () => {
    const deltaInput = container.querySelector('.counter-delta-input');
    deltaInput.value = '-3';
    clickButtonByText('適用', container);
    expect(state.segments[0].config.count).toBe(2);
  });

  it('適用後、0未満にはならない(下限クランプ)', () => {
    const deltaInput = container.querySelector('.counter-delta-input');
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

  it('マイナスのルールを記録するとcountが減り、0未満も許容される', () => {
    state.segments[0].config.rules[0].delta = -10;
    rerender();
    recordGift('テストギフト (100pt)', 1);
    expect(state.segments[0].config.count).toBe(-5); // 5 - 10
  });

  it('0未満まで減らした記録を取り消すと、記録前のcountにそのまま戻る', async () => {
    state.segments[0].config.rules[0].delta = -10;
    rerender();
    recordGift('テストギフト (100pt)', 1); // 5 - 10 = -5

    const undoBtn = [...container.querySelectorAll('button')].find((b) => b.title === '取り消し');
    undoBtn.click();
    await flush();

    // 記録時に0でクランプしていると、取り消しで +10 されてcountが15に増えてしまう。
    // 記録・取り消しが対称であることを保証する
    expect(state.segments[0].config.count).toBe(5);
  });

  it('1回の記録操作で符号違いの複数ギフトを同時に記録すると、全ログの反映値が合算される', () => {
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

    expect(state.segments[0].config.count).toBe(-94); // 5 - 100 + 1
  });

  it('手動操作(＋／－・直接入力)は従来通り0で下限クランプされる', () => {
    state.segments[0].config.count = 0;
    rerender();

    const minusBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === '－');
    minusBtn.click();
    expect(state.segments[0].config.count).toBe(0);

    const countInput = container.querySelector('.viewer-counter-input:not(.counter-delta-input)');
    countInput.value = '-30';
    countInput.dispatchEvent(new Event('input'));
    expect(state.segments[0].config.count).toBe(0);
  });

  it('countが負のときの手動操作は制限しない(0へ引き上げも据え置きもしない)', () => {
    // 0へ引き上げると取り消し時に増えた分が残る。逆に現在値へ据え置くと、
    // 負の領域で「適用」の加算まで捨てられて「＋」ボタンと結果が食い違う。
    state.segments[0].config.count = -5;
    rerender();

    const minusBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === '－');
    minusBtn.click();
    expect(state.segments[0].config.count).toBe(-6);

    const countInput = container.querySelector('.viewer-counter-input:not(.counter-delta-input)');
    countInput.value = '-30';
    countInput.dispatchEvent(new Event('input'));
    expect(state.segments[0].config.count).toBe(-30);
  });

  it('countが負でも「＋」は普通に増え、0以上になれば以後は通常のクランプに戻る', () => {
    state.segments[0].config.count = -1;
    rerender();

    const plusBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === '＋');
    plusBtn.click();
    expect(state.segments[0].config.count).toBe(0);

    const minusBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === '－');
    minusBtn.click();
    expect(state.segments[0].config.count).toBe(0);
  });

  it('負のcountを手動操作しても、取り消しではルール由来の分だけが正確に戻る', async () => {
    state.segments[0].config.rules[0].delta = -10;
    rerender();
    recordGift('テストギフト (100pt)', 1); // 5 - 10 = -5

    // 負の状態で手動操作を挟む(ここで0へ跳ね上がると取り消し後に10になってしまう)
    const minusBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === '－');
    minusBtn.click(); // -6

    const undoBtn = [...container.querySelectorAll('button')].find((b) => b.title === '取り消し');
    undoBtn.click();
    await flush();

    // 記録前の5から手動で1減らした状態。ルール由来の-10だけが打ち消され、
    // 利用者自身の手動操作は保持される
    expect(state.segments[0].config.count).toBe(4);
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
    expect(container.querySelector('.viewer-counter-input:not(.counter-delta-input)').value).toBe('3');
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

describe('renderCounter - 負のcountに対する手動操作', () => {
  let container;
  let state;
  let rerender;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div><div id="dialog-root"></div>';
    container = document.getElementById('root');
    state = {
      events: [{ id: 'event1' }],
      activeEventId: 'event1',
      users: [{ id: 'u1', displayName: 'ユーザーA' }],
      giftMaster: [],
      giftLogs: [],
      segments: [{
        id: 'seg1', eventId: 'event1', type: 'counter', key: 'counter', name: 'カウンター', config: { count: -5, rules: [] },
      }],
    };
    rerender = () => {
      container.replaceChildren();
      renderCounter({
        state, save: vi.fn(), rerender, container, segmentId: 'seg1',
      });
    };
    rerender();
  });

  const clickBtn = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent === label).click();

  it('負の状態で「適用」に正の値を入れると、そのまま加算される', () => {
    // クランプで現在値に据え置くと、増減値が黙って捨てられ「＋」ボタンと結果が食い違う
    const deltaInput = container.querySelector('.counter-delta-input');
    deltaInput.value = '3';
    clickBtn('適用');

    expect(state.segments[0].config.count).toBe(-2);
  });

  it('負の状態の「＋」と「適用+1」は同じ結果になる', () => {
    clickBtn('＋');
    const afterPlus = state.segments[0].config.count;

    state.segments[0].config.count = -5;
    rerender();
    const deltaInput = container.querySelector('.counter-delta-input');
    deltaInput.value = '1';
    clickBtn('適用');

    expect(state.segments[0].config.count).toBe(afterPlus);
    expect(afterPlus).toBe(-4);
  });

  it('負の状態では「－」も素直に減る(0へ引き上げない)', () => {
    clickBtn('－');
    expect(state.segments[0].config.count).toBe(-6);
  });

  it('0以上から0未満へ落とす操作だけは0で止める', () => {
    state.segments[0].config.count = 2;
    rerender();

    const deltaInput = container.querySelector('.counter-delta-input');
    deltaInput.value = '-10';
    clickBtn('適用');

    expect(state.segments[0].config.count).toBe(0);
  });

  it('直接入力で負の値を1文字ずつ打っても、途中でcountが0に飛ばない', () => {
    // input[type=number]は「-」だけの時点でvalueが空文字になる。空文字を0として
    // 確定してしまうと1文字目でcountが0になり、以後0起点でクランプされて負値を打てない
    const countInput = container.querySelector('.viewer-counter-input:not(.counter-delta-input)');
    const type = (v) => { countInput.value = v; countInput.dispatchEvent(new Event('input')); };

    type('');   // 「-」を打った直後にブラウザが返す値
    expect(state.segments[0].config.count).toBe(-5); // 入力途中は確定しない

    type('-1');
    expect(state.segments[0].config.count).toBe(-1);

    type('-12');
    expect(state.segments[0].config.count).toBe(-12);
  });

  it('0以上のときに「-」を打っても、countは0に落ちない(入力途中を確定しない)', () => {
    state.segments[0].config.count = 7;
    rerender();
    const countInput = container.querySelector('.viewer-counter-input:not(.counter-delta-input)');

    countInput.value = '';
    countInput.dispatchEvent(new Event('input'));

    expect(state.segments[0].config.count).toBe(7);
  });

  it('負の間はmin属性を外す(入力欄の制約と実値が食い違わないようにする)', () => {
    expect(container.querySelector('.viewer-counter-input:not(.counter-delta-input)').hasAttribute('min')).toBe(false);

    state.segments[0].config.count = 3;
    rerender();
    expect(container.querySelector('.viewer-counter-input:not(.counter-delta-input)').getAttribute('min')).toBe('0');
  });
});

describe('renderCounter - 取り消しのID衝突耐性', () => {
  let container;
  let state;
  let rerender;

  beforeEach(() => {
    vi.clearAllMocks();
    showConfirm.mockResolvedValue(true);
    showAlert.mockResolvedValue(undefined);
    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div><div id="dialog-root"></div>';
    container = document.getElementById('root');
    state = buildState();
    // 旧世代のID生成器は同一IDを量産しえたため、既存データには重複IDが実在しうる
    state.giftLogs.push(
      {
        id: 'dup', segmentId: 'seg1', userId: 'u1', giftId: 'gift-1', points: 100, qty: 1, appliedDelta: 0, timestamp: '2026-08-18T11:00:00.000Z',
      },
      {
        id: 'dup', segmentId: 'seg1', userId: 'u1', giftId: 'gift-1', points: 100, qty: 3, appliedDelta: 0, timestamp: '2026-08-18T10:00:00.000Z',
      },
    );
    rerender = () => {
      container.replaceChildren();
      renderCounter({
        state, save: vi.fn(), rerender, container,
      });
    };
    rerender();
  });

  it('同じidのログが2件あっても、取り消しは操作した1件だけを消す', async () => {
    const undoBtns = [...container.querySelectorAll('button')].filter((b) => b.title === '取り消し');
    undoBtns[0].click(); // 新しい方(qty:1)を取り消す
    await flush();

    expect(state.giftLogs).toHaveLength(1);
    expect(state.giftLogs[0].qty).toBe(3);
  });
});

describe('renderCounter - 直接入力欄の表示と実値の整合', () => {
  let container;
  let state;
  let rerender;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('クランプされた入力は、blur時に実値の表示へ戻る', () => {
    // 入力中はフォーカス維持のため再描画しないので、欄には打った値が残る。
    // blurで実値へ揃えないと「-30と表示されているのに実際は0」を誤認する
    const countInput = container.querySelector('.viewer-counter-input:not(.counter-delta-input)');
    countInput.value = '-30';
    countInput.dispatchEvent(new Event('input'));
    expect(state.segments[0].config.count).toBe(0);

    countInput.dispatchEvent(new Event('change'));

    expect(countInput.value).toBe('0');
  });

  it('欄を空にしたまま離れると、実値の表示へ戻る', () => {
    const countInput = container.querySelector('.viewer-counter-input:not(.counter-delta-input)');
    countInput.value = '';
    countInput.dispatchEvent(new Event('input'));
    countInput.dispatchEvent(new Event('change'));

    expect(state.segments[0].config.count).toBe(5);
    expect(countInput.value).toBe('5');
  });

  it('Enterキーでフォーカスを外す(実ブラウザではこのblurでchangeが発火し表示が揃う)', () => {
    // このinputは<form>で囲んでいないためEnter単体ではblurせず、changeも発火しない。
    // jsdomはblur()からchangeを自動発火しないので、ここで検証できるのはフォーカスが
    // 外れるところまで。change後の表示合わせは直上のテストが担保している。
    const countInput = container.querySelector('.viewer-counter-input:not(.counter-delta-input)');
    countInput.focus();
    expect(document.activeElement).toBe(countInput);

    countInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(document.activeElement).not.toBe(countInput);
  });

  it('表示を揃える際に画面全体を作り直さない(直後の隣接ボタンのタップを取りこぼさないため)', () => {
    const countInput = container.querySelector('.viewer-counter-input:not(.counter-delta-input)');
    const plusBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === '＋');

    countInput.value = '9';
    countInput.dispatchEvent(new Event('input'));
    countInput.dispatchEvent(new Event('change'));

    // changeでrerenderするとボタンがDOMごと差し替わり、押下中の1回目が届かなくなる
    expect(container.contains(plusBtn)).toBe(true);
    plusBtn.click();
    expect(state.segments[0].config.count).toBe(10);
  });
});

describe('renderCounter - 記録一覧のユーザー表示', () => {
  let container;
  let state;

  function userCellTexts() {
    return [...container.querySelectorAll('.log-table tbody tr')].map((tr) => tr.children[1].textContent);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div><div id="dialog-root"></div>';
    container = document.getElementById('root');
    state = buildState();
    // 上から順に: ユーザー未紐づけ(記録オフの企画で作られる) / 参照先が削除済み / 生存中
    state.giftLogs.push(
      {
        id: 'log-none', segmentId: 'seg1', userId: null, giftId: 'gift-1', points: 100, qty: 1, appliedDelta: 0, timestamp: '2026-08-18T12:00:00.000Z',
      },
      {
        id: 'log-gone', segmentId: 'seg1', userId: 'u-deleted', giftId: 'gift-1', points: 100, qty: 1, appliedDelta: 0, timestamp: '2026-08-18T11:00:00.000Z',
      },
      {
        id: 'log-alive', segmentId: 'seg1', userId: 'u1', giftId: 'gift-1', points: 100, qty: 1, appliedDelta: 0, timestamp: '2026-08-18T10:00:00.000Z',
      },
    );
    renderCounter({
      state, save: vi.fn(), rerender: vi.fn(), container,
    });
  });

  // 「記録しなかった」と「消えた」を同じ表示にすると、後から履歴を見た時に
  // 復旧できるはずのユーザー名を探すことになる。
  it('未紐づけは「-」、参照先が消えた記録は「(削除済みユーザー)」と区別して表示する', () => {
    expect(userCellTexts()).toEqual(['-', '(削除済みユーザー)', 'テストユーザー']);
  });
});
