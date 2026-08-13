// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { renderUsers } from '../js/views/userView.js';
import { showConfirm } from '../js/views/dialogs.js';

vi.mock('../js/views/dialogs.js', () => ({
  showConfirm: vi.fn(),
}));

// クリックハンドラがdialogs(Promiseベース)をawaitするようになったため、クリック後に
// マイクロタスクを十分にフラッシュしてから状態を検証する(他のview testと同じ方式)。
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function buildState() {
  return {
    activeEventId: 'event1',
    segments: [
      {
        id: 'seg1', eventId: 'event1', type: 'shiraPai', key: 'shiraPai', name: '罰ゲーム', date: null, config: {},
      },
      {
        id: 'seg2', eventId: 'event2', type: 'shiraPai', key: 'shiraPai', name: '別イベントの罰ゲーム', date: null, config: {},
      },
    ],
    giftMaster: [
      {
        id: 'g1', name: 'しらすまん', points: 200, category: '定番', memo: '', lastUsedAt: null, useCount: 0, custom: false,
      },
    ],
    giftLogs: [],
    users: [
      {
        id: 'u1', displayName: 'ゆうき', memo: '', iconImage: '', streamPostDone: false,
      },
    ],
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

describe('renderUsers', () => {
  let container;
  let rerender;
  let state;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="root"></div>';
    container = document.getElementById('root');
    state = buildState();
    rerender = () => {
      container.replaceChildren();
      renderUsers({
        state, save: vi.fn(), rerender, container,
      });
    };
    rerender();
  });

  it('登録済みユーザーがカード表示される', () => {
    const cards = container.querySelectorAll('.user-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].querySelector('input[type="text"]').value).toBe('ゆうき');
  });

  it('新規ユーザーを名前入力+追加で登録できる', () => {
    const nameInput = container.querySelector('.form-row.inline input[type="text"]');
    nameInput.value = 'あおい';
    nameInput.dispatchEvent(new Event('input'));
    clickByText(container, 'button', '追加');

    expect(state.users).toHaveLength(2);
    expect(state.users[1]).toMatchObject({ displayName: 'あおい', memo: '', streamPostDone: false });
  });

  it('名前が空欄のまま追加してもユーザーは増えない', () => {
    clickByText(container, 'button', '追加');
    expect(state.users).toHaveLength(1);
  });

  it('ユーザーカードの名前入力を編集するとstateに反映される', () => {
    const nameInput = container.querySelector('.user-card input[type="text"]');
    nameInput.value = 'ゆうき改';
    nameInput.dispatchEvent(new Event('input'));
    expect(state.users[0].displayName).toBe('ゆうき改');
  });

  it('メモを編集するとstateに反映される', () => {
    const memoInput = container.querySelector('.user-card textarea');
    memoInput.value = '常連さん';
    memoInput.dispatchEvent(new Event('input'));
    expect(state.users[0].memo).toBe('常連さん');
  });

  it('削除ボタンでconfirmするとユーザーが削除される', async () => {
    showConfirm.mockResolvedValueOnce(true);
    container.querySelector('.user-card button[title="削除"]').click();
    await flush();
    expect(state.users).toHaveLength(0);
  });

  it('削除ボタンでキャンセルするとユーザーは残る', async () => {
    showConfirm.mockResolvedValueOnce(false);
    container.querySelector('.user-card button[title="削除"]').click();
    await flush();
    expect(state.users).toHaveLength(1);
  });

  it('合計ポイントはアクティブイベントのsegmentに属するギフト記録だけを集計する(他イベント分は除外)', () => {
    state.giftLogs.push(
      {
        id: 'l1', segmentId: 'seg1', userId: 'u1', giftId: 'g1', points: 200, qty: 2, timestamp: '2026-08-18T10:00:00.000Z',
      },
      {
        id: 'l2', segmentId: 'seg2', userId: 'u1', giftId: 'g1', points: 200, qty: 5, timestamp: '2026-08-18T10:00:00.000Z',
      },
    );
    rerender();

    expect(container.querySelector('.user-total-points').textContent).toBe('合計ポイント: 400pt');
  });

  it('ギフト履歴は種類別に合計個数を集計し、多い順に並ぶ', () => {
    state.giftLogs.push(
      {
        id: 'l1', segmentId: 'seg1', userId: 'u1', giftId: 'g1', points: 200, qty: 1, timestamp: '2026-08-18T10:00:00.000Z',
      },
      {
        id: 'l2', segmentId: 'seg1', userId: 'u1', giftId: 'g1', points: 200, qty: 3, timestamp: '2026-08-18T11:00:00.000Z',
      },
      {
        id: 'l3', segmentId: 'seg1', userId: 'u1', giftId: null, points: 100, qty: 1, timestamp: '2026-08-18T12:00:00.000Z',
      },
    );
    rerender();

    const items = [...container.querySelectorAll('.user-history li')].map((li) => li.textContent);
    expect(items).toEqual(['しらすまん ×4', '直接入力100pt ×1']);
  });

  it('ギフト記録が無いユーザーは「記録なし」と表示される', () => {
    expect(container.querySelector('.user-history').textContent).toContain('記録なし');
  });
});
