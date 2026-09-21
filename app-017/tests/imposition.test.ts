/**
 * 拼版 / 折手测试：骑马钉套帖、胶装叠帖、末尾补白（不占正文页码）、
 * 纸张适配、折好还原阅读顺序，以及漏页/重页/页序/补白/结构核对。
 */
import { describe, expect, it } from 'vitest';
import {
  BINDING_LABELS,
  foldReadingOrder,
  impose,
  validateImposition,
  type ImpositionPlan,
  type ImpositionSheet,
  type ImpositionSlot,
} from '../src/lib/imposition';

const PAPER = { widthMm: 420, heightMm: 297 }; // A3 横向
const PAGE = { widthMm: 210, heightMm: 297 }; // A4 纵放：半张 A3 正好放下

function slotsOf(sheet: ImpositionSheet, side: 'front' | 'back'): (number | null)[] {
  return (side === 'front' ? sheet.front : sheet.back).slots.map((s) =>
    s.blank ? null : s.pageNumber,
  );
}

function expectValid(plan: ImpositionPlan) {
  const v = validateImposition(plan, PAGE);
  if (!v.ok) throw new Error(v.issues.map((i) => i.message).join('；'));
  expect(v.ok).toBe(true);
  return v;
}

describe('基本补白规则（两种装订都要凑满 4 的倍数，补白在末尾且不占页码）', () => {
  it.each([
    [0, 0, 0],
    [1, 3, 1],
    [2, 2, 1],
    [3, 1, 1],
    [4, 0, 1],
    [5, 3, 2],
    [6, 2, 2],
    [7, 1, 2],
    [8, 0, 2],
    [13, 3, 4],
  ])('正文 %d 页 → 补白 %d 页、总版 %d、纸张 %d 张', (n, blanks, sheets) => {
    for (const binding of ['saddle', 'perfect'] as const) {
      const plan = impose(n, binding, PAPER, PAGE);
      expect(plan.bodyPageCount).toBe(n);
      expect(plan.blankPageCount).toBe(blanks);
      expect(plan.totalPageCount).toBe(n + blanks);
      expect(plan.sheets).toHaveLength(sheets);
      expect(plan.fits).toBe(true);
      expectValid(plan);
    }
  });

  it('补白版位 blank=true 且不带正文页码', () => {
    const plan = impose(6, 'perfect', PAPER, PAGE);
    const blanks: ImpositionSlot[] = [];
    for (const sh of plan.sheets) {
      for (const side of [sh.front, sh.back]) {
        for (const sl of side.slots) if (sl.blank) blanks.push(sl);
      }
    }
    expect(blanks).toHaveLength(2);
    expect(blanks.every((b) => b.pageNumber === null)).toBe(true);
  });
});

describe('骑马钉（saddle）摆版', () => {
  it('1 张纸 4 页：front=[4|1]，back=[2|3]', () => {
    const plan = impose(4, 'saddle', PAPER, PAGE);
    expect(slotsOf(plan.sheets[0], 'front')).toEqual([4, 1]);
    expect(slotsOf(plan.sheets[0], 'back')).toEqual([2, 3]);
  });

  it('2 张纸 8 页：外层 [8|1]/[2|7]，内层 [6|3]/[4|5]', () => {
    const plan = impose(8, 'saddle', PAPER, PAGE);
    expect(slotsOf(plan.sheets[0], 'front')).toEqual([8, 1]);
    expect(slotsOf(plan.sheets[0], 'back')).toEqual([2, 7]);
    expect(slotsOf(plan.sheets[1], 'front')).toEqual([6, 3]);
    expect(slotsOf(plan.sheets[1], 'back')).toEqual([4, 5]);
  });

  it('3 张纸 12 页版位', () => {
    const plan = impose(12, 'saddle', PAPER, PAGE);
    expect(slotsOf(plan.sheets[0], 'front')).toEqual([12, 1]);
    expect(slotsOf(plan.sheets[0], 'back')).toEqual([2, 11]);
    expect(slotsOf(plan.sheets[1], 'front')).toEqual([10, 3]);
    expect(slotsOf(plan.sheets[1], 'back')).toEqual([4, 9]);
    expect(slotsOf(plan.sheets[2], 'front')).toEqual([8, 5]);
    expect(slotsOf(plan.sheets[2], 'back')).toEqual([6, 7]);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 16, 17, 20, 24, 33])(
    '骑马钉 %d 页折好后阅读顺序恒为 1..N',
    (n) => {
      const plan = impose(n, 'saddle', PAPER, PAGE);
      expect(foldReadingOrder(plan)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      expectValid(plan);
    },
  );

  it('补白版位在折好顺序中落在末尾（骑马钉的补白印在最外层纸，但折后位于书尾）', () => {
    const n = 6;
    const plan = impose(n, 'saddle', PAPER, PAGE);
    const withBlanks = foldReadingOrder(plan, true);
    expect(withBlanks.slice(0, n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(withBlanks.slice(n)).toEqual([null, null]);
  });
});

describe('胶装（perfect）摆版', () => {
  it('1 张纸 4 页：front=[4|1]，back=[2|3]', () => {
    const plan = impose(4, 'perfect', PAPER, PAGE);
    expect(slotsOf(plan.sheets[0], 'front')).toEqual([4, 1]);
    expect(slotsOf(plan.sheets[0], 'back')).toEqual([2, 3]);
  });

  it('2 张纸 8 页：逐张顺序成帖', () => {
    const plan = impose(8, 'perfect', PAPER, PAGE);
    expect(slotsOf(plan.sheets[0], 'front')).toEqual([4, 1]);
    expect(slotsOf(plan.sheets[0], 'back')).toEqual([2, 3]);
    expect(slotsOf(plan.sheets[1], 'front')).toEqual([8, 5]);
    expect(slotsOf(plan.sheets[1], 'back')).toEqual([6, 7]);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 16, 17, 20, 24, 33])(
    '胶装 %d 页折好后阅读顺序恒为 1..N',
    (n) => {
      const plan = impose(n, 'perfect', PAPER, PAGE);
      expect(foldReadingOrder(plan)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      expectValid(plan);
    },
  );

  it('补白在最末帖的尾部版位', () => {
    const plan = impose(5, 'perfect', PAPER, PAGE);
    // 第 2 帖：front=[补|5]，back=[6补|7补]
    expect(slotsOf(plan.sheets[1], 'front')).toEqual([null, 5]);
    expect(slotsOf(plan.sheets[1], 'back')).toEqual([null, null]);
    expect(foldReadingOrder(plan, true)).toEqual([1, 2, 3, 4, 5, null, null, null]);
  });
});

describe('换装订方式必须重排出不同的版位', () => {
  it('8 页时骑马钉外层与胶装第一帖不同（封面位置一致，封底版位随套帖变化）', () => {
    const saddle = impose(8, 'saddle', PAPER, PAGE);
    const perfect = impose(8, 'perfect', PAPER, PAGE);
    // 两种装订第 1 帖正面相同（封面/封底都在第一帖），骑马钉第 2 帖与胶装第 2 帖完全不同
    expect(slotsOf(saddle.sheets[1], 'front')).not.toEqual(slotsOf(perfect.sheets[1], 'front'));
    expect(slotsOf(saddle.sheets[1], 'back')).not.toEqual(slotsOf(perfect.sheets[1], 'back'));
  });
});

describe('纸张尺寸适配', () => {
  it('大纸横放尺寸自动规整为宽 ≥ 高', () => {
    const plan = impose(4, 'saddle', { widthMm: 297, heightMm: 420 }, PAGE);
    expect(plan.sheetWidthMm).toBe(420);
    expect(plan.sheetHeightMm).toBe(297);
  });

  it('半张放不下纵放页时 fits=false 并给出原因', () => {
    // A4 横向（297 宽）半张仅 148.5mm < A4 页宽 210
    const plan = impose(4, 'saddle', { widthMm: 297, heightMm: 210 }, PAGE);
    expect(plan.fits).toBe(false);
    expect(plan.fitIssue).toContain('放不下');
    const v = validateImposition(plan, PAGE);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.type === 'paper')).toBe(true);
  });

  it('改大纸张后 fits 转 true（换纸张要能重新排）', () => {
    const small = impose(4, 'saddle', { widthMm: 297, heightMm: 210 }, PAGE);
    const big = impose(4, 'saddle', { widthMm: 420, heightMm: 297 }, PAGE);
    expect(small.fits).toBe(false);
    expect(big.fits).toBe(true);
  });
});

describe('核对：漏页 / 重页 / 页序 / 补白 / 结构问题都要能抓出', () => {
  /** 手工构造一张纸（绕过 impose），便于注入错误 */
  function sheet(index: number, f: [number | null, number | null], b: [number | null, number | null]): ImpositionSheet {
    const mk = (p: number | null, pos: 'left' | 'right'): ImpositionSlot =>
      p === null ? { position: pos, pageNumber: null, blank: true } : { position: pos, pageNumber: p, blank: false };
    return {
      index,
      front: { side: 'front', slots: [mk(f[0], 'left'), mk(f[1], 'right')] },
      back: { side: 'back', slots: [mk(b[0], 'left'), mk(b[1], 'right')] },
    };
  }
  const basePlan = (sheets: ImpositionSheet[], body: number, blanks: number): ImpositionPlan => ({
    binding: 'perfect',
    sheets,
    bodyPageCount: body,
    totalPageCount: body + blanks,
    blankPageCount: blanks,
    sheetWidthMm: 420,
    sheetHeightMm: 297,
    fits: true,
  });

  it('漏页：缺第 2 页', () => {
    // front=[4|1], back=[3|3']... 构造一个漏掉 2 的方案
    const plan = basePlan([sheet(1, [4, 1], [3, 3])], 4, 0);
    const v = validateImposition(plan);
    expect(v.issues.some((i) => i.type === 'missing' && i.page === 2)).toBe(true);
    expect(v.issues.some((i) => i.type === 'duplicate' && i.page === 3)).toBe(true);
  });

  it('重页：第 1 页出现两次', () => {
    const plan = basePlan([sheet(1, [1, 1], [2, 3])], 4, 0);
    const v = validateImposition(plan);
    expect(v.issues.some((i) => i.type === 'duplicate' && i.page === 1)).toBe(true);
    expect(v.issues.some((i) => i.type === 'missing' && i.page === 4)).toBe(true);
  });

  it('页序错：版位调换导致折好顺序不对', () => {
    // 正确为 front=[4|1], back=[2|3]；把 back 左右对调 → 折后 1,3,2,4
    const plan = basePlan([sheet(1, [4, 1], [3, 2])], 4, 0);
    const v = validateImposition(plan);
    expect(v.issues.some((i) => i.type === 'order')).toBe(true);
  });

  it('越界页码报结构错', () => {
    const plan = basePlan([sheet(1, [9, 1], [2, 3])], 4, 0);
    const v = validateImposition(plan);
    expect(v.issues.some((i) => i.type === 'structure')).toBe(true);
    expect(v.issues.some((i) => i.type === 'missing' && i.page === 4)).toBe(true);
  });

  it('补白数量对不上 4 的倍数时报补白数量错', () => {
    const plan = basePlan([sheet(1, [4, 1], [2, 3])], 4, 1); // 声称补 1 页，总版 5
    const v = validateImposition(plan);
    expect(v.issues.some((i) => i.type === 'blank-count')).toBe(true);
  });

  it('空白页出现在正文之前报补白位置错', () => {
    // 正文 3 页应补 1 页在末尾（正确为 front=[补|1] back=[2|3]，补白在 front 左）。
    // 把补白放到 front 右（折后第 1 个读到的位置）→ 补白跑到了正文前面。
    const plan = basePlan([sheet(1, [1, null], [2, 3])], 3, 1);
    const v = validateImposition(plan);
    expect(v.issues.some((i) => i.type === 'blank-placement')).toBe(true);
  });

  it('大纸张数与总版数不符报结构错', () => {
    const plan: ImpositionPlan = { ...basePlan([sheet(1, [4, 1], [2, 3])], 8, 0) };
    const v = validateImposition(plan);
    expect(v.issues.some((i) => i.type === 'structure')).toBe(true);
    expect(v.issues.some((i) => i.type === 'missing')).toBe(true);
  });

  it('骑马钉错误摆法（按胶装摆）会被骑马钉阅读顺序抓到', () => {
    // 8 页若错误地用胶装式逐帖顺序摆，却声明为骑马钉 → 折后顺序错
    const s1 = sheet(1, [4, 1], [2, 3]);
    const s2 = sheet(2, [8, 5], [6, 7]);
    const plan: ImpositionPlan = { ...basePlan([s1, s2], 8, 0), binding: 'saddle' };
    const v = validateImposition(plan);
    expect(v.issues.some((i) => i.type === 'order')).toBe(true);
  });
});

describe('标注信息', () => {
  it('装订方式有中文名与折法说明', () => {
    expect(BINDING_LABELS.saddle).toBe('骑马钉');
    expect(BINDING_LABELS.perfect).toBe('胶装');
  });
});
