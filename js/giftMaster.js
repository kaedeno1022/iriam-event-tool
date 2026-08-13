import { genId } from './id.js';

// 表示上のカテゴリ並び順(付録A-1準拠、未知のカテゴリは末尾にアルファベット順で追加)
const CATEGORY_ORDER = [
  '定番', 'プチギフト', 'おもちゃ', 'ネタ', '笑', 'えらい', '挨拶',
  'ステージ', 'LOVE', 'スペシャル', '季節', '専用', 'その他',
];

export function listCategories(giftMaster) {
  const present = new Set(giftMaster.map((g) => g.category));
  const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
  const rest = [...present].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [...ordered, ...rest];
}

export function searchGifts(giftMaster, { category = 'all', query = '', sort = 'default' } = {}) {
  let list = giftMaster;
  if (category !== 'all') {
    list = list.filter((g) => g.category === category);
  }
  const q = query.trim();
  if (q) {
    list = list.filter((g) => g.name.includes(q));
  }

  const sorted = [...list];
  if (sort === 'manual') {
    // giftMaster配列の物理的な並び順をそのまま使う(ギフトマスタ管理画面の並び替えボタン用)
  } else if (sort === 'recent') {
    sorted.sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''));
  } else if (sort === 'frequent') {
    sorted.sort((a, b) => b.useCount - a.useCount);
  } else {
    sorted.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category, 'ja');
      const ap = a.points ?? Infinity;
      const bp = b.points ?? Infinity;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name, 'ja');
    });
  }
  return sorted;
}

export function addCustomGift(giftMaster, { name, points, category }) {
  const parsedPoints = Number(points);
  const gift = {
    id: genId('gift'),
    name,
    points: points === '' || points === null || points === undefined || Number.isNaN(parsedPoints) ? null : parsedPoints,
    category,
    memo: '',
    lastUsedAt: null,
    useCount: 0,
    custom: true,
  };
  giftMaster.push(gift);
  return gift;
}

export function touchGiftUsage(giftMaster, giftId) {
  const gift = giftMaster.find((g) => g.id === giftId);
  if (!gift) return;
  gift.lastUsedAt = new Date().toISOString();
  gift.useCount += 1;
}
