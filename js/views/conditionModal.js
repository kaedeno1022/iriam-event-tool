import { el, clear } from '../render.js';
import { genId } from '../id.js';
import { createGiftPicker } from './giftPicker.js';
import { showAlert } from './dialogs.js';

const modalRoot = () => document.getElementById('modal-root');

const KIND_LABELS = {
  giftPoints: '累計pt(ギフト種類問わず)',
  giftCount: '特定ギフトの個数',
  manualCheck: '手動チェック(スター・同接など)',
  manualCounter: '手動カウンター(同接など、目標付き)',
};

export function openConditionModal({ state, save, item, onSaved }) {
  const root = modalRoot();
  let kind = 'giftPoints';
  let label = '';
  let giftPicker = null;

  function close() {
    clear(root);
  }

  function render() {
    clear(root);

    const kindToggle = el('div', { class: 'mode-toggle' }, Object.entries(KIND_LABELS).map(([k, text]) => el('button', {
      type: 'button',
      class: k === kind ? 'btn-toggle active' : 'btn-toggle',
      onclick: () => { if (k === kind) return; kind = k; render(); },
    }, text)));

    const labelInput = el('input', {
      type: 'text',
      placeholder: '例: あふおも or 累計30,000pt / スター300,000 / 同接20人',
      value: label,
      oninput: (e) => { label = e.target.value; },
    });

    let extraFields = [];
    if (kind === 'giftPoints') {
      extraFields = [
        el('div', { class: 'form-row' }, [
          el('label', {}, '目標ポイント'),
          el('input', { type: 'number', min: '1', id: 'cond-target', value: '1000' }),
        ]),
      ];
    } else if (kind === 'giftCount') {
      if (!giftPicker) {
        giftPicker = createGiftPicker({ state, save });
      }
      extraFields = [
        el('div', { class: 'form-row' }, [el('label', {}, '対象ギフト'), giftPicker.element]),
        el('div', { class: 'form-row' }, [
          el('label', {}, '目標個数'),
          el('input', { type: 'number', min: '1', id: 'cond-target', value: '1' }),
        ]),
      ];
    } else if (kind === 'manualCounter') {
      extraFields = [
        el('p', { class: 'empty-hint' }, 'ギフト記録とは連動しません。パネル開け画面の＋/－ボタンで手動でカウントし、目標に達すると自動で達成扱いになります。'),
        el('div', { class: 'form-row' }, [
          el('label', {}, '目標値'),
          el('input', { type: 'number', min: '1', id: 'cond-target', value: '1' }),
        ]),
      ];
    } else {
      extraFields = [el('p', { class: 'empty-hint' }, '達成/未達成を手動でチェックするだけの条件です。目標値の入力は不要です。')];
    }

    const saveBtn = el('button', {
      type: 'button',
      class: 'btn-primary',
      onclick: async () => {
        const finalLabel = label.trim();
        if (!finalLabel) { await showAlert('条件名を入力してください'); return; }

        if (kind === 'manualCheck') {
          item.conditions.push({ id: genId('cond'), label: finalLabel, kind: 'manualCheck', achieved: false });
        } else if (kind === 'giftPoints') {
          const targetValue = Number(root.querySelector('#cond-target').value);
          if (!targetValue || targetValue <= 0) { await showAlert('正しい目標ポイントを入力してください'); return; }
          item.conditions.push({ id: genId('cond'), label: finalLabel, kind: 'giftPoints', target: targetValue });
        } else if (kind === 'manualCounter') {
          const targetValue = Number(root.querySelector('#cond-target').value);
          if (!targetValue || targetValue <= 0) { await showAlert('正しい目標値を入力してください'); return; }
          item.conditions.push({
            id: genId('cond'), label: finalLabel, kind: 'manualCounter', target: targetValue, current: 0,
          });
        } else {
          const giftId = giftPicker.getSelectedGiftId();
          if (!giftId) { await showAlert('対象ギフトを選択してください'); return; }
          const targetValue = Number(root.querySelector('#cond-target').value);
          if (!targetValue || targetValue <= 0) { await showAlert('正しい目標個数を入力してください'); return; }
          item.conditions.push({
            id: genId('cond'), label: finalLabel, kind: 'giftCount', giftId, target: targetValue,
          });
        }

        save();
        close();
        onSaved();
      },
    }, '追加する');

    const cancelBtn = el('button', { type: 'button', class: 'btn-secondary', onclick: close }, 'キャンセル');

    const box = el('div', { class: 'modal-box' }, [
      el('div', { class: 'modal-header' }, [
        el('h3', {}, `「${item.name}」に条件を追加`),
        el('button', { type: 'button', class: 'btn-close', onclick: close }, '×'),
      ]),
      el('div', { class: 'form-row' }, [el('label', {}, '条件の種類'), kindToggle]),
      el('div', { class: 'form-row' }, [el('label', {}, '条件名'), labelInput]),
      ...extraFields,
      el('div', { class: 'modal-actions' }, [cancelBtn, saveBtn]),
    ]);

    // input内のテキスト/数値をマウスドラッグで選択した際、選択終了(mouseup)がoverlay側に
    // ずれてclickのtargetがoverlayになることがある。mousedownの開始位置も併せて見て、
    // 「overlay自体をクリックした」場合のみ閉じるようにする(テキスト選択中の誤クローズ対策)。
    let mouseDownOnOverlay = false;
    root.append(el('div', {
      class: 'modal-overlay',
      onmousedown: (e) => { mouseDownOnOverlay = e.target === e.currentTarget; },
      onclick: (e) => { if (mouseDownOnOverlay && e.target === e.currentTarget) close(); },
    }, [box]));
  }

  render();
}
