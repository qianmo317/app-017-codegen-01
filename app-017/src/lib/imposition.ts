/**
 * 拼版（折手 / imposition）：把排好的正文页按装订方式摆到大纸上。
 *
 * 约定：
 * - 每张纸（sheet）正反两面（front 正面 / back 反面），每面横排 2 页（一张纸对折后为 4 个页面）；
 * - 骑马钉（saddle）：所有纸沿中缝对折后互相套在一起，骑钉。页码「外大内小」，
 *   最外一张正面 = 封底 | 封面；
 * - 胶装（perfect）：每张纸各自对折成一个书帖，书帖按顺序叠在一起铣背胶装、三面裁边，
 *   每帖 4 页（4k-3..4k）顺序拼版；
 * - 凑不满一张纸（页数非 4 的倍数）时在全书末尾补空白页；补白页没有正文页码，不占正文页码。
 *
 * 位置命名（俯视大纸，横向；沿中缝左半折到右半背后，折口在左 = 书脊，右边 = 裁口）：
 * - front 面（折后朝外）：FL 左 = 封底位（偶数页），FR 右 = 封面位（奇数页）；
 * - back  面（折后朝内）：BL 左 = 内页左（偶数页），BR 右 = 内页右（奇数页）。
 *
 * 一张纸对折后，front 面两个槽（FL/FR）都朝外（封面、封底），back 面两个槽（BL/BR）朝内（内页跨页）。
 */

export type BindingMode = 'saddle' | 'perfect';
export type SheetSide = 'front' | 'back';

export interface SheetSize {
  /** 大纸尺寸（mm），横向（宽 ≥ 高） */
  widthMm: number;
  heightMm: number;
}

export interface ImpositionSlot {
  /** 该槽在大纸上的位置 */
  side: SheetSide;
  position: 'left' | 'right';
  /** 正文页码（1 起）；补白空白页为 null */
  pageNumber: number | null;
  /** 末尾凑印张补出来的空白页（无正文页码） */
  blank: boolean;
  /** 折成书帖后该槽是否朝外（front 面 = 外封面/封底，back 面 = 内页） */
  outside: boolean;
}

export interface ImpositionSheet {
  /** 纸张序号（1 起，即印刷时大纸的先后顺序） */
  index: number;
  /** 骑马钉时从外到内的套帖序号（1 = 最外一张）；胶装时为书帖顺序（1 = 第一帖） */
  gathering: number;
  /** 正面两个槽（折后朝外），[左 FL, 右 FR] */
  front: [ImpositionSlot, ImpositionSlot];
  /** 反面两个槽（折后朝内），[左 BL, 右 BR] */
  back: [ImpositionSlot, ImpositionSlot];
  /** 该张含的正文页码（不含补白） */
  pageNumbers: number[];
  /** 该张是否含补白空白页 */
  hasBlanks: boolean;
  /** 该张是否为带封面的一帖（骑马钉最外一张 / 胶装第一帖） */
  coverSheet: boolean;
}

export interface ImpositionResult {
  binding: BindingMode;
  sheetSize: SheetSize;
  /** 正文页数（不含补白） */
  contentPageCount: number;
  /** 含补白的总页数（4 的倍数） */
  totalPageCount: number;
  /** 补白页数 */
  blankCount: number;
  /** 用纸张数 */
  sheetCount: number;
  sheets: ImpositionSheet[];
}

export type ImpositionIssueType =
  | 'missing'
  | 'duplicate'
  | 'out-of-order'
  | 'blank-mid-book'
  | 'orientation'
  | 'structure';

export interface ImpositionIssue {
  type: ImpositionIssueType;
  message: string;
  page?: number;
  sheet?: number;
}

export interface ImpositionVerification {
  ok: boolean;
  /** 警告（不影响版序正确，但需注意，如大纸尺寸装不下页面） */
  warnings: string[];
  issues: ImpositionIssue[];
  /** 按折书物理顺序读出的页码序列（漏页/重页核对依据，不含补白空位） */
  readingOrder: number[];
}

const PAGES_PER_SHEET = 4;

function slot(
  side: SheetSide,
  position: 'left' | 'right',
  pageNumber: number | null,
): ImpositionSlot {
  return { side, position, pageNumber, blank: pageNumber === null, outside: side === 'front' };
}

interface Quad {
  fl: number;
  fr: number;
  bl: number;
  br: number;
}

function buildSheet(
  binding: BindingMode,
  k: number,
  quad: Quad,
  contentCount: number,
  sheetSize: SheetSize,
): ImpositionSheet {
  const pick = (n: number): number | null => (n <= contentCount ? n : null);
  const nums = [quad.fl, quad.fr, quad.bl, quad.br].filter((n) => n <= contentCount);
  // 骑马钉最外一张、胶装第一帖带封面（FR = 第 1 页）
  const coverSheet = quad.fr === 1;
  return {
    index: k,
    gathering: k,
    front: [slot('front', 'left', pick(quad.fl)), slot('front', 'right', pick(quad.fr))],
    back: [slot('back', 'left', pick(quad.bl)), slot('back', 'right', pick(quad.br))],
    pageNumbers: nums,
    hasBlanks: nums.length < PAGES_PER_SHEET,
    coverSheet,
  };
}

/**
 * 骑马钉拼版。
 * N = 向上取整到 4 的倍数；第 k 张（从外到内，k=1 最外）：
 *   front: [N-2k+2 | 2k-1]   （FL 封底位，FR 封面位）
 *   back : [2k     | N-2k+1] （BL 内页左，BR 内页右）
 */
function imposeSaddle(contentCount: number, sheetSize: SheetSize): ImpositionResult {
  const total = Math.ceil(contentCount / PAGES_PER_SHEET) * PAGES_PER_SHEET;
  const sheetCount = total / PAGES_PER_SHEET;
  const sheets: ImpositionSheet[] = [];
  for (let k = 1; k <= sheetCount; k++) {
    sheets.push(
      buildSheet(
        'saddle',
        k,
        { fl: total - 2 * k + 2, fr: 2 * k - 1, bl: 2 * k, br: total - 2 * k + 1 },
        contentCount,
        sheetSize,
      ),
    );
  }
  return {
    binding: 'saddle',
    sheetSize,
    contentPageCount: contentCount,
    totalPageCount: total,
    blankCount: total - contentCount,
    sheetCount,
    sheets,
  };
}

/**
 * 胶装拼版。
 * 每张纸（书帖）装 4 个连续页：第 k 帖页面为 4k-3..4k：
 *   front: [4k | 4k-3]   （FL 本帖封底，FR 本帖封面）
 *   back : [4k-2 | 4k-1] （BL/BR 本帖内页跨页）
 * 补白空白页只可能落在最后一帖。
 */
function imposePerfect(contentCount: number, sheetSize: SheetSize): ImpositionResult {
  const total = Math.ceil(contentCount / PAGES_PER_SHEET) * PAGES_PER_SHEET;
  const sheetCount = total / PAGES_PER_SHEET;
  const sheets: ImpositionSheet[] = [];
  for (let k = 1; k <= sheetCount; k++) {
    sheets.push(
      buildSheet(
        'perfect',
        k,
        { fl: 4 * k, fr: 4 * k - 3, bl: 4 * k - 2, br: 4 * k - 1 },
        contentCount,
        sheetSize,
      ),
    );
  }
  return {
    binding: 'perfect',
    sheetSize,
    contentPageCount: contentCount,
    totalPageCount: total,
    blankCount: total - contentCount,
    sheetCount,
    sheets,
  };
}

/** 正文页数 + 装订方式 + 大纸尺寸 → 拼版结果 */
export function imposeDocument(
  contentPageCount: number,
  binding: BindingMode,
  sheetSize: SheetSize,
): ImpositionResult {
  const size = {
    widthMm: Math.abs(sheetSize.widthMm) || 0,
    heightMm: Math.abs(sheetSize.heightMm) || 0,
  };
  if (contentPageCount <= 0) {
    return {
      binding,
      sheetSize: size,
      contentPageCount: 0,
      totalPageCount: 0,
      blankCount: 0,
      sheetCount: 0,
      sheets: [],
    };
  }
  return binding === 'saddle' ? imposeSaddle(contentPageCount, size) : imposePerfect(contentPageCount, size);
}

/**
 * 模拟装订后翻书：按折书物理结构读出页码序列，应为 1..N（补白页位置为 null）。
 *
 * 一张对折纸从正面到背面的层序为：FR（外封面）→ BL（内页左）→ BR（内页右）→ FL（外封底）。
 * - 骑马钉：帖互相嵌套——从外到内各取 [FR, BL]，再从内到外各取 [BR, FL]；
 * - 胶装：书帖前后叠放，每帖按 [FR, BL, BR, FL] 读。
 */
export function physicalReadingOrder(result: ImpositionResult): (number | null)[] {
  const seq: (number | null)[] = [];
  if (result.binding === 'saddle') {
    for (const s of result.sheets) seq.push(s.front[1].pageNumber, s.back[0].pageNumber);
    for (let i = result.sheets.length - 1; i >= 0; i--) {
      const s = result.sheets[i];
      seq.push(s.back[1].pageNumber, s.front[0].pageNumber);
    }
  } else {
    for (const s of result.sheets) {
      seq.push(s.front[1].pageNumber, s.back[0].pageNumber, s.back[1].pageNumber, s.front[0].pageNumber);
    }
  }
  return seq;
}

/**
 * 核对拼版结果：
 * - 漏页：1..N 中某页未出现；
 * - 重页：某正文页在多个槽出现；
 * - 页序：折成书后物理翻读顺序必须是 1..N；
 * - 补白：空白页只能出现在全书末尾，不得夹在正文页之间；
 * - 朝向：左槽只放偶数页、右槽只放奇数页（双面沿短边翻转后页眉方向一致）；
 * - 结构：总页数为 4 的倍数、张数自洽。
 *
 * @param pageSizeMm 单个折后页面的实际尺寸（如打印机纸张竖版宽高），用于大纸装不装得下的警告
 */
export function verifyImposition(
  result: ImpositionResult,
  pageSizeMm?: { widthMm: number; heightMm: number },
): ImpositionVerification {
  const issues: ImpositionIssue[] = [];
  const warnings: string[] = [];

  // 1. 结构自洽 + 朝向（按槽在大纸上的实际位置：左偶右奇），并收集出现页
  const seen = new Map<number, number>();
  for (const sheet of result.sheets) {
    const checkSide = (side: SheetSide, slots: [ImpositionSlot, ImpositionSlot]) => {
      slots.forEach((sl, i) => {
        const position: 'left' | 'right' = i === 0 ? 'left' : 'right';
        // 元数据与实际摆放位置不一致 = 该槽数据损坏
        if (sl.side !== side || sl.position !== position) {
          issues.push({
            type: 'structure',
            message: `第 ${sheet.index} 张${side === 'front' ? '正' : '反'}面${position}槽的位置标注损坏`,
            sheet: sheet.index,
          });
        }
        if (sl.blank !== (sl.pageNumber === null)) {
          issues.push({
            type: 'structure',
            message: `第 ${sheet.index} 张${side === 'front' ? '正' : '反'}面${position}槽的空白标注与页码不一致`,
            page: sl.pageNumber ?? undefined,
            sheet: sheet.index,
          });
        }
        if (sl.pageNumber === null) return;
        seen.set(sl.pageNumber, (seen.get(sl.pageNumber) ?? 0) + 1);
        const isOdd = sl.pageNumber % 2 === 1;
        if (position === 'left' && isOdd) {
          issues.push({
            type: 'orientation',
            message: `第 ${sheet.index} 张${side === 'front' ? '正' : '反'}面左槽出现奇数页 ${sl.pageNumber}，左槽应为偶数页（双面翻转方向错误）`,
            page: sl.pageNumber,
            sheet: sheet.index,
          });
        }
        if (position === 'right' && !isOdd) {
          issues.push({
            type: 'orientation',
            message: `第 ${sheet.index} 张${side === 'front' ? '正' : '反'}面右槽出现偶数页 ${sl.pageNumber}，右槽应为奇数页（双面翻转方向错误）`,
            page: sl.pageNumber,
            sheet: sheet.index,
          });
        }
      });
    };
    checkSide('front', sheet.front);
    checkSide('back', sheet.back);
  }

  // 2. 重页
  for (const [page, times] of seen) {
    if (times > 1) {
      issues.push({ type: 'duplicate', message: `第 ${page} 页在大纸上出现 ${times} 次（重页）`, page });
    }
  }

  // 3. 漏页
  for (let p = 1; p <= result.contentPageCount; p++) {
    if (!seen.has(p)) issues.push({ type: 'missing', message: `第 ${p} 页未出现在任何大纸上（漏页）`, page: p });
  }

  // 4. 页序：折书物理翻读顺序必须严格 1..N
  const order = physicalReadingOrder(result);
  let expected = 1;
  order.forEach((p, i) => {
    if (p === null) return; // 补白位置由下一项检查
    if (p !== expected) {
      issues.push({
        type: 'out-of-order',
        message: `折书后第 ${i + 1} 个读到的是第 ${p} 页，应为第 ${expected} 页（页序错误）`,
        page: p,
      });
    }
    expected = p + 1;
  });

  // 5. 补白位置：翻读序列中出现空白后，其后不得再有正文页（空白只能在全书末尾）
  let nullSeen = false;
  for (const p of order) {
    if (p === null) {
      nullSeen = true;
    } else if (nullSeen) {
      issues.push({
        type: 'blank-mid-book',
        message: `第 ${p} 页排在补白空白页之后，补白只能位于全书末尾`,
        page: p,
      });
      nullSeen = false;
    }
  }

  // 6. 张数 / 总数自洽
  if (result.totalPageCount % PAGES_PER_SHEET !== 0) {
    issues.push({
      type: 'structure',
      message: `总页数 ${result.totalPageCount} 不是 4 的倍数，每张纸 4 页无法排满`,
    });
  }
  if (result.sheetCount !== result.sheets.length) {
    issues.push({
      type: 'structure',
      message: `标注用纸 ${result.sheetCount} 张，实际排出 ${result.sheets.length} 张`,
    });
  }
  if (result.blankCount !== result.totalPageCount - result.contentPageCount) {
    issues.push({ type: 'structure', message: '补白页数与总页数/正文页数不一致' });
  }

  // 7. 大纸装得下两个折后页面（警告，不阻断）
  if (pageSizeMm && result.sheetSize.widthMm > 0 && result.sheetSize.heightMm > 0) {
    const needW = pageSizeMm.widthMm * 2;
    const needH = pageSizeMm.heightMm;
    if (result.sheetSize.widthMm + 0.01 < needW || result.sheetSize.heightMm + 0.01 < needH) {
      warnings.push(
        `大纸 ${result.sheetSize.widthMm}×${result.sheetSize.heightMm}mm 装不下两页 ${pageSizeMm.widthMm}×${pageSizeMm.heightMm}mm（需要至少 ${needW}×${needH}mm），请换大纸`,
      );
    }
  }

  return {
    ok: issues.length === 0,
    warnings,
    issues,
    readingOrder: order.filter((p): p is number => p !== null),
  };
}

/** 常用大纸尺寸（横向，mm） */
export const SHEET_PRESETS: { id: string; label: string; size: SheetSize }[] = [
  { id: 'a3-landscape', label: 'A3 横向（420×297mm，A4 双联）', size: { widthMm: 420, heightMm: 297 } },
  { id: 'a4-landscape', label: 'A4 横向（297×210mm，A5 双联）', size: { widthMm: 297, heightMm: 210 } },
  { id: 'a2-landscape', label: 'A2 横向（594×420mm，A3 双联）', size: { widthMm: 594, heightMm: 420 } },
  { id: 'custom', label: '自定义尺寸', size: { widthMm: 420, heightMm: 297 } },
];

export const BINDING_LABELS: Record<BindingMode, string> = {
  saddle: '骑马钉（套帖对折，沿中缝骑钉）',
  perfect: '胶装（书帖叠放，铣背胶装后三面裁边）',
};
