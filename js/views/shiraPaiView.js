import { el, formatDateTime } from '../render.js';
import { genId } from '../id.js';
import { getActiveEventId } from '../storage.js';
import { openGiftRecordModal } from './giftRecordModal.js';
import { createGiftPicker } from './giftPicker.js';
import { collapsibleSection } from './economyHelpers.js';
import { showAlert, showConfirm, showPrompt } from './dialogs.js';
import { segmentNameHeader } from './segmentHeader.js';

// segmentId指定時はそのsegmentを直接表示する(ダッシュボードのカレンダーから日付ベースの
// 非既定インスタンスを開く場合)。未指定時は従来通りタブ用の既定枠(key==='shiraPai')を表示する。
function findSegment(state, segmentId) {
  if (segmentId) return state.segments.find((s) => s.id === segmentId);
  return state.segments.find((s) => s.key === 'shiraPai' && s.eventId === getActiveEventId(state));
}

function giftName(state, giftId) {
  const gift = state.giftMaster.find((g) => g.id === giftId);
  return gift ? gift.name : '(削除済みギフト)';
}

// --- モジュールレベルの画面状態(折りたたみ開閉) ---
// renderShiraPaiはページ遷移や他画面での操作のたびに(app.jsのグローバルrerender経由で)
// 毎回ゼロから呼び直されるため、通常の関数内ローカル変数では開閉状態が操作のたびにリセットされてしまう。
const rouletteGiftSettingsOpenBySegmentId = new Map();
const targetGiftSettingsOpenByPunishmentId = new Map();

// テスト専用。モジュールはテストファイル内で使い回されるため、テスト間で上記の状態が
// 漏れないようにリセットする(本番のページ読み込みでは呼ぶ必要はない)。
export function resetShiraPaiUiState() {
  rouletteGiftSettingsOpenBySegmentId.clear();
  targetGiftSettingsOpenByPunishmentId.clear();
}

// ギフトの多対応付け編集UI(現在の対象ギフトをchip表示+削除、ギフトピッカーで追加)。
// ルーレット加算ギフト(segment単位)・罰ゲーム対象ギフト(punishment単位)の両方で使い回す。
function renderGiftMultiSelect({
  state, save, rerender, ids, onAdd, onRemove,
}) {
  const chips = ids.length
    ? el('div', { class: 'punishment-list' }, ids.map((giftId) => el('div', { class: 'card punishment-row' }, [
      el('span', { class: 'punishment-name' }, giftName(state, giftId)),
      el('button', {
        type: 'button', class: 'btn-icon', title: '対象から外す', onclick: () => { onRemove(giftId); save(); rerender(); },
      }, '✕'),
    ])))
    : el('p', { class: 'empty-hint' }, '対象ギフト未設定');

  const picker = createGiftPicker({
    state,
    save,
    onChange: (giftId) => { onAdd(giftId); save(); rerender(); },
  });

  return el('div', {}, [chips, picker.element]);
}

export function renderShiraPai({
  state, save, rerender, container, segmentId,
}) {
  const segment = findSegment(state, segmentId);
  if (!segment) {
    container.append(el('p', {}, '罰ゲームチャレンジが見つかりません。'));
    return;
  }
  const punishments = segment.config.punishments;
  segment.config.history = segment.config.history ?? [];
  const history = segment.config.history;
  segment.config.spinCredits = segment.config.spinCredits ?? 0;
  segment.config.rouletteGiftIds = segment.config.rouletteGiftIds ?? [];

  // ルーレット加算ギフトとして登録済みのギフトが記録されたら、記録した個数(qty)分だけ
  // スピン残り回数へ自動加算する。
  function applyRouletteGifts(addedLogs) {
    for (const log of addedLogs) {
      if (log.giftId && segment.config.rouletteGiftIds.includes(log.giftId)) {
        segment.config.spinCredits += log.qty;
      }
    }
  }

  const recordGiftBtn = el('button', {
    type: 'button',
    class: 'btn-primary',
    onclick: () => openGiftRecordModal({
      state,
      segmentId: segment.id,
      save,
      onSaved: (userId, addedLogs) => {
        applyRouletteGifts(addedLogs);
        save();
        rerender();
      },
    }),
  }, 'ギフトを記録する');

  const rouletteGiftOpen = rouletteGiftSettingsOpenBySegmentId.get(segment.id) ?? false;
  const rouletteGiftSettings = collapsibleSection({
    title: 'ルーレット加算ギフト設定',
    isOpen: rouletteGiftOpen,
    onToggle: () => { rouletteGiftSettingsOpenBySegmentId.set(segment.id, !rouletteGiftOpen); rerender(); },
    content: el('div', {}, [
      el('p', { class: 'empty-hint' }, 'ここに登録したギフトが記録されると、記録した個数分だけルーレットの残り回数に自動加算されます。'),
      renderGiftMultiSelect({
        state,
        save,
        rerender,
        ids: segment.config.rouletteGiftIds,
        onAdd: (giftId) => { if (!segment.config.rouletteGiftIds.includes(giftId)) segment.config.rouletteGiftIds.push(giftId); },
        onRemove: (giftId) => { segment.config.rouletteGiftIds = segment.config.rouletteGiftIds.filter((id) => id !== giftId); },
      }),
    ]),
  });

  const giftLogs = state.giftLogs
    .filter((l) => l.segmentId === segment.id)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20);
  const giftLogRows = giftLogs.map((l) => {
    const user = state.users.find((u) => u.id === l.userId);
    const gift = l.giftId ? state.giftMaster.find((g) => g.id === l.giftId) : null;
    return el('tr', {}, [
      el('td', {}, formatDateTime(l.timestamp)),
      el('td', {}, user ? user.displayName : '(削除済みユーザー)'),
      el('td', {}, gift ? gift.name : `直接入力 ${l.points}pt`),
      el('td', {}, `×${l.qty}`),
      el('td', {}, [
        el('button', {
          type: 'button',
          class: 'btn-icon',
          title: '取り消し',
          onclick: async () => {
            if (!(await showConfirm('この記録を取り消しますか？(ルーレット加算対象ギフトの場合、残り回数も戻します)'))) return;
            if (l.giftId && segment.config.rouletteGiftIds.includes(l.giftId)) {
              segment.config.spinCredits = Math.max(0, segment.config.spinCredits - l.qty);
            }
            state.giftLogs = state.giftLogs.filter((x) => x.id !== l.id);
            save();
            rerender();
          },
        }, '↩'),
      ]),
    ]);
  });
  const giftLogTable = el('table', { class: 'log-table' }, [
    el('thead', {}, el('tr', {}, [el('th', {}, '日時'), el('th', {}, 'ユーザー'), el('th', {}, 'ギフト'), el('th', {}, '個数'), el('th', {}, '')])),
    el('tbody', {}, giftLogRows.length ? giftLogRows : el('tr', {}, el('td', { colspan: '5' }, '記録なし'))),
  ]);

  const rows = punishments.map((p) => {
    p.giftIds = p.giftIds ?? [];
    const giftOpen = targetGiftSettingsOpenByPunishmentId.get(p.id) ?? false;
    return el('div', { class: 'card' }, [
      el('div', { class: 'punishment-row' }, [
        el('span', { class: 'punishment-name' }, p.giftIds.length ? `${p.name}(対象: ${p.giftIds.map((id) => giftName(state, id)).join('、')})` : p.name),
        el('button', { type: 'button', class: 'btn-round', onclick: () => { p.count = Math.max(0, p.count - 1); save(); rerender(); } }, '－'),
        el('span', { class: 'punishment-count' }, String(p.count)),
        el('button', { type: 'button', class: 'btn-round', onclick: () => { p.count += 1; save(); rerender(); } }, '＋'),
        el('button', {
          type: 'button',
          class: 'btn-icon',
          title: '削除',
          onclick: async () => {
            if (!(await showConfirm(`「${p.name}」を削除しますか？`))) return;
            segment.config.punishments = segment.config.punishments.filter((x) => x.id !== p.id);
            save();
            rerender();
          },
        }, '🗑'),
      ]),
      collapsibleSection({
        title: '対象ギフト(表示用、当選確率には影響しません)',
        isOpen: giftOpen,
        onToggle: () => { targetGiftSettingsOpenByPunishmentId.set(p.id, !giftOpen); rerender(); },
        content: renderGiftMultiSelect({
          state,
          save,
          rerender,
          ids: p.giftIds,
          onAdd: (giftId) => { if (!p.giftIds.includes(giftId)) p.giftIds.push(giftId); },
          onRemove: (giftId) => { p.giftIds = p.giftIds.filter((id) => id !== giftId); },
        }),
      }),
    ]);
  });

  const addBtn = el('button', {
    type: 'button',
    class: 'btn-secondary',
    onclick: async () => {
      const name = await showPrompt('罰ゲーム名を入力(例: 足つぼ、苦丁茶、語尾変)');
      if (!name || !name.trim()) return;
      punishments.push({
        id: genId('punishment'), name: name.trim(), count: 0, giftIds: [],
      });
      save();
      rerender();
    },
  }, '＋ 罰ゲームを追加');

  const creditsMinus = el('button', {
    type: 'button', class: 'btn-round', onclick: () => { segment.config.spinCredits = Math.max(0, segment.config.spinCredits - 1); save(); rerender(); },
  }, '－');
  const creditsPlus = el('button', {
    type: 'button', class: 'btn-round', onclick: () => { segment.config.spinCredits += 1; save(); rerender(); },
  }, '＋');

  const rouletteBtn = el('button', {
    type: 'button',
    class: 'btn-primary',
    onclick: async () => {
      if (segment.config.spinCredits <= 0) { await showAlert('ルーレットの残り回数がありません。「＋」で回数を追加してください。'); return; }
      if (punishments.length === 0) { await showAlert('先に罰ゲームを追加してください'); return; }
      const chosen = punishments[Math.floor(Math.random() * punishments.length)];
      chosen.count += 1;
      segment.config.spinCredits -= 1;
      // punishmentNameはスピン時点の名前を複製保持する(監査ログのため)。後で罰ゲーム名を
      // 変更・削除しても履歴表示は当時の名前のまま変わらない(ライブ参照はしない)
      history.push({
        id: genId('spin'), timestamp: new Date().toISOString(), punishmentId: chosen.id, punishmentName: chosen.name,
      });
      save();
      rerender();
      await showAlert(`🎲 ルーレット結果: 「${chosen.name}」`);
    },
  }, '🎲 ルーレットを回す');

  const historyRows = history
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20)
    .map((entry) => el('tr', {}, [
      el('td', {}, formatDateTime(entry.timestamp)),
      el('td', {}, entry.punishmentName),
      el('td', {}, [
        el('button', {
          type: 'button',
          class: 'btn-icon',
          title: '取り消し',
          onclick: async () => {
            if (!(await showConfirm('この履歴を取り消しますか？(該当する罰ゲームの実施回数も-1されます)'))) return;
            const punishment = punishments.find((p) => p.id === entry.punishmentId);
            if (punishment) punishment.count = Math.max(0, punishment.count - 1);
            segment.config.history = history.filter((h) => h.id !== entry.id);
            save();
            rerender();
          },
        }, '↩'),
      ]),
    ]));

  const historyTable = el('table', { class: 'log-table' }, [
    el('thead', {}, el('tr', {}, [el('th', {}, '日時'), el('th', {}, '選ばれた罰ゲーム'), el('th', {}, '')])),
    el('tbody', {}, historyRows.length ? historyRows : el('tr', {}, el('td', { colspan: '3' }, '履歴なし'))),
  ]);

  container.append(el('section', {}, [
    segmentNameHeader(segment, save),
    el('div', { class: 'card' }, [
      el('h3', {}, 'ギフト記録'),
      el('p', { class: 'empty-hint' }, 'ここに記録したギフトはユーザーの合計ポイントに反映されます。'),
      recordGiftBtn,
      rouletteGiftSettings,
      el('h4', {}, '直近の記録'),
      giftLogTable,
    ]),
    el('div', { class: 'card' }, [
      el('h3', {}, 'ルーレット'),
      el('p', { class: 'empty-hint' }, '罰ゲーム一覧からランダムに1つ選び、そのカウンターを自動加算します。回すたびに残り回数を1消化します。'),
      el('div', { class: 'form-row inline' }, [
        el('label', {}, '残り回数'),
        creditsMinus,
        el('span', { class: 'punishment-count' }, String(segment.config.spinCredits)),
        creditsPlus,
      ]),
      rouletteBtn,
    ]),
    el('h3', {}, '罰ゲーム一覧'),
    el('div', { class: 'punishment-list' }, rows.length ? rows : [el('p', { class: 'empty-hint' }, '罰ゲーム未登録')]),
    addBtn,
    el('h3', {}, 'ルーレット履歴'),
    historyTable,
  ]));
}
