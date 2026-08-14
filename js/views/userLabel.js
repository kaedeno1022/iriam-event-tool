// ギフト記録の「ユーザー」列に出す表示名。全ての企画ビューで同じ規則を使う。
//
// ユーザー未紐づけの記録(企画のユーザー記録トグルがOFFの時に作られる、userId:null)と、
// 参照先のユーザーが後から削除された記録は別物なので表示を分ける。どちらも
// 「(削除済みユーザー)」にすると、意図して名前を残さなかった記録が「消えた」ように見え、
// 復旧できるはずだと誤解させる。
export function userLabel(state, userId) {
  if (!userId) return '-';
  const user = state.users.find((u) => u.id === userId);
  return user ? user.displayName : '(削除済みユーザー)';
}
