/**
 * 拼版大纸渲染：一张大纸（横向）正反面各两个版位 → 真实 mm 尺寸 SVG。
 * 打印 100% 时，大纸上每半张即为一个正文页的真实大小。
 * 屏幕预览靠 CSS 等比缩放；折缝、页码角标、帖标、补白等标记便于一眼核对。
 */
import type { PageSetup, PrinterParams } from '../types';
import type { LayoutPage } from './layout';
import type { ImpositionPlan, ImpositionSheet, ImpositionSlot } from './imposition';
import { BINDING_LABELS } from './imposition';
import { pageBodySVG } from './svg';

export interface SheetSVGOptions {
  /** 印刷标记：中缝折线、页码角标、正/反面标识、帖标（咬口）、补白框 */
  showMarks?: boolean;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 单个版位内容（正文点阵或空白补页），slot 原点 = (x0,y0)，尺寸 pageW×pageH */
function slotSVG(
  slot: ImpositionSlot,
  x0: number,
  y0: number,
  pageW: number,
  pageH: number,
  pages: (LayoutPage | null)[],
  setup: PageSetup,
  printer: PrinterParams,
  showMarks: boolean,
): string {
  const parts: string[] = [];

  if (slot.blank) {
    if (showMarks) {
      parts.push(
        `<rect x="${x0 + 4}" y="${y0 + 4}" width="${Math.max(0, pageW - 8)}" height="${Math.max(0, pageH - 8)}" ` +
          `fill="none" stroke="#999" stroke-width="0.3" stroke-dasharray="2 2"/>`,
        `<text x="${x0 + pageW / 2}" y="${y0 + pageH / 2}" text-anchor="middle" font-family="sans-serif" ` +
          `font-size="6" fill="#777">空白补页</text>`,
        `<text x="${x0 + pageW / 2}" y="${y0 + pageH / 2 + 8}" text-anchor="middle" font-family="sans-serif" ` +
          `font-size="3.2" fill="#999">不占正文页码</text>`,
      );
    }
  } else {
    const page = slot.pageNumber !== null ? pages[slot.pageNumber - 1] : undefined;
    if (page) parts.push(pageBodySVG(page, setup, printer, { offsetX: x0, offsetY: y0 }));
    if (showMarks && slot.pageNumber !== null) {
      // 页码角标：印在版位外侧（距边 3mm），核对版位用
      const cx = x0 + (slot.position === 'left' ? 5 : pageW - 5);
      const anchor = slot.position === 'left' ? 'start' : 'end';
      parts.push(
        `<text x="${cx}" y="${y0 + 6}" text-anchor="${anchor}" font-family="sans-serif" font-size="4.5" ` +
          `font-weight="bold" fill="#b00">${slot.pageNumber}</text>`,
      );
    }
  }
  return parts.join('');
}

/** 一张大纸一个面 → SVG（mm） */
export function sheetSideSVG(
  sheet: ImpositionSheet,
  side: 'front' | 'back',
  plan: ImpositionPlan,
  pages: (LayoutPage | null)[],
  setup: PageSetup,
  printer: PrinterParams,
  opts: SheetSVGOptions = {},
): string {
  const showMarks = opts.showMarks ?? true;
  const W = plan.sheetWidthMm;
  const H = plan.sheetHeightMm;
  const pageW = printer.paperWidthMm;
  const pageH = printer.paperHeightMm;
  // 两页纵放并排：水平各占半张，垂直居中
  const y0 = Math.max(0, (H - pageH) / 2);
  const halfW = W / 2;
  const [left, right] = (side === 'front' ? sheet.front : sheet.back).slots;

  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff" stroke="#333" stroke-width="0.4"/>`);

  // 左半张：原点 0；右半张：原点 halfW
  parts.push(slotSVG(left, 0, y0, halfW, pageH, pages, setup, printer, showMarks));
  parts.push(slotSVG(right, halfW, y0, halfW, pageH, pages, setup, printer, showMarks));

  if (showMarks) {
    // 中缝折线（对折线）
    parts.push(
      `<line x1="${halfW}" y1="0" x2="${halfW}" y2="${H}" stroke="#1565c0" stroke-width="0.3" stroke-dasharray="3 2"/>`,
      `<text x="${halfW + 1.5}" y="10" font-family="sans-serif" font-size="3.5" fill="#1565c0">沿此中缝对折</text>`,
    );
    // 面标识：正面=对折后朝外；反面=对折后朝内
    const sideText =
      side === 'front'
        ? `正面 · 对折后朝外（第 ${sheet.index} 张）`
        : `反面 · 对折后朝内（第 ${sheet.index} 张）`;
    parts.push(
      `<text x="${W / 2}" y="${H - 4}" text-anchor="middle" font-family="sans-serif" font-size="4" fill="#333">${esc(sideText)}</text>`,
    );
    // 帖标（咬口记号）：帖号不同，帖标沿书脊方向错开，叠齐后从侧面即可核对帖序
    const markStep = 6;
    const markY = 14 + (sheet.index - 1) * markStep;
    parts.push(
      `<rect x="${halfW - 1}" y="${markY}" width="2" height="3" fill="#1565c0"/>` +
        `<text x="${halfW + 4}" y="${markY + 3}" font-family="sans-serif" font-size="3" fill="#1565c0">帖 ${sheet.index}</text>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" class="imposition-sheet" data-sheet="${sheet.index}" data-side="${side}">${parts.join('')}</svg>`;
}

/** 一张大纸两面都生成（先正后反） */
export function sheetToSVGs(
  sheet: ImpositionSheet,
  plan: ImpositionPlan,
  pages: (LayoutPage | null)[],
  setup: PageSetup,
  printer: PrinterParams,
  opts: SheetSVGOptions = {},
): { front: string; back: string } {
  return {
    front: sheetSideSVG(sheet, 'front', plan, pages, setup, printer, opts),
    back: sheetSideSVG(sheet, 'back', plan, pages, setup, printer, opts),
  };
}

export function bindingLabel(b: ImpositionPlan['binding']): string {
  return BINDING_LABELS[b];
}
