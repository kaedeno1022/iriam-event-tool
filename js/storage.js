import { genId } from './id.js';

// v2: パネル明けのitem形状を{targetValue}から{conditions:[]}に変更(破壊的変更のためキーを分離し、
// 旧形式のデータを読み込んで進捗計算関数(当時のcomputeItemProgress、v5でcomputeSegmentProgressに改名)
// がクラッシュしないようにする)
// v3: Segmentにdate(日付紐づけ、未設定はnull)・stateにactiveEventId(複数イベント管理)を追加。
// v4: maidCorner/role segmentを1つのtype('shopGacha')に統合。selectモード(選択式ガチャ)廃止に伴い
// drawMode/gachaTicketPurchasesを廃止し、代わりに手動付与できる無料抽選権(freeDrawGrants)を追加。
// typeだけでは「メイド枠用の既定枠」「役職用の既定枠」を区別できなくなったため、Segmentに
// key(既定枠の識別子、ユーザーが日付ベースで追加した非既定segmentはnull)を追加した。
// v5: 「1 segment = 複数パネル(items配列)」を廃止し「1 segmentインスタンス = 1パネル」に簡略化
// (複数パネルが必要な場合は日付ベースで別インスタンスを作る想定、既存の複数item segmentは
// 1件目が元のsegmentを引き継ぎ、2件目以降は新規segmentとして分割する)。
// loveCate segmentをcategoryEndurance(カテゴリを選択できる汎用版)に一般化。
// いずれも既存データに対して加算的な変更のため、v1→v2のようなSTORAGE_KEY分離は行わず、
// v2までと同じくmigrateSegmentsでの後方互換パッチで対応する。
// v6(2026-08): 「イベントには既定で8種類の企画が必ず紐づく」という既定企画の概念を廃止。
// 新規イベントは企画segmentを持たない状態で作られ、ユーザーがダッシュボードの
// 「＋企画を割り当て」で必要な企画だけを都度追加する運用に統一した(ダッシュボードから
// 企画を削除・日付変更できるようにするための前提変更)。既存データに残る旧デフォルト枠
// (key有り)は削除せず、名前・日付の後方互換パッチだけ引き続き適用する。
// v6(2026-08-13、schemaVersion更新): viewerCounter(同接専用)をcounter(汎用カウンター)に
// 一般化。type/keyをリネームし、ギフト記録と連動して自動増減する「ルール」(rules[])を
// 追加した(config: { count, rules: [{ id, giftId, delta }] })。記録はルール固定の専用UIでは
// なく共通の「ギフトを記録」欄(対象ギフト固定なし)から行い、記録したgiftIdに一致するルールが
// あれば自動でcountに反映する(conditionIdは特定ルールに紐づけず常にnull)。記録時に適用した
// delta(1個あたり)はログ自体に記憶し、個数編集・取り消し時はその記憶値で補正する
// (ルールを事後に変更・削除しても過去の記録の補正結果は変わらない)。
const STORAGE_KEY = 'iriamEventTool:state:v2';
const SCHEMA_VERSION = 6;

function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    events: [],
    segments: [],
    giftMaster: [],
    giftLogs: [],
    users: [],
    activeEventId: null,
  };
}

async function buildInitialState() {
  const state = emptyState();

  const res = await fetch('data/gifts.seed.json');
  const seedGifts = await res.json();
  state.giftMaster = seedGifts.map((g) => ({
    id: genId('gift'),
    name: g.name,
    points: g.points,
    category: g.category,
    memo: g.memo ?? '',
    lastUsedAt: null,
    useCount: 0,
    custom: false,
  }));

  const eventId = genId('event');
  state.events.push({
    id: eventId,
    name: 'バナイベ(トップバナーチャレンジ)',
    periodStart: '2026-08-18',
    periodEnd: '2026-08-18',
    memo: '',
  });
  state.activeEventId = eventId;

  return state;
}

function buildShopGachaConfig() {
  return {
    shopItems: [],
    shopLog: [],
    gacha: { prizes: [], rateTiers: [] },
    gachaLog: [],
    freeDrawGrants: [],
    streamPostGrantedUserIds: [],
  };
}

// 企画typeごとの定義一覧。createSegmentInstance(ダッシュボードの「＋企画を割り当て」)が
// type別の初期config形状を引くカタログとして使うほか、migrateSegmentsが既存データに残る
// 旧デフォルト枠(key有り)の名前・日付を後方互換パッチする際の参照元としても使う。
// keyは「かつての既定枠がどれか」を表す識別子(typeとは独立)。メイド枠・役職は同じtype
// ('shopGacha')を共有するため、type単体では区別できない。新規作成されるsegmentのkeyは
// createSegmentInstanceで常にnullになる(既定企画の概念は廃止済み)。
const SEGMENT_TYPE_DEFS = [
  {
    key: 'panelOpen',
    type: 'panelOpen',
    name: 'パネル明け',
    oldNames: [],
    buildConfig: () => ({ imageUrl: '', conditions: [] }),
  },
  {
    key: 'shiraPai',
    type: 'shiraPai',
    name: '罰ゲームチャレンジ',
    oldNames: ['しらぱいたらいチャレンジ'],
    buildConfig: () => ({ punishments: [], history: [] }),
  },
  {
    key: 'maidCorner',
    type: 'shopGacha',
    name: 'メイド枠',
    oldNames: [],
    buildConfig: buildShopGachaConfig,
  },
  {
    key: 'role',
    type: 'shopGacha',
    name: '役職',
    oldNames: [],
    buildConfig: buildShopGachaConfig,
  },
  {
    key: 'categoryEndurance',
    type: 'categoryEndurance',
    name: 'カテゴリ耐久',
    oldNames: ['ラブカテ耐久'],
    buildConfig: () => ({ category: 'LOVE', giftCounts: [] }),
  },
  {
    // 6.7 デジガチャ・ボイスガチャ。メイド枠・役職と同じ買い物orガチャ枠(shopGacha)をそのまま
    // 流用する(共通GachaConfigの方針)。配信ポスト特典の自動付与機能もshopGachaView側に
    // 追加済みで、type共通のため他のshopGachaインスタンスからも使える。
    key: 'digiVoiceGacha',
    type: 'shopGacha',
    name: 'デジガチャ・ボイスガチャ',
    oldNames: [],
    buildConfig: buildShopGachaConfig,
  },
  {
    // 6.8 ラスラン(セトリ管理)。経済(pt/ガチャ)を持たない単純な順序リスト+実施済みチェックのみ。
    key: 'setlist',
    type: 'setlist',
    name: 'ラスラン',
    oldNames: [],
    buildConfig: () => ({ songs: [] }),
  },
  {
    // プラスマイナスカウンター(同接カウンターの汎用化)。手動±操作は他企画から独立するが、
    // ルール(rules)を登録すると特定ギフトの記録に応じてcountを自動増減できる。
    key: 'counter',
    type: 'counter',
    name: 'カウンター',
    oldNames: ['同接カウンター'],
    buildConfig: () => ({ count: 0, rules: [] }),
  },
];

// v5より前は1 segmentが複数パネル(items配列)を持てた。1件目は元のsegmentを引き継ぎ、
// 2件目以降は新規segment(key:null、日付ベースの非既定インスタンス扱い)として分割する。
// 分割したconditionに紐づくgiftLogsのsegmentIdも、分割先の新segmentへ付け替える
// (conditionId自体は保持されるため達成判定は影響を受けないが、「対象segmentのログ一覧」
// 表示がsegmentIdでの絞り込みのため、ここを合わせないと分割後にログが元segment側に残ってしまう)。
function migratePanelOpenItems(state) {
  const toAdd = [];
  const giftLogs = state.giftLogs ?? [];
  for (const seg of state.segments) {
    if (seg.type !== 'panelOpen' || !seg.config || !Array.isArray(seg.config.items)) continue;
    const items = seg.config.items;
    if (items.length === 0) {
      seg.config = { imageUrl: '', conditions: [] };
      continue;
    }
    const [first, ...rest] = items;
    seg.name = first.name || seg.name;
    seg.config = { imageUrl: first.imageUrl || '', conditions: first.conditions || [] };

    for (const item of rest) {
      const newSegment = {
        id: genId('segment'),
        eventId: seg.eventId,
        type: 'panelOpen',
        key: null,
        name: item.name,
        order: state.segments.length + toAdd.length,
        date: null,
        config: { imageUrl: item.imageUrl || '', conditions: item.conditions || [] },
      };
      const conditionIds = new Set((item.conditions || []).map((c) => c.id));
      for (const log of giftLogs) {
        if (log.segmentId === seg.id && conditionIds.has(log.conditionId)) {
          log.segmentId = newSegment.id;
        }
      }
      toAdd.push(newSegment);
    }
  }
  state.segments.push(...toAdd);
}

// v4より前に作られたmaidCorner/role segmentのtypeを'shopGacha'にリネームし、
// 対応するkeyを補完する。それ以外の型は旧typeがそのままkeyになる。
const LEGACY_KEY_BY_TYPE = { panelOpen: 'panelOpen', shiraPai: 'shiraPai' };
function migrateLegacySegments(state) {
  migratePanelOpenItems(state);

  for (const seg of state.segments) {
    if (seg.date === undefined) seg.date = null; // v3: 未スケジュール補完

    if (seg.type === 'maidCorner' || seg.type === 'role') {
      seg.key = seg.key ?? seg.type;
      seg.type = 'shopGacha';
    } else if (seg.type === 'loveCate') {
      seg.key = seg.key ?? 'categoryEndurance';
      seg.type = 'categoryEndurance';
    } else if (seg.type === 'viewerCounter') {
      seg.key = seg.key === 'viewerCounter' ? 'counter' : seg.key;
      seg.type = 'counter';
    } else if (seg.key === undefined) {
      // 既に移行済み、または日付ベースでユーザーが追加した非既定segmentはnullのまま
      seg.key = LEGACY_KEY_BY_TYPE[seg.type] ?? null;
    }

    if (seg.type === 'shopGacha' && seg.config) {
      seg.config.shopItems = seg.config.shopItems ?? [];
      seg.config.shopLog = seg.config.shopLog ?? [];
      seg.config.gacha = seg.config.gacha ?? { prizes: [] };
      seg.config.gacha.rateTiers = seg.config.gacha.rateTiers ?? [];
      seg.config.gachaLog = seg.config.gachaLog ?? [];
      seg.config.freeDrawGrants = seg.config.freeDrawGrants ?? [];
      // 6.7: 配信ポスト特典(streamPostDoneのユーザーに無料ガチャ1回を自動付与)を
      // 二重付与しないための既付与ユーザーID一覧。
      seg.config.streamPostGrantedUserIds = seg.config.streamPostGrantedUserIds ?? [];
      // 選択式モード(drawMode)・チケット購入(gachaTicketPurchases)はselectモード廃止に伴い廃止。
      // 既存の抽選履歴(gachaLog)自体は監査ログとして残すため削除しない。
      delete seg.config.gacha.drawMode;
      delete seg.config.gachaTicketPurchases;
    }

    if (seg.type === 'categoryEndurance' && seg.config) {
      seg.config.category = seg.config.category ?? 'LOVE';
      seg.config.giftCounts = seg.config.giftCounts ?? seg.config.loveGiftCounts ?? [];
      delete seg.config.loveGiftCounts;
    }

    if (seg.type === 'setlist' && seg.config) {
      seg.config.songs = seg.config.songs ?? [];
    }

    if (seg.type === 'counter' && seg.config) {
      seg.config.count = seg.config.count ?? 0;
      seg.config.rules = seg.config.rules ?? [];
    }
  }
}

// 既存データに残る企画segmentの形状を最新スキーマへ後方互換パッチする。「イベントには
// 既定で8種類の企画が必ず紐づく」という既定企画の概念は廃止したため、存在しないsegmentを
// ここで新規作成することはしない(企画はダッシュボードの「＋企画を割り当て」でユーザーが
// 都度追加する)。あくまで既に存在するsegmentの名前・日付・フィールド形状を補正するだけ。
// eventId省略時は先頭イベント(従来の単一イベント運用と同じ挙動)。複数イベント運用では
// initState()が全イベント分をループして明示的なeventId付きで呼び出す。
export function migrateSegments(state, eventId = state.events[0]?.id) {
  migrateLegacySegments(state);

  if (!eventId) return;
  state.activeEventId = state.activeEventId ?? eventId;

  const event = state.events.find((e) => e.id === eventId);
  const defaultDate = event?.periodStart || null;

  // 既に存在する旧デフォルト枠(key有り)だけを対象に、名前・日付の後方互換パッチを行う。
  // 存在しないkeyについては何もしない(新規作成しない)。
  for (const def of SEGMENT_TYPE_DEFS) {
    const existing = state.segments.find((s) => s.key === def.key && s.eventId === eventId);
    if (!existing) continue;
    // 旧デフォルト名のまま(=ユーザーが独自に改名していない)場合のみ、新しいデフォルト名に追従させる
    if (def.oldNames.includes(existing.name)) existing.name = def.name;
    // 「未スケジュールの企画」欄の廃止前に作られた既定企画(date: null)は、そのままだと
    // カレンダー上に現れずアクセス手段を失うため、後方互換としてここで日付を補完する。
    // ユーザーが既に日付を設定済み(date !== null)の場合は上書きしない。
    if (existing.date === null && defaultDate) existing.date = defaultDate;
  }

  const shiraPai = state.segments.find((s) => s.type === 'shiraPai' && s.eventId === eventId);
  if (shiraPai) shiraPai.config.history = shiraPai.config.history ?? [];
}

// 日付ベースで新規の企画インスタンスを作成する(ダッシュボードの「＋企画を割り当て」から使う)。
// 既定企画の概念は廃止したため、keyは常にnull。typeごとの初期config形状はSEGMENT_TYPE_DEFSの
// buildConfigをそのまま流用する。
export function createSegmentInstance(state, {
  eventId, type, name, date = null,
}) {
  const def = SEGMENT_TYPE_DEFS.find((d) => d.type === type);
  if (!def) throw new Error(`未対応の企画タイプ: ${type}`);
  const segment = {
    id: genId('segment'),
    eventId,
    type,
    key: null,
    name,
    order: state.segments.length,
    date,
    config: def.buildConfig(),
  };
  state.segments.push(segment);
  return segment;
}

// 現在操作対象のイベントID。未設定時は先頭イベントにフォールバックする。
export function getActiveEventId(state) {
  return state.activeEventId ?? state.events[0]?.id ?? null;
}

export function getActiveEvent(state) {
  const id = getActiveEventId(state);
  return state.events.find((e) => e.id === id) ?? null;
}

export function setActiveEvent(state, eventId) {
  if (!state.events.some((e) => e.id === eventId)) return;
  state.activeEventId = eventId;
}

// 新規イベントを作成する。企画segmentは何も紐づけない(既定企画の概念は廃止したため、
// ユーザーがダッシュボードの「＋企画を割り当て」で必要な企画だけを都度追加する)。
export function createEvent(state, {
  name, periodStart, periodEnd, memo = '',
}) {
  const event = {
    id: genId('event'), name, periodStart, periodEnd, memo,
  };
  state.events.push(event);
  state.activeEventId = event.id;
  return event;
}

let cachedState = null;

export async function initState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    cachedState = JSON.parse(raw);
    // イベントごとに補完する(eventId省略だと先頭イベントにしか後方互換パッチが効かないため)
    for (const event of cachedState.events ?? []) {
      migrateSegments(cachedState, event.id);
    }
    saveState(cachedState);
    return cachedState;
  }
  cachedState = await buildInitialState();
  saveState(cachedState);
  return cachedState;
}

export function getState() {
  if (!cachedState) {
    throw new Error('initState() を先に呼び出すこと');
  }
  return cachedState;
}

export function saveState(state = cachedState) {
  cachedState = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportStateAsFile(state = cachedState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  a.href = url;
  a.download = `iriam-event-tool_${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

const REQUIRED_ARRAY_FIELDS = ['events', 'segments', 'giftMaster', 'giftLogs', 'users'];

export function isValidStateShape(obj) {
  return !!obj && typeof obj === 'object' && REQUIRED_ARRAY_FIELDS.every((key) => Array.isArray(obj[key]));
}

export function importStateFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!isValidStateShape(parsed)) {
          reject(new Error('ファイルの形式が本ツールのエクスポートデータと一致しません'));
          return;
        }
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
