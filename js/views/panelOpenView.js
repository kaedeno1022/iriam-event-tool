import { el, formatDateTime } from '../render.js';
import { getActiveEventId } from '../storage.js';
import { openGiftRecordModal } from './giftRecordModal.js';
import { openConditionModal } from './conditionModal.js';
import { openNoteModal } from './noteModal.js';
import { showAlert, showConfirm, showPrompt } from './dialogs.js';
import { segmentNameHeader } from './segmentHeader.js';
import { userLabel } from './userLabel.js';

// 条件(condition)は「このパネル(1枚の画像)を開放するために満たすべき項目」。
// 1 segmentインスタンス = 1パネルという設計のため、達成判定はsegment単位でまとめて行う。
export function computeConditionProgress(state, condition) {
  if (condition.kind === 'manualCheck') {
    return { achieved: !!condition.achieved };
  }
  if (condition.kind === 'manualCounter') {
    const current = condition.current ?? 0;
    return { current, target: condition.target, achieved: current >= condition.target };
  }
  const logs = state.giftLogs.filter((l) => l.conditionId === condition.id);
  if (condition.kind === 'giftCount') {
    const current = logs
      .filter((l) => l.giftId === condition.giftId)
      .reduce((sum, l) => sum + l.qty, 0);
    return { current, target: condition.target, achieved: current >= condition.target };
  }
  // giftPoints: このconditionに記録されたギフト/ポイントの合計(種類は問わない)
  const current = logs.reduce((sum, l) => sum + l.points * l.qty, 0);
  return { current, target: condition.target, achieved: current >= condition.target };
}

export function computeSegmentProgress(state, segment) {
  // conditionsが欠けた不整合データでも落とさない。ここはダッシュボード(フォールバック先の
  // ルート)からも呼ばれるため、例外を投げるとツール全体へ到達する手段が無くなる。
  const conditions = (segment.config.conditions ?? []).map((c) => ({ ...c, ...computeConditionProgress(state, c) }));
  const achieved = conditions.length > 0 && conditions.every((c) => c.achieved);
  return { conditions, achieved };
}

// segmentId指定時はそのsegmentを直接表示する(ダッシュボードのカレンダーから日付ベースの
// 非既定インスタンスを開く場合)。未指定時は従来通りタブ用の既定枠(key==='panelOpen')を表示する。
function findPanelSegment(state, segmentId) {
  if (segmentId) return state.segments.find((s) => s.id === segmentId);
  return state.segments.find((s) => s.key === 'panelOpen' && s.eventId === getActiveEventId(state));
}

function conditionSummaryLabel(condition, state) {
  if (condition.kind === 'manualCheck') return '手動チェック';
  if (condition.kind === 'manualCounter') return '手動カウンター';
  if (condition.kind === 'giftCount') {
    const gift = state.giftMaster.find((g) => g.id === condition.giftId);
    return `ギフト個数(${gift ? gift.name : '(削除済みギフト)'})`;
  }
  return '累計pt';
}

function renderConditionRow({
  state, save, saveText = save, rerender, segment, condition,
}) {
  const progress = computeConditionProgress(state, condition);

  const deleteBtn = el('button', {
    type: 'button',
    class: 'btn-icon',
    title: '削除',
    onclick: async () => {
      if (!(await showConfirm(`条件「${condition.label}」を削除しますか？`))) return;
      segment.config.conditions = segment.config.conditions.filter((c) => c !== condition);
      save();
      rerender();
    },
  }, '🗑');

  if (condition.kind === 'manualCheck') {
    const notes = condition.notes ?? [];
    const noteRows = notes
      .slice()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .map((note) => el('li', {}, `${formatDateTime(note.timestamp)} ${note.value != null ? `${note.value} ` : ''}${note.memo}`));

    const addNoteBtn = el('button', {
      type: 'button',
      class: 'btn-secondary',
      onclick: () => openNoteModal({ condition, save, onSaved: rerender }),
    }, '記録');

    return el('div', { class: progress.achieved ? 'condition-row achieved' : 'condition-row' }, [
      el('div', { class: 'condition-row-body' }, [
        el('div', { class: 'condition-row-title' }, [
          el('label', { class: 'checkbox-row' }, [
            el('input', {
              type: 'checkbox',
              checked: !!condition.achieved,
              onchange: (e) => { condition.achieved = e.target.checked; save(); rerender(); },
            }),
            `${condition.label} (${conditionSummaryLabel(condition, state)})`,
          ]),
          progress.achieved ? el('span', { class: 'badge-done' }, '達成') : null,
        ]),
        notes.length ? el('ul', { class: 'note-list' }, noteRows) : null,
      ]),
      addNoteBtn,
      deleteBtn,
    ]);
  }

  if (condition.kind === 'manualCounter') {
    condition.current = condition.current ?? 0;
    const minusBtn = el('button', {
      type: 'button',
      class: 'btn-round',
      onclick: () => { condition.current = Math.max(0, condition.current - 1); save(); rerender(); },
    }, '－');
    const counterInput = el('input', {
      type: 'number',
      min: '0',
      value: String(condition.current),
      class: 'viewer-counter-input',
      // 入力中に毎回rerenderすると、複数桁を打つ途中でフォーカスが外れてしまう
      // (counterView.jsの直接入力欄と同じ理由でoninputはrerenderしない)。
      // 達成バッジ/progressの反映はonchange(blur時)に一本化する。このinputは<form>で
      // 囲んでいないためEnter単体ではblurせずchangeが発火しないので、onkeydownでは
      // rerender()を直接呼ばずblur()するだけに留める(focus中の要素をrerenderでDOMごと
      // 消すと、blur/changeが再入的に発火してrerenderが二重に走りうるため)。
      oninput: (e) => { condition.current = Math.max(0, Number(e.target.value) || 0); saveText(); },
      onchange: () => { rerender(); },
      onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
    });
    const plusBtn = el('button', {
      type: 'button',
      class: 'btn-round',
      onclick: () => { condition.current += 1; save(); rerender(); },
    }, '＋');

    return el('div', { class: progress.achieved ? 'condition-row achieved' : 'condition-row' }, [
      el('div', { class: 'condition-row-body' }, [
        el('div', { class: 'condition-row-title' }, [
          el('span', {}, `${condition.label} (${conditionSummaryLabel(condition, state)})`),
          progress.achieved ? el('span', { class: 'badge-done' }, '達成') : null,
        ]),
        el('div', {}, `${progress.current} / ${progress.target}`),
        el('progress', { value: String(progress.current), max: String(progress.target || 1) }),
        el('div', { class: 'form-row inline' }, [minusBtn, counterInput, plusBtn]),
      ]),
      deleteBtn,
    ]);
  }

  const recordBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: () => openGiftRecordModal({
      state,
      segmentId: segment.id,
      conditionId: condition.id,
      lockGiftId: condition.kind === 'giftCount' ? condition.giftId : null,
      save,
      onSaved: rerender,
    }),
  }, '記録');

  return el('div', { class: progress.achieved ? 'condition-row achieved' : 'condition-row' }, [
    el('div', { class: 'condition-row-body' }, [
      el('div', { class: 'condition-row-title' }, [
        el('span', {}, `${condition.label} (${conditionSummaryLabel(condition, state)})`),
        progress.achieved ? el('span', { class: 'badge-done' }, '達成') : null,
      ]),
      el('div', {}, `${progress.current} / ${progress.target}${condition.kind === 'giftCount' ? '個' : 'pt'}`),
      el('progress', { value: String(progress.current), max: String(progress.target || 1) }),
    ]),
    recordBtn,
    deleteBtn,
  ]);
}

export function renderPanelOpen({
  state, save, saveText = save, rerender, container, segmentId,
}) {
  const segment = findPanelSegment(state, segmentId);
  if (!segment) {
    container.append(el('p', {}, 'パネル開け企画が見つかりません。'));
    return;
  }
  segment.config.conditions = segment.config.conditions ?? [];

  const progress = computeSegmentProgress(state, segment);
  const conditionRows = segment.config.conditions.map((condition) => renderConditionRow({
    state, save, saveText, rerender, segment, condition,
  }));

  const imageUrlInput = el('input', {
    type: 'text',
    value: segment.config.imageUrl || '',
    placeholder: '画像URL(任意)',
    oninput: (e) => { segment.config.imageUrl = e.target.value; saveText(); },
  });

  const addConditionBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: () => openConditionModal({
      state, save, item: { name: segment.name, conditions: segment.config.conditions }, onSaved: rerender,
    }),
  }, '＋ 条件を追加');

  const panelCard = el('div', { class: progress.achieved ? 'card panel-item achieved' : 'card panel-item' }, [
    // 外部URLの画像は、インポートしたデータ由来だと閲覧者の情報が配信元へ渡る。
    // referrerpolicyでどのページを見ているかまでは渡さないようにしておく
    // (アクセス自体は画像表示に必要なため防げない。インポート時に件数を警告している)。
    segment.config.imageUrl
      ? el('img', {
        src: segment.config.imageUrl, class: 'panel-item-thumb', alt: segment.name, referrerpolicy: 'no-referrer',
      })
      : null,
    el('div', { class: 'panel-item-body' }, [
      el('div', { class: 'panel-item-title' }, [
        el('h3', {}, segment.name),
        progress.achieved ? el('span', { class: 'badge-done' }, '開放') : null,
      ]),
      el('div', { class: 'form-row' }, [el('label', {}, '画像URL'), imageUrlInput]),
      el('div', { class: 'condition-list' }, conditionRows.length ? conditionRows : [el('p', { class: 'empty-hint' }, '条件未設定')]),
      addConditionBtn,
    ]),
  ]);

  const logs = state.giftLogs
    .filter((l) => l.segmentId === segment.id)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20);

  const conditionLabelById = new Map();
  for (const c of segment.config.conditions) conditionLabelById.set(c.id, c.label);

  const logRows = logs.map((l) => {
    const gift = l.giftId ? state.giftMaster.find((g) => g.id === l.giftId) : null;
    return el('tr', {}, [
      el('td', {}, formatDateTime(l.timestamp)),
      el('td', {}, userLabel(state, l.userId)),
      el('td', {}, l.conditionId ? (conditionLabelById.get(l.conditionId) ?? '(削除済み条件)') : '-'),
      el('td', {}, gift ? gift.name : `直接入力 ${l.points}pt`),
      el('td', {}, `×${l.qty}`),
      el('td', {}, [
        el('button', {
          type: 'button',
          class: 'btn-icon',
          title: '個数を編集',
          onclick: async () => {
            const newQtyStr = await showPrompt('新しい個数を入力', String(l.qty));
            if (newQtyStr === null) return;
            const newQty = Number(newQtyStr);
            if (!Number.isInteger(newQty) || newQty <= 0) { await showAlert('1以上の整数を入力してください'); return; }
            l.qty = newQty;
            save();
            rerender();
          },
        }, '✎'),
        el('button', {
          type: 'button',
          class: 'btn-icon',
          title: '取り消し',
          onclick: async () => {
            if (!(await showConfirm('この記録を取り消しますか？'))) return;
            state.giftLogs = state.giftLogs.filter((x) => x !== l);
            save();
            rerender();
          },
        }, '↩'),
      ]),
    ]);
  });

  const logTable = el('table', { class: 'log-table' }, [
    el('thead', {}, el('tr', {}, [el('th', {}, '日時'), el('th', {}, 'ユーザー'), el('th', {}, '対象条件'), el('th', {}, 'ギフト'), el('th', {}, '個数'), el('th', {}, '')])),
    el('tbody', {}, logRows.length ? logRows : el('tr', {}, el('td', { colspan: '6' }, '記録なし'))),
  ]);

  container.append(el('section', { class: 'view-panel-open' }, [
    segmentNameHeader(segment, saveText),
    panelCard,
    el('h3', {}, '直近の記録'),
    logTable,
  ]));
}
