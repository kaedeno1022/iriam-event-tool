// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openGiftRecordModal } from '../js/views/giftRecordModal.js';
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
    users: [{ id: 'u1', displayName: 'テストユーザー' }],
    giftMaster: [],
    giftLogs: [],
  };
}

function clickSaveButton() {
  const saveBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === '記録する');
  saveBtn.click();
}

function clickCartSaveButton() {
  const saveBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('記録する'));
  saveBtn.click();
}

function findGiftChip(text) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent === text);
}

describe('openGiftRecordModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showAlert.mockResolvedValue(undefined);
    setupDom();
  });

  it('lockGiftIdに対応するギフトがギフトマスタから削除済みの場合、保存時にクラッシュせずアラートを出し記録も追加しない', async () => {
    const state = baseState(); // giftMasterが空 = lockGiftIdの参照先が存在しない状態を再現
    const onSaved = vi.fn();
    const save = vi.fn();

    openGiftRecordModal({
      state, segmentId: 'seg1', conditionId: 'cond1', lockGiftId: 'gift-deleted', save, onSaved,
    });

    document.querySelector('#grm-user').value = 'u1';

    expect(() => clickSaveButton()).not.toThrow();
    await flush();
    expect(showAlert).toHaveBeenCalled();
    expect(state.giftLogs).toHaveLength(0);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('lockGiftIdのギフトが存在すれば、個数入力欄に負数を打ち込んでも1未満には保存されない', () => {
    const state = baseState();
    state.giftMaster.push({ id: 'gift-1', name: 'テストギフト', points: 100, category: '定番', lastUsedAt: null, useCount: 0, custom: false });
    const onSaved = vi.fn();
    const save = vi.fn();

    openGiftRecordModal({
      state, segmentId: 'seg1', conditionId: 'cond1', lockGiftId: 'gift-1', save, onSaved,
    });

    document.querySelector('#grm-user').value = 'u1';
    const qtyInput = document.querySelector('#grm-qty');
    qtyInput.value = '-5';
    qtyInput.dispatchEvent(new Event('input'));

    clickSaveButton();

    expect(state.giftLogs).toHaveLength(1);
    expect(state.giftLogs[0].qty).toBeGreaterThanOrEqual(1);
    expect(state.giftLogs[0].conditionId).toBe('cond1');
  });

  it('lockGiftId未指定時は既定でギフト選択ピッカー(カート方式)が使え、チップ選択したギフトで記録できる(createGiftPicker統合の回帰)', () => {
    const state = baseState();
    state.giftMaster.push({ id: 'gift-1', name: 'テストギフト', points: 250, category: '定番', lastUsedAt: null, useCount: 0, custom: false });
    const onSaved = vi.fn();
    const save = vi.fn();

    openGiftRecordModal({ state, segmentId: 'seg1', save, onSaved });

    document.querySelector('#grm-user').value = 'u1';
    const giftChip = findGiftChip('テストギフト (250pt)');
    expect(giftChip).toBeTruthy();
    giftChip.click();

    clickCartSaveButton();

    expect(state.giftLogs).toHaveLength(1);
    expect(state.giftLogs[0]).toMatchObject({ giftId: 'gift-1', points: 250, qty: 1 });
    expect(state.giftMaster[0].useCount).toBe(1); // touchGiftUsageが呼ばれている
    expect(onSaved).toHaveBeenCalled();
  });

  it('複数の異なるギフトをタップするとカートに追加され、まとめて1回の保存で全件記録される', () => {
    const state = baseState();
    state.giftMaster.push(
      { id: 'gift-1', name: 'ギフトA', points: 10, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
      { id: 'gift-2', name: 'ギフトB', points: 200, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
    );
    const save = vi.fn();
    openGiftRecordModal({ state, segmentId: 'seg1', save, onSaved: vi.fn() });

    document.querySelector('#grm-user').value = 'u1';
    findGiftChip('ギフトA (10pt)').click();
    findGiftChip('ギフトB (200pt)').click();

    expect([...document.querySelectorAll('button')].some((b) => b.textContent === '記録する(2件)')).toBe(true);

    clickCartSaveButton();

    expect(state.giftLogs).toHaveLength(2);
    expect(state.giftLogs.map((l) => l.giftId).sort()).toEqual(['gift-1', 'gift-2']);
    expect(state.giftLogs.every((l) => l.qty === 1)).toBe(true);
  });

  it('カート行に単価×個数の小計が、合計欄に全体の合計ptが表示され、個数変更に追従する', () => {
    const state = baseState();
    state.giftMaster.push(
      { id: 'gift-1', name: 'ギフトA', points: 10, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
      { id: 'gift-2', name: 'ギフトB', points: 200, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
    );
    openGiftRecordModal({ state, segmentId: 'seg1', save: vi.fn(), onSaved: vi.fn() });

    document.querySelector('#grm-user').value = 'u1';
    findGiftChip('ギフトA (10pt)').click(); // 小計10pt
    findGiftChip('ギフトB (200pt)').click(); // 小計200pt

    const subtotals = () => [...document.querySelectorAll('.cart-row-subtotal')].map((s) => s.textContent);
    expect(subtotals()).toEqual(['10pt', '200pt']);
    expect(document.querySelector('.cart-total').textContent).toBe('合計 210pt');

    // ギフトAの個数を＋で2に増やす(小計20ptになるはず)
    const rowA = [...document.querySelectorAll('.cart-row')].find((r) => r.textContent.includes('ギフトA'));
    rowA.querySelectorAll('button')[1].click(); // ＋

    expect(subtotals()).toEqual(['20pt', '200pt']);
    expect(document.querySelector('.cart-total').textContent).toBe('合計 220pt');
  });

  it('ポイント不明のギフトはカートで「pt不明」と表示され、合計には0ptとして扱われる', () => {
    const state = baseState();
    state.giftMaster.push({ id: 'gift-1', name: '価格不明ギフト', points: null, category: 'その他', lastUsedAt: null, useCount: 0, custom: true });
    openGiftRecordModal({ state, segmentId: 'seg1', save: vi.fn(), onSaved: vi.fn() });

    document.querySelector('#grm-user').value = 'u1';
    findGiftChip('価格不明ギフト').click();

    expect(document.querySelector('.cart-row-name').textContent).toBe('価格不明ギフト (pt不明)');
    expect(document.querySelector('.cart-row-subtotal').textContent).toBe('0pt');
    expect(document.querySelector('.cart-total').textContent).toBe('合計 0pt');
  });

  it('ギフトをタップしてカートに追加してもgift-list要素は同一ノードのまま(スクロール位置維持の回帰)', () => {
    const state = baseState();
    state.giftMaster.push(
      { id: 'gift-1', name: 'ギフトA', points: 10, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
      { id: 'gift-2', name: 'ギフトB', points: 200, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
    );
    openGiftRecordModal({ state, segmentId: 'seg1', save: vi.fn(), onSaved: vi.fn() });

    document.querySelector('#grm-user').value = 'u1';
    const listBefore = document.querySelector('.gift-list');
    findGiftChip('ギフトA (10pt)').click();
    const listAfter = document.querySelector('.gift-list');

    expect(listAfter).toBe(listBefore);
  });

  it('カートの＋/－や削除で再描画しても.modal-boxのスクロール位置(scrollTop)が維持される', () => {
    const state = baseState();
    state.giftMaster.push({ id: 'gift-1', name: 'ギフトA', points: 10, category: '定番', lastUsedAt: null, useCount: 0, custom: false });
    openGiftRecordModal({ state, segmentId: 'seg1', save: vi.fn(), onSaved: vi.fn() });

    document.querySelector('#grm-user').value = 'u1';
    findGiftChip('ギフトA (10pt)').click();

    const box = document.querySelector('.modal-box');
    // jsdomはscrollHeight/clientHeightに基づくクランプを行わないため、scrollTopへの代入は
    // そのまま保持される(この点は本番ブラウザの挙動と異なるが、render()での退避・復元ロジック
    // 自体の検証には影響しない)
    box.scrollTop = 150;

    const plusBtn = [...document.querySelectorAll('.cart-row')][0].querySelectorAll('button')[1]; // － qty ＋ の並びの＋
    plusBtn.click();

    expect(document.querySelector('.modal-box').scrollTop).toBe(150);
  });

  it('カート操作(タップ・＋/－・削除)では.modal-boxも.gift-listも一切作り直さない(スクロール位置維持の根本対策)', () => {
    const state = baseState();
    state.giftMaster.push(
      { id: 'gift-1', name: 'ギフトA', points: 10, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
      { id: 'gift-2', name: 'ギフトB', points: 200, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
    );
    openGiftRecordModal({ state, segmentId: 'seg1', save: vi.fn(), onSaved: vi.fn() });
    document.querySelector('#grm-user').value = 'u1';

    const boxBefore = document.querySelector('.modal-box');
    const listBefore = document.querySelector('.gift-list');

    findGiftChip('ギフトA (10pt)').click();
    findGiftChip('ギフトB (200pt)').click();
    const cartRow = () => [...document.querySelectorAll('.cart-row')][0];
    cartRow().querySelectorAll('button')[1].click(); // ＋
    cartRow().querySelectorAll('button')[0].click(); // －
    cartRow().querySelectorAll('button')[2].click(); // 削除

    expect(document.querySelector('.modal-box')).toBe(boxBefore);
    expect(document.querySelector('.gift-list')).toBe(listBefore);
  });

  it('同じギフトを連続でタップすると新規行にならずカート内の個数が増える', () => {
    const state = baseState();
    state.giftMaster.push({ id: 'gift-1', name: 'ギフトA', points: 10, category: '定番', lastUsedAt: null, useCount: 0, custom: false });
    const save = vi.fn();
    openGiftRecordModal({ state, segmentId: 'seg1', save, onSaved: vi.fn() });

    document.querySelector('#grm-user').value = 'u1';
    findGiftChip('ギフトA (10pt)').click();
    findGiftChip('ギフトA (10pt)').click();
    findGiftChip('ギフトA (10pt)').click();

    clickCartSaveButton();

    expect(state.giftLogs).toHaveLength(1);
    expect(state.giftLogs[0]).toMatchObject({ giftId: 'gift-1', qty: 3 });
  });

  it('カート内の削除ボタンでその項目を除去できる', () => {
    const state = baseState();
    state.giftMaster.push(
      { id: 'gift-1', name: 'ギフトA', points: 10, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
      { id: 'gift-2', name: 'ギフトB', points: 200, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
    );
    const save = vi.fn();
    openGiftRecordModal({ state, segmentId: 'seg1', save, onSaved: vi.fn() });

    document.querySelector('#grm-user').value = 'u1';
    findGiftChip('ギフトA (10pt)').click();
    findGiftChip('ギフトB (200pt)').click();

    const cartRows = [...document.querySelectorAll('.cart-row')];
    expect(cartRows).toHaveLength(2);
    const removeBtnForA = [...cartRows[0].querySelectorAll('button')].find((b) => b.title === '削除');
    removeBtnForA.click();

    clickCartSaveButton();

    expect(state.giftLogs).toHaveLength(1);
    expect(state.giftLogs[0].giftId).toBe('gift-2');
  });

  it('カート内の一部ギフトが保存直前にギフトマスタから削除されていた場合、1件も保存しない(アトミック性)', async () => {
    const state = baseState();
    state.giftMaster.push(
      { id: 'gift-1', name: 'ギフトA', points: 10, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
      { id: 'gift-2', name: 'ギフトB', points: 200, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
    );
    const save = vi.fn();
    openGiftRecordModal({ state, segmentId: 'seg1', save, onSaved: vi.fn() });

    document.querySelector('#grm-user').value = 'u1';
    findGiftChip('ギフトA (10pt)').click();
    findGiftChip('ギフトB (200pt)').click();

    // カートに追加した後、片方がギフトマスタから削除された状況を再現
    state.giftMaster = state.giftMaster.filter((g) => g.id !== 'gift-2');

    clickCartSaveButton();
    await flush();

    expect(showAlert).toHaveBeenCalled();
    expect(state.giftLogs).toHaveLength(0); // gift-1側も含めて1件も保存されない
  });

  it('新規ユーザー追加ボタンで作成したユーザーが自動選択され、続けてギフトをタップしても選択が保持される', () => {
    const state = baseState();
    state.giftMaster.push({ id: 'gift-1', name: 'ギフトA', points: 10, category: '定番', lastUsedAt: null, useCount: 0, custom: false });
    const save = vi.fn();
    openGiftRecordModal({ state, segmentId: 'seg1', save, onSaved: vi.fn() });

    const newUserInputs = () => [...document.querySelectorAll('input[type="text"]')];
    const newUserInput = newUserInputs().find((i) => i.placeholder === '新規ユーザー名');
    newUserInput.value = '新規太郎';
    newUserInput.dispatchEvent(new Event('input'));
    [...document.querySelectorAll('button')].find((b) => b.textContent === '追加').click();

    const newUser = state.users.find((u) => u.displayName === '新規太郎');
    expect(document.querySelector('#grm-user').value).toBe(newUser.id); // 追加直後に自動選択されている

    findGiftChip('ギフトA (10pt)').click(); // カート操作で再描画が走っても選択が消えないか

    expect(document.querySelector('#grm-user').value).toBe(newUser.id);

    clickCartSaveButton();

    expect(state.giftLogs).toHaveLength(1);
    expect(state.giftLogs[0].userId).toBe(newUser.id);
  });

  it('カートが空のまま記録しようとするとアラートを出す', async () => {
    const state = baseState();
    openGiftRecordModal({ state, segmentId: 'seg1', save: vi.fn(), onSaved: vi.fn() });

    document.querySelector('#grm-user').value = 'u1';
    clickCartSaveButton();
    await flush();

    expect(showAlert).toHaveBeenCalled();
    expect(state.giftLogs).toHaveLength(0);
  });

  it('カートが空の間は合計欄(.cart-total)を表示せず、文字列"null"も画面に出さない(回帰)', () => {
    const state = baseState();
    state.giftMaster.push({ id: 'gift-1', name: 'ギフトA', points: 10, category: '定番', lastUsedAt: null, useCount: 0, custom: false });
    openGiftRecordModal({ state, segmentId: 'seg1', save: vi.fn(), onSaved: vi.fn() });

    expect(document.querySelector('.cart-total')).toBeNull();
    expect(document.querySelector('.gift-cart').textContent).not.toContain('null');

    // 追加してから削除して、再び空の状態に戻しても同様であることを確認
    findGiftChip('ギフトA (10pt)').click();
    expect(document.querySelector('.cart-total')).toBeTruthy();
    const removeBtn = [...document.querySelector('.cart-row').querySelectorAll('button')].find((b) => b.title === '削除');
    removeBtn.click();

    expect(document.querySelector('.cart-total')).toBeNull();
    expect(document.querySelector('.gift-cart').textContent).not.toContain('null');
  });

  it('モード切替(ギフト選択⇔ポイント直接入力)を再クリックしても入力欄の内容は保持される(回帰)', () => {
    const state = baseState();
    const save = vi.fn();

    openGiftRecordModal({ state, segmentId: 'seg1', save, onSaved: vi.fn() });

    const modeButtons = () => [...document.querySelectorAll('button')];
    modeButtons().find((b) => b.textContent === 'ポイント直接入力').click();
    const pointsInput = document.querySelector('#grm-points');
    pointsInput.value = '4200';
    pointsInput.dispatchEvent(new Event('input'));

    // 既に選択中の「ポイント直接入力」を再クリックしても値は消えない
    modeButtons().find((b) => b.textContent === 'ポイント直接入力').click();

    expect(document.querySelector('#grm-points').value).toBe('4200');
  });

  it('initialUserIdを渡すとユーザー選択欄が最初から選択された状態になる', () => {
    const state = baseState();
    openGiftRecordModal({
      state, segmentId: 'seg1', initialUserId: 'u1', save: vi.fn(), onSaved: vi.fn(),
    });

    expect(document.querySelector('#grm-user').value).toBe('u1');
  });
});
