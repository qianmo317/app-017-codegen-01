/**
 * 拼版（折手）测试。
 * 验收点（需求）：
 * - 骑马钉一张纸正反各两页再对折、套帖；胶装多张纸叠放裁边；
 * - 页数凑不满一张纸时在末尾补空白页，补白不占正文页码；
 * - 每张纸正反面各放哪几页、折起来哪面朝外一目了然（结构可断言）；
 * - 换装订方式/改纸张大小必须重新排；
 * - 排完能核对漏页、重页、页序。
 */
import { describe, expect, it } from 'vitest';
import {
  imposeDocument,
  physicalReadingOrder,
  verifyImposition,
  SHEET_PRESETS,
  type BindingMode,
  type ImpositionResult,
  type SheetSize,
} from '../src/lib/imposition';

const A3: SheetSize = SHEET_PRESETS[0].size;
const A4_PAGE = { widthMm: 210, heightMm: 297 };

function nums(r: ImpositionResult, idx: number) {
  const s = r.sheets[idx - 1];
  return {
    fl: s.front[0].pageNumber,
    fr: s.front[1].pageNumber,
    bl: s.back[0].pageNumber,
    br: s.back[1].pageNumber,
  };
}

/** 对 1..N 各种页数与两种装订都核对一遍：无漏页/重页、物理页序 1..N、补白只在末尾 */
function expectBookOk(mode: BindingMode, content: number, sheet = A3) {
  const r = imposeDocument(content, mode, sheet);
  const v = verifyImposition(r, A4_PAGE);
  if (!v.ok) throw new Error(v.issues.map((i) => i.message).join('；'));
  // 正文页 1..N 全部且仅出现一次
  const flat = r.sheets.flatMap((s) => [...s.front, ...s.back].map((sl) => sl.pageNumber)).filter((p): p is number => p !== null);
  expect([...flat].sort((a, b) => a - b)).toEqual(Array.from({ length: content }, (_, i) => i + 1));
  // 物理翻读顺序严格 1..N
  expect(v.readingOrder).toEqual(Array.from({ length: content }, (_, i) => i + 1));
  // 补白在翻读序列末尾
  const order = physicalReadingOrder(r);
  const contentPart = order.filter((p) => p !== null);
  expect(contentPart).toEqual(Array.from({ length: content }, (_, i) => i + 1));
  const firstNull = order.indexOf(null);
  if (firstNull >= 0) expect(order.slice(firstNull).every((p) => p === null)).toBe(true);
  return r;
}

describe('骑马钉拼版（套帖）', () => {
  it('8 页 2 张纸：最外一张 8|1 / 2|7，内一张 6|3 / 4|5', () => {
    const r = expectBookOk('saddle', 8);
    expect(r.sheetCount).toBe(2);
    expect(nums(r, 1)).toEqual({ fl: 8, fr: 1, bl: 2, br: 7 });
    expect(nums(r, 2)).toEqual({ fl: 6, fr: 3, bl: 4, br: 5 });
    // 最外一张正面含封面封底
    expect(r.sheets[0].coverSheet).toBe(true);
    expect(r.sheets[0].front[0].outside).toBe(true);
    expect(r.sheets[0].front[1].outside).toBe(true);
    expect(r.sheets[0].back[0].outside).toBe(false);
    expect(r.sheets[0].back[1].outside).toBe(false);
  });

  it('4 页 1 张纸：4|1 / 2|3', () => {
    const r = expectBookOk('saddle', 4);
    expect(r.sheetCount).toBe(1);
    expect(nums(r, 1)).toEqual({ fl: 4, fr: 1, bl: 2, br: 3 });
  });

  it('16 页 4 张：经典 16|1、2|15 … 14|3、4|13 套帖版序', () => {
    const r = expectBookOk('saddle', 16);
    expect(nums(r, 1)).toEqual({ fl: 16, fr: 1, bl: 2, br: 15 });
    expect(nums(r, 2)).toEqual({ fl: 14, fr: 3, bl: 4, br: 13 });
    expect(nums(r, 3)).toEqual({ fl: 12, fr: 5, bl: 6, br: 11 });
    expect(nums(r, 4)).toEqual({ fl: 10, fr: 7, bl: 8, br: 9 });
  });

  it('12 页 3 张', () => {
    const r = expectBookOk('saddle', 12);
    expect(nums(r, 1)).toEqual({ fl: 12, fr: 1, bl: 2, br: 11 });
    expect(nums(r, 2)).toEqual({ fl: 10, fr: 3, bl: 4, br: 9 });
    expect(nums(r, 3)).toEqual({ fl: 8, fr: 5, bl: 6, br: 7 });
  });

  it('套帖顺序：第 1 张 gathering=1 是最外一张（含封面）', () => {
    const r = expectBookOk('saddle', 8);
    expect(r.sheets.map((s) => s.gathering)).toEqual([1, 2]);
    expect(r.sheets[0].front[1].pageNumber).toBe(1);
  });
});

describe('胶装拼版（叠帖）', () => {
  it('8 页 2 帖：第一帖 4|1 / 2|3，第二帖 8|5 / 6|7', () => {
    const r = expectBookOk('perfect', 8);
    expect(r.sheetCount).toBe(2);
    expect(nums(r, 1)).toEqual({ fl: 4, fr: 1, bl: 2, br: 3 });
    expect(nums(r, 2)).toEqual({ fl: 8, fr: 5, bl: 6, br: 7 });
    // 第一帖含封面
    expect(r.sheets[0].coverSheet).toBe(true);
    expect(r.sheets[1].coverSheet).toBe(false);
    // gathering 顺序就是叠放顺序
    expect(r.sheets.map((s) => s.gathering)).toEqual([1, 2]);
  });

  it('4 页 1 帖：4|1 / 2|3', () => {
    const r = expectBookOk('perfect', 4);
    expect(nums(r, 1)).toEqual({ fl: 4, fr: 1, bl: 2, br: 3 });
  });

  it('12 页 3 帖各自为连续 4 页', () => {
    const r = expectBookOk('perfect', 12);
    expect(nums(r, 1)).toEqual({ fl: 4, fr: 1, bl: 2, br: 3 });
    expect(nums(r, 2)).toEqual({ fl: 8, fr: 5, bl: 6, br: 7 });
    expect(nums(r, 3)).toEqual({ fl: 12, fr: 9, bl: 10, br: 11 });
  });
});

describe('末尾补空白页（不占正文页码）', () => {
  it('骑马钉 6 页 → 8 页 2 张，补 2 个空白页在最内帖末尾', () => {
    const r = expectBookOk('saddle', 6);
    expect(r.totalPageCount).toBe(8);
    expect(r.blankCount).toBe(2);
    expect(r.contentPageCount).toBe(6);
    // 最外一张：8 位不存在 → FL 空白；7 位也不存在 → BR 空白；FR=1、BL=2
    expect(nums(r, 1)).toEqual({ fl: null, fr: 1, bl: 2, br: null });
    // 内一张：6 位（=6 存在）、3、4、5
    expect(nums(r, 2)).toEqual({ fl: 6, fr: 3, bl: 4, br: 5 });
    const blankSlots = r.sheets.flatMap((s) => [...s.front, ...s.back]).filter((sl) => sl.blank);
    expect(blankSlots).toHaveLength(2);
    expect(blankSlots.every((sl) => sl.pageNumber === null)).toBe(true);
  });

  it('胶装 6 页 → 8 页，第二帖末尾补 2 空白', () => {
    const r = expectBookOk('perfect', 6);
    expect(r.blankCount).toBe(2);
    expect(nums(r, 1)).toEqual({ fl: 4, fr: 1, bl: 2, br: 3 });
    expect(nums(r, 2)).toEqual({ fl: null, fr: 5, bl: 6, br: null });
    // 空白页没有正文页码
    const blanks = r.sheets[1].back[1];
    expect(blanks.blank).toBe(true);
    expect(blanks.pageNumber).toBeNull();
  });

  it('骑马钉 1/2/3/5/7 页：补齐到 4 的倍数且核对全过', () => {
    for (const n of [1, 2, 3, 5, 7, 9, 10, 13]) {
      const r = expectBookOk('saddle', n);
      expect(r.totalPageCount % 4).toBe(0);
      expect(r.blankCount).toBe(r.totalPageCount - n);
    }
  });

  it('胶装 1/2/3/5/7 页：补齐到 4 的倍数且核对全过', () => {
    for (const n of [1, 2, 3, 5, 7, 9, 10, 13]) {
      const r = expectBookOk('perfect', n);
      expect(r.totalPageCount % 4).toBe(0);
    }
  });

  it('0 页文档：不排纸', () => {
    const r = imposeDocument(0, 'saddle', A3);
    expect(r.sheets).toEqual([]);
    expect(r.sheetCount).toBe(0);
    expect(verifyImposition(r).ok).toBe(true);
  });
});

describe('正反面/朝外向标注', () => {
  it('每张纸 front 面折后朝外、back 面朝内', () => {
    for (const mode of ['saddle', 'perfect'] as BindingMode[]) {
      const r = expectBookOk(mode, 8);
      for (const s of r.sheets) {
        expect(s.front.every((sl) => sl.outside)).toBe(true);
        expect(s.back.every((sl) => !sl.outside)).toBe(true);
      }
    }
  });

  it('左槽偶页、右槽奇页（短边翻转方向一致）', () => {
    for (const mode of ['saddle', 'perfect'] as BindingMode[]) {
      const r = expectBookOk(mode, 16);
      for (const s of r.sheets) {
        for (const sl of [...s.front, ...s.back]) {
          if (sl.pageNumber === null) continue;
          expect(sl.pageNumber % 2 === 1 ? sl.position : sl.position === 'left' ? 'left' : 'right').toBeDefined();
          if (sl.position === 'left') expect(sl.pageNumber % 2).toBe(0);
          if (sl.position === 'right') expect(sl.pageNumber % 2).toBe(1);
        }
      }
    }
  });
});

describe('核对：漏页 / 重页 / 页序 / 补白位置', () => {
  it('正确拼版核对通过', () => {
    const v = verifyImposition(imposeDocument(10, 'saddle', A3));
    expect(v.ok).toBe(true);
    expect(v.issues).toEqual([]);
    expect(v.readingOrder).toHaveLength(10);
  });

  it('漏页：删掉某页能报 missing', () => {
    const r = imposeDocument(8, 'saddle', A3);
    // 8 页时第 5 页位于内一张（第 2 张）BR
    const broken: ImpositionResult = {
      ...r,
      sheets: r.sheets.map((s) =>
        s.index === 2
          ? { ...s, back: [s.back[0], { ...s.back[1], pageNumber: null, blank: true }] }
          : s,
      ),
    };
    const v = verifyImposition(broken);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.type === 'missing' && i.page === 5)).toBe(true);
  });

  it('重页：两槽放同一页能报 duplicate', () => {
    const r = imposeDocument(8, 'saddle', A3);
    const broken: ImpositionResult = {
      ...r,
      sheets: r.sheets.map((s, si) =>
        si === 0
          ? { ...s, back: [{ ...s.back[1], pageNumber: 1 }, s.back[1]] as ImpositionResult['sheets'][number]['back'] }
          : s,
      ),
    };
    const v = verifyImposition(broken);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.type === 'duplicate' && i.page === 1)).toBe(true);
  });

  it('页序错误：交换两页位置能报 out-of-order', () => {
    const r = imposeDocument(8, 'saddle', A3);
    const swapFront = (s: ImpositionResult['sheets'][number]): ImpositionResult['sheets'][number] => ({
      ...s,
      front: [s.front[1], s.front[0]],
    });
    const broken: ImpositionResult = {
      ...r,
      sheets: r.sheets.map((s) => (s.index === 2 ? swapFront(s) : s)),
    };
    const v = verifyImposition(broken);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.type === 'out-of-order')).toBe(true);
  });

  it('补白夹在正文中间能报 blank-mid-book', () => {
    const r = imposeDocument(6, 'perfect', A3); // 第二帖 FL=null（第8位）、BR=null（第7位）
    // 人为把第一帖 FL=4 换成空白，把第二帖 BR 换成 4：补白进入书中间
    const broken: ImpositionResult = {
      ...r,
      sheets: r.sheets.map((s, si) => {
        if (si === 0) {
          return { ...s, front: [{ ...s.front[0], pageNumber: null, blank: true }, s.front[1]], pageNumbers: [1, 2, 3] };
        }
        return {
          ...s,
          back: [s.back[0], { ...s.back[1], pageNumber: 4, blank: false }],
          pageNumbers: [5, 6, 4],
          hasBlanks: true,
        };
      }),
    };
    const v = verifyImposition(broken);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.type === 'blank-mid-book')).toBe(true);
  });

  it('朝向错误：奇页放左槽能报 orientation', () => {
    const r = imposeDocument(8, 'saddle', A3);
    const broken: ImpositionResult = {
      ...r,
      sheets: r.sheets.map((s, si) =>
        si === 0
          ? { ...s, back: [s.back[1], s.back[0]] } // 2 与 7 互换 → 左槽出现 7（奇）
          : s,
      ),
    };
    const v = verifyImposition(broken);
    expect(v.issues.some((i) => i.type === 'orientation')).toBe(true);
  });

  it('总页数不是 4 的倍数能报 structure', () => {
    const r = imposeDocument(8, 'saddle', A3);
    const v = verifyImposition({ ...r, totalPageCount: 10, blankCount: 2 });
    expect(v.issues.some((i) => i.type === 'structure')).toBe(true);
  });
});

describe('装订方式 / 纸张大小改变 → 重新排', () => {
  it('同页数骑马钉与胶排版序不同', () => {
    const saddle = imposeDocument(12, 'saddle', A3);
    const perfect = imposeDocument(12, 'perfect', A3);
    // 第一帖 FL：骑马钉 12，胶装 4
    expect(saddle.sheets[0].front[0].pageNumber).toBe(12);
    expect(perfect.sheets[0].front[0].pageNumber).toBe(4);
    expect(saddle.binding).toBe('saddle');
    expect(perfect.binding).toBe('perfect');
  });

  it('改纸张大小：版序不变但结果携带新尺寸，装不下给警告', () => {
    const small: SheetSize = { widthMm: 200, heightMm: 200 }; // A4 双联需要 420×297
    const r = imposeDocument(8, 'saddle', small);
    expect(r.sheetSize).toEqual(small);
    const v = verifyImposition(r, A4_PAGE);
    expect(v.warnings.length).toBeGreaterThan(0);
    expect(v.warnings[0]).toContain('装不下');
    // 换成 A3 后无警告
    expect(verifyImposition(imposeDocument(8, 'saddle', A3), A4_PAGE).warnings).toEqual([]);
  });

  it('A5 双联（A4 横向大纸）不警告', () => {
    const r = imposeDocument(8, 'saddle', SHEET_PRESETS[1].size);
    const v = verifyImposition(r, { widthMm: 148, heightMm: 210 });
    expect(v.warnings).toEqual([]);
    expect(v.ok).toBe(true);
  });
});
