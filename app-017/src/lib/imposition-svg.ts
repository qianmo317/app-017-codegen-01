/**
 * 拼版大纸 SVG：每张纸正反面各一个横向 SVG，左右两槽各放一个折后页面的点阵。
 * - SVG 用户单位 = mm，width/height = 大纸真实尺寸，打印 100% 时即为真实大小；
 * - 输出顺序须为「第 k 张正面、第 k 张反面」交替，双面打印选「短边翻转」即与版面对齐；
 * - 辅助标注（折线、裁口、页码、正反/朝外提示）在 .imp-guides 组内，屏幕核对可见、打印自动隐藏。
 */
import type { PageSetup, PrinterParams } from '../types';
import type { LayoutPage } from './layout';
import { pageBodyMarkup } from './svg';
import type { ImpositionSheet, ImpositionSlot, SheetSize, SheetSide } from './imposition';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function guideText(x: number, y: number, text: string, size = 3.2, anchor: 'start' | 'middle' | 'end' = 'start') {
  return `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" text-anchor="${anchor}" fill="#888">${esc(text)}</text>`;
}

/**
 * 单面大纸 → SVG 字符串。
 * @param pageOf 正文页码（1 起）→ 排版页；补白槽查不到则留白
 * @param withGuides 是否含辅助标注（折线、裁口、页码、面别）；屏幕预览 true，导出独立文件 false
 */
export function sheetSideToSVG(
  sheet: ImpositionSheet,
  side: SheetSide,
  pageOf: (pageNumber: number) => LayoutPage | undefined,
  setup: PageSetup,
  printer: PrinterParams,
  sheetSize: SheetSize,
  withGuides = true,
): string {
  const slots: [ImpositionSlot, ImpositionSlot] = side === 'front' ? sheet.front : sheet.back;
  const halfW = sheetSize.widthMm / 2;
  const W = sheetSize.widthMm;
  const H = sheetSize.heightMm;
  const body: string[] = [];
  const guides: string[] = [];

  // 外框（仅辅助）
  guides.push(
    `<rect x="0.5" y="0.5" width="${(W - 1).toFixed(2)}" height="${(H - 1).toFixed(2)}" fill="none" stroke="#bbb" stroke-width="0.3" stroke-dasharray="2 1.5"/>`,
  );

  slots.forEach((sl, i) => {
    const ox = i * halfW; // 左槽偏移 0，右槽偏移半张宽
    if (sl.pageNumber !== null) {
      const page = pageOf(sl.pageNumber);
      if (page) body.push(pageBodyMarkup(page, setup, printer, ox, 0));
      // 页码标注（槽顶外角）
      guides.push(
        guideText(
          ox + (i === 0 ? 4 : halfW - 4),
          6,
          `第 ${sl.pageNumber} 页`,
          3.2,
          i === 0 ? 'start' : 'end',
        ),
      );
    } else {
      // 补白槽：屏幕上画浅灰提示，打印时随 guides 隐藏，实际留白
      guides.push(
        `<rect x="${ox + 8}" y="12" width="${(halfW - 16).toFixed(2)}" height="${(H - 24).toFixed(2)}" fill="none" stroke="#d9d9d9" stroke-width="0.3" stroke-dasharray="3 2"/>`,
        guideText(ox + halfW / 2, H / 2, '补白空白页（无正文页码）', 4, 'middle'),
      );
    }
  });

  // 中缝折线
  guides.push(
    `<line x1="${halfW}" y1="0" x2="${halfW}" y2="${H}" stroke="#b3261e" stroke-width="0.25" stroke-dasharray="4 2"/>`,
    guideText(halfW, H - 14, '折线（书脊）', 3.2, 'middle'),
  );
  // 左书脊口、右裁口标注
  guides.push(
    guideText(2, H - 4, '← 书脊折口', 3),
    guideText(W - 2, H - 4, '裁口（胶装三面裁切）→', 3, 'end'),
  );
  // 面别与朝向（放在底部中间，避开点阵）
  const faceLabel =
    side === 'front'
      ? `第 ${sheet.index} 张 · 正面（此面折起后朝外）`
      : `第 ${sheet.index} 张 · 反面（此面朝内，双面打印沿短边翻转）`;
  guides.push(guideText(halfW, H - 22, faceLabel, 3.4, 'middle'));

  const guideMarkup = withGuides ? `<g class="imp-guides">${guides.join('')}</g>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" class="braille-sheet" role="img" aria-label="${esc(faceLabel)}">` +
    body.join('') +
    guideMarkup +
    `</svg>`
  );
}

/** 整张纸 → { 正面 SVG, 反面 SVG }，按打印输出顺序排列 */
export function sheetToSVGs(
  sheet: ImpositionSheet,
  pageOf: (pageNumber: number) => LayoutPage | undefined,
  setup: PageSetup,
  printer: PrinterParams,
  sheetSize: SheetSize,
  withGuides = true,
): { front: string; back: string } {
  return {
    front: sheetSideToSVG(sheet, 'front', pageOf, setup, printer, sheetSize, withGuides),
    back: sheetSideToSVG(sheet, 'back', pageOf, setup, printer, sheetSize, withGuides),
  };
}
