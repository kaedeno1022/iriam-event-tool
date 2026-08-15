// @vitest-environment jsdom
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import {
  isValidStateShape, migrateSegments, getActiveEventId, getActiveEvent, setActiveEvent, createEvent,
  createSegmentInstance, initState, saveState,
  STORAGE_KEY, StateLoadError, setSaveErrorHandler, backupCurrentState, readBackupRaw,
  clearStoredState, clearBackupState, importStateFromFile, countExternalImageUrls, scheduleSave, flushScheduledSave, hasBackup,
  canToggleUserTracking, isUserTrackingEnabled,
} from '../js/storage.js';

// 追加したテスト群で使う最小のstate。必須配列だけを持つ形。
function emptyStateForTest() {
  return {
    schemaVersion: 6,
    events: [],
    segments: [],
    giftMaster: [],
    giftLogs: [],
    users: [],
    activeEventId: null,
  };
}

describe('isValidStateShape', () => {
  it('必須配列が全て揃っていればtrue', () => {
    expect(isValidStateShape({
      events: [], segments: [], giftMaster: [], giftLogs: [], users: [],
    })).toBe(true);
  });

  it('必須フィールドが1つでも欠けていればfalse', () => {
    expect(isValidStateShape({ events: [], segments: [], giftMaster: [], giftLogs: [] })).toBe(false);
  });

  it('配列であるべきフィールドがオブジェクトだとfalse', () => {
    expect(isValidStateShape({
      events: [], segments: [], giftMaster: [], giftLogs: [], users: {},
    })).toBe(false);
  });

  it('nullやプリミティブはfalse', () => {
    expect(isValidStateShape(null)).toBe(false);
    expect(isValidStateShape('not an object')).toBe(false);
    expect(isValidStateShape(42)).toBe(false);
  });
});

describe('migrateSegments', () => {
  it('既定企画の概念は廃止したため、shiraPai等の企画が無い旧データに対しても新規作成しない', () => {
    const state = {
      events: [{ id: 'event1', name: 'テストイベント' }],
      segments: [{ id: 'seg1', eventId: 'event1', type: 'panelOpen', name: 'パネル開け', order: 0, config: { imageUrl: '', conditions: [] } }],
    };
    migrateSegments(state);

    // panelOpen(既存)以外は何も新規作成されない
    expect(state.segments).toHaveLength(1);
    expect(state.segments.some((s) => s.key === 'shiraPai')).toBe(false);
    expect(state.segments.some((s) => s.key === 'maidCorner')).toBe(false);
    expect(state.segments.some((s) => s.key === 'role')).toBe(false);
    expect(state.segments.some((s) => s.key === 'categoryEndurance')).toBe(false);
    expect(state.segments.some((s) => s.key === 'digiVoiceGacha')).toBe(false);
    expect(state.segments.some((s) => s.key === 'setlist')).toBe(false);
    expect(state.segments.some((s) => s.key === 'counter')).toBe(false);
  });

  it('既に旧デフォルト枠(shiraPai/メイド枠/役職/カテゴリ耐久)があれば中身は変更せず、無いものは新規作成しない', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [
        { id: 'seg1', eventId: 'event1', type: 'panelOpen', key: 'panelOpen', name: 'パネル開け', order: 0, config: { imageUrl: '', conditions: [] } },
        { id: 'seg2', eventId: 'event1', type: 'shiraPai', key: 'shiraPai', name: '罰ゲームチャレンジ', order: 1, config: { punishments: [{ id: 'p1', name: '既存罰ゲーム', count: 5 }], history: [] } },
        {
          id: 'seg3', eventId: 'event1', type: 'shopGacha', key: 'maidCorner', name: 'メイド枠', order: 2, config: { shopItems: [{ id: 'i1', name: '既存特典' }], shopLog: [], gacha: { prizes: [] }, gachaLog: [], freeDrawGrants: [] },
        },
        {
          id: 'seg4', eventId: 'event1', type: 'shopGacha', key: 'role', name: '役職', order: 3, config: { shopItems: [{ id: 'r1', name: '既存追加課金枠' }], shopLog: [], gacha: { prizes: [] }, gachaLog: [], freeDrawGrants: [] },
        },
        {
          id: 'seg5', eventId: 'event1', type: 'categoryEndurance', key: 'categoryEndurance', name: 'カテゴリ耐久', order: 4, config: { category: 'LOVE', giftCounts: [{ id: 'lg1', giftId: 'gift-1', initial: 10, given: 3 }] },
        },
      ],
    };
    migrateSegments(state);

    expect(state.segments).toHaveLength(5); // 増減なし
    const shiraPai = state.segments.find((s) => s.key === 'shiraPai');
    expect(shiraPai.id).toBe('seg2'); // 既存のものが残っている(置き換わっていない)
    expect(shiraPai.config.punishments).toHaveLength(1);
    const maidCorner = state.segments.find((s) => s.key === 'maidCorner');
    expect(maidCorner.id).toBe('seg3');
    expect(maidCorner.config.shopItems).toHaveLength(1);
    const role = state.segments.find((s) => s.key === 'role');
    expect(role.id).toBe('seg4');
    expect(role.config.shopItems).toHaveLength(1);
    const categoryEndurance = state.segments.find((s) => s.key === 'categoryEndurance');
    expect(categoryEndurance.id).toBe('seg5');
    expect(categoryEndurance.config.giftCounts).toHaveLength(1); // 既存の中身は保持
    // 未登録だったdigiVoiceGacha・setlistは新規作成されない(既定企画の概念は廃止)
    expect(state.segments.some((s) => s.key === 'digiVoiceGacha')).toBe(false);
    expect(state.segments.some((s) => s.key === 'setlist')).toBe(false);
  });

  it('旧type=maidCornerのsegmentはtype=shopGacha・key=maidCornerにリネームされる(中身は保持)', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg3', eventId: 'event1', type: 'maidCorner', name: 'メイド枠', order: 0, config: { shopItems: [{ id: 'i1' }] },
      }],
    };
    migrateSegments(state);

    const maidCorner = state.segments.find((s) => s.key === 'maidCorner');
    expect(maidCorner.id).toBe('seg3');
    expect(maidCorner.type).toBe('shopGacha');
    expect(maidCorner.config.shopItems).toEqual([{ id: 'i1' }]);
  });

  it('旧type=roleのsegmentはtype=shopGacha・key=roleにリネームされる(中身は保持)', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg4', eventId: 'event1', type: 'role', name: '役職', order: 0, config: { shopItems: [{ id: 'r1' }] },
      }],
    };
    migrateSegments(state);

    const role = state.segments.find((s) => s.key === 'role');
    expect(role.id).toBe('seg4');
    expect(role.type).toBe('shopGacha');
    expect(role.config.shopItems).toEqual([{ id: 'r1' }]);
  });

  it('旧type=loveCateのsegmentはtype=categoryEndurance・key=categoryEnduranceにリネームされ、category:LOVEが補完される(中身は保持)', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg5', eventId: 'event1', type: 'loveCate', name: 'ラブカテ耐久', order: 0, config: { loveGiftCounts: [{ id: 'lg1', giftId: 'gift-1', initial: 10, given: 3 }] },
      }],
    };
    migrateSegments(state);

    const categoryEndurance = state.segments.find((s) => s.key === 'categoryEndurance');
    expect(categoryEndurance.id).toBe('seg5');
    expect(categoryEndurance.type).toBe('categoryEndurance');
    expect(categoryEndurance.config.category).toBe('LOVE');
    expect(categoryEndurance.config.giftCounts).toEqual([{ id: 'lg1', giftId: 'gift-1', initial: 10, given: 3 }]);
    expect(categoryEndurance.config.loveGiftCounts).toBeUndefined();
  });

  it('旧デフォルト名(ラブカテ耐久)のままのsegmentは新しいデフォルト名(カテゴリ耐久)に追従する', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{ id: 'seg5', eventId: 'event1', type: 'loveCate', name: 'ラブカテ耐久', order: 0, config: {} }],
    };
    migrateSegments(state);

    expect(state.segments.find((s) => s.key === 'categoryEndurance').name).toBe('カテゴリ耐久');
  });

  it('旧type=viewerCounterのsegmentはtype=counter・key=counterにリネームされ、rules:[]が補完される(count保持)', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg6', eventId: 'event1', type: 'viewerCounter', key: 'viewerCounter', name: '同接カウンター', order: 0, config: { count: 42 },
      }],
    };
    migrateSegments(state);

    const counter = state.segments.find((s) => s.key === 'counter');
    expect(counter.id).toBe('seg6');
    expect(counter.type).toBe('counter');
    expect(counter.config.count).toBe(42);
    expect(counter.config.rules).toEqual([]);
  });

  it('日付ベースで追加された非既定のviewerCounter(key:null)はkey:nullのままcounterにリネームされる', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg7', eventId: 'event1', type: 'viewerCounter', key: null, name: '入室カウンター', order: 0, config: { count: 0 },
      }],
    };
    migrateSegments(state);

    const counter = state.segments.find((s) => s.id === 'seg7');
    expect(counter.key).toBeNull();
    expect(counter.type).toBe('counter');
  });

  it('旧デフォルト名(同接カウンター)のままのsegmentは新しいデフォルト名(カウンター)に追従する', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg6', eventId: 'event1', type: 'viewerCounter', key: 'viewerCounter', name: '同接カウンター', order: 0, config: { count: 0 },
      }],
    };
    migrateSegments(state);

    expect(state.segments.find((s) => s.key === 'counter').name).toBe('カウンター');
  });

  it('旧デフォルト名(パネル明け)のままのsegmentは新しいデフォルト名(パネル開け)に追従する', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg1', eventId: 'event1', type: 'panelOpen', key: 'panelOpen', name: 'パネル明け', order: 0, config: { imageUrl: '', conditions: [] },
      }],
    };
    migrateSegments(state);

    expect(state.segments.find((s) => s.key === 'panelOpen').name).toBe('パネル開け');
  });

  it('1 segmentに複数パネル(items配列)を持つ旧panelOpen segmentは、1件目が元segmentを引き継ぎ2件目以降は新規segmentに分割される', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg1',
        eventId: 'event1',
        type: 'panelOpen',
        name: 'パネル開け',
        order: 0,
        config: {
          items: [
            { id: 'item1', name: 'パネルA', imageUrl: 'a.png', conditions: [{ id: 'c1', kind: 'manualCheck', achieved: false }] },
            { id: 'item2', name: 'パネルB', imageUrl: 'b.png', conditions: [{ id: 'c2', kind: 'manualCheck', achieved: true }] },
          ],
        },
      }],
      giftLogs: [
        { id: 'log1', segmentId: 'seg1', conditionId: 'c1', userId: 'u1', points: 0, qty: 1 },
        { id: 'log2', segmentId: 'seg1', conditionId: 'c2', userId: 'u1', points: 0, qty: 1 },
      ],
    };
    migrateSegments(state);

    const panelSegments = state.segments.filter((s) => s.type === 'panelOpen');
    expect(panelSegments).toHaveLength(2);

    const first = state.segments.find((s) => s.id === 'seg1');
    expect(first.name).toBe('パネルA');
    expect(first.key).toBe('panelOpen'); // 元segmentのkeyはそのまま(既定枠)
    expect(first.config).toEqual({ imageUrl: 'a.png', conditions: [{ id: 'c1', kind: 'manualCheck', achieved: false }] });

    const second = panelSegments.find((s) => s.id !== 'seg1');
    expect(second.name).toBe('パネルB');
    expect(second.key).toBeNull(); // 分割で追加された非既定インスタンス
    expect(second.config).toEqual({ imageUrl: 'b.png', conditions: [{ id: 'c2', kind: 'manualCheck', achieved: true }] });

    // 分割されたconditionに紐づくgiftLogsのsegmentIdも新segmentへ付け替わる
    expect(state.giftLogs.find((l) => l.id === 'log1').segmentId).toBe('seg1'); // 1件目は元のまま
    expect(state.giftLogs.find((l) => l.id === 'log2').segmentId).toBe(second.id); // 2件目は新segmentへ
  });

  it('items配列が空のpanelOpen segmentは分割せず、そのままconditions:[]の新形式に変換される', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg1', eventId: 'event1', type: 'panelOpen', name: 'パネル開け', order: 0, config: { items: [] },
      }],
    };
    migrateSegments(state);

    const seg = state.segments.find((s) => s.id === 'seg1');
    expect(seg.config).toEqual({ imageUrl: '', conditions: [] });
  });

  it('旧drawMode/gachaTicketPurchasesフィールドは移行時に削除される(景品自体は保持)', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg3',
        eventId: 'event1',
        type: 'maidCorner',
        name: 'メイド枠',
        order: 0,
        config: { gacha: { drawMode: 'select', prizes: [{ id: 'p1', probability: 100 }] }, gachaTicketPurchases: [{ id: 't1' }] },
      }],
    };
    migrateSegments(state);

    const maidCorner = state.segments.find((s) => s.key === 'maidCorner');
    expect(maidCorner.config.gacha.drawMode).toBeUndefined();
    expect(maidCorner.config.gacha.prizes).toEqual([{ id: 'p1', probability: 100 }]);
    expect(maidCorner.config.gachaTicketPurchases).toBeUndefined();
  });

  it('type=shopGachaで既にkeyがnullのsegment(日付ベースでユーザーが追加した非既定インスタンス相当)は上書きせず、既定のメイド枠/役職も新規作成されない', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg-extra',
        eventId: 'event1',
        type: 'shopGacha',
        key: null,
        name: '追加のガチャ枠',
        order: 5,
        config: { shopItems: [], shopLog: [], gacha: { prizes: [] }, gachaLog: [], freeDrawGrants: [] },
      }],
    };
    migrateSegments(state);

    const extra = state.segments.find((s) => s.id === 'seg-extra');
    expect(extra.key).toBeNull();
    expect(state.segments.filter((s) => s.type === 'shopGacha')).toHaveLength(1); // 既存の非既定1件のみ、既定枠は作られない
    expect(state.segments.some((s) => s.key === 'maidCorner')).toBe(false);
    expect(state.segments.some((s) => s.key === 'role')).toBe(false);
    expect(state.segments.some((s) => s.key === 'digiVoiceGacha')).toBe(false);
  });

  it('旧デフォルト名(しらぱいたらいチャレンジ)のままのsegmentは新しいデフォルト名に追従する', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{ id: 'seg2', eventId: 'event1', type: 'shiraPai', name: 'しらぱいたらいチャレンジ', order: 0, config: { punishments: [] } }],
    };
    migrateSegments(state);

    expect(state.segments.find((s) => s.type === 'shiraPai').name).toBe('罰ゲームチャレンジ');
  });

  it('ユーザーが独自の名前に変更済みのsegmentは名前を上書きしない', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{ id: 'seg2', eventId: 'event1', type: 'shiraPai', name: '推し罰ゲーム大会', order: 0, config: { punishments: [] } }],
    };
    migrateSegments(state);

    expect(state.segments.find((s) => s.type === 'shiraPai').name).toBe('推し罰ゲーム大会');
  });

  it('既存segmentにhistoryフィールドが無ければ空配列で補完する', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{ id: 'seg2', eventId: 'event1', type: 'shiraPai', name: '罰ゲームチャレンジ', order: 0, config: { punishments: [] } }],
    };
    migrateSegments(state);

    expect(state.segments.find((s) => s.type === 'shiraPai').config.history).toEqual([]);
  });

  it('既存shopGacha segmentに欠けているフィールド(shopLog/gacha/gachaLog/freeDrawGrants)があれば補完する', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg3', eventId: 'event1', type: 'shopGacha', key: 'maidCorner', name: 'メイド枠', order: 0, config: { shopItems: [{ id: 'i1' }] },
      }],
    };
    migrateSegments(state);

    const maidCorner = state.segments.find((s) => s.key === 'maidCorner');
    expect(maidCorner.config.shopItems).toEqual([{ id: 'i1' }]); // 既存の中身は保持
    expect(maidCorner.config.shopLog).toEqual([]);
    expect(maidCorner.config.gacha).toEqual({ prizes: [], rateTiers: [] });
    expect(maidCorner.config.gachaLog).toEqual([]);
    expect(maidCorner.config.freeDrawGrants).toEqual([]);
  });

  it('既存shopGacha segmentのgachaにrateTiersが無ければ空配列で補完する(景品自体は保持)', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg4', eventId: 'event1', type: 'shopGacha', key: 'role', name: '役職', order: 0, config: { gacha: { prizes: [{ id: 'p1', probability: 100 }] } },
      }],
    };
    migrateSegments(state);

    const gacha = state.segments.find((s) => s.key === 'role').config.gacha;
    expect(gacha.prizes).toEqual([{ id: 'p1', probability: 100 }]);
    expect(gacha.rateTiers).toEqual([]);
  });

  it('旧weight形式のガチャ景品は重み比から算出したprobability(%、合計100)に変換され、weightは削除される', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg4',
        eventId: 'event1',
        type: 'shopGacha',
        key: 'role',
        name: '役職',
        order: 0,
        config: {
          gacha: {
            prizes: [
              { id: 'p1', name: 'A', weight: 1 },
              { id: 'p2', name: 'B', weight: 3 },
            ],
          },
        },
      }],
    };
    migrateSegments(state);

    const { prizes } = state.segments.find((s) => s.key === 'role').config.gacha;
    expect(prizes[0]).toMatchObject({ id: 'p1', probability: 25 });
    expect(prizes[1]).toMatchObject({ id: 'p2', probability: 75 });
    expect(prizes[0].weight).toBeUndefined();
    expect(prizes[1].weight).toBeUndefined();
  });

  it('既にprobabilityを持つガチャ景品はマイグレーション対象外(値を書き換えない)', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg4', eventId: 'event1', type: 'shopGacha', key: 'role', name: '役職', order: 0, config: { gacha: { prizes: [{ id: 'p1', probability: 40 }] } },
      }],
    };
    migrateSegments(state);

    expect(state.segments.find((s) => s.key === 'role').config.gacha.prizes[0].probability).toBe(40);
  });

  it('probability済みの景品とweightのみの景品が混在していても、既存probabilityは上書きせず残り予算のみをweight比で配分する', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg4',
        eventId: 'event1',
        type: 'shopGacha',
        key: 'role',
        name: '役職',
        order: 0,
        config: {
          gacha: {
            prizes: [
              { id: 'p1', name: '既存', probability: 40 },
              { id: 'p2', name: '旧A', weight: 1 },
              { id: 'p3', name: '旧B', weight: 1 },
            ],
          },
        },
      }],
    };
    migrateSegments(state);

    const { prizes } = state.segments.find((s) => s.key === 'role').config.gacha;
    expect(prizes[0].probability).toBe(40); // 既存値は書き換えられない
    expect(prizes[1].probability).toBe(30); // 残り60%をweight比(1:1)で均等配分
    expect(prizes[2].probability).toBe(30);
    expect(prizes[1].weight).toBeUndefined();
    expect(prizes[2].weight).toBeUndefined();
    expect(prizes.reduce((sum, p) => sum + p.probability, 0)).toBe(100);
  });

  it('既存categoryEndurance segmentに欠けているフィールド(category/giftCounts)があれば補完する', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg5', eventId: 'event1', type: 'categoryEndurance', key: 'categoryEndurance', name: 'カテゴリ耐久', order: 0, config: {},
      }],
    };
    migrateSegments(state);

    const categoryEndurance = state.segments.find((s) => s.key === 'categoryEndurance');
    expect(categoryEndurance.config.category).toBe('LOVE');
    expect(categoryEndurance.config.giftCounts).toEqual([]);
  });

  it('eventが存在しない(空)場合は何もしない(例外にならない)', () => {
    const state = { events: [], segments: [] };
    expect(() => migrateSegments(state)).not.toThrow();
    expect(state.segments).toHaveLength(0);
  });

  it('dateフィールドが無い旧segmentは全イベント分をnull(未スケジュール)で補完する', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [
        { id: 'seg1', eventId: 'event1', type: 'panelOpen', name: 'パネル開け', order: 0, config: { items: [] } },
        { id: 'seg-other', eventId: 'event-other', type: 'panelOpen', name: '別イベントのパネル開け', order: 0, config: { items: [] } },
      ],
    };
    migrateSegments(state);

    expect(state.segments.find((s) => s.id === 'seg1').date).toBeNull();
    expect(state.segments.find((s) => s.id === 'seg-other').date).toBeNull();
  });

  it('既にdateが設定されているsegmentは上書きしない', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [
        { id: 'seg1', eventId: 'event1', type: 'panelOpen', name: 'パネル開け', order: 0, date: '2026-08-18', config: { items: [] } },
      ],
    };
    migrateSegments(state);

    expect(state.segments.find((s) => s.id === 'seg1').date).toBe('2026-08-18');
  });

  it('存在しない旧デフォルト枠(shiraPai等)は、periodStartの有無に関わらず新規作成されない', () => {
    const withoutPeriod = {
      events: [{ id: 'event1' }],
      segments: [{ id: 'seg1', eventId: 'event1', type: 'panelOpen', name: 'パネル開け', order: 0, config: { items: [] } }],
    };
    migrateSegments(withoutPeriod);
    expect(withoutPeriod.segments.some((s) => s.type === 'shiraPai')).toBe(false);

    const withPeriod = {
      events: [{ id: 'event1', periodStart: '2026-08-18', periodEnd: '2026-08-20' }],
      segments: [{ id: 'seg1', eventId: 'event1', type: 'panelOpen', name: 'パネル開け', order: 0, config: { items: [] } }],
    };
    migrateSegments(withPeriod);
    expect(withPeriod.segments.some((s) => s.type === 'shiraPai')).toBe(false);
  });

  it('既存のdate: null既定segmentは、periodStart設定済みならその日付で後方互換補完される', () => {
    const state = {
      events: [{ id: 'event1', periodStart: '2026-08-18', periodEnd: '2026-08-20' }],
      segments: [{
        id: 'seg1', eventId: 'event1', type: 'panelOpen', key: 'panelOpen', name: 'パネル開け', order: 0, date: null, config: { imageUrl: '', conditions: [] },
      }],
    };
    migrateSegments(state);

    expect(state.segments.find((s) => s.id === 'seg1').date).toBe('2026-08-18');
  });

  it('既存segmentが既に日付を設定済みなら、periodStartがあっても上書きしない', () => {
    const state = {
      events: [{ id: 'event1', periodStart: '2026-08-18', periodEnd: '2026-08-20' }],
      segments: [{
        id: 'seg1', eventId: 'event1', type: 'panelOpen', key: 'panelOpen', name: 'パネル開け', order: 0, date: '2026-08-19', config: { imageUrl: '', conditions: [] },
      }],
    };
    migrateSegments(state);

    expect(state.segments.find((s) => s.id === 'seg1').date).toBe('2026-08-19');
  });

  it('activeEventIdが未設定なら渡されたeventIdで補完する', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [{ id: 'seg1', eventId: 'event1', type: 'panelOpen', name: 'パネル開け', order: 0, config: { items: [] } }],
    };
    migrateSegments(state);

    expect(state.activeEventId).toBe('event1');
  });

  it('activeEventIdが既に設定されていれば上書きしない', () => {
    const state = {
      events: [{ id: 'event1' }, { id: 'event2' }],
      activeEventId: 'event2',
      segments: [],
    };
    migrateSegments(state, 'event1');

    expect(state.activeEventId).toBe('event2');
  });

  it('複数イベントがある場合、日付の後方互換補完は指定eventIdのイベントだけに行う(他イベントのsegmentは変更しない)', () => {
    const state = {
      events: [
        { id: 'event1', periodStart: '2026-08-18', periodEnd: '2026-08-20' },
        { id: 'event2', periodStart: '2026-09-01', periodEnd: '2026-09-03' },
      ],
      segments: [
        { id: 'seg1', eventId: 'event1', type: 'panelOpen', key: 'panelOpen', name: 'パネル開け', order: 0, date: null, config: { imageUrl: '', conditions: [] } },
        { id: 'seg2', eventId: 'event2', type: 'panelOpen', key: 'panelOpen', name: 'パネル開け', order: 0, date: null, config: { imageUrl: '', conditions: [] } },
      ],
    };
    migrateSegments(state, 'event2');

    // 指定したevent2側だけ日付が補完され、event1側は指定外なので変更されない
    expect(state.segments.find((s) => s.id === 'seg2').date).toBe('2026-09-01');
    expect(state.segments.find((s) => s.id === 'seg1').date).toBeNull();
    // 存在しないshiraPai等が新規作成されることもない
    expect(state.segments).toHaveLength(2);
  });
});

describe('getActiveEventId / getActiveEvent / setActiveEvent', () => {
  it('activeEventIdが設定されていればそのイベントを返す', () => {
    const state = { events: [{ id: 'event1' }, { id: 'event2' }], activeEventId: 'event2' };
    expect(getActiveEventId(state)).toBe('event2');
    expect(getActiveEvent(state)).toBe(state.events[1]);
  });

  it('activeEventId未設定なら先頭イベントにフォールバックする', () => {
    const state = { events: [{ id: 'event1' }], activeEventId: null };
    expect(getActiveEventId(state)).toBe('event1');
    expect(getActiveEvent(state)).toBe(state.events[0]);
  });

  it('イベントが1つも無ければnullを返す', () => {
    const state = { events: [], activeEventId: null };
    expect(getActiveEventId(state)).toBeNull();
    expect(getActiveEvent(state)).toBeNull();
  });

  it('setActiveEventは存在するeventIdのみ反映する', () => {
    const state = { events: [{ id: 'event1' }, { id: 'event2' }], activeEventId: 'event1' };
    setActiveEvent(state, 'event2');
    expect(state.activeEventId).toBe('event2');
  });

  it('setActiveEventは存在しないeventIdを渡すと何もしない', () => {
    const state = { events: [{ id: 'event1' }], activeEventId: 'event1' };
    setActiveEvent(state, 'event-not-exist');
    expect(state.activeEventId).toBe('event1');
  });
});

describe('createEvent', () => {
  it('新規イベントを作成する。既定企画の概念は廃止したため企画segmentは何も紐づけない', () => {
    const state = {
      events: [{ id: 'event1' }],
      segments: [],
      activeEventId: 'event1',
    };
    const event = createEvent(state, { name: '次のイベント', periodStart: '2026-09-01', periodEnd: '2026-09-07' });

    expect(state.events).toHaveLength(2);
    expect(event.name).toBe('次のイベント');
    expect(event.periodStart).toBe('2026-09-01');
    expect(event.periodEnd).toBe('2026-09-07');
    expect(event.memo).toBe('');
    expect(state.activeEventId).toBe(event.id);

    const newEventSegments = state.segments.filter((s) => s.eventId === event.id);
    expect(newEventSegments).toHaveLength(0);
  });

  it('createSegmentInstanceで作成したsegmentはイベントごとに独立している(型を共有しても別インスタンス)', () => {
    const state = { events: [], segments: [], activeEventId: null };
    const event1 = createEvent(state, { name: 'イベント1', periodStart: '2026-08-18', periodEnd: '2026-08-24' });
    const event2 = createEvent(state, { name: 'イベント2', periodStart: '2026-09-01', periodEnd: '2026-09-07' });

    const shiraPai1 = createSegmentInstance(state, { eventId: event1.id, type: 'shiraPai', name: '罰ゲーム1' });
    const shiraPai2 = createSegmentInstance(state, { eventId: event2.id, type: 'shiraPai', name: '罰ゲーム2' });
    expect(shiraPai1.id).not.toBe(shiraPai2.id);

    shiraPai1.config.punishments.push({ id: 'p1', name: '足つぼ', count: 1 });
    expect(shiraPai2.config.punishments).toHaveLength(0);
  });
});

describe('createSegmentInstance', () => {
  it('指定した日付・種類でsegmentを新規作成し、key:nullで非既定インスタンスとして追加する', () => {
    const state = { segments: [] };
    const segment = createSegmentInstance(state, {
      eventId: 'event1', type: 'shopGacha', name: '土曜の物販ガチャ', date: '2026-08-22',
    });

    expect(state.segments).toContain(segment);
    expect(segment).toMatchObject({
      eventId: 'event1', type: 'shopGacha', key: null, name: '土曜の物販ガチャ', date: '2026-08-22',
    });
    expect(segment.config).toEqual({
      shopItems: [], shopLog: [], gacha: { prizes: [], rateTiers: [] }, gachaLog: [], freeDrawGrants: [], streamPostGrantedUserIds: [],
    });
  });

  it('typeごとに正しい既定configを生成する(panelOpen/shiraPai/categoryEndurance/setlist)', () => {
    const state = { segments: [] };
    const panel = createSegmentInstance(state, { eventId: 'e1', type: 'panelOpen', name: 'パネル' });
    const shira = createSegmentInstance(state, { eventId: 'e1', type: 'shiraPai', name: '罰ゲーム' });
    const endurance = createSegmentInstance(state, { eventId: 'e1', type: 'categoryEndurance', name: '耐久' });
    const setlist = createSegmentInstance(state, { eventId: 'e1', type: 'setlist', name: 'ラスラン' });

    expect(panel.config).toEqual({ imageUrl: '', conditions: [] });
    expect(shira.config).toEqual({ punishments: [], history: [] });
    expect(endurance.config).toEqual({ category: 'LOVE', giftCounts: [] });
    expect(setlist.config).toEqual({ songs: [] });
  });

  it('date省略時はnull(未スケジュール)になる', () => {
    const state = { segments: [] };
    const segment = createSegmentInstance(state, { eventId: 'e1', type: 'shiraPai', name: '罰ゲーム' });
    expect(segment.date).toBeNull();
  });

  it('未対応のtypeを渡すと例外を投げる', () => {
    const state = { segments: [] };
    expect(() => createSegmentInstance(state, { eventId: 'e1', type: 'unknownType', name: 'テスト' })).toThrow();
  });
});

describe('initState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('保存済みデータに複数イベントがある場合、全イベントに旧データ補完(migrateSegments)を適用する(先頭イベントだけに偏らない)。既定企画は新規作成されない', async () => {
    saveState({
      schemaVersion: 5,
      events: [{ id: 'event1' }, { id: 'event2' }],
      activeEventId: 'event1',
      segments: [
        {
          id: 'seg1', eventId: 'event1', type: 'panelOpen', name: 'パネル開け', order: 0, date: null, config: { items: [] },
        },
        {
          id: 'seg2', eventId: 'event2', type: 'panelOpen', name: 'パネル開け', order: 0, date: null, config: { items: [] },
        },
      ],
      giftMaster: [],
      giftLogs: [],
      users: [],
    });

    const state = await initState();

    for (const eventId of ['event1', 'event2']) {
      const segs = state.segments.filter((s) => s.eventId === eventId);
      // panelOpenが移行されるだけで、他の既定枠(shiraPai等)は新規作成されない
      expect(segs).toHaveLength(1);
      // 旧データのkey未設定は後方互換補完で'panelOpen'になる(既定企画の新規作成とは別ロジック)
      expect(segs[0].key).toBe('panelOpen');
    }
  });
});

describe('saveState の保存失敗ハンドリング', () => {
  beforeEach(() => {
    localStorage.clear();
    setSaveErrorHandler(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setSaveErrorHandler(null);
  });

  it('保存に成功するとtrueを返し、ハンドラにはnull(=異常なし)を通知する', () => {
    const handler = vi.fn();
    setSaveErrorHandler(handler);

    expect(saveState(emptyStateForTest())).toBe(true);
    expect(handler).toHaveBeenCalledWith(null);
  });

  it('容量超過で保存できない場合でも例外を投げず、falseを返してハンドラに通知する', () => {
    // 保存はほぼ全ての操作から呼ばれるため、ここで例外が漏れると各ハンドラで未捕捉になり、
    // UI上は成功したように見えたままデータが失われる
    const err = new DOMException('quota', 'QuotaExceededError');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw err; });
    const handler = vi.fn();
    setSaveErrorHandler(handler);

    expect(() => saveState(emptyStateForTest())).not.toThrow();
    expect(saveState(emptyStateForTest())).toBe(false);
    expect(handler).toHaveBeenCalledWith(err);
  });
});

describe('initState の読み込み失敗ハンドリング', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('保存データがJSONとして壊れている場合、StateLoadErrorを投げて生の文字列を保持する', async () => {
    localStorage.setItem(STORAGE_KEY, '{壊れたJSON');

    await expect(initState()).rejects.toThrow(StateLoadError);
    // エラー画面から救出できるよう、読めなかった中身をそのまま持たせる
    await expect(initState()).rejects.toMatchObject({ raw: '{壊れたJSON' });
  });

  it('保存データが本ツールの形式でない場合もStateLoadErrorを投げる', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }));

    await expect(initState()).rejects.toThrow(StateLoadError);
  });
});

describe('backupCurrentState / clearStoredState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('退避したstateはreadBackupRawで読み出せる', () => {
    const state = emptyStateForTest();
    state.users.push({ id: 'u1', displayName: 'テスト' });

    expect(backupCurrentState(state)).toBe(true);
    expect(JSON.parse(readBackupRaw()).users[0].displayName).toBe('テスト');
  });

  it('clearStoredStateは保存データだけを消し、バックアップは残す(復元の最後の手段のため)', () => {
    saveState(emptyStateForTest());
    backupCurrentState(emptyStateForTest());

    clearStoredState();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(readBackupRaw()).not.toBeNull();
  });
});

describe('importStateFromFile の検証', () => {
  function fileOf(obj) {
    return new File([typeof obj === 'string' ? obj : JSON.stringify(obj)], 'test.json', { type: 'application/json' });
  }

  it('本ツールの形式に一致するファイルは読み込める', async () => {
    const parsed = await importStateFromFile(fileOf(emptyStateForTest()));
    expect(parsed.users).toEqual([]);
  });

  it('JSONとして壊れているファイルは拒否する', async () => {
    await expect(importStateFromFile(fileOf('{壊れたJSON'))).rejects.toThrow('JSONとして読み取れませんでした');
  });

  it('必須配列が欠けているファイルは拒否する', async () => {
    await expect(importStateFromFile(fileOf({ events: [] }))).rejects.toThrow('本ツールのエクスポートデータと一致しません');
  });

  it('この版より新しいスキーマのファイルは拒否する(知らないフィールドを誤変換しないため)', async () => {
    const future = { ...emptyStateForTest(), schemaVersion: 999 };
    await expect(importStateFromFile(fileOf(future))).rejects.toThrow('新しい版');
  });

  it('古いスキーマのファイルは受け入れる(migrateSegmentsが後方互換パッチを当てるため)', async () => {
    const old = { ...emptyStateForTest(), schemaVersion: 1 };
    await expect(importStateFromFile(fileOf(old))).resolves.toBeTruthy();
  });

  it('http/https/data以外のスキームの画像URLは空にする', async () => {
    const state = emptyStateForTest();
    state.segments.push({
      id: 'seg1', type: 'panelOpen', config: { imageUrl: 'javascript:alert(1)', conditions: [] },
    });

    const parsed = await importStateFromFile(fileOf(state));
    expect(parsed.segments[0].config.imageUrl).toBe('');
  });

  it('通常のhttps画像URLと相対パスはそのまま残す', async () => {
    const state = emptyStateForTest();
    state.segments.push({ id: 'a', type: 'panelOpen', config: { imageUrl: 'https://example.com/a.png', conditions: [] } });
    state.segments.push({ id: 'b', type: 'panelOpen', config: { imageUrl: 'img/local.png', conditions: [] } });

    const parsed = await importStateFromFile(fileOf(state));
    expect(parsed.segments[0].config.imageUrl).toBe('https://example.com/a.png');
    expect(parsed.segments[1].config.imageUrl).toBe('img/local.png');
  });
});

describe('countExternalImageUrls', () => {
  it('外部ホストを指す画像URLの件数を数える(インポート時の警告に使う)', () => {
    const state = emptyStateForTest();
    state.segments.push({ id: 'a', config: { imageUrl: 'https://example.com/a.png' } });
    state.segments.push({ id: 'b', config: { imageUrl: 'img/local.png' } });
    state.segments.push({ id: 'c', config: {} });

    expect(countExternalImageUrls(state)).toBe(1);
  });
});

describe('scheduleSave(テキスト入力用の遅延保存)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('呼んだ直後は書き込まれず、一定時間後にまとめて1回だけ書き込む', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const state = emptyStateForTest();

    scheduleSave(state);
    scheduleSave(state);
    scheduleSave(state);
    expect(setItem).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('flushScheduledSaveで保留中の保存を即座に書き切れる(ページ離脱時に使う)', () => {
    const state = emptyStateForTest();
    state.users.push({ id: 'u1', displayName: '離脱前の入力' });
    scheduleSave(state);

    flushScheduledSave();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).users[0].displayName).toBe('離脱前の入力');
  });

  it('遅延保存の保留中に即時保存が走っても、二重に書き込まない', () => {
    const state = emptyStateForTest();
    scheduleSave(state);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    saveState(state);
    vi.runAllTimers();

    expect(setItem).toHaveBeenCalledTimes(1);
  });
});

describe('必須配列の補完(不整合データでダッシュボードが落ちないようにする)', () => {
  it('conditionsが欠けたpanelOpen segmentは空配列で補完される', () => {
    const state = {
      ...emptyStateForTest(),
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg1', eventId: 'event1', type: 'panelOpen', key: null, name: 'パネル', date: null, config: { imageUrl: '' },
      }],
    };

    migrateSegments(state, 'event1');

    expect(state.segments[0].config.conditions).toEqual([]);
  });

  it('punishmentsが欠けたshiraPai segmentは空配列で補完される', () => {
    const state = {
      ...emptyStateForTest(),
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg1', eventId: 'event1', type: 'shiraPai', key: null, name: '罰ゲーム', date: null, config: {},
      }],
    };

    migrateSegments(state, 'event1');

    expect(state.segments[0].config.punishments).toEqual([]);
  });

  it('既存の中身がある場合は上書きしない', () => {
    const state = {
      ...emptyStateForTest(),
      events: [{ id: 'event1' }],
      segments: [{
        id: 'seg1', eventId: 'event1', type: 'panelOpen', key: null, name: 'パネル', date: null, config: { conditions: [{ id: 'c1' }] },
      }],
    };

    migrateSegments(state, 'event1');

    expect(state.segments[0].config.conditions).toHaveLength(1);
  });
});

describe('プロトコル相対URLの扱い', () => {
  function fileOf(obj) {
    return new File([JSON.stringify(obj)], 'test.json', { type: 'application/json' });
  }

  it('プロトコル相対URL(//host/x.png)は外部画像として件数に数える', () => {
    const state = emptyStateForTest();
    state.segments.push({ id: 'a', config: { imageUrl: '//evil.example.com/x.png' } });
    state.segments.push({ id: 'b', config: { imageUrl: 'https://example.com/b.png' } });
    state.segments.push({ id: 'c', config: { imageUrl: 'img/local.png' } });

    // 「外部画像0件」と報告したまま外部へリクエストが飛ぶ状態を作らない
    expect(countExternalImageUrls(state)).toBe(2);
  });

  it('プロトコル相対URLはサニタイズでは消さない(表示は警告件数で判断させる)', async () => {
    const state = emptyStateForTest();
    state.segments.push({ id: 'a', type: 'panelOpen', config: { imageUrl: '//example.com/x.png', conditions: [] } });

    const parsed = await importStateFromFile(fileOf(state));
    expect(parsed.segments[0].config.imageUrl).toBe('//example.com/x.png');
  });
});

describe('clearBackupState / clearStoredState と遅延保存の関係', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clearBackupStateはバックアップだけを消し、本体の保存データは残す', () => {
    saveState(emptyStateForTest());
    backupCurrentState(emptyStateForTest());

    clearBackupState();

    expect(readBackupRaw()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('clearStoredStateは保留中の遅延保存を取り消す(消したデータが後から書き戻らない)', () => {
    vi.useFakeTimers();
    try {
      scheduleSave(emptyStateForTest());
      clearStoredState();
      vi.runAllTimers();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('前後に空白がある画像URLの扱い', () => {
  function fileOf(obj) {
    return new File([JSON.stringify(obj)], 'test.json', { type: 'application/json' });
  }

  it('先頭に空白があっても外部画像として件数に数える', () => {
    // ブラウザはsrcを解決する前に前後の空白・制御文字を除去するため、
    // 判定側が素通しすると「0件」と報告したまま実際には外部へリクエストが飛ぶ
    const state = emptyStateForTest();
    state.segments.push({ id: 'a', config: { imageUrl: '  https://evil.example.com/x.png' } });
    state.segments.push({ id: 'b', config: { imageUrl: '\t//evil.example.com/y.png' } });

    expect(countExternalImageUrls(state)).toBe(2);
  });

  it('先頭に空白を付けたjavascript:スキームもサニタイズで空にする', async () => {
    const state = emptyStateForTest();
    state.segments.push({ id: 'a', type: 'panelOpen', config: { imageUrl: ' \njavascript:alert(1)', conditions: [] } });

    const parsed = await importStateFromFile(fileOf(state));
    expect(parsed.segments[0].config.imageUrl).toBe('');
  });
});

describe('hasBackup', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('バックアップの有無を、値を読み出さずに判定できる', () => {
    expect(hasBackup()).toBe(false);

    backupCurrentState(emptyStateForTest());
    expect(hasBackup()).toBe(true);

    clearBackupState();
    expect(hasBackup()).toBe(false);
  });

  it('本体の保存データだけがある状態ではfalseを返す', () => {
    saveState(emptyStateForTest());
    expect(hasBackup()).toBe(false);
  });
});

describe('URL文字列の途中にタブ・改行がある場合', () => {
  function fileOf(obj) {
    return new File([JSON.stringify(obj)], 'test.json', { type: 'application/json' });
  }

  it('スキームの途中に改行が挟まっていても外部画像として数える', () => {
    // ブラウザはタブ・LF・CRをURL中のどの位置からでも除去してから解決するため、
    // 端だけを見て判定すると「h(改行)ttps://…」が相対パスと誤判定されて素通しになる
    const state = emptyStateForTest();
    state.segments.push({ id: 'a', config: { imageUrl: 'h\nttps://evil.example.com/x.png' } });
    state.segments.push({ id: 'b', config: { imageUrl: 'htt\tps://evil.example.com/y.png' } });

    expect(countExternalImageUrls(state)).toBe(2);
  });

  it('スキームの途中に改行を挟んだjavascript:もサニタイズで空にする', async () => {
    const state = emptyStateForTest();
    state.segments.push({ id: 'a', type: 'panelOpen', config: { imageUrl: 'java\nscript:alert(1)', conditions: [] } });

    const parsed = await importStateFromFile(fileOf(state));
    expect(parsed.segments[0].config.imageUrl).toBe('');
  });
});

describe('バックスラッシュを含む画像URL', () => {
  it('「/\\host/x.png」形式も外部画像として数える', () => {
    // http(s)ではバックスラッシュがスラッシュと同一視され、//host/… として解決される
    const state = emptyStateForTest();
    state.segments.push({ id: 'a', config: { imageUrl: '/\\evil.example.com/x.png' } });
    state.segments.push({ id: 'b', config: { imageUrl: 'https:\\\\evil.example.com/y.png' } });
    state.segments.push({ id: 'c', config: { imageUrl: 'img/local.png' } });

    expect(countExternalImageUrls(state)).toBe(2);
  });
});

describe('canToggleUserTracking / isUserTrackingEnabled', () => {
  function segmentOf(type, extra = {}) {
    return { id: 'seg1', type, config: {}, ...extra };
  }

  it('trackUsers未設定のsegmentは「記録する」として扱う(既存データの移行を不要にするための既定)', () => {
    expect(isUserTrackingEnabled(segmentOf('counter'))).toBe(true);
  });

  it('trackUsers:false を設定すると「記録しない」になる', () => {
    expect(isUserTrackingEnabled(segmentOf('counter', { trackUsers: false }))).toBe(false);
  });

  it('trackUsers:true を明示した場合も「記録する」', () => {
    expect(isUserTrackingEnabled(segmentOf('counter', { trackUsers: true }))).toBe(true);
  });

  it.each([
    ['panelOpen'],
    ['shiraPai'],
    ['categoryEndurance'],
    ['counter'],
  ])('ギフトを記録する企画(%s)は切り替えできる', (type) => {
    expect(canToggleUserTracking(segmentOf(type))).toBe(true);
  });

  // shopGacha: ポイント残高の集計・特典の重複交換防止・ガチャの当選済み判定が全てuserIdに
  //            依存するため、オフにすると機能が成立しない。
  // setlist:   ギフト記録の機能自体を持たないため、切り替えても何も変わらない。
  // どちらも、誤ってtrackUsers:falseが書き込まれた既存データを読んでも「記録する」に倒す。
  it.each([
    ['買い物orガチャ枠', 'shopGacha'],
    ['ラスラン', 'setlist'],
  ])('%sは切り替え不可で、trackUsers:falseが入っていても「記録する」に倒す', (_label, type) => {
    expect(canToggleUserTracking(segmentOf(type))).toBe(false);
    expect(isUserTrackingEnabled(segmentOf(type, { trackUsers: false }))).toBe(true);
  });
});
