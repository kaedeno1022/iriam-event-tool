// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { renderDashboard } from '../js/views/dashboard.js';
import { renderUsers } from '../js/views/userView.js';
import { renderGiftMaster } from '../js/views/giftMasterView.js';
import { renderSetlist } from '../js/views/setlistView.js';
import { renderCounter } from '../js/views/counterView.js';
import { renderPanelOpen } from '../js/views/panelOpenView.js';

vi.mock('../js/views/dialogs.js', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
  showSelect: vi.fn(),
}));

// テキスト入力は遅延保存(saveText)、ボタン操作は即時保存(save)、という切り分けが
// 各viewで実際に配線されているかを検証する。デフォルト引数(saveText = save)のせいで、
// 受け取り忘れ・渡し間違いがあっても通常のテストでは検出できないため、
// 2つを別スパイにして呼び分けを直接確認する。

function buildState() {
  return {
    events: [{
      id: 'event1', name: 'バナイベ', periodStart: '2026-08-18', periodEnd: '2026-08-18', memo: '',
    }],
    activeEventId: 'event1',
    segments: [],
    giftLogs: [],
    users: [],
    giftMaster: [],
  };
}

function setup(render, state, extra = {}) {
  document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div><div id="dialog-root"></div>';
  const container = document.getElementById('root');
  const save = vi.fn();
  const saveText = vi.fn();
  const rerender = () => {};
  render({
    state, save, saveText, rerender, container, ...extra,
  });
  return { container, save, saveText };
}

function typeInto(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('テキスト入力は遅延保存・ボタン操作は即時保存', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ダッシュボード: イベント名とメモは遅延保存、日付は即時保存', () => {
    const state = buildState();
    const { container, save, saveText } = setup(renderDashboard, state);

    typeInto(container.querySelector('input[type="text"]'), '新しい名前');
    expect(saveText).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();

    typeInto(container.querySelector('textarea'), 'メモ');
    expect(saveText).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled();

    // 日付は入力のたびに再描画が必要なため即時保存のままでよい
    const dateInput = container.querySelector('.form-row.inline input[type="date"]');
    typeInto(dateInput, '2026-08-19');
    expect(save).toHaveBeenCalled();
  });

  it('ユーザー: 表示名とメモは遅延保存', () => {
    const state = buildState();
    state.users.push({ id: 'u1', displayName: 'A', memo: '' });
    const { container, save, saveText } = setup(renderUsers, state);

    typeInto(container.querySelector('.user-card-header input'), 'B');
    typeInto(container.querySelector('.user-card textarea'), 'メモ');

    expect(saveText).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled();
  });

  it('ギフトマスタ: 名前・pt・カテゴリの編集は遅延保存', () => {
    const state = buildState();
    state.giftMaster.push({
      id: 'g1', name: 'しらすまん', points: 200, category: '定番', useCount: 0, lastUsedAt: null,
    });
    const { container, save, saveText } = setup(renderGiftMaster, state);

    const row = container.querySelector('.gift-master-table tbody tr');
    typeInto(row.querySelector('td:nth-child(1) input'), '改名');
    typeInto(row.querySelector('td:nth-child(2) input'), '300');
    typeInto(row.querySelector('td:nth-child(3) input'), 'ネタ');

    expect(saveText).toHaveBeenCalledTimes(3);
    expect(save).not.toHaveBeenCalled();
  });

  it('ラスラン: 曲名の編集は遅延保存、済みチェックは即時保存', () => {
    const state = buildState();
    state.segments.push({
      id: 'seg1', eventId: 'event1', type: 'setlist', key: null, name: 'ラスラン', date: null, config: { songs: [{ id: 's1', title: '曲A', done: false }] },
    });
    const { container, save, saveText } = setup(renderSetlist, state, { segmentId: 'seg1' });

    typeInto(container.querySelector('.song-title-input'), '曲B');
    expect(saveText).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();

    container.querySelector('input[type="checkbox"]').click();
    expect(save).toHaveBeenCalled();
  });

  it('カウンター: 数値直接入力は遅延保存、±ボタンは即時保存', () => {
    const state = buildState();
    state.segments.push({
      id: 'seg1', eventId: 'event1', type: 'counter', key: null, name: 'カウンター', date: null, config: { count: 0, rules: [] },
    });
    const { container, save, saveText } = setup(renderCounter, state, { segmentId: 'seg1' });

    typeInto(container.querySelector('.viewer-counter-input'), '12');
    expect(saveText).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();

    [...container.querySelectorAll('button')].find((b) => b.textContent === '＋').click();
    expect(save).toHaveBeenCalled();
  });

  it('パネル開け: 画像URLと手動カウンターの直接入力は遅延保存', () => {
    const state = buildState();
    state.segments.push({
      id: 'seg1',
      eventId: 'event1',
      type: 'panelOpen',
      key: null,
      name: 'パネル開け',
      date: null,
      config: {
        imageUrl: '',
        conditions: [{
          id: 'c1', label: '同接', kind: 'manualCounter', target: 10, current: 0,
        }],
      },
    });
    const { container, save, saveText } = setup(renderPanelOpen, state, { segmentId: 'seg1' });

    typeInto(container.querySelector('.viewer-counter-input'), '3');
    expect(saveText).toHaveBeenCalledTimes(1);

    const urlInput = [...container.querySelectorAll('input[type="text"]')].find((i) => i.placeholder === '画像URL(任意)');
    typeInto(urlInput, 'img/a.png');
    expect(saveText).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled();
  });

  it('企画名ヘッダー(全企画共通)は遅延保存', () => {
    const state = buildState();
    state.segments.push({
      id: 'seg1', eventId: 'event1', type: 'counter', key: null, name: 'カウンター', date: null, config: { count: 0, rules: [] },
    });
    const { container, save, saveText } = setup(renderCounter, state, { segmentId: 'seg1' });

    typeInto(container.querySelector('.segment-name-header'), '改名した企画');

    expect(saveText).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(state.segments[0].name).toBe('改名した企画');
  });

  it('saveTextを渡さない呼び出しでは従来通りsaveが即時に呼ばれる(後方互換)', () => {
    const state = buildState();
    document.body.innerHTML = '<div id="root"></div>';
    const container = document.getElementById('root');
    const save = vi.fn();
    renderDashboard({
      state, save, rerender: () => {}, container,
    });

    typeInto(container.querySelector('input[type="text"]'), '名前');

    expect(save).toHaveBeenCalledTimes(1);
  });
});
