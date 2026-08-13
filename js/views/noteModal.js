import { el, clear } from '../render.js';
import { genId } from '../id.js';
import { showAlert } from './dialogs.js';

const modalRoot = () => document.getElementById('modal-root');

// 手動チェック条件の「記録」(現在値+メモの履歴)を追加するモーダル。
export function openNoteModal({ condition, save, onSaved }) {
  const root = modalRoot();

  function close() {
    clear(root);
  }

  function render() {
    clear(root);

    const memoInput = el('textarea', { id: 'note-memo', placeholder: '例: 20:15時点で公式アプリ確認' });
    const valueInput = el('input', { type: 'number', id: 'note-value', placeholder: '不明なら空欄' });

    const saveBtn = el('button', {
      type: 'button',
      class: 'btn-primary',
      onclick: async () => {
        const memo = root.querySelector('#note-memo').value.trim();
        const valueStr = root.querySelector('#note-value').value;
        const parsedValue = Number(valueStr);
        const value = valueStr && valueStr.trim() !== '' && !Number.isNaN(parsedValue) ? parsedValue : null;

        if (!memo && value === null) { await showAlert('メモまたは現在値のいずれかを入力してください'); return; }

        condition.notes = condition.notes ?? [];
        condition.notes.push({ id: genId('note'), timestamp: new Date().toISOString(), value, memo });
        save();
        close();
        onSaved();
      },
    }, '記録する');

    const cancelBtn = el('button', { type: 'button', class: 'btn-secondary', onclick: close }, 'キャンセル');

    const box = el('div', { class: 'modal-box' }, [
      el('div', { class: 'modal-header' }, [
        el('h3', {}, `「${condition.label}」に記録を追加`),
        el('button', { type: 'button', class: 'btn-close', onclick: close }, '×'),
      ]),
      el('div', { class: 'form-row' }, [el('label', {}, '現在値(任意)'), valueInput]),
      el('div', { class: 'form-row' }, [el('label', {}, 'メモ'), memoInput]),
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
