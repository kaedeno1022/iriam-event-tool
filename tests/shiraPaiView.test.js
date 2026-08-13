// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { renderShiraPai } from '../js/views/shiraPaiView.js';
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
      id: 'seg-shirapai',
      eventId: 'event1',
      type: 'shiraPai',
      key: 'shiraPai',
      name: '罰ゲームチャレンジ',
      config: { punishments: [] },
    }],
    users: [],
    giftLogs: [],
    giftMaster: [],
  };
}

// クリックハンドラがdialogs(Promiseベース)をawaitするようになったため、クリック後に
// マイクロタスクを十分にフラッシュしてから状態を検証する。setTimeoutのマクロタスクまで
// 進めれば、連続したawait(モック済みPromiseの解決)はその前に全て処理される。
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function findButton(text, root = document) {
  return [...root.querySelectorAll('button')].find((b) => b.textContent === text);
}

describe('renderShiraPai', () => {
  let container;
  let rerender;
  let state;

  beforeEach(() => {
    vi.clearAllMocks();
    showAlert.mockResolvedValue(undefined);
    showConfirm.mockResolvedValue(true);
    showPrompt.mockResolvedValue(null);

    document.body.innerHTML = '<div id="root"></div>';
    container = document.getElementById('root');
    state = buildState();
    rerender = () => {
      container.replaceChildren();
      renderShiraPai({ state, save: vi.fn(), rerender, container });
    };
    rerender();
  });

  it('未登録時は「罰ゲーム未登録」と表示される', () => {
    expect(container.textContent).toContain('罰ゲーム未登録');
  });

  it('「＋ 罰ゲームを追加」でprompt入力した名前が一覧に追加される(count:0で開始)', async () => {
    showPrompt.mockResolvedValueOnce('足つぼ');
    findButton('＋ 罰ゲームを追加', container).click();
    await flush();

    expect(state.segments[0].config.punishments).toHaveLength(1);
    expect(state.segments[0].config.punishments[0]).toMatchObject({ name: '足つぼ', count: 0 });
    expect(container.textContent).toContain('足つぼ');
  });

  it('追加をキャンセルすると一覧に追加されない', async () => {
    showPrompt.mockResolvedValueOnce(null);
    findButton('＋ 罰ゲームを追加', container).click();
    await flush();

    expect(state.segments[0].config.punishments).toHaveLength(0);
  });

  it('＋/－ボタンでカウンターを手動増減できる(0未満にはならない)', () => {
    state.segments[0].config.punishments.push({ id: 'p1', name: '苦丁茶', count: 0 });
    rerender();

    const row = () => container.querySelector('.punishment-row');
    const minusBtn = () => [...row().querySelectorAll('button')].find((b) => b.textContent === '－');
    const plusBtn = () => [...row().querySelectorAll('button')].find((b) => b.textContent === '＋');

    minusBtn().click(); // 0のまま(下限)
    expect(state.segments[0].config.punishments[0].count).toBe(0);

    plusBtn().click();
    plusBtn().click();
    expect(state.segments[0].config.punishments[0].count).toBe(2);

    minusBtn().click();
    expect(state.segments[0].config.punishments[0].count).toBe(1);
  });

  it('削除ボタンで確認後にその罰ゲームが一覧から消える', async () => {
    state.segments[0].config.punishments.push({ id: 'p1', name: '語尾変', count: 3 });
    rerender();

    showConfirm.mockResolvedValueOnce(true);
    const deleteBtn = [...container.querySelectorAll('button')].find((b) => b.title === '削除');
    deleteBtn.click();
    await flush();

    expect(state.segments[0].config.punishments).toHaveLength(0);
  });

  it('罰ゲームが0件の状態でルーレットを回すとアラートを出し何も変更しない', async () => {
    state.segments[0].config.spinCredits = 1; // 罰ゲーム0件のガードを検証したいので残り回数は確保しておく
    rerender();

    findButton('🎲 ルーレットを回す', container).click();
    await flush();

    expect(showAlert).toHaveBeenCalledWith('先に罰ゲームを追加してください');
    expect(state.segments[0].config.spinCredits).toBe(1); // 失敗した回はspinCreditsを消費しない
  });

  it('ルーレットを回すとランダムに選ばれた罰ゲームのcountが1増え、結果がアラートされる', async () => {
    state.segments[0].config.punishments.push(
      { id: 'p1', name: '足つぼ', count: 0 },
      { id: 'p2', name: '苦丁茶', count: 0 },
    );
    state.segments[0].config.spinCredits = 1;
    rerender();

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99); // 2件中、末尾側(index 1 = 苦丁茶)を選ばせる

    findButton('🎲 ルーレットを回す', container).click();
    await flush();

    const p1 = state.segments[0].config.punishments.find((p) => p.id === 'p1');
    const p2 = state.segments[0].config.punishments.find((p) => p.id === 'p2');
    expect(p2.count).toBe(1);
    expect(p1.count).toBe(0);
    expect(showAlert).toHaveBeenCalledWith('🎲 ルーレット結果: 「苦丁茶」');

    randomSpy.mockRestore();
  });

  it('ルーレットを回すと履歴に記録され、日時と選ばれた罰ゲーム名が一覧に表示される', async () => {
    state.segments[0].config.punishments.push({ id: 'p1', name: '足つぼ', count: 0 });
    state.segments[0].config.spinCredits = 1;
    rerender();

    findButton('🎲 ルーレットを回す', container).click();
    await flush();

    expect(state.segments[0].config.history).toHaveLength(1);
    expect(state.segments[0].config.history[0]).toMatchObject({ punishmentId: 'p1', punishmentName: '足つぼ' });
    expect(container.textContent).toContain('足つぼ');
    expect(container.textContent).not.toContain('履歴なし');
  });

  it('履歴を取り消すと該当エントリが消え、対応する罰ゲームのcountも-1される', async () => {
    state.segments[0].config.punishments.push({ id: 'p1', name: '足つぼ', count: 3 });
    state.segments[0].config.history.push({ id: 'h1', timestamp: new Date().toISOString(), punishmentId: 'p1', punishmentName: '足つぼ' });
    rerender();

    [...container.querySelectorAll('button')].find((b) => b.title === '取り消し').click();
    await flush();

    expect(state.segments[0].config.history).toHaveLength(0);
    expect(state.segments[0].config.punishments.find((p) => p.id === 'p1').count).toBe(2);
  });

  it('罰ゲームのcountが既に0の状態で履歴を取り消しても負数にならない(下限0)', async () => {
    state.segments[0].config.punishments.push({ id: 'p1', name: '足つぼ', count: 0 });
    state.segments[0].config.history.push({ id: 'h1', timestamp: new Date().toISOString(), punishmentId: 'p1', punishmentName: '足つぼ' });
    rerender();

    [...container.querySelectorAll('button')].find((b) => b.title === '取り消し').click();
    await flush();

    expect(state.segments[0].config.punishments.find((p) => p.id === 'p1').count).toBe(0);
  });

  it('取り消し確認をキャンセルすると履歴もcountも変更されない', async () => {
    state.segments[0].config.punishments.push({ id: 'p1', name: '足つぼ', count: 3 });
    state.segments[0].config.history.push({ id: 'h1', timestamp: new Date().toISOString(), punishmentId: 'p1', punishmentName: '足つぼ' });
    rerender();

    showConfirm.mockResolvedValueOnce(false);
    [...container.querySelectorAll('button')].find((b) => b.title === '取り消し').click();
    await flush();

    expect(state.segments[0].config.history).toHaveLength(1);
    expect(state.segments[0].config.punishments.find((p) => p.id === 'p1').count).toBe(3);
  });

  it('罰ゲーム自体が既に削除済みの履歴を取り消しても例外にならず、履歴だけ消える', async () => {
    // punishmentsにp1は存在しない(削除済みを模す)状態でhistoryだけ残っているケース
    state.segments[0].config.history.push({ id: 'h1', timestamp: new Date().toISOString(), punishmentId: 'deleted-punishment', punishmentName: '削除済み罰ゲーム' });
    rerender();

    [...container.querySelectorAll('button')].find((b) => b.title === '取り消し').click();
    await flush();

    expect(state.segments[0].config.history).toHaveLength(0);
  });

  it('カウンターの手動+/-操作は履歴に記録されない(ルーレット由来のみ履歴化)', () => {
    state.segments[0].config.punishments.push({ id: 'p1', name: '足つぼ', count: 0 });
    rerender();

    const plusBtn = () => [...container.querySelector('.punishment-row').querySelectorAll('button')].find((b) => b.textContent === '＋');
    plusBtn().click();

    expect(state.segments[0].config.punishments[0].count).toBe(1);
    expect(state.segments[0].config.history).toHaveLength(0);
  });

  it('残り回数(spinCredits)が0の時にルーレットを押すとアラートで案内し、何も変更しない', async () => {
    state.segments[0].config.punishments.push({ id: 'p1', name: '足つぼ', count: 0 });
    rerender(); // spinCreditsは初期値0のまま

    const rouletteBtn = findButton('🎲 ルーレットを回す', container);
    expect(rouletteBtn.disabled).toBeFalsy(); // 押せなくはしない(押した時にアラートで案内する方式)
    rouletteBtn.click();
    await flush();

    expect(showAlert).toHaveBeenCalledWith('ルーレットの残り回数がありません。「＋」で回数を追加してください。');
    expect(state.segments[0].config.punishments[0].count).toBe(0);
    expect(state.segments[0].config.history).toHaveLength(0);
  });

  it('残り回数の＋/－で手動増減できる(下限0)', () => {
    const creditsValue = () => container.querySelector('.form-row.inline .punishment-count').textContent;
    expect(creditsValue()).toBe('0');

    const minusBtn = () => [...container.querySelectorAll('.form-row.inline button')].find((b) => b.textContent === '－');
    const plusBtn = () => [...container.querySelectorAll('.form-row.inline button')].find((b) => b.textContent === '＋');

    minusBtn().click(); // 0のまま(下限)
    expect(state.segments[0].config.spinCredits).toBe(0);

    plusBtn().click();
    plusBtn().click();
    expect(state.segments[0].config.spinCredits).toBe(2);
    expect(creditsValue()).toBe('2');

    minusBtn().click();
    expect(state.segments[0].config.spinCredits).toBe(1);
  });

  it('ルーレットを回すと残り回数(spinCredits)が1消化される', async () => {
    state.segments[0].config.punishments.push({ id: 'p1', name: '足つぼ', count: 0 });
    state.segments[0].config.spinCredits = 3;
    rerender();

    findButton('🎲 ルーレットを回す', container).click();
    await flush();

    expect(state.segments[0].config.spinCredits).toBe(2);
  });

  it('残り回数を消化してちょうど0になると、次に押した時は「残り回数がありません」のアラートになる', async () => {
    state.segments[0].config.punishments.push({ id: 'p1', name: '足つぼ', count: 0 });
    state.segments[0].config.spinCredits = 1;
    rerender();

    findButton('🎲 ルーレットを回す', container).click();
    await flush();
    expect(state.segments[0].config.spinCredits).toBe(0);

    showAlert.mockClear();
    findButton('🎲 ルーレットを回す', container).click();
    await flush();
    expect(showAlert).toHaveBeenCalledWith('ルーレットの残り回数がありません。「＋」で回数を追加してください。');
    expect(state.segments[0].config.punishments[0].count).toBe(1); // 2回目は不成立なので加算されていない
  });
});

describe('renderShiraPai - segmentId指定(日付ベースの非既定インスタンス)', () => {
  it('segmentId指定時は、key==="shiraPai"でなくてもそのsegmentを直接表示する', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const container = document.getElementById('root');
    const state = buildState();
    state.segments.push({
      id: 'seg-extra', eventId: 'event1', type: 'shiraPai', key: null, name: '土曜の罰ゲーム', config: { punishments: [] },
    });

    renderShiraPai({
      state, save: vi.fn(), rerender: vi.fn(), container, segmentId: 'seg-extra',
    });

    expect(container.textContent).toContain('土曜の罰ゲーム');
  });
});
