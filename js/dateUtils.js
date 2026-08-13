// ブラウザのローカルタイムゾーンでの年月日をYYYY-MM-DD形式で返す。
// Date#toISOString()はUTC基準のため、getDay()/setDate()等のローカル基準メソッドと混在させると、
// UTCとの時差の分だけ日付がずれる(例: JSTの深夜0時〜9時台はtoISOString()側が前日になる)。
// この関数・tuesdayWeekRangeは一貫してローカル基準のメソッドのみを使う。
function toLocalISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// IRIAMの同接ランキング等の集計期間(火曜始まり・月曜終わり)に合わせた週の期間を返す。
// baseDateを含む週(baseDateが火曜ならその日始まり)のperiodStart/periodEndをローカル日付文字列で返す。
export function tuesdayWeekRange(baseDate = new Date()) {
  const day = baseDate.getDay(); // 0=日,1=月,2=火,3=水,4=木,5=金,6=土
  const diffFromTuesday = (day + 5) % 7; // 直近(当日含む)の火曜から何日進んでいるか
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() - diffFromTuesday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { periodStart: toLocalISODate(start), periodEnd: toLocalISODate(end) };
}
