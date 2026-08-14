import { el, formatDateTime } from '../render.js';
import { getActiveEventId } from '../storage.js';
import { openGiftRecordModal } from './giftRecordModal.js';
import { openCounterRuleModal } from './counterRuleModal.js';
import { showAlert, showConfirm, showPrompt } from './dialogs.js';
import { segmentNameHeader } from './segmentHeader.js';
import { userLabel } from './userLabel.js';

// segmentId指定時はそのsegmentを直接表示する(ダッシュボードのカレンダーから日付ベースの
// 非既定インスタンスを開く場合)。未指定時は従来通りタブ用の既定枠(key==='counter')を表示する。
function findSegment(state, segmentId) {
  if (segmentId) return state.segments.find((s) => s.id === segmentId);
  return state.segments.find((s) => s.key === 'counter' && s.eventId === getActiveEventId(state));
}

// 手動操作(＋／－・直接入力・増減値の適用)の下限。「0以上から0未満へ落とす」場合だけ0で止める。
// ルール由来の増減で既に負になっている間は一切制限しない。
// 制限すると2つの問題が起きる:
//   - 0へ引き上げると、その後に元のログを取り消した時に増えた分が残り記録前の値に戻らない
//   - 現在値に据え置くと、負の領域では「適用」に正の値を入れても黙って捨てられ、
//     クランプしない「＋」ボタンと結果が食い違う(同じ+1が-4と-5に分かれる)
function clampCount(next, current) {
  if (current < 0) return next;
  return Math.max(0, next);
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
      segment.config.rules = segment.config.rules.filter((r) => r !== rule);
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
  state, save, saveText = save, rerender, container, segmentId,
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
    // ルール由来の増減で負になっている間はmin=0を外す(実値と入力欄の制約が食い違うため)
    min: segment.config.count < 0 ? undefined : '0',
    value: String(segment.config.count),
    class: 'viewer-counter-input',
    // input[type=number]は「-」だけ打った時点でvalueが空文字になる(value sanitization)。
    // 空文字を0として確定すると、負の値を打とうとした1文字目でcountが0に飛び、
    // 続く数字も0起点でクランプされてしまう。入力途中は何も確定しない。
    oninput: (e) => {
      if (e.target.value === '') return;
      const next = Number(e.target.value);
      if (!Number.isFinite(next)) return;
      segment.config.count = clampCount(next, segment.config.count);
      saveText();
    },
    // 入力中にrerenderするとフォーカスが外れて複数桁を打てないため、oninputでは再描画しない。
    // その結果、クランプされた値や確定しなかった入力途中の値が欄に残って実値とずれるので、
    // blur時(onchange)に表示を実値へ揃える。
    // ここでrerender()を呼ばないのは、この画面でcountを表示しているのがこの入力欄自身だけで、
    // 全体を作り直す必要が無いため。作り直すと、入力欄を編集した直後に隣の＋／－や「適用」を
    // タップした1回目が、mousedown→change→DOM差し替えでボタンごと消えて届かなくなる
    // (パネル開けの手動カウンターは達成バッジ・進捗バーがcurrentに依存するため再描画が要るが、
    // ここにはその依存が無い)。
    onchange: (e) => { e.target.value = String(segment.config.count); },
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
  });

  const minusBtn = el('button', {
    type: 'button',
    class: 'btn-round',
    onclick: () => { segment.config.count = clampCount(segment.config.count - 1, segment.config.count); save(); rerender(); },
  }, '－');

  const plusBtn = el('button', {
    type: 'button',
    class: 'btn-round',
    onclick: () => { segment.config.count += 1; save(); rerender(); },
  }, '＋');

  // IRIAM側のルーレット等、外部で決まった増減値をそのまま反映するための入力欄。
  // 絶対値をセットする既存のcountInputとは別に、相対値(増減量)を加減算する。
  const deltaInput = el('input', {
    type: 'number', step: '1', value: '0', class: 'viewer-counter-input counter-delta-input',
  });
  const applyDeltaBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: () => {
      const delta = Number(deltaInput.value);
      if (!Number.isInteger(delta) || delta === 0) return;
      segment.config.count = clampCount(segment.config.count + delta, segment.config.count);
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
        // ルール由来の増減は下限クランプしない(負の値も許容する)。クランプすると
        // 「実際には適用されなかった分」まで取り消し時に戻ってしまい、記録→取り消しで
        // カウントが増える(例: count=0でdelta=-3を記録→0のまま、取り消すと+3されて3になる)。
        // ログ単位で可逆であることを優先し、下限は手動操作(clampCount)だけに適用する。
        let totalDelta = 0;
        for (const l of addedLogs) {
          l.appliedDelta = perUnitDelta(segment, l.giftId);
          totalDelta += l.appliedDelta * l.qty;
        }
        segment.config.count += totalDelta;
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
    const gift = l.giftId ? state.giftMaster.find((g) => g.id === l.giftId) : null;
    const applied = l.appliedDelta ?? 0;
    const reflectedLabel = applied === 0 ? '-' : `${applied * l.qty > 0 ? '+' : ''}${applied * l.qty}`;

    return el('tr', {}, [
      el('td', {}, formatDateTime(l.timestamp)),
      el('td', {}, userLabel(state, l.userId)),
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
            // 記録時と同じ理由でクランプしない(記録・個数編集・取り消しの3経路で対称にする)
            segment.config.count += (l.appliedDelta ?? 0) * (newQty - l.qty);
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
            segment.config.count -= (l.appliedDelta ?? 0) * l.qty;
            state.giftLogs = state.giftLogs.filter((x) => x !== l);
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
    segmentNameHeader(segment, saveText),
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
