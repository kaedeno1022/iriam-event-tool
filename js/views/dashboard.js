import { el } from '../render.js';
import { getActiveEvent, createSegmentInstance } from '../storage.js';
import { computeSegmentProgress } from './panelOpenView.js';
import {
  showPrompt, showSelect, showConfirm,
} from './dialogs.js';

const TYPE_LABELS = {
  panelOpen: 'パネル明け',
  shiraPai: '罰ゲーム',
  shopGacha: '買い物 or ガチャ枠',
  categoryEndurance: 'カテゴリ耐久',
  setlist: 'ラスラン',
  viewerCounter: '同接カウンター',
};
// この6種はcreateSegmentInstance()で新規作成できる(いずれもSEGMENT_TYPE_DEFSにbuildConfigがある)。
const CREATABLE_TYPES = Object.keys(TYPE_LABELS);
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function segmentSummary(state, segment) {
  if (segment.type === 'panelOpen') {
    const progress = computeSegmentProgress(state, segment);
    const achievedCount = progress.conditions.filter((c) => c.achieved).length;
    return progress.achieved ? '開放済み' : `条件 ${achievedCount} / ${progress.conditions.length} 達成`;
  }
  if (segment.type === 'shiraPai') {
    const punishments = segment.config.punishments ?? [];
    const totalCount = punishments.reduce((sum, p) => sum + p.count, 0);
    return `罰ゲーム ${punishments.length}種類 / 累計実施 ${totalCount}回`;
  }
  if (segment.type === 'shopGacha') {
    const shopCount = segment.config.shopLog?.length ?? 0;
    const gachaCount = segment.config.gachaLog?.length ?? 0;
    return `交換 ${shopCount}件 / ガチャ ${gachaCount}件`;
  }
  if (segment.type === 'categoryEndurance') {
    const counts = segment.config.giftCounts ?? [];
    const givenTotal = counts.reduce((sum, c) => sum + c.given, 0);
    const remainingTotal = counts.reduce((sum, c) => sum + Math.max(0, c.initial - c.given), 0);
    return `[${segment.config.category ?? '?'}] 投げられた合計 ${givenTotal}件 / 残り合計 ${remainingTotal}`;
  }
  if (segment.type === 'setlist') {
    const songs = segment.config.songs ?? [];
    const doneCount = songs.filter((s) => s.done).length;
    return `済み ${doneCount} / 全${songs.length}曲`;
  }
  if (segment.type === 'viewerCounter') {
    return `同接 ${segment.config.count ?? 0}`;
  }
  return '(未対応の企画タイプ)';
}

// 既定企画の概念を廃止したため、カレンダー上のどの企画も「別日に動かす」「削除する」が
// 必要になった。カード全体を<a>にすると内側のinput/buttonと入れ子が壊れるため、リンクは
// 見出し部分だけにし、日付変更・削除は外側のdiv側の操作として並べる。
function segmentCard({
  state, save, rerender, segment, event,
}) {
  const link = el('a', { href: `#/segment/${segment.id}`, class: 'segment-card-link' }, [
    el('h4', {}, segment.name),
    el('p', { class: 'empty-hint' }, TYPE_LABELS[segment.type] ?? segment.type),
    el('p', {}, segmentSummary(state, segment)),
  ]);

  const dateInput = el('input', {
    type: 'date',
    value: segment.date || '',
    min: event.periodStart || undefined,
    max: event.periodEnd || undefined,
    onchange: (e) => {
      if (!e.target.value) return;
      segment.date = e.target.value;
      save();
      rerender();
    },
  });

  const deleteBtn = el('button', {
    type: 'button',
    class: 'btn-icon',
    title: '削除',
    onclick: async () => {
      if (!(await showConfirm(`「${segment.name}」を削除しますか？\n(記録済みのギフト記録等は削除されませんが、以後どの画面にも表示されなくなります)`))) return;
      state.segments = state.segments.filter((s) => s.id !== segment.id);
      save();
      rerender();
    },
  }, '🗑');

  return el('div', { class: 'segment-card' }, [
    link,
    el('div', { class: 'form-row inline' }, [el('label', {}, '日付'), dateInput, deleteBtn]),
  ]);
}

// periodStart〜periodEndのYYYY-MM-DD文字列一覧をローカル日付基準で列挙する。
// 誤入力(期間が長大・逆転)で固まらないよう366日を上限にする。
function dateRange(periodStart, periodEnd) {
  if (!periodStart || !periodEnd) return [];
  const [sy, sm, sd] = periodStart.split('-').map(Number);
  const [ey, em, ed] = periodEnd.split('-').map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const dates = [];
  let guard = 0;
  while (cursor <= end && guard < 366) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return dates;
}

function weekdayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()];
}

function promptSegmentType(dateLabel) {
  return showSelect(`${dateLabel}に割り当てる企画の種類を選択`, CREATABLE_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] })));
}

export function renderDashboard({
  state, save, rerender, container,
}) {
  const event = getActiveEvent(state);
  if (!event) {
    container.append(el('p', {}, 'イベントが登録されていません。ヘッダーの「＋ 新規イベント」から作成してください。'));
    return;
  }

  const eventForm = el('div', { class: 'card' }, [
    el('h2', {}, 'イベント情報'),
    el('div', { class: 'form-row' }, [
      el('label', {}, 'イベント名'),
      el('input', {
        type: 'text', value: event.name,
        oninput: (e) => { event.name = e.target.value; save(); },
      }),
    ]),
    el('div', { class: 'form-row inline' }, [
      el('label', {}, '期間'),
      el('input', {
        type: 'date', value: event.periodStart,
        oninput: (e) => { event.periodStart = e.target.value; save(); rerender(); },
      }),
      el('span', {}, '〜'),
      el('input', {
        type: 'date', value: event.periodEnd,
        oninput: (e) => { event.periodEnd = e.target.value; save(); rerender(); },
      }),
    ]),
    el('div', { class: 'form-row' }, [
      el('label', {}, 'メモ'),
      el('textarea', {
        oninput: (e) => { event.memo = e.target.value; save(); },
      }, event.memo || ''),
    ]),
  ]);

  const eventSegments = state.segments.filter((s) => s.eventId === event.id);

  const scheduledByDate = new Map();
  for (const segment of eventSegments) {
    if (!segment.date) continue;
    if (!scheduledByDate.has(segment.date)) scheduledByDate.set(segment.date, []);
    scheduledByDate.get(segment.date).push(segment);
  }

  const dates = dateRange(event.periodStart, event.periodEnd);

  async function assignNewSegment(dateStr) {
    const type = await promptSegmentType(dateStr);
    if (type === null) return; // キャンセル
    const name = await showPrompt('企画名を入力', TYPE_LABELS[type]);
    if (!name || !name.trim()) return;
    const segment = createSegmentInstance(state, {
      eventId: event.id, type, name: name.trim(), date: dateStr,
    });
    save();
    location.hash = `#/segment/${segment.id}`;
  }

  const dayCells = dates.map((dateStr) => {
    const segs = scheduledByDate.get(dateStr) ?? [];
    const addBtn = el('button', {
      type: 'button',
      class: 'btn-secondary',
      onclick: () => assignNewSegment(dateStr),
    }, '＋ 企画を割り当て');

    return el('div', { class: 'card calendar-day' }, [
      el('div', { class: 'calendar-day-header' }, [
        el('strong', {}, dateStr),
        el('span', { class: 'empty-hint' }, `(${weekdayLabel(dateStr)})`),
      ]),
      segs.length
        ? el('div', { class: 'calendar-day-segments' }, segs.map((segment) => segmentCard({
          state, save, rerender, segment, event,
        })))
        : el('p', { class: 'empty-hint' }, '設定なし'),
      addBtn,
    ]);
  });

  container.append(el('section', {}, [
    eventForm,
    el('h2', {}, '日程カレンダー'),
    dates.length
      ? el('div', { class: 'calendar-grid' }, dayCells)
      : el('p', { class: 'empty-hint' }, '上の「期間」を設定するとカレンダーが表示されます。'),
  ]));
}
