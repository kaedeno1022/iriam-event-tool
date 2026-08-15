import { el, clear } from '../render.js';
import { genId } from '../id.js';
import { touchGiftUsage } from '../giftMaster.js';
import { createGiftPicker } from './giftPicker.js';
import { showAlert } from './dialogs.js';
import { isUserTrackingEnabled } from '../storage.js';

const modalRoot = () => document.getElementById('modal-root');

export function openGiftRecordModal({
  state, segmentId, conditionId = null, lockGiftId = null, initialUserId = '', save, onSaved,
}) {
  const root = modalRoot();
  // ユーザーを記録するかは記録先の企画の設定に従うため、呼び出し側から渡させずここで引く。
  // segmentが見つからない場合は従来どおり記録あり(安全側)にする。
  const segment = state.segments.find((s) => s.id === segmentId);
  const trackUsers = segment ? isUserTrackingEnabled(segment) : true;
  let mode = 'gift'; // 'gift' | 'points'
  let selectedGiftId = lockGiftId; // lockGiftId時のみ使う単一選択
  let qty = 1; // lockGiftId時・ポイント直接入力時のみ使う個数
  let cart = []; // ロックなしのギフト選択時のみ使う複数選択カート: [{ giftId, qty }]
  let newUserName = '';
  let newUserFormOpen = false; // 既存ユーザーの選択が大半を占めるため、既定では畳んでおく
  let selectedUserId = initialUserId;
  let giftPicker = null;
  // カート関連のDOM要素は一度だけ生成して使い回す。カートの増減はこれらの中身だけを
  // 差し替え、モーダル全体(root)には触れない。モーダル全体を作り直すとギフト一覧の
  // スクロール位置が失われる(実ブラウザでは、DOMツリーから一時的にでも切り離すと
  // スクロール位置が保持されない)ため、この使い回しが重要。
  let cartContainer = null;
  let saveBtn = null;

  const isCartMode = !lockGiftId; // ロックなしのギフト選択はカート方式(複数種類をまとめて記録)

  function close() {
    clear(root);
  }

  function addToCart(giftId) {
    const entry = cart.find((c) => c.giftId === giftId);
    if (entry) {
      entry.qty += 1;
    } else {
      cart.push({ giftId, qty: 1 });
    }
  }

  function updateSaveLabel() {
    if (!saveBtn) return;
    saveBtn.textContent = isCartMode && mode === 'gift' ? `記録する(${cart.length}件)` : '記録する';
  }

  // cartContainerの中身だけを現在のcart配列から作り直す(cartContainer自体・その外側は一切触らない)
  function renderCartRows() {
    if (!cartContainer) return;
    clear(cartContainer);
    let total = 0;
    const rows = cart.map((entry, idx) => {
      const gift = state.giftMaster.find((g) => g.id === entry.giftId);
      const unitPoints = gift?.points ?? 0;
      const subtotal = unitPoints * entry.qty;
      total += subtotal;
      const nameLabel = gift ? `${gift.name} (${gift.points != null ? `${gift.points}pt` : 'pt不明'})` : '(削除済みギフト)';
      return el('div', { class: 'cart-row' }, [
        el('span', { class: 'cart-row-name' }, nameLabel),
        el('button', {
          type: 'button', class: 'btn-round', title: '個数を減らす', 'aria-label': '個数を減らす', onclick: () => { entry.qty = Math.max(1, entry.qty - 1); refreshCart(); },
        }, '－'),
        el('input', {
          type: 'number',
          min: '1',
          value: String(entry.qty),
          class: 'cart-row-qty',
          'aria-label': `${nameLabel}の個数`,
          // 1文字打つたびに全行を作り直すとキャレット位置が飛ぶため、確定(blur/Enter)時にだけ反映する
          onchange: (e) => { entry.qty = Math.max(1, Number(e.target.value) || 1); refreshCart(); },
          onkeydown: (ev) => { if (ev.key === 'Enter') ev.target.blur(); },
        }),
        el('button', {
          type: 'button', class: 'btn-round', title: '個数を増やす', 'aria-label': '個数を増やす', onclick: () => { entry.qty += 1; refreshCart(); },
        }, '＋'),
        el('span', { class: 'cart-row-subtotal' }, `${subtotal}pt`),
        el('button', {
          type: 'button', class: 'btn-icon', title: '削除', 'aria-label': '削除', onclick: () => { cart.splice(idx, 1); refreshCart(); },
        }, '🗑'),
      ]);
    });
    const children = [
      el('p', { class: 'cart-hint' }, cart.length ? `選択中: ${cart.length}種類(タップでさらに追加できます)` : 'ギフトをタップして追加してください(複数選択可)'),
      ...rows,
    ];
    if (cart.length) children.push(el('p', { class: 'cart-total' }, `合計 ${total}pt`));
    cartContainer.append(...children);
  }

  function refreshCart() {
    renderCartRows();
    updateSaveLabel();
  }

  // モーダル内の操作(モード切替・ユーザー追加など)による全体再描画では<select>が作り直されるため、
  // 現在の選択値を退避してから再描画する(ユーザーを新規追加した直後だけは選択値を明示的に
  // 指定済みなので、この関数を使わずrender()を直接呼ぶ)
  function rerender() {
    const currentUserSelect = root.querySelector('#grm-user');
    if (currentUserSelect) selectedUserId = currentUserSelect.value;
    render();
  }

  function render() {
    // .modal-boxは独自スクロール(overflow-y:auto)を持つが、再描画のたびに新規DOM要素として
    // 作り直されるためスクロール位置が失われる。作り直す前に退避し、後で復元する
    const existingBox = root.querySelector('.modal-box');
    const savedScrollTop = existingBox ? existingBox.scrollTop : 0;

    clear(root);

    const userSelect = !trackUsers ? null : el('select', { id: 'grm-user' }, [
      el('option', { value: '', selected: selectedUserId === '' }, '選択してください'),
      ...state.users.map((u) => el('option', { value: u.id, selected: u.id === selectedUserId }, u.displayName)),
    ]);

    const newUserInput = el('input', {
      type: 'text',
      placeholder: '新規ユーザー名',
      value: newUserName,
      oninput: (e) => { newUserName = e.target.value; },
    });

    const addUserBtn = el('button', {
      type: 'button',
      class: 'btn-secondary',
      onclick: () => {
        const name = newUserName.trim();
        if (!name) return;
        const user = { id: genId('user'), displayName: name, memo: '', iconImage: '', streamPostDone: false };
        state.users.push(user);
        save(state);
        newUserName = '';
        newUserFormOpen = false;
        selectedUserId = user.id;
        render();
      },
    }, '追加');

    // 記録のたびに大半は既存ユーザーを選ぶだけなので、新規追加は畳んで優先度を下げる。
    // collapsibleSection共通部品は「〜を編集」固定文言でここには馴染まないため、専用の文言で組む。
    const newUserToggleBtn = el('button', {
      type: 'button',
      class: 'btn-secondary',
      onclick: () => { newUserFormOpen = !newUserFormOpen; render(); },
    }, newUserFormOpen ? '▲ 新規ユーザー追加を閉じる' : '＋ 新規ユーザーを追加');
    const newUserSection = el('div', { class: 'collapsible' }, [
      newUserToggleBtn,
      newUserFormOpen ? el('div', { class: 'form-row inline' }, [newUserInput, addUserBtn]) : null,
    ]);

    const modeToggle = lockGiftId ? null : el('div', { class: 'mode-toggle' }, [
      el('button', {
        type: 'button',
        class: mode === 'gift' ? 'btn-toggle active' : 'btn-toggle',
        onclick: () => { if (mode === 'gift') return; mode = 'gift'; rerender(); },
      }, 'ギフト選択'),
      el('button', {
        type: 'button',
        class: mode === 'points' ? 'btn-toggle active' : 'btn-toggle',
        onclick: () => { if (mode === 'points') return; mode = 'points'; rerender(); },
      }, 'ポイント直接入力'),
    ]);

    let pickerSection;
    if (lockGiftId) {
      const lockedGift = state.giftMaster.find((g) => g.id === lockGiftId);
      pickerSection = el('div', { class: 'locked-gift' }, [
        el('p', {}, `対象ギフト: ${lockedGift ? lockedGift.name : '(削除済みギフト)'}${lockedGift && lockedGift.points != null ? ` (${lockedGift.points}pt)` : ''}`),
      ]);
    } else if (mode === 'gift') {
      if (!giftPicker) {
        giftPicker = createGiftPicker({
          state,
          save,
          onChange: (giftId) => { addToCart(giftId); refreshCart(); },
        });
      }
      if (!cartContainer) {
        cartContainer = el('div', { class: 'gift-cart' });
      }
      renderCartRows();
      pickerSection = el('div', {}, [giftPicker.element, cartContainer]);
    } else {
      pickerSection = el('div', { class: 'points-input' }, [
        el('label', {}, 'ポイント数'),
        el('input', {
          type: 'number', min: '0', id: 'grm-points', value: '0',
        }),
      ]);
    }

    // カート方式の時は個々の行で個数を管理するため、共通の個数欄は表示しない
    let qtyRow = null;
    if (!(isCartMode && mode === 'gift')) {
      const qtyInput = el('input', { type: 'number', min: '1', value: String(qty), id: 'grm-qty', oninput: (e) => { qty = Math.max(1, Number(e.target.value) || 1); } });
      const qtyMinus = el('button', {
        type: 'button', class: 'btn-round', title: '個数を減らす', 'aria-label': '個数を減らす', onclick: () => { qty = Math.max(1, qty - 1); qtyInput.value = String(qty); },
      }, '－');
      const qtyPlus = el('button', {
        type: 'button', class: 'btn-round', title: '個数を増やす', 'aria-label': '個数を増やす', onclick: () => { qty += 1; qtyInput.value = String(qty); },
      }, '＋');
      qtyRow = el('div', { class: 'form-row inline' }, [el('label', {}, '個数'), qtyMinus, qtyInput, qtyPlus]);
    }

    saveBtn = el('button', {
      type: 'button',
      class: 'btn-primary',
      onclick: async () => {
        // ユーザーを記録しない企画では選択欄自体を描画していないため、DOMを読まずnullで確定する。
        const userId = trackUsers ? root.querySelector('#grm-user').value : null;
        if (trackUsers && !userId) { await showAlert('ユーザーを選択してください'); return; }

        if (isCartMode && mode === 'gift') {
          if (cart.length === 0) { await showAlert('ギフトを選択してください'); return; }
          for (const entry of cart) {
            if (!state.giftMaster.find((g) => g.id === entry.giftId)) {
              await showAlert('選択したギフトの一部がギフトマスタから削除されています。選び直してください。');
              return;
            }
          }
          const timestamp = new Date().toISOString();
          const addedLogs = [];
          for (const entry of cart) {
            const gift = state.giftMaster.find((g) => g.id === entry.giftId);
            const logEntry = {
              id: genId('giftlog'), timestamp, userId, giftId: gift.id, points: gift.points ?? 0, qty: entry.qty, segmentId, conditionId,
            };
            state.giftLogs.push(logEntry);
            addedLogs.push(logEntry);
            touchGiftUsage(state.giftMaster, gift.id);
          }
          save(state);
          close();
          onSaved(userId, addedLogs);
          return;
        }

        if (mode === 'gift' && !selectedGiftId) { await showAlert('ギフトを選択してください'); return; }

        let points;
        let giftId = null;
        if (mode === 'gift') {
          giftId = selectedGiftId;
          const gift = state.giftMaster.find((g) => g.id === giftId);
          if (!gift) { await showAlert('対象ギフトがギフトマスタから削除されています。条件を編集し直してください。'); return; }
          points = gift.points ?? 0;
          touchGiftUsage(state.giftMaster, giftId);
        } else {
          points = Math.max(0, Number(root.querySelector('#grm-points').value) || 0);
        }

        const logEntry = {
          id: genId('giftlog'),
          timestamp: new Date().toISOString(),
          userId,
          giftId,
          points,
          qty,
          segmentId,
          conditionId,
        };
        state.giftLogs.push(logEntry);
        save(state);
        close();
        onSaved(userId, [logEntry]);
      },
    }, '記録する');
    updateSaveLabel();

    const cancelBtn = el('button', { type: 'button', class: 'btn-secondary', onclick: close }, 'キャンセル');

    const box = el('div', { class: 'modal-box' }, [
      el('div', { class: 'modal-header' }, [
        el('h3', {}, 'ギフト記録'),
        el('button', { type: 'button', class: 'btn-close', title: '閉じる', 'aria-label': '閉じる', onclick: close }, '×'),
      ]),
      trackUsers ? el('div', { class: 'form-row' }, [el('label', {}, 'ユーザー'), userSelect]) : null,
      trackUsers ? newUserSection : null,
      trackUsers ? null : el('p', { class: 'empty-hint' }, 'この企画はユーザーを記録しない設定です。記録にユーザー名は残りません。'),
      modeToggle,
      pickerSection,
      qtyRow,
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
    box.scrollTop = savedScrollTop;
  }

  render();
}
