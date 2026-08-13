import { el, clear } from '../render.js';
import { genId } from '../id.js';

// ユーザー選択+その場での新規追加ができる部品。メイド枠・役職・デジガチャ等、
// 「対象ユーザーを選んでから何か操作する」画面で共通して使う(giftPickerと同じ設計思想)。
export function createUserSelect({
  state, save, initialUserId = '', onChange = () => {}, labelFor = (u) => u.displayName,
}) {
  let selectedUserId = initialUserId;
  let newUserName = '';

  const container = el('div', { class: 'user-select-widget' });

  function render() {
    clear(container);

    const select = el('select', {
      onchange: (e) => { selectedUserId = e.target.value; onChange(selectedUserId); },
    }, [
      el('option', { value: '', selected: selectedUserId === '' }, '選択してください'),
      ...state.users.map((u) => el('option', { value: u.id, selected: u.id === selectedUserId }, labelFor(u))),
    ]);

    const newInput = el('input', {
      type: 'text',
      placeholder: '新規ユーザー名',
      value: newUserName,
      oninput: (e) => { newUserName = e.target.value; },
    });

    const addBtn = el('button', {
      type: 'button',
      class: 'btn-secondary',
      onclick: () => {
        const name = newUserName.trim();
        if (!name) return;
        const user = {
          id: genId('user'), displayName: name, memo: '', iconImage: '', streamPostDone: false,
        };
        state.users.push(user);
        save(state);
        newUserName = '';
        selectedUserId = user.id;
        onChange(selectedUserId);
        render();
      },
    }, '追加');

    container.append(
      el('div', { class: 'form-row' }, [el('label', {}, 'ユーザー'), select]),
      el('div', { class: 'form-row inline' }, [newInput, addBtn]),
    );
  }

  render();

  return {
    element: container,
    getSelectedUserId: () => selectedUserId,
  };
}
