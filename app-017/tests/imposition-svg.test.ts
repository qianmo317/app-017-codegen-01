/**
 * 拼版大纸 SVG 渲染测试：真实 mm 尺寸、正反标识、折缝、补白标记、标记开关。
 */
import { describe, expect, it } from 'vitest';
import { convertText } from '../src/lib/convert';
import { layoutDocument } from '../src/lib/layout';
import { impose } from '../src/lib/imposition';
import { sheetSideSVG } from '../src/lib/imposition-svg';

const SETUP = {
  cellsPerLine: 32,
  linesPerPage: 25,
  doubleSided: true,
  marginMm: { top: 20, left: 15, right: 15 },
};
const PRINTER = {
  dotDiameterMm: 1.5,
  dotPitchMm: 2.5,
  cellPitchMm: 6.2,
  linePitchMm: 10,
  paperWidthMm: 210,
  paperHeightMm: 297,
};
const OPTS = { toneMode: 'all' as const, autoDetectPinyin: true, profile: 'zh-current' as const };

describe('拼版大纸 SVG 渲染', () => {
  it('含补白文档两种装订都能渲染每张大纸正反两面，尺寸为大纸真实尺寸', () => {
    const conv = convertText('特殊教育需要盲文教材。'.repeat(60), OPTS);
    const layout = layoutDocument(conv.paragraphs, SETUP, true);
    for (const binding of ['saddle', 'perfect'] as const) {
      const plan = impose(layout.pages.length, binding, { widthMm: 420, heightMm: 297 }, { widthMm: 210, heightMm: 297 });
      expect(plan.sheets.length).toBeGreaterThan(0);
      for (const sh of plan.sheets) {
        const f = sheetSideSVG(sh, 'front', plan, layout.pages, SETUP, PRINTER);
        const b = sheetSideSVG(sh, 'back', plan, layout.pages, SETUP, PRINTER);
        expect(f).toContain('width="420mm"');
        expect(f).toContain('height="297mm"');
        expect(f).toContain('沿此中缝对折');
        expect(f).toContain('正面 · 对折后朝外');
        expect(b).toContain('反面 · 对折后朝内');
        const hasBlank = [...sh.front.slots, ...sh.back.slots].some((s) => s.blank);
        if (hasBlank) expect(f + b).toContain('空白补页');
      }
    }
  });

  it('页码角标出现在正文版位上', () => {
    const conv = convertText('盲文测试内容', OPTS);
    const layout = layoutDocument(conv.paragraphs, SETUP, true);
    const plan = impose(4, 'saddle', { widthMm: 420, heightMm: 297 }, { widthMm: 210, heightMm: 297 });
    const f = sheetSideSVG(plan.sheets[0], 'front', plan, layout.pages, SETUP, PRINTER);
    // front=[4|1]
    expect(f).toContain('>4</text>');
    expect(f).toContain('>1</text>');
  });

  it('关闭核对标记时不输出折缝/角标/补白字样（实际印刷用）', () => {
    const conv = convertText('盲文测试', OPTS);
    const layout = layoutDocument(conv.paragraphs, SETUP, true);
    const plan = impose(6, 'saddle', { widthMm: 420, heightMm: 297 }, { widthMm: 210, heightMm: 297 });
    const svg = sheetSideSVG(plan.sheets[0], 'front', plan, layout.pages, SETUP, PRINTER, { showMarks: false });
    expect(svg).not.toContain('沿此中缝对折');
    expect(svg).not.toContain('空白补页');
    expect(svg).toContain('<svg');
  });
});
