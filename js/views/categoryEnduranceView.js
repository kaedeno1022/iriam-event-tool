import { el, formatDateTime } from '../render.js';
import { genId } from '../id.js';
import { addCustomGift, touchGiftUsage, listCategories } from '../giftMaster.js';
import { getActiveEventId } from '../storage.js';
import { openGiftRecordModal } from './giftRecordModal.js';
import { collapsibleSection } from './economyHelpers.js';
import { showConfirm, showPrompt } from './dialogs.js';
import { segmentNameHeader } from './segmentHeader.js';
import { userLabel } from './userLabel.js';

// segmentId指定時はそのsegmentを直接表示する(ダッシュボードのカレンダーから日付ベースの
// 非既定インスタンスを開く場合)。未指定時は従来通りタブ用の既定枠(key==='categoryEndurance')を表示する。
function findSegment(state, segmentId) {
  if (segmentId) return state.segments.find((s) => s.id === segmentId);
  return state.segments.find((s) => s.key === 'categoryEndurance' && s.eventId === getActiveEventId(state));
}

// --- モジュールレベルの画面状態 ---
// renderCategoryEnduranceはページ遷移や他画面での操作のたびに(app.jsのグローバルrerender経由で)
// 毎回ゼロから呼び直されるため、通常の関数内ローカル変数では「初期値一括設定の折りたたみ開閉」が
// 操作のたびにリセットされてしまう。segment.id(常に一意)ごとに保持することで、日付ベースで
// 複数のカテゴリ耐久インスタンスが存在する場合でも開閉状態が互いに混ざらないようにする。
const targetSettingsOpenBySegmentId = new Map();

// テスト専用。モジュールはテストファイル内で使い回されるため、テスト間で上記の状態が
// 漏れないようにリセットする(本番のページ読み込みでは呼ぶ必要はない)。
export function resetCategoryEnduranceUiState() {
  targetSettingsOpenBySegmentId.clear();
}

export function renderCategoryEndurance({
  state, save, saveText = save, rerender, container, segmentId,
}) {
  const segment = findSegment(state, segmentId);
  if (!segment) {
    container.append(el('p', {}, 'カテゴリ耐久が見つかりません。'));
    return;
  }
  segment.config.giftCounts = segment.config.giftCounts ?? [];
  segment.config.category = segment.config.category ?? 'LOVE';
  const targetSettingsOpen = targetSettingsOpenBySegmentId.get(segment.id) ?? false;

  // 対象カテゴリのギフトを「初期値(目標数)から投げられた分だけ減っていく」カウンターで管理する。
  // ユーザー単位の記録(誰が投げたか)は持たず、ギフトごとの初期値・投げられた累計数だけを直接保持する
  // (耐久企画は複数人からのギフトの累計進行そのものが本質のため、個人の記録は不要という判断)。
  function giftRecord(giftId) {
    return segment.config.giftCounts.find((r) => r.giftId === giftId);
  }

  function ensureGiftRecord(giftId) {
    let record = giftRecord(giftId);
    if (!record) {
      record = {
        id: genId('endgift'), giftId, initial: 0, given: 0,
      };
      segment.config.giftCounts.push(record);
    }
    return record;
  }

  function throwGift(gift) {
    ensureGiftRecord(gift.id).given += 1;
    touchGiftUsage(state.giftMaster, gift.id);
    save();
    rerender();
  }

  function undoThrow(giftId) {
    const record = giftRecord(giftId);
    if (!record) return;
    record.given = Math.max(0, record.given - 1);
    save();
    rerender();
  }

  // ギフト記録画面(ユーザー選択あり)経由で記録されたギフトのうち、対象カテゴリに一致する分だけ
  // 残数カウンター(giftCounts.given)にも反映する。イベント全体の合計ポイント集計(ユーザータブ)に
  // 反映させたいという要望から追加した経路で、匿名の「－」ボタンとは独立して併存する。
  function applyGiftLogsToCounts(addedLogs) {
    for (const log of addedLogs) {
      if (!log.giftId) continue;
      const gift = state.giftMaster.find((g) => g.id === log.giftId);
      if (!gift || gift.category !== segment.config.category) continue;
      ensureGiftRecord(gift.id).given += log.qty;
    }
  }

  // ギフトマスタに現在存在するカテゴリ一覧に加え、選択中カテゴリにまだ1件もギフトが
  // 登録されていなくても選択肢から消えないよう保証する。
  const categoriesFromMaster = listCategories(state.giftMaster);
  const categories = categoriesFromMaster.includes(segment.config.category)
    ? categoriesFromMaster
    : [segment.config.category, ...categoriesFromMaster];

  const categorySelect = el('select', {
    onchange: (e) => { segment.config.category = e.target.value; save(); rerender(); },
  }, categories.map((c) => el('option', { value: c, selected: c === segment.config.category }, c)));

  const targetGifts = state.giftMaster.filter((g) => g.category === segment.config.category);

  const bulkInitialInput = el('input', { type: 'number', min: '0', id: 'endurance-bulk-initial', value: '0' });
  const applyBulkBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: () => {
      const value = Math.max(0, Math.floor(Number(document.getElementById('endurance-bulk-initial').value)) || 0);
      for (const g of targetGifts) {
        ensureGiftRecord(g.id).initial = value;
      }
      save();
      rerender();
    },
  }, '一括適用');

  const addGiftBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: async () => {
      const name = await showPrompt(`${segment.config.category}カテゴリのギフト名を入力`);
      if (!name || !name.trim()) return;
      const pointsStr = await showPrompt('ポイント数を入力(不明なら空欄)');
      addCustomGift(state.giftMaster, { name: name.trim(), points: pointsStr, category: segment.config.category });
      save();
      rerender();
    },
  }, `＋ ${segment.config.category}ギフトを追加`);

  const recordGiftBtn = el('button', {
    type: 'button',
    class: 'btn-primary',
    onclick: () => openGiftRecordModal({
      state,
      segmentId: segment.id,
      save,
      onSaved: (userId, addedLogs) => {
        applyGiftLogsToCounts(addedLogs);
        save();
        rerender();
      },
    }),
  }, 'ギフトを記録する');

  const giftLogs = state.giftLogs
    .filter((l) => l.segmentId === segment.id)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20);
  const giftLogRows = giftLogs.map((l) => {
    const gift = l.giftId ? state.giftMaster.find((g) => g.id === l.giftId) : null;
    return el('tr', {}, [
      el('td', {}, formatDateTime(l.timestamp)),
      el('td', {}, userLabel(state, l.userId)),
      el('td', {}, gift ? gift.name : `直接入力 ${l.points}pt`),
      el('td', {}, `×${l.qty}`),
      el('td', {}, [
        el('button', {
          type: 'button',
          class: 'btn-icon',
          title: '取り消し',
          'aria-label': '取り消し',
          onclick: async () => {
            if (!(await showConfirm('この記録を取り消しますか？(対象カテゴリのギフトの場合、残数カウンターも戻します)'))) return;
            if (gift && gift.category === segment.config.category) {
              const record = giftRecord(gift.id);
              if (record) record.given = Math.max(0, record.given - l.qty);
            }
            state.giftLogs = state.giftLogs.filter((x) => x !== l);
            save();
            rerender();
          },
        }, '↩'),
      ]),
    ]);
  });
  const giftLogTable = el('table', { class: 'log-table' }, [
    el('thead', {}, el('tr', {}, [el('th', {}, '日時'), el('th', {}, 'ユーザー'), el('th', {}, 'ギフト'), el('th', {}, '個数'), el('th', {}, '')])),
    el('tbody', {}, giftLogRows.length ? giftLogRows : el('tr', {}, el('td', { colspan: '5' }, '記録なし'))),
  ]);

  const countRows = targetGifts.map((g) => {
    const record = giftRecord(g.id);
    const remaining = (record?.initial ?? 0) - (record?.given ?? 0);
    return el('div', { class: 'card list-row' }, [
      el('span', { class: 'list-row-name' }, `${g.name}${g.points != null ? ` (${g.points}pt)` : ''}`),
      el('button', {
        type: 'button', class: 'btn-round', title: '1件投げた記録を追加(残り-1)', 'aria-label': '1件投げた記録を追加(残り-1)', onclick: () => throwGift(g),
      }, '－'),
      el('span', { class: remaining < 0 ? 'points-negative list-row-count' : 'list-row-count' }, `残り${remaining}`),
      el('button', {
        type: 'button', class: 'btn-round', title: '記録を1件取り消す(残り+1)', 'aria-label': '記録を1件取り消す(残り+1)', onclick: () => undoThrow(g.id),
      }, '＋'),
    ]);
  });

  container.append(el('section', {}, [
    segmentNameHeader(segment, saveText),
    el('div', { class: 'card' }, [
      el('div', { class: 'form-row' }, [el('label', {}, '対象カテゴリ'), categorySelect]),
      collapsibleSection({
        title: '初期値の一括設定',
        isOpen: targetSettingsOpen,
        onToggle: () => { targetSettingsOpenBySegmentId.set(segment.id, !targetSettingsOpen); rerender(); },
        content: el('div', { class: 'form-row inline' }, [
          el('label', {}, '初期値'),
          bulkInitialInput,
          applyBulkBtn,
          el('p', { class: 'empty-hint' }, `現在の対象ギフト(${targetGifts.length}種)すべてにこの値を一括で設定します。`),
        ]),
      }),
      el('h3', {}, `${segment.config.category}ギフト記録`),
      el('p', { class: 'empty-hint' }, '投げられたら「－」で残数を減らします。「＋」は直前の記録の取り消しです。'),
      el('div', { class: 'list-row-group' }, countRows.length ? countRows : [el('p', { class: 'empty-hint' }, `${segment.config.category}カテゴリのギフトがギフトマスタに登録されていません`)]),
      addGiftBtn,
      el('h3', {}, 'ギフトを記録する(ユーザー別)'),
      el('p', { class: 'empty-hint' }, 'ユーザーを指定して記録すると、対象カテゴリのギフトは残数からも自動で減算され、ユーザーの合計ポイントにも反映されます。'),
      recordGiftBtn,
      el('h4', {}, '直近の記録'),
      giftLogTable,
    ]),
  ]));
}
