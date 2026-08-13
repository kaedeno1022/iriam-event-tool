import { el } from '../render.js';
import { genId } from '../id.js';
import { getActiveEventId } from '../storage.js';
import { showConfirm, showPrompt } from './dialogs.js';

// segmentId指定時はそのsegmentを直接表示する(ダッシュボードのカレンダーから日付ベースの
// 非既定インスタンスを開く場合)。未指定時は従来通りタブ用の既定枠(key==='setlist')を表示する。
function findSegment(state, segmentId) {
  if (segmentId) return state.segments.find((s) => s.id === segmentId);
  return state.segments.find((s) => s.key === 'setlist' && s.eventId === getActiveEventId(state));
}

function moveSong(songs, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= songs.length) return;
  [songs[index], songs[target]] = [songs[target], songs[index]];
}

export function renderSetlist({
  state, save, rerender, container, segmentId,
}) {
  const segment = findSegment(state, segmentId);
  if (!segment) {
    container.append(el('p', {}, 'ラスランが見つかりません。'));
    return;
  }
  segment.config.songs = segment.config.songs ?? [];
  const songs = segment.config.songs;

  const doneCount = songs.filter((s) => s.done).length;

  const songRows = songs.map((song, index) => el('div', { class: 'card punishment-row' }, [
    el('label', { class: 'checkbox-row' }, [
      el('input', {
        type: 'checkbox',
        checked: song.done,
        onchange: (e) => { song.done = e.target.checked; save(); rerender(); },
      }),
    ]),
    el('input', {
      type: 'text',
      value: song.title,
      oninput: (e) => { song.title = e.target.value; save(); },
    }),
    el('button', {
      type: 'button', class: 'btn-icon', title: '上へ', disabled: index === 0, onclick: () => { moveSong(songs, index, -1); save(); rerender(); },
    }, '↑'),
    el('button', {
      type: 'button', class: 'btn-icon', title: '下へ', disabled: index === songs.length - 1, onclick: () => { moveSong(songs, index, 1); save(); rerender(); },
    }, '↓'),
    el('button', {
      type: 'button',
      class: 'btn-icon',
      title: '削除',
      onclick: async () => {
        if (!(await showConfirm(`「${song.title}」をセトリから削除しますか？`))) return;
        segment.config.songs = songs.filter((s) => s.id !== song.id);
        save();
        rerender();
      },
    }, '🗑'),
  ]));

  const addSongBtn = el('button', {
    type: 'button',
    class: 'btn-primary',
    onclick: async () => {
      const title = await showPrompt('曲名を入力');
      if (!title || !title.trim()) return;
      songs.push({ id: genId('song'), title: title.trim(), done: false });
      save();
      rerender();
    },
  }, '＋ 曲を追加');

  container.append(el('section', {}, [
    el('h2', {}, segment.name),
    el('div', { class: 'card' }, [
      el('p', { class: 'empty-hint' }, '曲名を登録し、↑↓で歌う順に並び替えます。歌い終えたら「済み」にチェックしてください。'),
      el('p', {}, `済み ${doneCount} / 全${songs.length}曲`),
      el('div', { class: 'punishment-list' }, songRows.length ? songRows : [el('p', { class: 'empty-hint' }, 'セトリ未登録')]),
      addSongBtn,
    ]),
  ]));
}
