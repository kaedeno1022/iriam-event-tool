// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { showAlert, showConfirm, showPrompt } from '../js/views/dialogs.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="dialog-root"></div>';
});

function modalBox() {
  return document.querySelector('.modal-box');
}

// overlayの閉じる判定はmousedown+clickが共にoverlay自身で起きたかを見る(テキスト選択中の
// 誤クローズ対策のため)。.click()だけではmousedownが発生しないため、実際のタップを模して
// 両方のイベントを発火させる。
function tapOverlay() {
  const overlay = document.querySelector('.modal-overlay');
  overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  overlay.click();
}

describe('showAlert', () => {
  it('メッセージを表示し、OKクリックでundefinedのまま解決する', async () => {
    const resultPromise = showAlert('保存しました');
    expect(modalBox().textContent).toContain('保存しました');

    modalBox().querySelector('button').click();
    const result = await resultPromise;

    expect(result).toBeUndefined();
    expect(document.getElementById('dialog-root').children).toHaveLength(0); // 閉じている
  });

  it('背景(オーバーレイ)クリックでも閉じる', async () => {
    const resultPromise = showAlert('メッセージ');
    tapOverlay();
    await resultPromise;
    expect(document.getElementById('dialog-root').children).toHaveLength(0);
  });
});

describe('showConfirm', () => {
  it('OKクリックでtrueに解決する', async () => {
    const resultPromise = showConfirm('削除しますか？');
    const buttons = [...modalBox().querySelectorAll('button')];
    buttons.find((b) => b.textContent === 'OK').click();
    expect(await resultPromise).toBe(true);
  });

  it('キャンセルクリックでfalseに解決する', async () => {
    const resultPromise = showConfirm('削除しますか？');
    const buttons = [...modalBox().querySelectorAll('button')];
    buttons.find((b) => b.textContent === 'キャンセル').click();
    expect(await resultPromise).toBe(false);
  });

  it('背景クリックでfalseに解決する(誤操作での意図しない実行を防ぐ)', async () => {
    const resultPromise = showConfirm('削除しますか？');
    tapOverlay();
    expect(await resultPromise).toBe(false);
  });
});

describe('showPrompt', () => {
  it('デフォルト値が入力欄に反映される', () => {
    showPrompt('個数を入力', '3');
    expect(modalBox().querySelector('input').value).toBe('3');
  });

  it('OKクリックで入力欄の値に解決する', async () => {
    const resultPromise = showPrompt('個数を入力', '3');
    const input = modalBox().querySelector('input');
    input.value = '5';
    const buttons = [...modalBox().querySelectorAll('button')];
    buttons.find((b) => b.textContent === 'OK').click();
    expect(await resultPromise).toBe('5');
  });

  it('キャンセルクリックでnullに解決する(window.prompt()と同じ契約)', async () => {
    const resultPromise = showPrompt('個数を入力');
    const buttons = [...modalBox().querySelectorAll('button')];
    buttons.find((b) => b.textContent === 'キャンセル').click();
    expect(await resultPromise).toBeNull();
  });

  it('背景クリックでnullに解決する', async () => {
    const resultPromise = showPrompt('個数を入力');
    tapOverlay();
    expect(await resultPromise).toBeNull();
  });

  it('Enterキーで入力欄の値に解決する', async () => {
    const resultPromise = showPrompt('個数を入力', '3');
    const input = modalBox().querySelector('input');
    input.value = '7';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(await resultPromise).toBe('7');
  });
});

describe('連続呼び出し', () => {
  it('前のダイアログの解決前に次を呼んでも、dialog-rootが正しく差し替わる(直列に使う前提)', async () => {
    const first = showAlert('1つ目');
    modalBox().querySelector('button').click();
    await first;

    const second = showConfirm('2つ目');
    expect(modalBox().textContent).toContain('2つ目');
    modalBox().querySelector('button').click();
    await second;
  });
});
