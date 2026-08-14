import { describe, it, expect } from 'vitest';
import { userLabel } from '../js/views/userLabel.js';

function baseState() {
  return { users: [{ id: 'u1', displayName: 'しらす' }] };
}

describe('userLabel', () => {
  it('存在するユーザーIDなら表示名を返す', () => {
    expect(userLabel(baseState(), 'u1')).toBe('しらす');
  });

  it('参照先が削除されたユーザーIDは「(削除済みユーザー)」と区別して表示する', () => {
    expect(userLabel(baseState(), 'u-deleted')).toBe('(削除済みユーザー)');
  });

  // ユーザー記録をオフにした企画の記録はuserIdを持たない。これを「削除済み」と表示すると、
  // 意図して名前を残さなかった記録が失われたように見えるため、別の表示にする。
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['空文字', ''],
  ])('ユーザー未紐づけ(%s)は「-」を返し、削除済み表示にはしない', (_label, userId) => {
    expect(userLabel(baseState(), userId)).toBe('-');
  });
});
