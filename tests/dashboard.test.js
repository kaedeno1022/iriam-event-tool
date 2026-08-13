// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { renderDashboard } from '../js/views/dashboard.js';
import { showPrompt, showSelect } from '../js/views/dialogs.js';

vi.mock('../js/views/dialogs.js', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
  showSelect: vi.fn(),
}));

// クリックハンドラがdialogs(Promiseベース)をawaitするようになったため、クリック後に
// マイクロタスクを十分にフラッシュしてから状態を検証する。
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function buildState() {
  return {
    events: [{
      id: 'event1', name: 'バナイベ', periodStart: '2026-08-18', periodEnd: '2026-08-20', memo: '',
    }],
    activeEventId: 'event1',
    segments: [],
    giftLogs: [],
    users: [],
    giftMaster: [],
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

describe('renderDashboard', () => {
  let container;
  let rerender;
  let state;

  beforeEach(() => {
    vi.clearAllMocks();
    showPrompt.mockResolvedValue(null);
    showSelect.mockResolvedValue(null);
    document.body.innerHTML = '<div id="root"></div>';
    container = document.getElementById('root');
    state = buildState();
    rerender = () => {
      container.replaceChildren();
      renderDashboard({
        state, save: vi.fn(), rerender, container,
      });
    };
    rerender();
  });

  it('イベントが無い場合は案内文を表示する', () => {
    document.body.innerHTML = '<div id="root2"></div>';
    const emptyContainer = document.getElementById('root2');
    renderDashboard({
      state: { ...state, events: [], activeEventId: null }, save: vi.fn(), rerender: () => {}, container: emptyContainer,
    });
    expect(emptyContainer.textContent).toContain('新規イベント');
  });

  it('イベント名・期間・メモの入力欄に現在値が反映される', () => {
    const nameInput = container.querySelector('input[type="text"]');
    expect(nameInput.value).toBe('バナイベ');
    const dateInputs = container.querySelectorAll('.form-row.inline input[type="date"]');
    expect(dateInputs[0].value).toBe('2026-08-18');
    expect(dateInputs[1].value).toBe('2026-08-20');
  });

  it('期間内の全日付がカレンダーに表示され、曜日ラベルも付く(2026-08-18は火曜日)', () => {
    const headers = [...container.querySelectorAll('.calendar-day-header')].map((h) => h.textContent);
    expect(headers).toEqual(['2026-08-18(火)', '2026-08-19(水)', '2026-08-20(木)']);
  });

  it('期間が未設定ならカレンダーの代わりに案内文を表示する', () => {
    state.events[0].periodStart = '';
    state.events[0].periodEnd = '';
    rerender();
    expect(container.querySelector('.calendar-grid')).toBeNull();
    expect(container.textContent).toContain('カレンダーが表示されます');
  });

  it('企画が割り当てられていない日は「設定なし」と表示される', () => {
    const dayCells = [...container.querySelectorAll('.calendar-day')];
    expect(dayCells.every((cell) => cell.textContent.includes('設定なし'))).toBe(true);
  });

  it('segment.dateが一致する企画はその日のカレンダーセルにカードとして表示され、#/segment/<id>にリンクする', () => {
    state.segments.push({
      id: 'seg1', eventId: 'event1', type: 'panelOpen', key: 'panelOpen', name: 'パネル明け', date: '2026-08-19', config: { imageUrl: '', conditions: [] },
    });
    rerender();

    const dayCells = [...container.querySelectorAll('.calendar-day')];
    const day19 = dayCells.find((c) => c.textContent.includes('2026-08-19'));
    const link = day19.querySelector('a.segment-card-link');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('#/segment/seg1');
    expect(link.textContent).toContain('パネル明け');
  });

  it('date:nullの企画はカレンダーのどのセルにも表示されない(「未スケジュール」欄は廃止済み)', () => {
    state.segments.push({
      id: 'seg1', eventId: 'event1', type: 'shiraPai', key: 'shiraPai', name: '罰ゲームチャレンジ', date: null, config: { punishments: [] },
    });
    rerender();

    expect(container.querySelector('.calendar-grid').textContent).not.toContain('罰ゲームチャレンジ');
    expect(container.textContent).not.toContain('未スケジュール');
  });

  it('「＋ 企画を割り当て」でプルダウンから種類を選択すると、その日付でsegmentが新規作成される', async () => {
    showSelect.mockResolvedValueOnce('shiraPai');
    showPrompt.mockResolvedValueOnce('土曜の罰ゲーム');

    const day18 = [...container.querySelectorAll('.calendar-day')].find((c) => c.textContent.includes('2026-08-18'));
    clickByText(day18, 'button', '＋ 企画を割り当て');
    await flush();

    expect(state.segments).toHaveLength(1);
    expect(state.segments[0]).toMatchObject({
      type: 'shiraPai', name: '土曜の罰ゲーム', date: '2026-08-18', eventId: 'event1', key: null,
    });
  });

  it('「＋ 企画を割り当て」の種類選択をキャンセルすると何も作成されない', async () => {
    showSelect.mockResolvedValueOnce(null);

    const day18 = [...container.querySelectorAll('.calendar-day')].find((c) => c.textContent.includes('2026-08-18'));
    clickByText(day18, 'button', '＋ 企画を割り当て');
    await flush();

    expect(state.segments).toHaveLength(0);
  });

  it('企画名の入力を空欄でキャンセルすると何も作成されない', async () => {
    showSelect.mockResolvedValueOnce('shiraPai');
    showPrompt.mockResolvedValueOnce(null);

    const day18 = [...container.querySelectorAll('.calendar-day')].find((c) => c.textContent.includes('2026-08-18'));
    clickByText(day18, 'button', '＋ 企画を割り当て');
    await flush();

    expect(state.segments).toHaveLength(0);
  });

  it('shopGachaのカードには交換件数・ガチャ件数が表示される', () => {
    state.segments.push({
      id: 'seg1',
      eventId: 'event1',
      type: 'shopGacha',
      key: 'maidCorner',
      name: 'メイド枠',
      date: '2026-08-18',
      config: {
        shopItems: [], shopLog: [{ id: 'l1' }], gacha: { prizes: [], rateTiers: [] }, gachaLog: [{ id: 'g1' }, { id: 'g2' }], freeDrawGrants: [],
      },
    });
    rerender();

    expect(container.textContent).toContain('交換 1件 / ガチャ 2件');
  });

  it('categoryEnduranceのカードには対象カテゴリと投げられた合計/残り合計が表示される', () => {
    state.segments.push({
      id: 'seg1',
      eventId: 'event1',
      type: 'categoryEndurance',
      key: 'categoryEndurance',
      name: 'カテゴリ耐久',
      date: '2026-08-18',
      config: { category: 'LOVE', giftCounts: [{ giftId: 'g1', initial: 10, given: 3 }] },
    });
    rerender();

    expect(container.textContent).toContain('[LOVE] 投げられた合計 3件 / 残り合計 7');
  });
});
