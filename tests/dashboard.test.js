// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { renderDashboard, findOrphanGiftLogs } from '../js/views/dashboard.js';
import { showPrompt, showSelect, showConfirm } from '../js/views/dialogs.js';
import { backupCurrentState, readBackupRaw } from '../js/storage.js';

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
    localStorage.clear();
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
      id: 'seg1', eventId: 'event1', type: 'panelOpen', key: 'panelOpen', name: 'パネル開け', date: '2026-08-19', config: { imageUrl: '', conditions: [] },
    });
    rerender();

    const dayCells = [...container.querySelectorAll('.calendar-day')];
    const day19 = dayCells.find((c) => c.textContent.includes('2026-08-19'));
    const link = day19.querySelector('a.segment-card-link');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('#/segment/seg1');
    expect(link.textContent).toContain('パネル開け');
  });

  it('カードの✎ボタンで企画名をリネームできる', async () => {
    state.segments.push({
      id: 'seg1', eventId: 'event1', type: 'panelOpen', key: 'panelOpen', name: 'パネル開け', date: '2026-08-19', config: { imageUrl: '', conditions: [] },
    });
    rerender();

    showPrompt.mockResolvedValueOnce('改名後のパネル開け');
    const dayCells = [...container.querySelectorAll('.calendar-day')];
    const day19 = dayCells.find((c) => c.textContent.includes('2026-08-19'));
    clickByText(day19, 'button', '✎');
    await flush();

    expect(state.segments[0].name).toBe('改名後のパネル開け');
    expect(showPrompt).toHaveBeenCalledWith('企画名を入力', 'パネル開け');
  });

  it('企画名リネームで空欄を入力(またはキャンセル)しても名前は変わらない', async () => {
    state.segments.push({
      id: 'seg1', eventId: 'event1', type: 'panelOpen', key: 'panelOpen', name: 'パネル開け', date: '2026-08-19', config: { imageUrl: '', conditions: [] },
    });
    rerender();

    showPrompt.mockResolvedValueOnce(null);
    const dayCells = [...container.querySelectorAll('.calendar-day')];
    const day19 = dayCells.find((c) => c.textContent.includes('2026-08-19'));
    clickByText(day19, 'button', '✎');
    await flush();

    expect(state.segments[0].name).toBe('パネル開け');
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

describe('findOrphanGiftLogs / データの整理', () => {
  let container;
  let state;
  let save;
  let rerender;

  beforeEach(() => {
    vi.clearAllMocks();
    showConfirm.mockResolvedValue(true);
    localStorage.clear();
    document.body.innerHTML = '<div id="root"></div>';
    container = document.getElementById('root');
    save = vi.fn();
    state = buildState();
    state.segments.push({
      id: 'seg1', eventId: 'event1', type: 'counter', key: null, name: 'カウンター', order: 0, date: '2026-08-18', config: { count: 0, rules: [] },
    });
    // seg1(存在する企画)のログと、削除済み企画に紐づいたまま残っているログ
    state.giftLogs.push(
      { id: 'log1', segmentId: 'seg1', userId: 'u1', giftId: 'g1', points: 100, qty: 1, timestamp: '2026-08-18T10:00:00.000Z' },
      { id: 'log2', segmentId: 'deleted-seg', userId: 'u1', giftId: 'g1', points: 100, qty: 1, timestamp: '2026-08-18T10:00:00.000Z' },
      { id: 'log3', segmentId: 'deleted-seg', userId: 'u1', giftId: 'g1', points: 100, qty: 2, timestamp: '2026-08-18T10:00:00.000Z' },
    );
    rerender = () => {
      container.replaceChildren();
      renderDashboard({
        state, save, rerender, container,
      });
    };
    rerender();
  });

  it('存在しない企画に紐づくギフト記録だけを孤立ログとして拾う', () => {
    expect(findOrphanGiftLogs(state).map((l) => l.id)).toEqual(['log2', 'log3']);
  });

  it('孤立ログが無ければ整理用のカードを表示しない', () => {
    state.giftLogs = state.giftLogs.filter((l) => l.segmentId === 'seg1');
    rerender();

    expect(findByText(container, 'h3', 'データの整理')).toBeUndefined();
  });

  it('孤立ログがあれば件数付きの削除ボタンを表示する', () => {
    expect(findByText(container, 'h3', 'データの整理')).toBeTruthy();
    expect(findByText(container, 'button', '不要な記録2件を削除')).toBeTruthy();
  });

  it('削除を実行すると孤立ログだけが消え、生きている企画の記録は残る', async () => {
    clickByText(container, 'button', '不要な記録2件を削除');
    await flush();

    expect(state.giftLogs.map((l) => l.id)).toEqual(['log1']);
    expect(save).toHaveBeenCalled();
  });

  it('確認ダイアログでキャンセルすると何も消えない', async () => {
    showConfirm.mockResolvedValue(false);

    clickByText(container, 'button', '不要な記録2件を削除');
    await flush();

    expect(state.giftLogs).toHaveLength(3);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('孤立ログ削除のID衝突耐性 / バックアップ削除', () => {
  let container;
  let state;
  let save;
  let rerender;

  beforeEach(() => {
    vi.clearAllMocks();
    showConfirm.mockResolvedValue(true);
    localStorage.clear();
    document.body.innerHTML = '<div id="root"></div>';
    container = document.getElementById('root');
    save = vi.fn();
    state = buildState();
    rerender = () => {
      container.replaceChildren();
      renderDashboard({
        state, save, rerender, container,
      });
    };
  });

  it('生きている記録と孤立ログが同じidを持っていても、生きている方を消さない', async () => {
    // 旧世代のID生成器は同一IDを量産しえたため、既存データには重複IDが実在しうる。
    // 削除条件をid一致にすると、この状況で生きている記録まで巻き添えで消える。
    state.segments.push({
      id: 'seg1', eventId: 'event1', type: 'counter', key: null, name: 'カウンター', order: 0, date: '2026-08-18', config: { count: 0, rules: [] },
    });
    state.giftLogs.push(
      { id: 'dup', segmentId: 'seg1', userId: 'u1', giftId: 'g1', points: 100, qty: 1, timestamp: '2026-08-18T10:00:00.000Z' },
      { id: 'dup', segmentId: 'deleted-seg', userId: 'u1', giftId: 'g1', points: 100, qty: 1, timestamp: '2026-08-18T10:00:00.000Z' },
    );
    rerender();

    clickByText(container, 'button', '不要な記録1件を削除');
    await flush();

    expect(state.giftLogs).toHaveLength(1);
    expect(state.giftLogs[0].segmentId).toBe('seg1');
  });

  it('バックアップが存在する場合のみ削除ボタンを出し、押すとバックアップだけ消える', async () => {
    backupCurrentState(state);
    rerender();

    expect(readBackupRaw()).not.toBeNull();
    clickByText(container, 'button', 'インポート前バックアップを削除');
    await flush();

    expect(readBackupRaw()).toBeNull();
  });

  it('孤立ログもバックアップも無ければ整理カード自体を出さない', () => {
    rerender();
    expect(findByText(container, 'h3', 'データの整理')).toBeUndefined();
  });
});

describe('renderDashboard のユーザー記録トグル', () => {
  let container;
  let state;
  let save;
  let rerender;

  function addSegment(type, extra = {}) {
    const segment = {
      id: `seg-${type}`, eventId: 'event1', type, key: null, name: `${type}企画`, order: 0, date: '2026-08-18', config: {}, ...extra,
    };
    state.segments.push(segment);
    return segment;
  }

  function toggleButtons() {
    return [...container.querySelectorAll('.btn-user-toggle')];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.body.innerHTML = '<div id="root"></div>';
    container = document.getElementById('root');
    state = buildState();
    save = vi.fn();
    rerender = () => {
      container.replaceChildren();
      renderDashboard({
        state, save, rerender, container,
      });
    };
  });

  it('trackUsers未設定の企画は「記録する」状態のトグルを表示する', () => {
    addSegment('counter');
    rerender();

    const [toggle] = toggleButtons();
    expect(toggle.textContent).toBe('👤 記録');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.className).toContain('on');
  });

  it('trackUsers:false の企画は「記録しない」状態で表示する', () => {
    addSegment('counter', { trackUsers: false });
    rerender();

    const [toggle] = toggleButtons();
    expect(toggle.textContent).toBe('👤 なし');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.className).toContain('off');
  });

  it('押すとtrackUsersが反転して保存され、表示も切り替わる', () => {
    const segment = addSegment('counter');
    rerender();

    toggleButtons()[0].click();
    expect(segment.trackUsers).toBe(false);
    expect(save).toHaveBeenCalled();
    expect(toggleButtons()[0].textContent).toBe('👤 なし');

    toggleButtons()[0].click();
    expect(segment.trackUsers).toBe(true);
    expect(toggleButtons()[0].textContent).toBe('👤 記録');
  });

  // 切り替え対象外の判定はstorage.jsのcanToggleUserTrackingに委譲している。
  // ここで両typeを列挙しておくことで、dashboard側がtypeをハードコードする実装へ
  // 退行した場合(片方しか除外しなくなる)を検出する。
  it.each([
    ['買い物orガチャ枠', 'shopGacha'],
    ['ラスラン', 'setlist'],
  ])('%sにはトグルを出さない', (_label, type) => {
    addSegment(type);
    rerender();

    // カード自体は出るが、トグルだけが無い状態であることを確かめる
    expect(container.querySelectorAll('.segment-card')).toHaveLength(1);
    expect(toggleButtons()).toHaveLength(0);
  });

  it('企画ごとに独立して切り替わる(同じイベント内の他の企画に波及しない)', () => {
    const counter = addSegment('counter');
    const panel = addSegment('panelOpen');
    rerender();

    const target = toggleButtons().find((b) => b.closest('.segment-card').textContent.includes(counter.name));
    target.click();

    expect(counter.trackUsers).toBe(false);
    expect(panel.trackUsers).toBeUndefined();
  });
});
