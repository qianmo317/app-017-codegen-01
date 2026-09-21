/**
 * 拼版 / 折手（imposition）：把排好的正文页按装订方式摆到大纸上。
 *
 * 模型（一张大纸 = 一个 sheet，正反面各印 2 页，沿竖向中缝对折后成 1 个书帖 4 页）：
 * - 每张纸正面（front，对折后朝外）：左、右两个版位；反面（back，对折后朝内）：左、右两个版位。
 * - 骑马钉（saddle）：所有纸套在同一道书脊折缝里，从外到内依次套帖；
 *   最外层纸放第 1 页与最后一帖页（封面/封底一侧）。
 * - 胶装（perfect）：纸一张张叠起来（本实现按单纸 4 页成帖），从第 1 页起顺序成帖，
 *   折口侧统一铣背胶装、裁边成书。
 * - 凑不满一张纸（正文页数不是 4 的倍数）时在书的末尾补空白页，
 *   补出来的空白页 blank=true、不带正文页码（pageNumber 为 null），不计入正文页。
 *
 * 单面页位与折页顺序（一张纸 4 页）：
 *   front=[第4页 | 第1页]，back=[第2页 | 第3页]
 *   对折后阅读顺序：front.右 → back.左 → back.右 → front.左 = 1,2,3,4。
 * 双面打印翻向：横向大纸、竖缝对折时，正反面沿竖轴翻面（打印机选「短边翻页」）对齐。
 */

/** 装订方式 */
export type Binding = 'saddle' | 'perfect';

/** 纸面：front=正面（对折后朝外）；back=反面（对折后朝内） */
export type SheetSide = 'front' | 'back';

/** 版位：对折竖缝的左 / 右 */
export type SlotPosition = 'left' | 'right';

/** 一个版位上放的页 */
export interface ImpositionSlot {
  /** 版位：竖缝左 / 右 */
  position: SlotPosition;
  /** 正文页码（1 起）；空白补页为 null */
  pageNumber: number | null;
  /** 是否为凑帖补出的空白页（不占正文页码） */
  blank: boolean;
}

/** 一张大纸的一个面 */
export interface ImpositionSide {
  side: SheetSide;
  /** 沿纸进纸方向从左到右两个版位（index 0=左，1=右） */
  slots: [ImpositionSlot, ImpositionSlot];
}

/** 一张大纸（正反面） */
export interface ImpositionSheet {
  /** 帖序号，1 起：骑马钉=从最外层向内；胶装=从正文首页向后 */
  index: number;
  /** 正面（朝外面）：对折后这一面朝向书的外侧（含封面/封底一侧） */
  front: ImpositionSide;
  /** 反面（朝里面）：对折后朝向书的内侧（书心两页） */
  back: ImpositionSide;
}

/** 拼版结果 */
export interface ImpositionPlan {
  binding: Binding;
  sheets: ImpositionSheet[];
  /** 正文页数（不含补白） */
  bodyPageCount: number;
  /** 含补白在内的总版数（4 的倍数） */
  totalPageCount: number;
  /** 末尾补出的空白页数（0-3） */
  blankPageCount: number;
  /** 大纸尺寸（mm），横向：宽 >= 高 */
  sheetWidthMm: number;
  sheetHeightMm: number;
  /** 大纸能否并排放下两页（每半张 >= 对应纵放页尺寸） */
  fits: boolean;
  /** 放不下的原因（fits=false 时给出） */
  fitIssue?: string;
}

/** 校验问题 */
export type ImpositionIssueType =
  | 'missing' // 漏页：某正文页没被摆上
  | 'duplicate' // 重页：同一正文页被摆了不止一次
  | 'order' // 页序错：按装订折好还原后，页码不连续递增
  | 'blank-count' // 补白数量不对（应为 0-3 且凑满 4 的倍数）
  | 'blank-placement' // 空白页出现在正文页之前（补白必须在末尾）
  | 'structure' // 结构错：纸/面/版位数量不对，或缺版位、页码越界
  | 'paper'; // 纸张问题：当前大纸放不下两页

export interface ImpositionIssue {
  type: ImpositionIssueType;
  message: string;
  /** 相关帖号（如有） */
  sheet?: number;
  /** 相关正文页码（如有） */
  page?: number;
}

export interface ImpositionValidation {
  ok: boolean;
  issues: ImpositionIssue[];
  /** 实际摆上的正文页（去重前出现顺序） */
  placedPages: number[];
  /** 折好还原后的阅读顺序（页码；补白位置跳过） */
  readingOrder: number[];
}

const SIDES: SheetSide[] = ['front', 'back'];

/** 空白版位 */
function blankSlot(position: SlotPosition): ImpositionSlot {
  return { position, pageNumber: null, blank: true };
}

/** 正文版位 */
function pageSlot(position: SlotPosition, pageNumber: number): ImpositionSlot {
  return { position, pageNumber, blank: false };
}

/**
 * 取「横向大纸」尺寸：宽度不小于高度（竖向中缝对折）。
 * 无论用户输入的大纸是纵放还是横放，拼版一律按横向大纸计算。
 */
export function landscapeSize(widthMm: number, heightMm: number): { w: number; h: number } {
  return { w: Math.max(widthMm, heightMm), h: Math.min(widthMm, heightMm) };
}

/**
 * 拼版主入口：正文页数 + 装订方式 + 大纸（与单页）尺寸 → 大纸摆放方案。
 * 换装订方式或改纸张/页面大小后重新调用本函数即可整版重排。
 */
export function impose(
  bodyPageCount: number,
  binding: Binding,
  paper: { widthMm: number; heightMm: number },
  page: { widthMm: number; heightMm: number },
): ImpositionPlan {
  const n = Math.max(0, Math.floor(bodyPageCount));
  const blankPageCount = (4 - (n % 4)) % 4;
  const totalPageCount = n + blankPageCount;
  const sheetCount = totalPageCount / 4;
  const { w, h } = landscapeSize(paper.widthMm, paper.heightMm);

  /** 版位号（1..total）：超出正文页数的版位放补白 */
  const slotOf = (edition: number, pos: SlotPosition): ImpositionSlot =>
    edition > n ? blankSlot(pos) : pageSlot(pos, edition);

  const sheets: ImpositionSheet[] = [];
  for (let s = 0; s < sheetCount; s++) {
    let front: [number, number];
    let back: [number, number];

    if (binding === 'saddle') {
      // 骑马钉：从最外层（index=1）向内套帖，每向内一层，前后版位各向书心收 2。
      // front=[总版-2s | 1+2s]，back=[2+2s | 总版-1-2s]（s 从 0 起）。
      const lo = 2 * s;
      front = [totalPageCount - lo, lo + 1];
      back = [lo + 2, totalPageCount - lo - 1];
    } else {
      // 胶装：逐张叠放，每张 4 页顺序成帖（首页所在张在最上面）。
      const base = 4 * s;
      front = [base + 4, base + 1];
      back = [base + 2, base + 3];
    }

    sheets.push({
      index: s + 1,
      front: { side: 'front', slots: [slotOf(front[0], 'left'), slotOf(front[1], 'right')] },
      back: { side: 'back', slots: [slotOf(back[0], 'left'), slotOf(back[1], 'right')] },
    });
  }

  // 大纸横放后，每半张要放得下一页（页纵放：半张宽 ≥ 页宽 且 半张高 ≥ 页高）
  const halfW = w / 2;
  const fits = halfW >= page.widthMm && h >= page.heightMm;

  return {
    binding,
    sheets,
    bodyPageCount: n,
    totalPageCount,
    blankPageCount,
    sheetWidthMm: w,
    sheetHeightMm: h,
    fits,
    fitIssue: fits
      ? undefined
      : `大纸 ${w}×${h}mm 横放后每半张仅 ${halfW.toFixed(0)}×${h}mm，放不下 ${page.widthMm}×${page.heightMm}mm 的页，请换更大的纸或缩小页面`,
  };
}

/**
 * 折好还原后的阅读顺序（仅正文页码，补白跳过）。
 *
 * 一张对折纸 4 个版位的物理阅读次序：
 *   front.右 → back.左 → back.右 → front.左
 * - 胶装：帖从第 1 页起依次叠放 → 帖按 index 升序，每帖走上述 4 个位。
 * - 骑马钉：外层帖的外叶先读、内叶最后读，中间夹着全部内层帖 →
 *   前半叶按帖 index 升序取 front.右、back.左；
 *   后半叶按帖 index 降序取 back.右、front.左。
 */
export function foldReadingOrder(plan: ImpositionPlan, includeBlanks?: false): number[];
export function foldReadingOrder(plan: ImpositionPlan, includeBlanks: true): (number | null)[];
export function foldReadingOrder(plan: ImpositionPlan, includeBlanks = false): (number | null)[] {
  const pick = (sheet: ImpositionSheet, side: SheetSide, pos: SlotPosition): number | null => {
    const slot = (side === 'front' ? sheet.front : sheet.back).slots.find((x) => x.position === pos)!;
    return slot.blank ? null : slot.pageNumber;
  };

  const raw: (number | null)[] = [];
  if (plan.binding === 'saddle') {
    for (const sheet of plan.sheets) {
      raw.push(pick(sheet, 'front', 'right'), pick(sheet, 'back', 'left'));
    }
    for (let i = plan.sheets.length - 1; i >= 0; i--) {
      const sheet = plan.sheets[i];
      raw.push(pick(sheet, 'back', 'right'), pick(sheet, 'front', 'left'));
    }
  } else {
    for (const sheet of plan.sheets) {
      raw.push(
        pick(sheet, 'front', 'right'),
        pick(sheet, 'back', 'left'),
        pick(sheet, 'back', 'right'),
        pick(sheet, 'front', 'left'),
      );
    }
  }
  return includeBlanks ? raw : raw.filter((x): x is number => x !== null);
}

/**
 * 核对拼版结果：漏页、重页、页序（折好还原后必须为 1..N 递增）、
 * 补白数量与位置、纸/面/版位结构、纸张适配。
 * 纯只读校验，不依赖生成过程 —— 任何摆法错误都会在这里被抓出来。
 */
export function validateImposition(
  plan: ImpositionPlan,
  page?: { widthMm: number; heightMm: number },
): ImpositionValidation {
  const issues: ImpositionIssue[] = [];
  const placedPages: number[] = [];

  const expectedSheets = plan.totalPageCount / 4;
  if (plan.sheets.length !== expectedSheets) {
    issues.push({
      type: 'structure',
      message: `大纸张数应为 ${expectedSheets}（总版数 ${plan.totalPageCount} ÷ 4），实际 ${plan.sheets.length}`,
    });
  }
  if (![0, 1, 2, 3].includes(plan.blankPageCount) || (plan.bodyPageCount + plan.blankPageCount) % 4 !== 0) {
    issues.push({
      type: 'blank-count',
      message: `补白数量 ${plan.blankPageCount} 不能把总版数凑成 4 的倍数（正文 ${plan.bodyPageCount} 页）`,
    });
  }

  for (const sheet of plan.sheets) {
    for (const sideName of SIDES) {
      const side = sideName === 'front' ? sheet.front : sheet.back;
      if (side.side !== sideName) {
        issues.push({ type: 'structure', sheet: sheet.index, message: `第 ${sheet.index} 张大纸面标记错误` });
      }
      if (side.slots.length !== 2) {
        issues.push({
          type: 'structure',
          sheet: sheet.index,
          message: `第 ${sheet.index} 张${sideName === 'front' ? '正' : '反'}面应有 2 个版位，实际 ${side.slots.length}`,
        });
        continue;
      }
      if (side.slots[0].position !== 'left' || side.slots[1].position !== 'right') {
        issues.push({
          type: 'structure',
          sheet: sheet.index,
          message: `第 ${sheet.index} 张${sideName === 'front' ? '正' : '反'}面版位顺序应为 左→右`,
        });
      }
      for (const slot of side.slots) {
        if (slot.blank) {
          if (slot.pageNumber !== null) {
            issues.push({
              type: 'structure',
              sheet: sheet.index,
              message: '空白补页不应带正文页码',
            });
          }
          continue;
        }
        const p = slot.pageNumber;
        if (p === null) {
          issues.push({ type: 'structure', sheet: sheet.index, message: '存在既不是正文页也不是空白页的版位' });
          continue;
        }
        if (p < 1 || p > plan.bodyPageCount) {
          issues.push({
            type: 'structure',
            sheet: sheet.index,
            page: p,
            message: `第 ${sheet.index} 张大纸出现越界页码 ${p}（正文仅 ${plan.bodyPageCount} 页）`,
          });
          continue;
        }
        placedPages.push(p);
      }
    }
  }

  // 重页
  const counts = new Map<number, number>();
  for (const p of placedPages) counts.set(p, (counts.get(p) ?? 0) + 1);
  for (const [p, c] of counts) {
    if (c > 1) issues.push({ type: 'duplicate', page: p, message: `第 ${p} 页被摆了 ${c} 次（重页）` });
  }

  // 漏页
  for (let p = 1; p <= plan.bodyPageCount; p++) {
    if (!counts.has(p)) issues.push({ type: 'missing', page: p, message: `第 ${p} 页没有摆上任何大纸（漏页）` });
  }

  // 补白位置 + 页序（同一份折好序列上的严格位置校验）：
  // 折好后第 i 个位置必须严格等于「i < 正文页数 ? 第 i+1 页 : 空白」。
  // 只检查“正文递增”无法发现“空白跑到前面但折后被挤出尾位”的摆法错误，
  // 因此这里连补白所在的物理位置一并核对。
  const foldedWithBlanks = foldReadingOrder(plan, true);
  if (foldedWithBlanks.length !== plan.totalPageCount) {
    issues.push({
      type: 'structure',
      message: `折好后版位数 ${foldedWithBlanks.length} 与总版数 ${plan.totalPageCount} 不符`,
    });
  }
  let orderReported = false;
  for (let i = 0; i < foldedWithBlanks.length; i++) {
    const got = foldedWithBlanks[i];
    if (i < plan.bodyPageCount) {
      // 该位置必须是正文第 i+1 页
      if (got === null) {
        // 正文位置上却是空白 → 补白跑到了正文前面
        issues.push({
          type: 'blank-placement',
          message: `折好后第 ${i + 1} 个位置应是正文第 ${i + 1} 页，却是空白补页；补白只能补在全书末尾`,
        });
      } else if (got !== i + 1) {
        if (!orderReported) {
          issues.push({
            type: 'order',
            page: got,
            message: `折好后第 ${i + 1} 个读到的应是第 ${i + 1} 页，实际是第 ${got} 页（页序错误）`,
          });
          orderReported = true;
        }
      }
    } else if (got !== null) {
      // 末尾补白位置上却放了正文页
      issues.push({
        type: 'blank-placement',
        page: got ?? undefined,
        message: `第 ${got} 页排在了末尾补白位置；补白只能补在全书最后 ${plan.blankPageCount} 个版位`,
      });
    }
  }
  const blankCountFolded = foldedWithBlanks.filter((p) => p === null).length;
  if (blankCountFolded !== plan.blankPageCount) {
    issues.push({
      type: 'blank-count',
      message: `折好后实际补白 ${blankCountFolded} 页，与方案记录的 ${plan.blankPageCount} 页不符`,
    });
  }

  const readingOrder = foldReadingOrder(plan);
  if (readingOrder.length !== plan.bodyPageCount) {
    issues.push({
      type: 'blank-count',
      message: `折好后读到的正文版位数 ${readingOrder.length} 与正文页数 ${plan.bodyPageCount} 不一致`,
    });
  }

  // 纸张适配
  if (!plan.fits) issues.push({ type: 'paper', message: plan.fitIssue ?? '当前大纸放不下两页' });
  if (page) {
    const { w, h } = landscapeSize(plan.sheetWidthMm, plan.sheetHeightMm);
    if ((w / 2 < page.widthMm || h < page.heightMm) && plan.fits) {
      issues.push({ type: 'paper', message: '方案标注为可容纳，但按尺寸复核放不下两页' });
    }
  }

  return { ok: issues.length === 0, issues, placedPages, readingOrder };
}

/** 装订方式的中文说明（供界面展示折法） */
export const BINDING_LABELS: Record<Binding, string> = {
  saddle: '骑马钉',
  perfect: '胶装',
};

export const BINDING_DESCRIPTIONS: Record<Binding, string> = {
  saddle: '一张大纸正反各印两页，所有纸沿同一道书脊中缝对折后从外到内套帖，订书钉从折缝钉入。',
  perfect: '一张大纸正反各印两页、对折成帖，许多帖依次叠齐，折口侧统一铣背胶装、裁边成书。',
};
