import { el, formatDateTime } from '../render.js';
import { getActiveEventId } from '../storage.js';
import { openGiftRecordModal } from './giftRecordModal.js';
import { openCounterRuleModal } from './counterRuleModal.js';
import { showAlert, showConfirm, showPrompt } from './dialogs.js';

// segmentId指定時はそのsegmentを直接表示する(ダッシュボードのカレンダーから日付ベースの
// 非既定インスタンスを開く場合)。未指定時は従来通りタブ用の既定枠(key==='counter')を表示する。
function findSegment(state, segmentId) {
  if (segmentId) return state.segments.find((s) => s.id === segmentId);
  return state.segments.find((s) => s.key === 'counter' && s.eventId === getActiveEventId(state));
}

function clampCount(n) {
  return Math.max(0, n);
}

// 記録されたgiftIdに一致するルールの増減値を合算する(1個あたりのdelta)。一致するルールが
// 無ければ0(単なる記録として残るだけで、countには影響しない)。同じギフトに複数ルールが
// 登録されていた場合は合算して両方適用する。
function perUnitDelta(segment, giftId) {
  return segment.config.rules
    .filter((r) => r.giftId === giftId)
    .reduce((sum, r) => sum + r.delta, 0);
}

function renderRuleRow({
  state, save, rerender, segment, rule,
}) {
  const gift = state.giftMaster.find((g) => g.id === rule.giftId);
  const deltaLabel = rule.delta > 0 ? `+${rule.delta}` : String(rule.delta);

  const deleteBtn = el('button', {
    type: 'button',
    class: 'btn-icon',
    title: '削除',
    onclick: async () => {
      if (!(await showConfirm(`ルール「${gift ? gift.name : '(削除済みギフト)'} ${deltaLabel}」を削除しますか？`))) return;
      segment.config.rules = segment.config.rules.filter((r) => r.id !== rule.id);
      save();
      rerender();
    },
  }, '🗑');

  return el('div', { class: 'condition-row' }, [
    el('div', { class: 'condition-row-body' }, [
      el('div', { class: 'condition-row-title' }, [
        el('span', {}, `${gift ? gift.name : '(削除済みギフト)'} → ${deltaLabel}`),
      ]),
    ]),
    deleteBtn,
  ]);
}

export function renderCounter({
  state, save, rerender, container, segmentId,
}) {
  const segment = findSegment(state, segmentId);
  if (!segment) {
    container.append(el('p', {}, 'カウンターが見つかりません。'));
    return;
  }
  segment.config.count = segment.config.count ?? 0;
  segment.config.rules = segment.config.rules ?? [];

  const countInput = el('input', {
    type: 'number',
    min: '0',
    value: String(segment.config.count),
    class: 'viewer-counter-input',
    oninput: (e) => { segment.config.count = clampCount(Number(e.target.value) || 0); save(); },
  });

  const minusBtn = el('button', {
    type: 'button',
    class: 'btn-round',
    onclick: () => { segment.config.count = clampCount(segment.config.count - 1); save(); rerender(); },
  }, '－');

  const plusBtn = el('button', {
    type: 'button',
    class: 'btn-round',
    onclick: () => { segment.config.count += 1; save(); rerender(); },
  }, '＋');

  // IRIAM側のルーレット等、外部で決まった増減値をそのまま反映するための入力欄。
  // 絶対値をセットする既存のcountInputとは別に、相対値(増減量)を加減算する。
  const deltaInput = el('input', {
    type: 'number', step: '1', value: '0', class: 'viewer-counter-input',
  });
  const applyDeltaBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: () => {
      const delta = Number(deltaInput.value);
      if (!Number.isInteger(delta) || delta === 0) return;
      segment.config.count = clampCount(segment.config.count + delta);
      deltaInput.value = '0';
      save();
      rerender();
    },
  }, '適用');

  const addRuleBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: () => openCounterRuleModal({
      state, save, segment, onSaved: rerender,
    }),
  }, '＋ ルールを追加');

  const ruleRows = segment.config.rules.map((rule) => renderRuleRow({
    state, save, rerender, segment, rule,
  }));

  // ギフトを選ぶだけの共通記録欄。特定ルールに紐づけない(ロックしない)ため、記録した
  // giftIdがルールに一致すれば自動でcountへ反映し、一致しなければ記録だけ残る。
  const recordBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: () => openGiftRecordModal({
      state,
      segmentId: segment.id,
      save,
      onSaved: (userId, addedLogs) => {
        // 1回の記録操作で符号違いの複数ギフトが同時に飛んでくる場合があるため、
        // ログ単位で都度クランプすると経路依存の結果になる。全ログの反映値を
        // 合算してから一度だけクランプする。
        let totalDelta = 0;
        for (const l of addedLogs) {
          l.appliedDelta = perUnitDelta(segment, l.giftId);
          totalDelta += l.appliedDelta * l.qty;
        }
        segment.config.count = clampCount(segment.config.count + totalDelta);
        save();
        rerender();
      },
    }),
  }, 'ギフトを記録');

  const logs = state.giftLogs
    .filter((l) => l.segmentId === segment.id)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20);

  const logRows = logs.map((l) => {
    const user = state.users.find((u) => u.id === l.userId);
    const gift = l.giftId ? state.giftMaster.find((g) => g.id === l.giftId) : null;
    const applied = l.appliedDelta ?? 0;
    const reflectedLabel = applied === 0 ? '-' : `${applied * l.qty > 0 ? '+' : ''}${applied * l.qty}`;

    return el('tr', {}, [
      el('td', {}, formatDateTime(l.timestamp)),
      el('td', {}, user ? user.displayName : '(削除済みユーザー)'),
      el('td', {}, gift ? gift.name : `直接入力 ${l.points}pt`),
      el('td', {}, `×${l.qty}`),
      el('td', {}, reflectedLabel),
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
            segment.config.count = clampCount(segment.config.count + (l.appliedDelta ?? 0) * (newQty - l.qty));
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
            segment.config.count = clampCount(segment.config.count - (l.appliedDelta ?? 0) * l.qty);
            state.giftLogs = state.giftLogs.filter((x) => x.id !== l.id);
            save();
            rerender();
          },
        }, '↩'),
      ]),
    ]);
  });

  const logTable = el('table', { class: 'log-table' }, [
    el('thead', {}, el('tr', {}, [el('th', {}, '日時'), el('th', {}, 'ユーザー'), el('th', {}, 'ギフト'), el('th', {}, '個数'), el('th', {}, 'カウントへの反映'), el('th', {}, '')])),
    el('tbody', {}, logRows.length ? logRows : el('tr', {}, el('td', { colspan: '6' }, '記録なし'))),
  ]);

  container.append(el('section', {}, [
    el('h2', {}, segment.name),
    el('div', { class: 'card' }, [
      el('p', { class: 'empty-hint' }, '＋／－で1ずつ増減、または数値を直接入力してください。'),
      el('div', { class: 'form-row inline' }, [minusBtn, countInput, plusBtn]),
      el('p', { class: 'empty-hint' }, '増減値を入力して「適用」を押すと、まとめて加減算できます(例: ルーレット結果の反映)。'),
      el('div', { class: 'form-row inline' }, [deltaInput, applyDeltaBtn]),
    ]),
    el('h3', {}, 'ギフト連動ルール'),
    el('p', { class: 'empty-hint' }, '「ギフトを記録」で記録したギフトが、ここに登録したギフトと一致すると自動でカウントへ反映されます。'),
    el('div', { class: 'condition-list' }, ruleRows.length ? ruleRows : [el('p', { class: 'empty-hint' }, 'ルール未設定')]),
    addRuleBtn,
    el('h3', {}, 'ギフトを記録'),
    recordBtn,
    el('h3', {}, '直近の記録'),
    logTable,
  ]));
}
