// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { renderShopGacha, resetShopGachaUiState } from '../js/views/shopGachaView.js';
import { showAlert, showConfirm, showPrompt } from '../js/views/dialogs.js';

vi.mock('../js/views/dialogs.js', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
  showSelect: vi.fn(),
}));

function buildState() {
  return {
    events: [{ id: 'event1' }],
    activeEventId: 'event1',
    users: [{ id: 'u1', displayName: 'ユーザーA' }],
    giftLogs: [],
    giftMaster: [],
    segments: [
      {
        id: 'seg-maid',
        eventId: 'event1',
        type: 'shopGacha',
        key: 'maidCorner',
        name: 'メイド枠',
        config: {
          shopItems: [], shopLog: [], gacha: { prizes: [], rateTiers: [] }, gachaLog: [], freeDrawGrants: [],
        },
      },
      {
        id: 'seg-role',
        eventId: 'event1',
        type: 'shopGacha',
        key: 'role',
        name: '役職',
        config: {
          shopItems: [], shopLog: [], gacha: { prizes: [], rateTiers: [] }, gachaLog: [], freeDrawGrants: [],
        },
      },
    ],
  };
}

function selectUser(container, userId) {
  const select = container.querySelector('.user-select-widget select');
  select.value = userId;
  select.dispatchEvent(new Event('change'));
}

// クリックハンドラがdialogs(Promiseベース)をawaitするようになったため、クリック後に
// マイクロタスクを十分にフラッシュしてから状態を検証する。
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

async function clickByText(container, tag, text) {
  const el = [...container.querySelectorAll(tag)].find((node) => node.textContent.trim() === text);
  if (!el) throw new Error(`${tag} not found: ${text}`);
  el.click();
  await flush();
}

function findByText(container, tag, text) {
  return [...container.querySelectorAll(tag)].find((node) => node.textContent.trim() === text);
}

describe('renderShopGacha', () => {
  let container;
  let rerender;
  let state;

  beforeEach(async () => {
    vi.clearAllMocks();
    showAlert.mockResolvedValue(undefined);
    showConfirm.mockResolvedValue(true);
    showPrompt.mockResolvedValue(null);

    resetShopGachaUiState();
    document.body.innerHTML = '<div id="root"></div><div id="modal-root"></div>';
    container = document.getElementById('root');
    state = buildState();
    rerender = () => {
      container.replaceChildren();
      renderShopGacha({
        state, save: vi.fn(), rerender, container, segmentKey: 'maidCorner',
      });
    };
    rerender();
  });

  it('該当キーのsegmentが無い場合はエラーメッセージを表示する', () => {
    document.body.innerHTML = '<div id="root2"></div>';
    const emptyContainer = document.getElementById('root2');
    renderShopGacha({
      state: { ...state, segments: [] }, save: vi.fn(), rerender: () => {}, container: emptyContainer, segmentKey: 'maidCorner',
    });
    expect(emptyContainer.textContent).toContain('企画が見つかりません');
  });

  it('segment.nameを見出しに表示する', () => {
    expect(container.querySelector('h2').textContent).toBe('メイド枠');
  });

  it('既定でポイントタブが選択されている', () => {
    expect(findByText(container, 'button', 'ポイント').classList.contains('active')).toBe(true);
  });

  it('タブ切替でお買い物・ガチャの内容に切り替わる', async () => {
    await clickByText(container, 'button', 'お買い物');
    expect(container.textContent).toContain('特典一覧');
    await clickByText(container, 'button', 'ガチャ');
    expect(container.textContent).toContain('無料ガチャ');
  });

  describe('ポイントタブ', () => {
    it('ギフト記録に応じたユーザー別残高が表示される', () => {
      state.giftLogs.push({
        id: 'g1', segmentId: 'seg-maid', userId: 'u1', points: 500, qty: 1, timestamp: new Date().toISOString(),
      });
      rerender();
      expect(container.textContent).toContain('500pt');
    });
  });

  describe('お買い物タブ', () => {
    beforeEach(async () => {
      state.segments[0].config.shopItems.push({
        id: 'item1', name: 'オムライスらくがき', requiredPoints: 200, stock: 1, allowDuplicate: false,
      });
      await clickByText(container, 'button', 'お買い物');
    });

    it('ユーザー未選択時は交換候補が表示されない', () => {
      expect(container.textContent).toContain('上の「対象ユーザー」で選択してください');
    });

    it('pt不足の場合は交換ボタンを押してもalertでブロックされ交換されない', async () => {
      selectUser(container, 'u1');
      await clickByText(container, 'button', 'オムライスらくがき(200pt)');
      expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('ptが不足しています'));
      expect(state.segments[0].config.shopLog).toHaveLength(0);
    });

    it('pt十分なら交換でき、shopLogに記録され残高が減る', async () => {
      state.giftLogs.push({
        id: 'g1', segmentId: 'seg-maid', userId: 'u1', points: 500, qty: 1, timestamp: new Date().toISOString(),
      });
      rerender();
      await clickByText(container, 'button', 'お買い物');
      selectUser(container, 'u1');
      await clickByText(container, 'button', 'オムライスらくがき(200pt)');
      expect(state.segments[0].config.shopLog).toHaveLength(1);
      expect(state.segments[0].config.shopLog[0]).toMatchObject({ userId: 'u1', itemId: 'item1', pointsSpent: 200 });
    });

    it('被り不可の特典は交換済みユーザーには再表示されない', async () => {
      state.segments[0].config.shopLog.push({
        id: 'l1', userId: 'u1', itemId: 'item1', itemName: 'オムライスらくがき', pointsSpent: 200, timestamp: new Date().toISOString(),
      });
      rerender();
      await clickByText(container, 'button', 'お買い物');
      selectUser(container, 'u1');
      expect(container.textContent).toContain('交換可能な特典がありません');
    });
  });

  describe('ガチャタブ', () => {
    beforeEach(async () => {
      state.segments[0].config.gacha.prizes.push({
        id: 'prize1', name: 'ヘッダー', weight: 1, stock: null, allowDuplicate: true, guaranteedPoints: null,
      });
      state.segments[0].config.gacha.rateTiers.push({ id: 'tier1', points: 300, draws: 1 });
      await clickByText(container, 'button', 'ガチャ');
    });

    it('選択式(select)モードは廃止されており、モード切替UIが存在しない', () => {
      expect(container.textContent).not.toContain('選択式');
      expect(container.textContent).not.toContain('抽選(ランダム)');
    });

    it('pt十分ならレートボタンで抽選でき、gachaLogにmode:randomで記録されptが消費される', async () => {
      state.giftLogs.push({
        id: 'g1', segmentId: 'seg-maid', userId: 'u1', points: 300, qty: 1, timestamp: new Date().toISOString(),
      });
      rerender();
      await clickByText(container, 'button', 'ガチャ');
      selectUser(container, 'u1');
      await clickByText(container, 'button', '300ptで1回分');
      expect(state.segments[0].config.gachaLog).toHaveLength(1);
      expect(state.segments[0].config.gachaLog[0]).toMatchObject({
        userId: 'u1', prizeName: 'ヘッダー', mode: 'random', pointsSpent: 300,
      });
    });

    it('pt不足ならレートボタンを押してもalertでブロックされ抽選されない', async () => {
      selectUser(container, 'u1');
      await clickByText(container, 'button', '300ptで1回分');
      expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('ptが不足しています'));
      expect(state.segments[0].config.gachaLog).toHaveLength(0);
    });

    it('確定枠は抽選を挟まずguaranteedPointsを消費して直接獲得できる', async () => {
      state.segments[0].config.gacha.prizes[0].guaranteedPoints = 1000;
      state.giftLogs.push({
        id: 'g1', segmentId: 'seg-maid', userId: 'u1', points: 1000, qty: 1, timestamp: new Date().toISOString(),
      });
      rerender();
      await clickByText(container, 'button', 'ガチャ');
      selectUser(container, 'u1');
      await clickByText(container, 'button', 'ヘッダー(1000pt)');
      expect(state.segments[0].config.gachaLog).toHaveLength(1);
      expect(state.segments[0].config.gachaLog[0]).toMatchObject({ mode: 'guaranteed', pointsSpent: 1000 });
    });

    it('無料ガチャは付与前は残り0回で押せない', () => {
      selectUser(container, 'u1');
      const btn = findByText(container, 'button', '無料で引く');
      expect(btn.disabled).toBe(true);
    });

    it('管理画面から無料ガチャを付与すると残り回数が増え、pt消費なしで1回引ける', async () => {
      selectUser(container, 'u1');
      await clickByText(container, 'button', '▼ 無料ガチャ付与を編集');
      showPrompt.mockResolvedValueOnce('2');
      await clickByText(container, 'button', '＋ 無料ガチャを付与');

      expect(state.segments[0].config.freeDrawGrants).toHaveLength(1);
      expect(state.segments[0].config.freeDrawGrants[0]).toMatchObject({ userId: 'u1', count: 2 });
      expect(container.textContent).toContain('残り2回');

      findByText(container, 'button', '無料で引く').click();
      await flush();

      expect(state.segments[0].config.gachaLog).toHaveLength(1);
      expect(state.segments[0].config.gachaLog[0]).toMatchObject({ userId: 'u1', mode: 'free', pointsSpent: 0 });
      expect(container.textContent).toContain('残り1回');
    });

    it('無料枠での抽選はptを消費しない(pointsSpent: 0)', async () => {
      state.segments[0].config.freeDrawGrants.push({
        id: 'grant1', userId: 'u1', count: 1, timestamp: new Date().toISOString(),
      });
      rerender();
      await clickByText(container, 'button', 'ガチャ');
      selectUser(container, 'u1');

      findByText(container, 'button', '無料で引く').click();
      await flush();

      expect(state.segments[0].config.gachaLog[0].pointsSpent).toBe(0);
    });

    it('ガチャ履歴にモード(抽選/確定/無料)が日本語で表示される', async () => {
      state.segments[0].config.gachaLog.push(
        {
          id: 'l1', timestamp: new Date().toISOString(), userId: 'u1', prizeId: 'prize1', prizeName: 'ヘッダー', mode: 'random',
        },
        {
          id: 'l2', timestamp: new Date().toISOString(), userId: 'u1', prizeId: 'prize1', prizeName: 'ヘッダー', mode: 'guaranteed',
        },
        {
          id: 'l3', timestamp: new Date().toISOString(), userId: 'u1', prizeId: 'prize1', prizeName: 'ヘッダー', mode: 'free',
        },
      );
      rerender();
      await clickByText(container, 'button', 'ガチャ');
      expect(container.textContent).toContain('抽選');
      expect(container.textContent).toContain('確定');
      expect(container.textContent).toContain('無料');
    });

    describe('＋ 景品を追加(4連続prompt+confirmのawaitチェーン)', () => {
      beforeEach(async () => {
        await clickByText(container, 'button', '▼ 景品一覧を編集');
      });

      it('4つの入力を全て終えると、入力値通りの景品が追加される', async () => {
        showPrompt.mockResolvedValueOnce('新景品').mockResolvedValueOnce('3').mockResolvedValueOnce('10').mockResolvedValueOnce('');
        showConfirm.mockResolvedValueOnce(true);

        await clickByText(container, 'button', '＋ 景品を追加');

        expect(state.segments[0].config.gacha.prizes).toHaveLength(2); // 既存のprize1 + 新規
        const added = state.segments[0].config.gacha.prizes.find((p) => p.name === '新景品');
        expect(added).toMatchObject({
          name: '新景品', weight: 3, stock: 10, allowDuplicate: true, guaranteedPoints: null,
        });
      });

      it('景品名の入力をキャンセルすると、以降のダイアログは呼ばれず何も追加されない', async () => {
        showPrompt.mockResolvedValueOnce(null);

        await clickByText(container, 'button', '＋ 景品を追加');

        expect(state.segments[0].config.gacha.prizes).toHaveLength(1); // 既存のprize1のみ
        expect(showPrompt).toHaveBeenCalledTimes(1); // 重み以降のpromptは呼ばれていない
        expect(showConfirm).not.toHaveBeenCalled();
      });

      it('重み・在庫の入力をキャンセルしても既定値(重み1・在庫無制限)で追加は続行される', async () => {
        showPrompt.mockResolvedValueOnce('新景品').mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
        showConfirm.mockResolvedValueOnce(false);

        await clickByText(container, 'button', '＋ 景品を追加');

        const added = state.segments[0].config.gacha.prizes.find((p) => p.name === '新景品');
        expect(added).toMatchObject({
          weight: 1, stock: null, allowDuplicate: false, guaranteedPoints: null,
        });
      });

      it('確定枠に不正な値(0以下)を入力するとアラートを出し追加しない', async () => {
        showPrompt.mockResolvedValueOnce('新景品').mockResolvedValueOnce('1').mockResolvedValueOnce('').mockResolvedValueOnce('0');
        showConfirm.mockResolvedValueOnce(true);

        await clickByText(container, 'button', '＋ 景品を追加');

        expect(state.segments[0].config.gacha.prizes.find((p) => p.name === '新景品')).toBeUndefined();
        expect(showAlert).toHaveBeenCalledWith('確定枠の必要ptは正の数値で入力してください');
      });

      it('確定枠に正の数値を入力すると、guaranteedPointsが設定される', async () => {
        showPrompt.mockResolvedValueOnce('新景品').mockResolvedValueOnce('1').mockResolvedValueOnce('').mockResolvedValueOnce('1000');
        showConfirm.mockResolvedValueOnce(true);

        await clickByText(container, 'button', '＋ 景品を追加');

        const added = state.segments[0].config.gacha.prizes.find((p) => p.name === '新景品');
        expect(added.guaranteedPoints).toBe(1000);
      });
    });

    describe('配信ポスト特典の一括付与(6.7)', () => {
      beforeEach(async () => {
        await clickByText(container, 'button', '▼ 無料ガチャ付与を編集');
      });

      it('配信ポスト実施済みユーザー全員に無料ガチャが1回ずつ付与され、streamPostGrantedUserIdsに記録される', async () => {
        state.users.push(
          { id: 'u2', displayName: 'ユーザーB', streamPostDone: true },
          { id: 'u3', displayName: 'ユーザーC', streamPostDone: true },
          { id: 'u4', displayName: 'ユーザーD', streamPostDone: false },
        );
        rerender();
        await clickByText(container, 'button', 'ガチャ');

        await clickByText(container, 'button', '＋ 配信ポスト特典を一括付与(対象2人)');

        expect(state.segments[0].config.freeDrawGrants.map((g) => g.userId).sort()).toEqual(['u2', 'u3']);
        expect(state.segments[0].config.freeDrawGrants.every((g) => g.count === 1)).toBe(true);
        expect(state.segments[0].config.streamPostGrantedUserIds.sort()).toEqual(['u2', 'u3']);
      });

      it('既に付与済みのユーザーは対象人数・対象から除外され、二重付与されない', async () => {
        state.users.push({ id: 'u2', displayName: 'ユーザーB', streamPostDone: true });
        state.segments[0].config.streamPostGrantedUserIds = ['u2'];
        rerender();
        await clickByText(container, 'button', 'ガチャ');

        expect(findByText(container, 'button', '＋ 配信ポスト特典を一括付与(対象0人)')).toBeTruthy();
      });

      it('対象0人の状態でボタンを押すとアラートを出し何も付与しない', async () => {
        await clickByText(container, 'button', '＋ 配信ポスト特典を一括付与(対象0人)');

        expect(showAlert).toHaveBeenCalled();
        expect(state.segments[0].config.freeDrawGrants).toHaveLength(0);
      });

      it('確認をキャンセルすると付与されない', async () => {
        state.users.push({ id: 'u2', displayName: 'ユーザーB', streamPostDone: true });
        rerender();
        await clickByText(container, 'button', 'ガチャ');

        showConfirm.mockResolvedValueOnce(false);
        await clickByText(container, 'button', '＋ 配信ポスト特典を一括付与(対象1人)');

        expect(state.segments[0].config.freeDrawGrants).toHaveLength(0);
        expect(state.segments[0].config.streamPostGrantedUserIds).toHaveLength(0);
      });
    });
  });

  it('2つのインスタンス(メイド枠/役職)はUI状態(選択中ユーザー等)が独立している', () => {
    document.body.innerHTML = '<div id="root-maid"></div><div id="root-role"></div>';
    const maidContainer = document.getElementById('root-maid');
    const roleContainer = document.getElementById('root-role');
    renderShopGacha({
      state, save: vi.fn(), rerender: () => {}, container: maidContainer, segmentKey: 'maidCorner',
    });
    renderShopGacha({
      state, save: vi.fn(), rerender: () => {}, container: roleContainer, segmentKey: 'role',
    });

    selectUser(maidContainer, 'u1');

    expect(maidContainer.querySelector('.user-select-widget select').value).toBe('u1');
    expect(roleContainer.querySelector('.user-select-widget select').value).toBe('');
  });

  it('2つのインスタンスは経済(pt/ガチャ)が完全に独立している(片方のギフト記録がもう片方の残高に影響しない)', () => {
    state.giftLogs.push({
      id: 'g1', segmentId: 'seg-maid', userId: 'u1', points: 500, qty: 1, timestamp: new Date().toISOString(),
    });
    document.body.innerHTML = '<div id="root-role"></div>';
    const roleContainer = document.getElementById('root-role');
    renderShopGacha({
      state, save: vi.fn(), rerender: () => {}, container: roleContainer, segmentKey: 'role',
    });
    expect(roleContainer.textContent).not.toContain('500pt');
  });
});

describe('renderShopGacha - segmentId指定(日付ベースの非既定インスタンス)', () => {
  it('segmentId指定時は、segmentKeyでなくてもそのsegmentを直接表示する', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const container = document.getElementById('root');
    const s = buildState();
    s.segments.push({
      id: 'seg-extra',
      eventId: 'event1',
      type: 'shopGacha',
      key: null,
      name: '土曜の物販ガチャ',
      config: {
        shopItems: [], shopLog: [], gacha: { prizes: [], rateTiers: [] }, gachaLog: [], freeDrawGrants: [],
      },
    });

    renderShopGacha({
      state: s, save: vi.fn(), rerender: () => {}, container, segmentId: 'seg-extra',
    });

    expect(container.querySelector('h2').textContent).toBe('土曜の物販ガチャ');
  });

  it('key:nullを共有する2つの非既定インスタンス(異なるsegmentId)でもUI状態(選択中ユーザー)が独立している', () => {
    document.body.innerHTML = '<div id="root-a"></div><div id="root-b"></div>';
    const containerA = document.getElementById('root-a');
    const containerB = document.getElementById('root-b');
    const s = buildState();
    const baseConfig = () => ({
      shopItems: [], shopLog: [], gacha: { prizes: [], rateTiers: [] }, gachaLog: [], freeDrawGrants: [],
    });
    s.segments.push(
      {
        id: 'seg-a', eventId: 'event1', type: 'shopGacha', key: null, name: '土曜のガチャ', config: baseConfig(),
      },
      {
        id: 'seg-b', eventId: 'event1', type: 'shopGacha', key: null, name: '日曜のガチャ', config: baseConfig(),
      },
    );

    renderShopGacha({
      state: s, save: vi.fn(), rerender: () => {}, container: containerA, segmentId: 'seg-a',
    });
    renderShopGacha({
      state: s, save: vi.fn(), rerender: () => {}, container: containerB, segmentId: 'seg-b',
    });

    selectUser(containerA, 'u1');

    expect(containerA.querySelector('.user-select-widget select').value).toBe('u1');
    expect(containerB.querySelector('.user-select-widget select').value).toBe('');
  });
});
