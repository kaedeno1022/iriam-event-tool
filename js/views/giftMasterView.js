import { el, clear } from '../render.js';
import { listCategories, searchGifts, addCustomGift } from '../giftMaster.js';
import { showAlert, showConfirm } from './dialogs.js';

// giftはギフトそのもの(giftMasterの要素)を受け取る。IDで引き直すと、重複IDが残っている
// 既存データで別のギフトを掴んで意図しない並び替えになりうるため。
export function moveGiftInCategory(giftMaster, gift, direction) {
  if (!gift || !giftMaster.includes(gift)) return;
  const sameCategoryIndices = giftMaster
    .map((g, idx) => (g.category === gift.category ? idx : -1))
    .filter((idx) => idx !== -1);
  const posInCategory = sameCategoryIndices.indexOf(giftMaster.indexOf(gift));
  const targetPos = posInCategory + direction;
  if (targetPos < 0 || targetPos >= sameCategoryIndices.length) return;
  const i = sameCategoryIndices[posInCategory];
  const j = sameCategoryIndices[targetPos];
  [giftMaster[i], giftMaster[j]] = [giftMaster[j], giftMaster[i]];
}

export function renderGiftMaster({
  state, save, saveText = save, rerender, container,
}) {
  let category = 'all';
  let query = '';
  let sort = 'manual';

  const listBox = el('div', { class: 'gift-master-list' });

  function renderList() {
    clear(listBox);
    const results = searchGifts(state.giftMaster, { category, query, sort });
    if (results.length === 0) {
      listBox.append(el('p', { class: 'empty-hint' }, '該当ギフトなし'));
      return;
    }
    const table = el('table', { class: 'gift-master-table' }, [
      el('thead', {}, el('tr', {}, [
        el('th', {}, 'ギフト名'), el('th', {}, 'pt'), el('th', {}, 'カテゴリ'),
        el('th', {}, '使用回数'), el('th', {}, ''),
      ])),
      el('tbody', {}, results.map((g) => el('tr', {}, [
        el('td', {}, el('input', {
          type: 'text', value: g.name,
          oninput: (e) => { g.name = e.target.value; saveText(); },
        })),
        el('td', {}, el('input', {
          type: 'number', value: g.points ?? '', placeholder: '不明',
          oninput: (e) => { g.points = e.target.value === '' ? null : Number(e.target.value); saveText(); },
        })),
        el('td', {}, el('input', {
          type: 'text', value: g.category,
          oninput: (e) => { g.category = e.target.value; saveText(); },
        })),
        el('td', {}, String(g.useCount)),
        el('td', { class: 'gift-master-actions' }, [
          el('button', { type: 'button', class: 'btn-icon', title: '上へ', onclick: () => { moveGiftInCategory(state.giftMaster, g, -1); save(); renderList(); } }, '↑'),
          el('button', { type: 'button', class: 'btn-icon', title: '下へ', onclick: () => { moveGiftInCategory(state.giftMaster, g, 1); save(); renderList(); } }, '↓'),
          el('button', {
            type: 'button', class: 'btn-icon', title: '削除',
            onclick: async () => {
              if (!(await showConfirm(`「${g.name}」を削除しますか？`))) return;
              state.giftMaster = state.giftMaster.filter((x) => x !== g);
              save();
              renderList();
            },
          }, '🗑'),
        ]),
      ]))),
    ]);
    listBox.append(table);
  }

  const searchInput = el('input', {
    type: 'search', placeholder: 'ギフト名で検索', value: query,
    oninput: (e) => { query = e.target.value; renderList(); },
  });

  const sortSelect = el('select', {
    onchange: (e) => { sort = e.target.value; renderList(); },
  }, [
    el('option', { value: 'manual' }, '登録順(↑↓で並び替え可)'),
    el('option', { value: 'recent' }, '最近使った順'),
    el('option', { value: 'frequent' }, 'よく使う順'),
  ]);

  let newName = '';
  let newPoints = '';
  let newCategory = '';
  const addForm = el('div', { class: 'form-row inline' }, [
    el('input', { type: 'text', placeholder: 'ギフト名', oninput: (e) => { newName = e.target.value; } }),
    el('input', { type: 'number', placeholder: 'pt', oninput: (e) => { newPoints = e.target.value; } }),
    el('input', { type: 'text', placeholder: 'カテゴリ', oninput: (e) => { newCategory = e.target.value; } }),
    el('button', {
      type: 'button', class: 'btn-primary',
      onclick: async () => {
        if (!newName.trim() || !newCategory.trim()) { await showAlert('ギフト名とカテゴリは必須'); return; }
        addCustomGift(state.giftMaster, { name: newName.trim(), points: newPoints, category: newCategory.trim() });
        save();
        rerender();
      },
    }, '追加'),
  ]);

  const controlsBox = el('div', { class: 'gift-master-controls' });
  function renderControls() {
    clear(controlsBox);
    const cats = ['all', ...listCategories(state.giftMaster)];
    controlsBox.append(el('div', { class: 'category-tabs' }, cats.map((c) => el('button', {
      type: 'button',
      class: c === category ? 'tab active' : 'tab',
      onclick: () => { category = c; renderControls(); renderList(); },
    }, c === 'all' ? 'すべて' : c))));
    controlsBox.append(searchInput, sortSelect);
  }
  renderControls();
  renderList();

  container.append(el('section', {}, [
    el('h2', {}, 'ギフトマスタ管理'),
    el('h3', {}, '新規登録'),
    addForm,
    el('h3', {}, '一覧・検索'),
    controlsBox,
    listBox,
  ]));
}
