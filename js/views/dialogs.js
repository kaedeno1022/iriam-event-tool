import { el, clear } from '../render.js';

// web標準のalert/confirm/promptは同期処理でブロッキングするため、SP実機での見た目・操作感が
// ブラウザ依存になりやすく、スタイルも当てられない。ここではdialog-root上に描画する独自ダイアログを
// Promiseベースで提供し、既存のalert/confirm/promptと同じ呼び出し感覚(戻り値の意味も含めて)で
// 使えるようにする。
// giftRecordModal.js等の既存の独自モーダルが使うmodal-rootとは別のDOMルート(dialog-root)を使う。
// conditionModal等、modal-root上に開いた自前モーダルの内部からshowAlert/showConfirm/showPromptを
// 呼ぶケースがあり、同じrootを共有すると「確認ダイアログを開いたら背後のモーダル自体が消える」
// 事故になるため(clear()が両者を巻き込んでしまう)、意図的にルートを分離している。
const modalRoot = () => document.getElementById('dialog-root');

// overlayCloseValueは背景タップで閉じた時の解決値(window標準ダイアログでの「何もしない」相当の
// 値。confirm/promptでは「キャンセル」と同じ意味を持たせる必要があるため、alert以外はfalse/null)。
function openDialog(render, overlayCloseValue) {
  return new Promise((resolve) => {
    const root = modalRoot();
    clear(root);

    function close(value) {
      clear(root);
      resolve(value);
    }

    const box = render(close);
    // input内のテキストをマウスドラッグで選択した際、選択終了(mouseup)がoverlay側に
    // ずれてclickのtargetがoverlayになることがある。mousedownの開始位置も併せて見て、
    // 「overlay自体をクリックした」場合のみ閉じるようにする(テキスト選択中の誤クローズ対策)。
    let mouseDownOnOverlay = false;
    root.append(el('div', {
      class: 'modal-overlay',
      onmousedown: (e) => { mouseDownOnOverlay = e.target === e.currentTarget; },
      onclick: (e) => { if (mouseDownOnOverlay && e.target === e.currentTarget) close(overlayCloseValue); },
    }, [box]));
  });
}

// window.alert()の代替。戻り値はwindow.alert()同様undefined。
export function showAlert(message) {
  return openDialog((close) => {
    const okBtn = el('button', { type: 'button', class: 'btn-primary', onclick: () => close(undefined) }, 'OK');
    return el('div', { class: 'modal-box dialog-box' }, [
      el('p', { class: 'dialog-message' }, message),
      el('div', { class: 'modal-actions' }, [okBtn]),
    ]);
  }, undefined);
}

// window.confirm()の代替。OK→true、キャンセル(背景タップ含む)→falseで解決する。
export function showConfirm(message) {
  return openDialog((close) => {
    const cancelBtn = el('button', { type: 'button', class: 'btn-secondary', onclick: () => close(false) }, 'キャンセル');
    const okBtn = el('button', { type: 'button', class: 'btn-primary', onclick: () => close(true) }, 'OK');
    return el('div', { class: 'modal-box dialog-box' }, [
      el('p', { class: 'dialog-message' }, message),
      el('div', { class: 'modal-actions' }, [cancelBtn, okBtn]),
    ]);
  }, false);
}

// 選択式のprompt。optionsは[{ value, label }]。OK→選択されたvalue、キャンセル(背景タップ含む)→nullで解決する。
export function showSelect(message, options) {
  return openDialog((close) => {
    const select = el('select', {}, options.map((opt) => el('option', { value: opt.value }, opt.label)));
    const cancelBtn = el('button', { type: 'button', class: 'btn-secondary', onclick: () => close(null) }, 'キャンセル');
    const okBtn = el('button', { type: 'button', class: 'btn-primary', onclick: () => close(select.value) }, 'OK');
    return el('div', { class: 'modal-box dialog-box' }, [
      el('p', { class: 'dialog-message' }, message),
      el('div', { class: 'form-row' }, [select]),
      el('div', { class: 'modal-actions' }, [cancelBtn, okBtn]),
    ]);
  }, null);
}

// window.prompt()の代替。OK→入力文字列、キャンセル(背景タップ含む)→nullで解決する
// (window.prompt()と同じ契約なので、呼び出し側のNumber()変換等はそのまま使い回せる)。
export function showPrompt(message, defaultValue = '') {
  return openDialog((close) => {
    const input = el('input', {
      type: 'text',
      value: defaultValue,
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); close(input.value); } },
    });
    const cancelBtn = el('button', { type: 'button', class: 'btn-secondary', onclick: () => close(null) }, 'キャンセル');
    const okBtn = el('button', { type: 'button', class: 'btn-primary', onclick: () => close(input.value) }, 'OK');
    const box = el('div', { class: 'modal-box dialog-box' }, [
      el('p', { class: 'dialog-message' }, message),
      el('div', { class: 'form-row' }, [input]),
      el('div', { class: 'modal-actions' }, [cancelBtn, okBtn]),
    ]);
    queueMicrotask(() => { input.focus(); input.select(); });
    return box;
  }, null);
}
