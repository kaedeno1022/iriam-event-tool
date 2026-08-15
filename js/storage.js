import { genId } from './id.js';

// v2: パネル開けのitem形状を{targetValue}から{conditions:[]}に変更(破壊的変更のためキーを分離し、
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
export const STORAGE_KEY = 'iriamEventTool:state:v2';
// インポート等の破壊的操作の直前に、直前のstateを退避しておくキー。読み込みは行わず、
// 「取り違えたファイルを取り込んでしまった」時にエラー画面から手動で復元するためだけに使う。
const BACKUP_KEY = 'iriamEventTool:backup:v2';
const SCHEMA_VERSION = 6;

// initState()が保存データを読めなかったことを表す。app.js側のエラー画面が、生の文字列(raw)を
// そのままファイルへ書き出して救出できるようにするため、読めなかった中身を保持する。
export class StateLoadError extends Error {
  constructor(message, { raw = null, cause = null } = {}) {
    super(message);
    this.name = 'StateLoadError';
    this.raw = raw;
    this.cause = cause;
  }
}

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

  // GitHub Pagesは存在しないパスに対して200ではなく404 + HTMLを返すため、res.okを見ずに
  // json()を呼ぶと「SyntaxErrorで初回起動が白画面」という原因の分かりにくい失敗になる。
  const res = await fetch('data/gifts.seed.json');
  if (!res.ok) {
    throw new StateLoadError(`ギフト初期データの取得に失敗しました(HTTP ${res.status})`);
  }
  let seedGifts;
  try {
    seedGifts = await res.json();
  } catch (err) {
    throw new StateLoadError('ギフト初期データの形式が不正です', { cause: err });
  }
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
    name: 'パネル開け',
    oldNames: ['パネル明け'],
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

// 確率表示化(2026年8月)より前のガチャ景品はweight(相対値)を持っていたが、
// probability(%、全景品合計100)へ移行した。weightのみでprobabilityを持たない景品だけを
// 変換対象にし、既にprobabilityを持つ景品(値)には触れない。変換対象には、既存probability景品が
// 既に確保している分を除いた残り予算を、重み比に応じてclampしながら配分する
// (clampはredistributeProbabilityと同じ理由: しないと丸め誤差で負値になりうる)。
function migrateGachaWeightToProbability(prizes) {
  if (!prizes || prizes.length === 0) return;
  const toMigrate = prizes.filter((p) => p.probability === undefined && p.weight !== undefined);
  if (toMigrate.length === 0) return;
  const alreadyAllocated = prizes.reduce(
    (sum, p) => sum + (p.probability !== undefined ? (Number(p.probability) || 0) : 0),
    0,
  );
  const remaining = Math.max(0, 100 - alreadyAllocated);
  const weights = toMigrate.map((p) => Math.max(0, Number(p.weight) || 0));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let allocated = 0;
  toMigrate.forEach((p, i) => {
    delete p.weight;
    if (i === toMigrate.length - 1) {
      p.probability = remaining - allocated;
      return;
    }
    const share = total > 0 ? weights[i] / total : 1 / toMigrate.length;
    const raw = Math.min(Math.max(Math.round(share * remaining), 0), remaining - allocated);
    p.probability = raw;
    allocated += raw;
  });
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
      migrateGachaWeightToProbability(seg.config.gacha.prizes);
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

    // 必須の配列が欠けたsegmentが1つでもあると、ダッシュボード(フォールバック先のルート)の
    // 集計が例外で落ち、ツール全体に到達できなくなる。読み込み時に形だけ整えておく。
    if (seg.type === 'panelOpen' && seg.config) {
      seg.config.conditions = seg.config.conditions ?? [];
    }
    if (seg.type === 'shiraPai' && seg.config) {
      seg.config.punishments = seg.config.punishments ?? [];
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

// 「誰が投げたか」を残す必要のない企画では、ギフト記録のたびにユーザーを選ぶ手間を省く。
// ただし次の2typeは切り替えの対象外(それぞれ理由が違う):
//   - shopGacha: ポイント残高の集計・特典の重複交換防止・ガチャの当選済み判定が全て
//                userIdに依存しており、ユーザー無しで記録すると残高が誰のものか決まらず
//                機能そのものが成立しない
//   - setlist:   ギフト記録の機能を持たない(曲の消化だけを扱う)ため、切り替えても
//                何も変わらない。押せるが無意味なトグルを出さない
const NO_USER_TOGGLE_TYPES = new Set(['shopGacha', 'setlist']);

export function canToggleUserTracking(segment) {
  return !NO_USER_TOGGLE_TYPES.has(segment.type);
}

// trackUsers未定義は「記録する」として扱う。この既定により、フラグ導入前に作られた
// 既存segmentへのスキーマ移行が不要になる。切り替え対象外のtypeは、インポート等で
// trackUsers:falseが混入していても「記録する」に倒して機能が壊れないようにする。
export function isUserTrackingEnabled(segment) {
  if (!canToggleUserTracking(segment)) return true;
  return segment.trackUsers ?? true;
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

// localStorage自体が使えない環境(ブラウザ設定でサイトデータをブロックしている等)では
// getItemも例外を投げうるため、読み出しも保護する。読めない場合は「保存データなし」扱いにし、
// 初期データで起動する(この後の書き込みが失敗した時はsaveStateがsetSaveErrorHandlerで登録したハンドラへ通知する)。
function readRawState() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function initState() {
  const raw = readRawState();
  if (raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new StateLoadError('保存データが壊れているため読み込めませんでした', { raw, cause: err });
    }
    if (!isValidStateShape(parsed)) {
      throw new StateLoadError('保存データの形式が不正なため読み込めませんでした', { raw });
    }
    cachedState = parsed;
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

// 保存失敗の通知先(app.jsが警告バナーを登録する)。
// 保存はほぼ全ての操作(ボタン・テキスト入力)から呼ばれる唯一の永続化経路なので、
// ここで例外を投げると各ハンドラで未捕捉になり、UI上は成功したように見えたまま
// データが失われる。失敗は握りつぶさず、必ず利用者に見える形で通知する。
let saveErrorHandler = null;
export function setSaveErrorHandler(handler) {
  saveErrorHandler = handler;
}

// 注意: 書き込みの成否に関わらずcachedStateは引数のstateを指す。保存に失敗したデータ
// (例: インポートを拒否した中身)がcachedStateに残るため、既定値に頼る引数なしの呼び出しを
// 新たに増やすと、拒否したはずのデータを掴む経路になりうる。
// 現状の呼び出し元は全て明示的にstateを渡している。
export function saveState(state = cachedState) {
  cachedState = state;
  // 遅延保存が予約されていれば、同じ内容を二重に書かないよう取り消す
  cancelScheduledSave();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (saveErrorHandler) saveErrorHandler(null);
    return true;
  } catch (err) {
    // バナーにはerr.nameしか出ないため、切り分け用に原因を残す
    // (容量超過以外に、循環参照によるJSON.stringify失敗なども同じ経路に来る)
    console.error('保存に失敗しました', err);
    if (saveErrorHandler) saveErrorHandler(err);
    return false;
  }
}

// --- 遅延保存(テキスト入力用) ---
// 1文字ごとにstate全体を直列化してlocalStorageへ書くと、ログが増えた時にSPで体感できる
// 入力遅延になる。タイマーはモジュールレベルに持たせ、画面の再描画で作り直されないようにする。
const TEXT_SAVE_DELAY_MS = 300;
let scheduledSaveTimer = null;

function cancelScheduledSave() {
  if (scheduledSaveTimer === null) return;
  clearTimeout(scheduledSaveTimer);
  scheduledSaveTimer = null;
}

// 連続入力中でも「最初の呼び出しから一定時間後に必ず1回保存する」方式にしている。
// 入力のたびにタイマーを延長する方式だと、長文を打ち続けている間ずっと未保存のままになり、
// その最中にタブを閉じられると入力が丸ごと失われるため。
export function scheduleSave(state = cachedState) {
  cachedState = state;
  if (scheduledSaveTimer !== null) return;
  scheduledSaveTimer = setTimeout(() => {
    scheduledSaveTimer = null;
    saveState(cachedState);
  }, TEXT_SAVE_DELAY_MS);
}

// 保留中の遅延保存を即座に実行する。ページ離脱時とテストで使う。
export function flushScheduledSave() {
  if (scheduledSaveTimer === null) return;
  cancelScheduledSave();
  saveState(cachedState);
}

// テキストをJSONファイルとしてダウンロードさせる。通常のエクスポートに加え、
// 壊れて読み込めなかった保存データをそのまま救出する用途(エラー画面)でも使うため、
// stateオブジェクトではなく文字列を受け取る形にしてある。
export function downloadJsonText(text, filenamePrefix = 'iriam-event-tool') {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  a.href = url;
  a.download = `${filenamePrefix}_${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportStateAsFile(state = cachedState) {
  downloadJsonText(JSON.stringify(state, null, 2));
}

// --- 破壊的操作前のバックアップ ---
// インポートは既存データを丸ごと置き換えるため、取り違えたファイルを取り込むと元に戻せない。
// 直前のstateを別キーへ退避し、エラー画面から復元できるようにする。退避自体が容量不足で
// 失敗しても本処理は続行させたいので、成否だけを返して例外は投げない。
export function backupCurrentState(state = cachedState) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function readBackupRaw() {
  try {
    return localStorage.getItem(BACKUP_KEY);
  } catch {
    return null;
  }
}

// バックアップの有無だけを調べる。getItemだとstate丸ごとの文字列(数百KB〜)を毎回受け取ることに
// なり、描画のたびに呼ぶダッシュボードでは無視できないコストになるため、キーの存在だけを見る。
export function hasBackup() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      if (localStorage.key(i) === BACKUP_KEY) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// エラー画面からの最終手段。保存データを消して初期状態から起動し直せるようにする
// (バックアップは残す。消してしまうと復元の最後の手段が無くなるため)。
export function clearStoredState() {
  // 保留中の遅延保存が後から発火すると、消したはずのデータが書き戻る
  cancelScheduledSave();
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

// バックアップはstate丸ごとのコピーで容量を常時圧迫するため、不要になったら消せるようにする。
export function clearBackupState() {
  try {
    localStorage.removeItem(BACKUP_KEY);
    return true;
  } catch {
    return false;
  }
}

const REQUIRED_ARRAY_FIELDS = ['events', 'segments', 'giftMaster', 'giftLogs', 'users'];

export function isValidStateShape(obj) {
  return !!obj && typeof obj === 'object' && REQUIRED_ARRAY_FIELDS.every((key) => Array.isArray(obj[key]));
}

// 画像URLとして受け入れるスキーム。javascript:はimgのsrcでは実行されないが、
// 受け取ったファイル由来の値をそのままDOMへ渡さないための最低限の線引きとして弾いておく。
// ブラウザはimgのsrcを解決する前に前後の空白・制御文字を除去するため、判定側も同じ前提に
// 揃える。揃えないと「 https://…」(先頭に空白)がスキーム無し=相対パスと誤判定され、
// サニタイズも外部件数の警告もすり抜けたまま実際には外部へリクエストが飛ぶ。
function normalizeUrl(url) {
  if (typeof url !== 'string') return '';
  // URLパーサはタブ・LF・CRを位置に関わらず除去し、前後の空白類・C0制御文字も無視する。
  // さらにhttp(s)などのspecial schemeではバックスラッシュをスラッシュと同一視するため、
  // 「/\\evil.example.com/x.png」は外部URLとして解決される。判定側も同じ前提に揃えないと、
  // サニタイズも外部件数の警告もすり抜けたまま実際には外部へリクエストが飛ぶ。
  // 戻り値は判定にしか使わず、保存する値は書き換えない。
  return url
    .replace(/[\t\n\r]/g, '')
    .replace(/^[\s\u0000-\u001F]+|[\s\u0000-\u001F]+$/g, '')
    .replace(/\\/g, '/');
}

function isAllowedImageUrl(url) {
  const u = normalizeUrl(url);
  if (u === '') return false;
  // 「//example.com/x.png」はスキーム無しに見えるが実際は外部を指すプロトコル相対URL。
  // 同一パス扱いで素通しすると、後段の外部判定からも漏れるため明示的に外部として扱う。
  if (u.startsWith('//')) return true;
  // 同一オリジンの絶対パス・相対パスはそのまま許可する(自分で入力した値の互換のため)
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) return true;
  return /^(https?|data):/i.test(u);
}

// 外部ホストを指す画像URLかどうか。プロトコル相対URLも外部として数える。
function isExternalImageUrl(url) {
  return /^(https?:)?\/\//i.test(normalizeUrl(url));
}

// 外部ホストを指す画像URLの件数。インポートしたデータの画像を表示すると、その時点で
// 閲覧者のIPアドレス等が相手のサーバに渡る。件数を確認ダイアログに出して判断材料にする。
export function countExternalImageUrls(state) {
  return (state.segments ?? []).filter((seg) => isExternalImageUrl(seg?.config?.imageUrl)).length;
}

// 受け取ったファイル由来のstateから、そのままDOMへ渡すと危険な値を落とす。
function sanitizeImportedState(state) {
  for (const seg of state.segments ?? []) {
    if (seg?.config?.imageUrl && !isAllowedImageUrl(seg.config.imageUrl)) {
      seg.config.imageUrl = '';
    }
  }
  return state;
}

export function importStateFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (err) {
        reject(new Error('JSONとして読み取れませんでした', { cause: err }));
        return;
      }
      if (!isValidStateShape(parsed)) {
        reject(new Error('ファイルの形式が本ツールのエクスポートデータと一致しません'));
        return;
      }
      // 未来のスキーマで書かれたファイルは、この版のマイグレーションでは正しく解釈できない
      // (知らないフィールドを落とす・誤変換する)ため取り込まない。古い版のファイルは
      // migrateSegmentsが後方互換パッチを当てるので受け入れる。
      const version = Number(parsed.schemaVersion);
      if (Number.isFinite(version) && version > SCHEMA_VERSION) {
        reject(new Error(`このファイルは新しい版(v${version})のツールで作られています。ツールを更新してから読み込んでください(現在: v${SCHEMA_VERSION})`));
        return;
      }
      resolve(sanitizeImportedState(parsed));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
