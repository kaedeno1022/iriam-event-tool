import { el, clear } from '../render.js';
import { genId } from '../id.js';
import { redistributeProbability } from '../gacha.js';
import { showAlert } from './dialogs.js';

const modalRoot = () => document.getElementById('modal-root');

// ガチャ景品の追加/編集モーダル。prizeを渡せば編集(現在値を初期値に)、nullなら新規作成。
// initialValuesは「＋お買い物からコピー」時に名前/在庫/被り可否だけ初期値として流し込むための
// 補助引数(コピー元の特典には確率・確定枠が無いため、確率は未入力状態から、確定枠はなしから始める)。
// prizesは対象景品が属する配列そのもの。確率は全景品合計100%を保つ制約があるため、保存時に
// 自分以外(others)の確率をredistributeProbabilityで比例縮小/伸長してから自分の値を確定する。
export function openPrizeModal({
  prizes, prize = null, initialValues = null, save, onSaved,
}) {
  const root = modalRoot();
  const isEdit = prize !== null;
  const source = prize ?? initialValues ?? {};
  const others = isEdit ? prizes.filter((p) => p.id !== prize.id) : prizes;

  function close() {
    clear(root);
  }

  function render() {
    clear(root);

    const nameInput = el('input', {
      type: 'text', id: 'prize-name', value: source.name ?? '',
    });

    // 他に景品が無い(others.length===0)場合は選択の余地が無いため確率入力欄を無効化し、
    // 常に100%固定であることを示す。
    const probabilityInput = el('input', {
      type: 'number',
      id: 'prize-probability',
      min: '0',
      max: '100',
      value: String(source.probability ?? (others.length === 0 ? 100 : 10)),
      disabled: others.length === 0,
    });

    const stockInput = el('input', {
      type: 'number', id: 'prize-stock', min: '0', value: source.stock != null ? String(source.stock) : '',
    });
    const allowDuplicateInput = el('input', { type: 'checkbox', id: 'prize-allow-duplicate', checked: source.allowDuplicate ?? false });
    const guaranteedInput = el('input', {
      type: 'number', id: 'prize-guaranteed', min: '1', value: source.guaranteedPoints != null ? String(source.guaranteedPoints) : '',
    });

    const saveBtn = el('button', {
      type: 'button',
      class: 'btn-primary',
      onclick: async () => {
        const name = nameInput.value.trim();
        if (!name) { await showAlert('景品名を入力してください'); return; }

        const probability = others.length === 0 ? 100 : Number(probabilityInput.value);
        if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
          await showAlert('確率は0〜100の数値で入力してください');
          return;
        }

        const stockRaw = stockInput.value.trim();
        const stock = stockRaw === '' ? null : Number(stockRaw);

        const guaranteedRaw = guaranteedInput.value.trim();
        let guaranteedPoints = null;
        if (guaranteedRaw !== '') {
          guaranteedPoints = Number(guaranteedRaw);
          if (!Number.isFinite(guaranteedPoints) || guaranteedPoints <= 0) {
            await showAlert('確定枠の必要ptは正の数値で入力してください');
            return;
          }
        }

        redistributeProbability(others, 100 - probability);
        if (isEdit) {
          prize.name = name;
          prize.probability = probability;
          prize.stock = stock;
          prize.allowDuplicate = allowDuplicateInput.checked;
          prize.guaranteedPoints = guaranteedPoints;
        } else {
          prizes.push({
            id: genId('prize'), name, probability, stock, allowDuplicate: allowDuplicateInput.checked, guaranteedPoints,
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
        el('h3', {}, isEdit ? '景品を編集' : '景品を追加'),
        el('button', { type: 'button', class: 'btn-close', onclick: close }, '×'),
      ]),
      el('div', { class: 'form-row' }, [el('label', {}, '景品名'), nameInput]),
      el('div', { class: 'form-row' }, [
        el('label', {}, '確率(%)'),
        probabilityInput,
        others.length === 0 ? el('p', { class: 'empty-hint' }, '他に景品が無いため常に100%になります。') : null,
      ]),
      el('div', { class: 'form-row' }, [el('label', {}, '在庫数(空欄で無制限)'), stockInput]),
      el('label', { class: 'checkbox-row' }, [allowDuplicateInput, '被りを許可する(複数回当選できる)']),
      el('div', { class: 'form-row' }, [el('label', {}, '確定枠の必要pt(空欄なら確定枠なし)'), guaranteedInput]),
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
