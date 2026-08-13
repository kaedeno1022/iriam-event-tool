import { el } from '../render.js';

// 企画詳細画面の見出し(旧h2)を、その場でリネームできるinputに置き換えた共通ヘルパー。
// event.name(ダッシュボードのイベント名編集)と同じ「inputに直接入力→oninputで即保存」パターンを
// 6つの企画詳細画面(panelOpen/shiraPai/shopGacha/categoryEndurance/setlist/counter)で使い回す。
export function segmentNameHeader(segment, save) {
  return el('input', {
    type: 'text',
    class: 'segment-name-header',
    value: segment.name,
    'aria-label': '企画名',
    oninput: (e) => { segment.name = e.target.value; save(); },
  });
}
