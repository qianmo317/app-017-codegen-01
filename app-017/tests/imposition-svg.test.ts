/**
 * 拼版大纸 SVG 输出测试：
 * - 大纸真实尺寸（mm）、左右槽各放对页点阵；
 * - 辅助标注屏幕可见、导出版本不含；
 * - 输出顺序正反交替，可双面打印。
 */
import { describe, expect, it } from 'vitest';
import { convertText } from '../src/lib/convert';
import { layoutDocument } from '../src/lib/layout';
import { imposeDocument } from '../src/lib/imposition';
import { sheetToSVGs, sheetSideToSVG } from '../src/lib/imposition-svg';
import type { PageSetup, PrinterParams } from '../src/types';

const OPTS = { toneMode: 'all' as const, autoDetectPinyin: true, profile: 'zh-current' as const };
const SETUP: PageSetup = { cellsPerLine: 32, linesPerPage: 25, doubleSided: false, marginMm: { top: 20, left: 15, right: 15 } };
const PRINTER: PrinterParams = {
  dotDiameterMm: 1.5,
  dotPitchMm: 2.5,
  cellPitchMm: 6.2,
  linePitchMm: 10,
  paperWidthMm: 210,
  paperHeightMm: 297,
};
const A3 = { widthMm: 420, heightMm: 297 };

function makePages(repeats: number) {
  const text = '特殊教育学校开展盲文教学需要大量点字教材。'.repeat(repeats);
  const conv = convertText(text, OPTS);
  return layoutDocument(conv.paragraphs, SETUP, true).pages;
}

describe('拼版大纸 SVG', () => {
  it('SVG 尺寸 = 大纸 mm 尺寸，viewBox 双联', () => {
    const pages = makePages(110); // 8 页
    const r = imposeDocument(pages.length, 'saddle', A3);
    const pageOf = (n: number) => pages[n - 1];
    const svg = sheetSideToSVG(r.sheets[0], 'front', pageOf, SETUP, PRINTER, A3);
    expect(svg).toContain('width="420mm"');
    expect(svg).toContain('height="297mm"');
    expect(svg).toContain('viewBox="0 0 420 297"');
    expect(svg).toContain('class="braille-sheet"');
  });

  it('最外一张正面：左槽为第 8 页点阵（x≈左边距），右槽为第 1 页点阵（x≥半张宽）', () => {
    const pages = makePages(110);
    const r = imposeDocument(8, 'saddle', A3);
    const pageOf = (n: number) => pages[n - 1];
    const svg = sheetSideToSVG(r.sheets[0], 'front', pageOf, SETUP, PRINTER, A3);
    // 右槽起点 x 坐标 = 210 + 左边距 15 = 225
    expect(svg).toContain('cx="225.000"');
    // 左槽起点 x = 15
    expect(svg).toContain('cx="15.000"');
    // 折线在中缝 210mm
    expect(svg).toContain('x1="210"');
  });

  it('屏幕预览含辅助标注组（折线、面别、页码、裁口）', () => {
    const pages = makePages(80); // 6 页
    const r = imposeDocument(6, 'saddle', A3);
    const pageOf = (n: number) => pages[n - 1];
    const front = sheetSideToSVG(r.sheets[0], 'front', pageOf, SETUP, PRINTER, A3, true);
    expect(front).toContain('class="imp-guides"');
    expect(front).toContain('补白空白页（无正文页码）');
    expect(front).toContain('正面（此面折起后朝外）');
    expect(front).toContain('折线（书脊）');
    expect(front).toContain('裁口');
    const back = sheetSideToSVG(r.sheets[0], 'back', pageOf, SETUP, PRINTER, A3, true);
    expect(back).toContain('反面（此面朝内，双面打印沿短边翻转）');
  });

  it('导出版本（withGuides=false）不含任何辅助标注，补白槽完全留白', () => {
    const pages = makePages(80); // 6 页
    const r = imposeDocument(6, 'saddle', A3);
    const pageOf = (n: number) => pages[n - 1];
    const front = sheetSideToSVG(r.sheets[0], 'front', pageOf, SETUP, PRINTER, A3, false);
    expect(front).not.toContain('imp-guides');
    expect(front).not.toContain('补白');
    expect(front).not.toContain('折线');
    // 第 1 页点阵仍在
    expect(front).toContain('<circle');
  });

  it('每张纸输出正反两个 SVG，页面内容不同（正/反放的页不同）', () => {
    const pages = makePages(110);
    const r = imposeDocument(8, 'saddle', A3);
    const pageOf = (n: number) => pages[n - 1];
    const { front, back } = sheetToSVGs(r.sheets[0], pageOf, SETUP, PRINTER, A3, false);
    expect(front).not.toBe(back);
    expect(front).toContain('aria-label="第 1 张 · 正面');
    expect(back).toContain('aria-label="第 1 张 · 反面');
  });

  it('胶装与骑马钉同样可生成全部大纸 SVG，纸张数量与拼版一致', () => {
    const pages = makePages(80); // 6 页
    for (const mode of ['saddle', 'perfect'] as const) {
      const r = imposeDocument(6, mode, A3);
      const pageOf = (n: number) => pages[n - 1];
      const pairs = r.sheets.map((s) => sheetToSVGs(s, pageOf, SETUP, PRINTER, A3));
      expect(pairs).toHaveLength(r.sheetCount);
      pairs.forEach(({ front, back }) => {
        expect(front).toContain('width="420mm"');
        expect(back).toContain('width="420mm"');
      });
    }
  });
});
