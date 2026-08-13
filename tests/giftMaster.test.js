import { describe, it, expect } from 'vitest';
import { listCategories, searchGifts, addCustomGift, touchGiftUsage } from '../js/giftMaster.js';
import { moveGiftInCategory } from '../js/views/giftMasterView.js';

function sampleGifts() {
  return [
    { id: 'g1', name: 'しらすまん', points: 200, category: '定番', lastUsedAt: null, useCount: 0, custom: false },
    { id: 'g2', name: 'あふれる想い', points: 30000, category: 'LOVE', lastUsedAt: '2026-08-01T10:00:00.000Z', useCount: 3, custom: false },
    { id: 'g3', name: 'パイ投げ', points: 500, category: 'ネタ', lastUsedAt: '2026-08-05T10:00:00.000Z', useCount: 10, custom: false },
    { id: 'g4', name: 'たらい落とし', points: 500, category: 'ネタ', lastUsedAt: null, useCount: 1, custom: false },
  ];
}

describe('listCategories', () => {
  it('存在するカテゴリのみを、定義済みの並び順で返す', () => {
    const cats = listCategories(sampleGifts());
    expect(cats).toEqual(['定番', 'ネタ', 'LOVE']);
  });

  it('定義済み順序にないカテゴリは末尾にアルファベット順で追加する', () => {
    const gifts = [...sampleGifts(), { id: 'g5', name: 'カスタム', points: 1, category: 'ZZZ枠', lastUsedAt: null, useCount: 0, custom: true }];
    const cats = listCategories(gifts);
    expect(cats.at(-1)).toBe('ZZZ枠');
  });
});

describe('searchGifts', () => {
  it('カテゴリで絞り込める', () => {
    const results = searchGifts(sampleGifts(), { category: 'ネタ' });
    expect(results.map((g) => g.id).sort()).toEqual(['g3', 'g4']);
  });

  it('ギフト名の部分一致で絞り込める', () => {
    const results = searchGifts(sampleGifts(), { query: 'たらい' });
    expect(results.map((g) => g.id)).toEqual(['g4']);
  });

  it('デフォルトソートはカテゴリ→ポイント→名前の順(同カテゴリ内はポイント昇順)', () => {
    const results = searchGifts(sampleGifts(), {});
    const ids = results.map((g) => g.id);
    // カテゴリごとの相対順序(カテゴリ名自体のlocaleCompare結果に依存しないよう、
    // 同カテゴリ内の並びだけを検証する)
    expect(ids.indexOf('g4')).toBeLessThan(ids.indexOf('g3')); // ネタ内: たらい落とし→パイ投げ
    expect(ids).toHaveLength(4);
  });

  it('sort:recent は lastUsedAt の新しい順(未使用は末尾)', () => {
    const results = searchGifts(sampleGifts(), { sort: 'recent' });
    expect(results.map((g) => g.id)).toEqual(['g3', 'g2', 'g1', 'g4']);
  });

  it('sort:frequent は useCount の多い順', () => {
    const results = searchGifts(sampleGifts(), { sort: 'frequent' });
    expect(results.map((g) => g.id)).toEqual(['g3', 'g2', 'g4', 'g1']);
  });

  it('カテゴリと検索語を同時に適用できる', () => {
    const results = searchGifts(sampleGifts(), { category: 'ネタ', query: 'パイ' });
    expect(results.map((g) => g.id)).toEqual(['g3']);
  });

  it('sort:manual は配列の物理的な並び順をそのまま返す(再ソートしない)', () => {
    const gifts = sampleGifts(); // 配列順: g1, g2, g3, g4
    const results = searchGifts(gifts, { sort: 'manual' });
    expect(results.map((g) => g.id)).toEqual(['g1', 'g2', 'g3', 'g4']);
  });
});

describe('moveGiftInCategory', () => {
  it('同カテゴリ内の隣接アイテムと入れ替える(他カテゴリを挟んでいても同カテゴリの隣を見る)', () => {
    const gifts = sampleGifts(); // g1(定番) g2(LOVE) g3(ネタ) g4(ネタ)
    moveGiftInCategory(gifts, 'g4', -1); // ネタ内でg4をg3より上へ
    expect(gifts.map((g) => g.id)).toEqual(['g1', 'g2', 'g4', 'g3']);
  });

  it('先頭を上へ、末尾を下へ移動しようとしても何も起きない', () => {
    const gifts = sampleGifts();
    moveGiftInCategory(gifts, 'g1', -1); // 定番はg1のみ
    expect(gifts.map((g) => g.id)).toEqual(['g1', 'g2', 'g3', 'g4']);
    moveGiftInCategory(gifts, 'g4', 1); // ネタ内でg4は最後
    expect(gifts.map((g) => g.id)).toEqual(['g1', 'g2', 'g3', 'g4']);
  });

  it('searchGifts(sort:manual)と組み合わせると並び替えが表示に反映される', () => {
    const gifts = sampleGifts();
    moveGiftInCategory(gifts, 'g4', -1);
    const results = searchGifts(gifts, { category: 'ネタ', sort: 'manual' });
    expect(results.map((g) => g.id)).toEqual(['g4', 'g3']);
  });

  it('存在しないidを渡しても例外にならない', () => {
    const gifts = sampleGifts();
    expect(() => moveGiftInCategory(gifts, 'not-exist', 1)).not.toThrow();
  });
});

describe('addCustomGift', () => {
  it('custom:true でギフトを追加し配列に反映する', () => {
    const gifts = sampleGifts();
    const added = addCustomGift(gifts, { name: '新規ギフト', points: '999', category: 'その他' });
    expect(gifts).toContain(added);
    expect(added.custom).toBe(true);
    expect(added.points).toBe(999);
    expect(added.useCount).toBe(0);
    expect(added.id).toBeTruthy();
  });

  it('ポイント未入力なら points は null になる', () => {
    const gifts = sampleGifts();
    const added = addCustomGift(gifts, { name: '価格不明ギフト', points: '', category: 'その他' });
    expect(added.points).toBeNull();
  });

  it('ポイントに数値以外の文字列(prompt()経由の入力ミス等)が渡ってもNaNではなくnullになる', () => {
    const gifts = sampleGifts();
    const added = addCustomGift(gifts, { name: '不正入力ギフト', points: 'abc', category: 'その他' });
    expect(added.points).toBeNull();
  });
});

describe('touchGiftUsage', () => {
  it('useCount を増やし lastUsedAt を更新する', () => {
    const gifts = sampleGifts();
    touchGiftUsage(gifts, 'g1');
    const gift = gifts.find((g) => g.id === 'g1');
    expect(gift.useCount).toBe(1);
    expect(gift.lastUsedAt).not.toBeNull();
  });

  it('存在しない id を渡しても例外にならない', () => {
    const gifts = sampleGifts();
    expect(() => touchGiftUsage(gifts, 'not-exist')).not.toThrow();
  });
});
