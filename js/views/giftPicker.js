import { el, clear } from '../render.js';
import { listCategories, searchGifts, addCustomGift } from '../giftMaster.js';
import { showPrompt } from './dialogs.js';

// ギフト検索・選択UI。giftRecordModal(記録時のギフト選択)とconditionModal(条件のギフト指定)で共用する。
// 呼び出し側は`.element`をDOMに挿入し、選択状態が必要になったタイミングで`.getSelectedGiftId()`を読む。
export function createGiftPicker({ state, save, initialSelectedId = null, onChange = () => {} }) {
  let category = 'all';
  let query = '';
  let sort = 'default';
  let selectedGiftId = initialSelectedId;

  const container = el('div', { class: 'gift-picker' });
  // 検索結果一覧は使い回す(単純な選択操作でここを作り直すとスクロール位置がリセットされるため)
  const listBox = el('div', { class: 'gift-list' });

  // 一覧の中身(フィルタ結果)自体は変えず、選択ハイライトだけを切り替える
  // (「その他」ボタンはgift-chipクラスを共有するがgiftIdを持たないため対象から除く)
  function updateHighlight() {
    for (const chip of listBox.querySelectorAll('.gift-chip:not(.gift-chip-other)')) {
      chip.classList.toggle('selected', chip.dataset.giftId === selectedGiftId);
    }
  }

  function select(giftId) {
    selectedGiftId = giftId;
    onChange(selectedGiftId);
    updateHighlight();
  }

  function renderList() {
    clear(listBox);
    const results = searchGifts(state.giftMaster, { category, query, sort });
    if (results.length === 0) {
      listBox.append(el('p', { class: 'empty-hint' }, '該当ギフトなし。「その他」から新規登録できます。'));
    }
    for (const g of results) {
      listBox.append(el('button', {
        type: 'button',
        class: g.id === selectedGiftId ? 'gift-chip selected' : 'gift-chip',
        dataset: { giftId: g.id },
        onclick: () => select(g.id),
      }, `${g.name}${g.points != null ? ` (${g.points}pt)` : ''}`));
    }
    listBox.append(el('button', {
      type: 'button',
      class: 'gift-chip gift-chip-other',
      onclick: () => openQuickAdd(),
    }, '＋ その他(新規登録)'));
  }

  async function openQuickAdd() {
    const name = await showPrompt('ギフト名を入力');
    if (!name) return;
    const pointsStr = await showPrompt('ポイント数を入力(不明な場合は空欄)');
    const cat = category !== 'all' ? category : ((await showPrompt('カテゴリ名を入力', 'その他')) || 'その他');
    const gift = addCustomGift(state.giftMaster, { name, points: pointsStr, category: cat });
    save(state);
    selectedGiftId = gift.id;
    onChange(selectedGiftId);
    renderList(); // 新規ギフトが一覧に加わるので、ハイライトだけでなく一覧自体を作り直す
  }

  function render() {
    clear(container);

    const categories = ['all', ...listCategories(state.giftMaster)];
    const catTabs = el('div', { class: 'category-tabs' }, categories.map((c) => el('button', {
      type: 'button',
      class: c === category ? 'tab active' : 'tab',
      onclick: () => { category = c; render(); },
    }, c === 'all' ? 'すべて' : c)));

    const searchInput = el('input', {
      type: 'search',
      placeholder: 'ギフト名で検索',
      value: query,
      oninput: (e) => { query = e.target.value; renderList(); },
    });

    const sortBtns = el('div', { class: 'sort-tabs' }, [
      el('button', { type: 'button', class: sort === 'default' ? 'tab active' : 'tab', onclick: () => { sort = 'default'; render(); } }, '標準'),
      el('button', { type: 'button', class: sort === 'recent' ? 'tab active' : 'tab', onclick: () => { sort = 'recent'; render(); } }, '最近使った'),
      el('button', { type: 'button', class: sort === 'frequent' ? 'tab active' : 'tab', onclick: () => { sort = 'frequent'; render(); } }, 'よく使う'),
    ]);

    renderList();
    container.append(searchInput, catTabs, sortBtns, listBox);
  }

  render();

  return {
    element: container,
    getSelectedGiftId: () => selectedGiftId,
  };
}
