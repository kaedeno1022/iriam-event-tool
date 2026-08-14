// 生成するID(接頭辞を除く)の16進文字数。48bit相当で、10万件生成しても衝突確率は0.002%程度。
// 以前は8文字(32bit)だったが、giftLogsがイベントをまたいで蓄積し続ける運用のため桁を増やした。
// 削除・取り消しはオブジェクトの同一性で対象を絞るようにしたが、IDは別オブジェクトからの
// 参照解決(giftId→ギフトマスタ、rouletteGiftIds、punishmentId等)に使い続けるため、
// 重複すると参照先を取り違える。
const ID_LENGTH = 12;

// crypto.getRandomValuesはsecure contextを要求しないため、randomUUID(iOS Safari 15.4未満などに
// 存在しない)と違ってHTTP配信や古い端末でも使える。ここを唯一の乱数源にする。
function randomHex(length) {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    cryptoObj.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, length);
  }
  // getRandomValuesすら無い環境向けの最終手段。Date.nowは混ぜない
  // (上位桁が長時間変化せず、桁を切り詰めた際に同一IDを量産する事故の原因になるため)。
  let out = '';
  while (out.length < length) out += Math.random().toString(16).slice(2);
  return out.slice(0, length);
}

export function genId(prefix) {
  return `${prefix}_${randomHex(ID_LENGTH)}`;
}
