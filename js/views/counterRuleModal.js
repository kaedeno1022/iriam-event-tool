import { el, clear } from '../render.js';
import { genId } from '../id.js';
import { createGiftPicker } from './giftPicker.js';
import { showAlert } from './dialogs.js';

const modalRoot = () => document.getElementById('modal-root');

// カウンターのルール(特定ギフトが記録されるたびにcountをdelta増減する)を1件追加するだけの
// 軽量モーダル。conditionModal.jsと違い種類分岐(kind)や目標値は持たない単純な形なので専用化した。
export function openCounterRuleModal({ state, save, segment, onSaved }) {
  const root = modalRoot();
  let giftPicker = null;

  function close() {
    clear(root);
  }

  function render() {
    clear(root);

    if (!giftPicker) {
      giftPicker = createGiftPicker({ state, save });
    }

    const deltaInput = el('input', {
      type: 'number', id: 'rule-delta', value: '1', step: '1',
    });

    const saveBtn = el('button', {
      type: 'button',
      class: 'btn-primary',
      onclick: async () => {
        const giftId = giftPicker.getSelectedGiftId();
        if (!giftId) { await showAlert('対象ギフトを選択してください'); return; }
        const delta = Number(root.querySelector('#rule-delta').value);
        if (!Number.isInteger(delta) || delta === 0) { await showAlert('0以外の整数を増減値に入力してください'); return; }

        segment.config.rules.push({ id: genId('rule'), giftId, delta });
        save();
        close();
        onSaved();
      },
    }, '追加する');

    const cancelBtn = el('button', { type: 'button', class: 'btn-secondary', onclick: close }, 'キャンセル');

    const box = el('div', { class: 'modal-box' }, [
      el('div', { class: 'modal-header' }, [
        el('h3', {}, `「${segment.name}」にルールを追加`),
        el('button', { type: 'button', class: 'btn-close', title: '閉じる', 'aria-label': '閉じる', onclick: close }, '×'),
      ]),
      el('div', { class: 'form-row' }, [el('label', {}, '対象ギフト'), giftPicker.element]),
      el('div', { class: 'form-row' }, [el('label', {}, '増減値(マイナス可)'), deltaInput]),
      el('div', { class: 'modal-actions' }, [cancelBtn, saveBtn]),
    ]);

    let mouseDownOnOverlay = false;
    root.append(el('div', {
      class: 'modal-overlay',
      onmousedown: (e) => { mouseDownOnOverlay = e.target === e.currentTarget; },
      onclick: (e) => { if (mouseDownOnOverlay && e.target === e.currentTarget) close(); },
    }, [box]));
  }

  render();
}
