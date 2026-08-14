import { el } from '../render.js';
import { genId } from '../id.js';
import { getActiveEventId } from '../storage.js';
import { showConfirm } from './dialogs.js';

export function renderUsers({
  state, save, saveText = save, rerender, container,
}) {
  const activeEventId = getActiveEventId(state);
  const activeSegmentIds = new Set(state.segments.filter((s) => s.eventId === activeEventId).map((s) => s.id));
  let newName = '';

  const addForm = el('div', { class: 'form-row inline' }, [
    el('input', {
      type: 'text', placeholder: '新規ユーザー名', value: newName,
      oninput: (e) => { newName = e.target.value; },
    }),
    el('button', {
      type: 'button',
      class: 'btn-primary',
      onclick: () => {
        const name = newName.trim();
        if (!name) return;
        state.users.push({ id: genId('user'), displayName: name, memo: '', iconImage: '', streamPostDone: false });
        save();
        rerender();
      },
    }, '追加'),
  ]);

  const userCards = state.users.map((user) => {
    const logs = state.giftLogs.filter((l) => l.userId === user.id && activeSegmentIds.has(l.segmentId));

    const totalPoints = logs.reduce((sum, l) => sum + l.points * l.qty, 0);

    // ギフト種類ごとに合計個数を集計する(記録の時系列一覧ではなく、種類別の合計を見たいという要望のため)。
    // ギフトIDが無い(直接ポイント入力)記録は"direct"キーにまとめる。
    const totalsByKey = new Map();
    for (const l of logs) {
      const key = l.giftId ?? 'direct';
      const entry = totalsByKey.get(key) ?? { giftId: l.giftId, points: l.points, qty: 0 };
      entry.qty += l.qty;
      totalsByKey.set(key, entry);
    }
    const historyRows = [...totalsByKey.values()]
      .sort((a, b) => b.qty - a.qty)
      .map((entry) => {
        const gift = entry.giftId ? state.giftMaster.find((g) => g.id === entry.giftId) : null;
        const label = gift ? gift.name : `直接入力${entry.points}pt`;
        return el('li', {}, `${label} ×${entry.qty}`);
      });

    return el('div', { class: 'card user-card' }, [
      el('div', { class: 'user-card-header' }, [
        el('input', {
          type: 'text', value: user.displayName,
          oninput: (e) => { user.displayName = e.target.value; saveText(); },
        }),
        el('button', {
          type: 'button',
          class: 'btn-icon',
          title: '削除',
          onclick: async () => {
            if (!(await showConfirm(`「${user.displayName}」を削除しますか？(記録済みギフト履歴は残ります)`))) return;
            state.users = state.users.filter((u) => u !== user);
            save();
            rerender();
          },
        }, '🗑'),
      ]),
      el('p', { class: 'user-total-points' }, `合計ポイント: ${totalPoints}pt`),
      el('textarea', {
        placeholder: 'メモ',
        oninput: (e) => { user.memo = e.target.value; saveText(); },
      }, user.memo || ''),
      el('div', { class: 'user-history' }, [
        el('strong', {}, `ギフト履歴(種類別合計、計${logs.length}件)`),
        el('ul', {}, historyRows.length ? historyRows : [el('li', {}, '記録なし')]),
      ]),
    ]);
  });

  container.append(el('section', {}, [
    el('h2', {}, 'ユーザー横断管理'),
    addForm,
    el('div', { class: 'user-grid' }, userCards),
  ]));
}
