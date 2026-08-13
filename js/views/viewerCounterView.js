import { el } from '../render.js';
import { getActiveEventId } from '../storage.js';

// segmentId指定時はそのsegmentを直接表示する(ダッシュボードのカレンダーから日付ベースの
// 非既定インスタンスを開く場合)。未指定時は従来通りタブ用の既定枠(key==='viewerCounter')を表示する。
function findSegment(state, segmentId) {
  if (segmentId) return state.segments.find((s) => s.id === segmentId);
  return state.segments.find((s) => s.key === 'viewerCounter' && s.eventId === getActiveEventId(state));
}

export function renderViewerCounter({
  state, save, rerender, container, segmentId,
}) {
  const segment = findSegment(state, segmentId);
  if (!segment) {
    container.append(el('p', {}, '同接カウンターが見つかりません。'));
    return;
  }
  segment.config.count = segment.config.count ?? 0;

  const countInput = el('input', {
    type: 'number',
    min: '0',
    value: String(segment.config.count),
    class: 'viewer-counter-input',
    oninput: (e) => { segment.config.count = Math.max(0, Number(e.target.value) || 0); save(); },
  });

  const minusBtn = el('button', {
    type: 'button',
    class: 'btn-round',
    onclick: () => { segment.config.count = Math.max(0, segment.config.count - 1); save(); rerender(); },
  }, '－');

  const plusBtn = el('button', {
    type: 'button',
    class: 'btn-round',
    onclick: () => { segment.config.count += 1; save(); rerender(); },
  }, '＋');

  container.append(el('section', {}, [
    el('h2', {}, segment.name),
    el('div', { class: 'card' }, [
      el('p', { class: 'empty-hint' }, '＋／－で1ずつ増減、または数値を直接入力してください。'),
      el('div', { class: 'form-row inline' }, [minusBtn, countInput, plusBtn]),
    ]),
  ]));
}
