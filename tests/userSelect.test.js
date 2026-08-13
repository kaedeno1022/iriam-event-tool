// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createUserSelect } from '../js/views/userSelect.js';

function baseState() {
  return { users: [{ id: 'u1', displayName: 'テストユーザー' }] };
}

describe('createUserSelect', () => {
  it('既存ユーザーが選択肢に表示される', () => {
    const state = baseState();
    const widget = createUserSelect({ state, save: vi.fn() });
    document.body.append(widget.element);

    const options = [...widget.element.querySelector('select').options].map((o) => o.textContent);
    expect(options).toContain('テストユーザー');
  });

  it('選択するとonChangeが呼ばれ、getSelectedUserIdにも反映される', () => {
    const state = baseState();
    const onChange = vi.fn();
    const widget = createUserSelect({ state, save: vi.fn(), onChange });
    document.body.append(widget.element);

    const select = widget.element.querySelector('select');
    select.value = 'u1';
    select.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalledWith('u1');
    expect(widget.getSelectedUserId()).toBe('u1');
  });

  it('新規ユーザーを追加すると自動選択され、state.usersにも反映される', () => {
    const state = baseState();
    const save = vi.fn();
    const onChange = vi.fn();
    const widget = createUserSelect({ state, save, onChange });
    document.body.append(widget.element);

    const input = widget.element.querySelector('input[type="text"]');
    input.value = '新規ユーザー';
    input.dispatchEvent(new Event('input'));
    widget.element.querySelector('button').click();

    const newUser = state.users.find((u) => u.displayName === '新規ユーザー');
    expect(newUser).toBeTruthy();
    expect(save).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(newUser.id);
    expect(widget.getSelectedUserId()).toBe(newUser.id);
  });

  it('空欄のまま追加ボタンを押しても何も起きない', () => {
    const state = baseState();
    const widget = createUserSelect({ state, save: vi.fn() });
    document.body.append(widget.element);

    widget.element.querySelector('button').click();

    expect(state.users).toHaveLength(1);
  });

  it('initialUserIdを渡すと初期選択状態になる', () => {
    const state = baseState();
    const widget = createUserSelect({ state, save: vi.fn(), initialUserId: 'u1' });
    document.body.append(widget.element);

    expect(widget.getSelectedUserId()).toBe('u1');
    expect(widget.element.querySelector('select').value).toBe('u1');
  });
});
