import { el, clear } from '../render.js';
import { genId } from '../id.js';
import { showAlert } from './dialogs.js';

const modalRoot = () => document.getElementById('modal-root');

// お買い物特典の追加/編集モーダル。itemを渡せば編集(現在値を初期値に)、nullなら新規作成。
// kindは呼び出し元が表示に使う名称(例: '特典')。
export function openStockItemModal({
  items, item = null, kind, save, onSaved,
}) {
  const root = modalRoot();
  const isEdit = item !== null;

  function close() {
    clear(root);
  }

  function render() {
    clear(root);

    const nameInput = el('input', {
      type: 'text', id: 'stockitem-name', value: item?.name ?? '',
    });
    const pointsInput = el('input', {
      type: 'number', id: 'stockitem-points', min: '0', value: item?.requiredPoints != null ? String(item.requiredPoints) : '',
    });
    const stockInput = el('input', {
      type: 'number', id: 'stockitem-stock', min: '0', value: item?.stock != null ? String(item.stock) : '',
    });
    const allowDuplicateInput = el('input', { type: 'checkbox', id: 'stockitem-allow-duplicate', checked: item?.allowDuplicate ?? false });

    const saveBtn = el('button', {
      type: 'button',
      class: 'btn-primary',
      onclick: async () => {
        const name = nameInput.value.trim();
        if (!name) { await showAlert(`${kind}名を入力してください`); return; }

        const pointsRaw = pointsInput.value.trim();
        const requiredPoints = pointsRaw === '' ? null : Number(pointsRaw);

        const stockRaw = stockInput.value.trim();
        const stock = stockRaw === '' ? null : Number(stockRaw);

        if (isEdit) {
          item.name = name;
          item.requiredPoints = requiredPoints;
          item.stock = stock;
          item.allowDuplicate = allowDuplicateInput.checked;
        } else {
          items.push({
            id: genId('shopitem'), name, requiredPoints, stock, allowDuplicate: allowDuplicateInput.checked,
          });
        }
        save();
        close();
        onSaved();
      },
    }, isEdit ? '保存する' : '追加する');

    const cancelBtn = el('button', { type: 'button', class: 'btn-secondary', onclick: close }, 'キャンセル');

    const box = el('div', { class: 'modal-box' }, [
      el('div', { class: 'modal-header' }, [
        el('h3', {}, isEdit ? `${kind}を編集` : `${kind}を追加`),
        el('button', { type: 'button', class: 'btn-close', onclick: close }, '×'),
      ]),
      el('div', { class: 'form-row' }, [el('label', {}, `${kind}名`), nameInput]),
      el('div', { class: 'form-row' }, [el('label', {}, '必要ポイント(空欄で不明)'), pointsInput]),
      el('div', { class: 'form-row' }, [el('label', {}, '在庫数(空欄で無制限)'), stockInput]),
      el('label', { class: 'checkbox-row' }, [allowDuplicateInput, '被りを許可する(複数回獲得できる)']),
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
