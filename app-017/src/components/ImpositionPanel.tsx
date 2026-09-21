import { useEffect, useMemo, useState } from 'react';
import type { PageSetup, PrinterParams } from '../types';
import type { LayoutPage } from '../lib/layout';
import {
  imposeDocument,
  verifyImposition,
  physicalReadingOrder,
  SHEET_PRESETS,
  BINDING_LABELS,
  type BindingMode,
  type ImpositionResult,
  type ImpositionSheet,
  type ImpositionSlot,
  type SheetSize,
} from '../lib/imposition';
import { sheetToSVGs } from '../lib/imposition-svg';
import { downloadBlob, svgToPngBlob } from '../lib/png';

interface Props {
  pages: LayoutPage[];
  setup: PageSetup;
  printer: PrinterParams;
  docTitle: string;
  exportLocked: boolean;
}

const POS_NAME = { left: '左', right: '右' } as const;

function SlotBox({ sl }: { sl: ImpositionSlot }) {
  return (
    <div
      className={`imp-slot ${sl.blank ? 'is-blank' : ''} ${sl.outside ? 'is-outside' : ''}`}
      role="cell"
      aria-label={
        sl.blank
          ? `${sl.side === 'front' ? '正面' : '反面'}${POS_NAME[sl.position]}槽：补白空白页，不占正文页码`
          : `${sl.side === 'front' ? '正面' : '反面'}${POS_NAME[sl.position]}槽：第 ${sl.pageNumber} 页${
              sl.outside ? '，折起后朝外' : ''
            }`
      }
    >
      {sl.blank ? (
        <>
          <span className="imp-slot-blank">空白页</span>
          <span className="imp-slot-sub">补白 · 无正文页码</span>
        </>
      ) : (
        <>
          <span className="imp-slot-num">{sl.pageNumber}</span>
          <span className="imp-slot-sub">第 {sl.pageNumber} 页</span>
        </>
      )}
      <span className="imp-slot-tag">{sl.outside ? '朝外' : '朝内'}</span>
    </div>
  );
}

function SheetCard({ sheet, binding }: { sheet: ImpositionSheet; binding: BindingMode }) {
  const gatheringLabel =
    binding === 'saddle'
      ? sheet.gathering === 1
        ? '最外一张（封面帖）'
        : `第 ${sheet.gathering} 帖（从外到内）`
      : `第 ${sheet.gathering} 帖（叠放顺序）`;
  return (
    <article className="imp-sheet" aria-label={`第 ${sheet.index} 张大纸，${gatheringLabel}`}>
      <header className="imp-sheet-head">
        <strong>第 {sheet.index} 张大纸</strong>
        <span className="stats">
          {gatheringLabel}
          {sheet.coverSheet ? ' · 含封面/封底' : ''}
          {sheet.hasBlanks ? ' · 含补白空白页' : ''}
        </span>
      </header>

      <div className="imp-side">
        <div className="imp-side-label">
          正面（折起后朝外）
          <span className="imp-edge">← 书脊折口</span>
          <span className="imp-edge">裁口 →</span>
        </div>
        <div className="imp-sheet-row">
          <SlotBox sl={sheet.front[0]} />
          <div className="imp-fold" aria-hidden="true">
            折
          </div>
          <SlotBox sl={sheet.front[1]} />
        </div>
      </div>

      <div className="imp-side">
        <div className="imp-side-label">
          反面（折起后朝内）
          <span className="imp-hint">双面打印沿短边翻转到此面</span>
        </div>
        <div className="imp-sheet-row">
          <SlotBox sl={sheet.back[0]} />
          <div className="imp-fold imp-fold-back" aria-hidden="true">
            折
          </div>
          <SlotBox sl={sheet.back[1]} />
        </div>
      </div>

      <p className="imp-sheet-foot stats">本张正文页：{sheet.pageNumbers.length ? sheet.pageNumbers.join('、') : '无'}</p>
    </article>
  );
}

export default function ImpositionPanel({ pages, setup, printer, docTitle, exportLocked }: Props) {
  const [binding, setBinding] = useState<BindingMode>('saddle');
  const [presetId, setPresetId] = useState(SHEET_PRESETS[0].id);
  const [customSize, setCustomSize] = useState<SheetSize>({ widthMm: 420, heightMm: 297 });
  const [msg, setMsg] = useState('');

  const preset = SHEET_PRESETS.find((p) => p.id === presetId) ?? SHEET_PRESETS[0];
  const sheetSize: SheetSize = presetId === 'custom' ? customSize : preset.size;

  // 换装订方式或改纸张大小都会重新排（纯函数，输入变即重算）
  const result: ImpositionResult = useMemo(
    () => imposeDocument(pages.length, binding, sheetSize),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages.length, binding, sheetSize.widthMm, sheetSize.heightMm],
  );
  const pageOf = useMemo(() => {
    const map = new Map<number, LayoutPage>();
    pages.forEach((p) => map.set(p.number, p));
    return (n: number) => map.get(n);
  }, [pages]);

  // 单页纸张竖版尺寸（折后页面），用于装不装得下的核对
  const pageSizeMm = useMemo(
    () => ({ widthMm: printer.paperWidthMm, heightMm: printer.paperHeightMm }),
    [printer.paperWidthMm, printer.paperHeightMm],
  );
  const verification = useMemo(
    () => verifyImposition(result, pageSizeMm),
    [result, pageSizeMm.widthMm, pageSizeMm.heightMm],
  );
  const order = useMemo(() => physicalReadingOrder(result), [result]);
  const blanksAtEnd = useMemo(
    () => order.slice(result.contentPageCount).every((p) => p === null),
    [order, result.contentPageCount],
  );

  // 打印拼版时按大纸尺寸设置 @page（横向、无边距）；离开拼版视图即移除
  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-imposition-page', '');
    style.textContent = `@page { size: ${sheetSize.widthMm}mm ${sheetSize.heightMm}mm; margin: 0; }`;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [sheetSize.widthMm, sheetSize.heightMm]);

  // 每张纸 { front, back } 真实尺寸 SVG（屏幕预览含辅助标注）；打印输出顺序为正、反交替
  const sheetSVGs = useMemo(
    () => result.sheets.map((s) => sheetToSVGs(s, pageOf, setup, printer, sheetSize)),
    [result.sheets, pageOf, setup, printer, sheetSize.widthMm, sheetSize.heightMm],
  );

  // 导出的独立文件不含辅助标注（折线/页码提示等只用于屏幕核对）
  const exportSVGs = useMemo(
    () => result.sheets.map((s) => sheetToSVGs(s, pageOf, setup, printer, sheetSize, false)),
    [result.sheets, pageOf, setup, printer, sheetSize.widthMm, sheetSize.heightMm],
  );

  const baseName = docTitle || 'document';

  const exportSheetsSVG = () => {
    result.sheets.forEach((s, i) => {
      downloadBlob(
        new Blob([exportSVGs[i].front], { type: 'image/svg+xml' }),
        `${baseName}-拼版-第${s.index}张-正面.svg`,
      );
      downloadBlob(
        new Blob([exportSVGs[i].back], { type: 'image/svg+xml' }),
        `${baseName}-拼版-第${s.index}张-反面.svg`,
      );
    });
    setMsg(`已按${binding === 'saddle' ? '骑马钉' : '胶装'}导出 ${result.sheetCount} 张纸的正/反面 SVG（共 ${exportSVGs.length * 2} 个）。`);
  };

  const exportSheetsPNG = async () => {
    setMsg('正在生成拼版大纸 PNG…');
    try {
      for (let i = 0; i < exportSVGs.length; i++) {
        const fb = exportSVGs[i];
        const frontBlob = await svgToPngBlob(fb.front, sheetSize.widthMm, sheetSize.heightMm);
        downloadBlob(frontBlob, `${baseName}-拼版-第${i + 1}张-正面.png`);
        const backBlob = await svgToPngBlob(fb.back, sheetSize.widthMm, sheetSize.heightMm);
        downloadBlob(backBlob, `${baseName}-拼版-第${i + 1}张-反面.png`);
      }
      setMsg('已导出全部拼版大纸 PNG（300 DPI）。');
    } catch (e) {
      setMsg(`PNG 导出失败：${(e as Error).message}`);
    }
  };

  return (
    <section aria-label="拼版（折手）">
      <h2 className="no-print">拼版（折手）</h2>
      <p className="stats no-print">
        把排好的 {pages.length} 个正文页按装订方式摆到大纸上：一张纸正反各印 2 页、对折成 4 页。
      </p>

      <div className="imp-controls no-print">
        <label>
          装订方式
          <select value={binding} onChange={(e) => setBinding(e.target.value as BindingMode)} aria-label="装订方式">
            {(Object.keys(BINDING_LABELS) as BindingMode[]).map((m) => (
              <option key={m} value={m}>
                {BINDING_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          大纸尺寸
          <select value={presetId} onChange={(e) => setPresetId(e.target.value)} aria-label="大纸尺寸">
            {SHEET_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {presetId === 'custom' && (
          <div className="row">
            <label>
              大纸宽 mm
              <input
                type="number"
                min={100}
                max={2000}
                value={customSize.widthMm}
                onChange={(e) => setCustomSize((s) => ({ ...s, widthMm: Number(e.target.value) || 0 }))}
                aria-label="大纸宽毫米"
              />
            </label>
            <label>
              大纸高 mm
              <input
                type="number"
                min={100}
                max={2000}
                value={customSize.heightMm}
                onChange={(e) => setCustomSize((s) => ({ ...s, heightMm: Number(e.target.value) || 0 }))}
                aria-label="大纸高毫米"
              />
            </label>
          </div>
        )}
      </div>

      <div className="imp-summary no-print" role="status" aria-live="polite">
        <span className="badge">正文 {result.contentPageCount} 页</span>
        <span className="badge">补白 {result.blankCount} 页（不占页码）</span>
        <span className="badge">总版面 {result.totalPageCount} 页</span>
        <span className="badge">用纸 {result.sheetCount} 张</span>
        <span className="badge">
          大纸 {sheetSize.widthMm}×{sheetSize.heightMm}mm
        </span>
        {verification.ok ? (
          <span className="badge ok">核对通过：无漏页、无重页、页序 1–{result.contentPageCount} 正确</span>
        ) : (
          <span className="badge error">核对未通过（{verification.issues.length} 项）</span>
        )}
      </div>

      <div className="no-print">
        {verification.warnings.map((w, i) => (
          <p className="imp-warn" role="alert" key={`w${i}`}>
            ⚠ {w}
          </p>
        ))}
        {!verification.ok &&
          verification.issues.map((iss, i) => (
            <p className="imp-issue" role="alert" key={`i${i}`}>
              ✕ {iss.message}
            </p>
          ))}
      </div>

      {result.blankCount > 0 && (
        <p className="stats no-print">
          补白说明：正文 {result.contentPageCount} 页凑不满印张，在全书末尾补 {result.blankCount} 个空白页（
          {blanksAtEnd ? '已核对：空白页全部在末尾' : '警告：空白页不在末尾'}），补白页不编正文页码。
        </p>
      )}

      <p className="stats no-print">
        工艺：
        {binding === 'saddle'
          ? '各张沿中缝对折后互相套在一起（第 1 张最外），在折口处骑马钉；页码外大内小。'
          : '各张对折成书帖后按顺序叠放，铣背打毛、上胶包封面，再切三面（顶、前口、地脚）。'}
        双面打印请选「沿短边翻转」，打印时选「实际大小 / 100%」。
      </p>

      <div className="imp-actions no-print">
        <button type="button" className="primary" onClick={() => window.print()} disabled={!verification.ok}>
          打印拼版大纸（正反交替、短边翻转）
        </button>
        <button type="button" onClick={exportSheetsSVG} disabled={exportLocked || !verification.ok}>
          下载拼版 SVG
        </button>
        <button type="button" onClick={exportSheetsPNG} disabled={exportLocked || !verification.ok}>
          下载拼版 PNG
        </button>
        <span className="stats" role="status" aria-live="polite">
          {msg}
        </span>
      </div>

      {result.sheets.length === 0 ? (
        <p className="stats no-print">当前没有正文页，暂无需拼版的纸张。</p>
      ) : (
        <>
          <h3 className="no-print">版面示意图（每张纸正反面放哪几页、哪面朝外）</h3>
          <div className="imp-sheet-list no-print">
            {result.sheets.map((s) => (
              <SheetCard key={s.index} sheet={s} binding={binding} />
            ))}
          </div>

          <h3 className="no-print">真实尺寸拼版大纸（按打印顺序：每张正面→反面）</h3>
          <div className="imp-print-list">
            {result.sheets.map((s, i) => (
              <div key={s.index}>
                <p className="print-sheet-label no-print">
                  第 {s.index} 张 · 正面（朝外）{s.hasBlanks ? ' · 本张含补白' : ''}
                </p>
                <div className="print-sheet-wrap" dangerouslySetInnerHTML={{ __html: sheetSVGs[i].front }} />
                <p className="print-sheet-label no-print">第 {s.index} 张 · 反面（朝内，短边翻转到此面）</p>
                <div className="print-sheet-wrap" dangerouslySetInnerHTML={{ __html: sheetSVGs[i].back }} />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
