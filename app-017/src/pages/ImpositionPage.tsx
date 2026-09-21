import { useEffect, useMemo, useState } from 'react';
import type { Binding, ImpositionIssue } from '../lib/imposition';
import {
  BINDING_DESCRIPTIONS,
  BINDING_LABELS,
  impose,
  validateImposition,
} from '../lib/imposition';
import { sheetSideSVG } from '../lib/imposition-svg';
import { convertText } from '../lib/convert';
import { layoutDocument } from '../lib/layout';
import { getDoc } from '../lib/storage';
import type { Doc } from '../types';
import { useSettings } from '../App';
import { navigate } from '../router';

/** 大纸预设（mm）。拼版一律横向：宽 >= 高 */
const PAPER_PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'a3', label: 'A3 横向（297×420）', w: 420, h: 297 },
  { id: 'a4', label: 'A4 横向（210×297）', w: 297, h: 210 },
  { id: 'b4', label: 'B4 横向（257×364）', w: 364, h: 257 },
];

const ISSUE_LABEL: Record<ImpositionIssue['type'], string> = {
  missing: '漏页',
  duplicate: '重页',
  order: '页序',
  'blank-count': '补白数量',
  'blank-placement': '补白位置',
  structure: '结构',
  paper: '纸张',
};

export default function ImpositionPage({ id }: { id: string }) {
  const { settings } = useSettings();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [binding, setBinding] = useState<Binding>('saddle');
  const [preset, setPreset] = useState('a3');
  const [paperW, setPaperW] = useState(420);
  const [paperH, setPaperH] = useState(297);
  const [showMarks, setShowMarks] = useState(true);

  useEffect(() => {
    let alive = true;
    getDoc(id).then((d) => {
      if (alive) setDoc(d ?? null);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // 与编辑器/打印页一致的转换与分页，保证拼的是最终要印的页
  const laidOut = useMemo(() => {
    if (!doc) return null;
    const conv = convertText(doc.raw, {
      toneMode: settings.toneMode,
      autoDetectPinyin: settings.autoDetectPinyin,
      profile: doc.ruleProfile,
      overrides: doc.overrides,
      confirmed: doc.confirmed,
      dictEntries: settings.dictEntries,
    });
    return {
      conv,
      layout: layoutDocument(conv.paragraphs, doc.setup, settings.showPageNumbers),
    };
  }, [doc, settings.toneMode, settings.autoDetectPinyin, settings.showPageNumbers, settings.dictEntries]);

  const pageW = settings.printer.paperWidthMm;
  const pageH = settings.printer.paperHeightMm;

  // 换装订方式或改纸张大小 → 整版重排
  const plan = useMemo(() => {
    if (!laidOut) return null;
    return impose(
      laidOut.layout.pages.length,
      binding,
      { widthMm: paperW, heightMm: paperH },
      { widthMm: pageW, heightMm: pageH },
    );
  }, [laidOut, binding, paperW, paperH, pageW, pageH]);

  const validation = useMemo(() => {
    if (!plan) return null;
    return validateImposition(plan, { widthMm: pageW, heightMm: pageH });
  }, [plan, pageW, pageH]);

  const svgCache = useMemo(() => {
    if (!plan || !laidOut || !doc) return [];
    return plan.sheets.map((sheet) => ({
      index: sheet.index,
      front: sheetSideSVG(sheet, 'front', plan, laidOut.layout.pages, doc.setup, settings.printer, {
        showMarks,
      }),
      back: sheetSideSVG(sheet, 'back', plan, laidOut.layout.pages, doc.setup, settings.printer, {
        showMarks,
      }),
    }));
  }, [plan, laidOut, doc, settings.printer, showMarks]);

  if (!doc) {
    return (
      <p>
        文档不存在。
        <button type="button" onClick={() => navigate('/')}>
          返回首页
        </button>
      </p>
    );
  }
  if (!laidOut || !plan || !validation) return <p>加载中…</p>;

  const bodyPages = laidOut.layout.pages;

  const applyPreset = (pid: string) => {
    setPreset(pid);
    const p = PAPER_PRESETS.find((x) => x.id === pid);
    if (p) {
      setPaperW(p.w);
      setPaperH(p.h);
    }
  };

  return (
    <div className="imposition">
      <div className="imposition-toolbar no-print">
        <button type="button" onClick={() => navigate(`/editor/${id}/print`)}>
          ← 返回打印与导出
        </button>
        <button type="button" className="primary" disabled={!plan.fits || !validation.ok} onClick={() => window.print()}>
          打印大纸（请选「实际大小 / 100%」、双面、短边翻页）
        </button>
      </div>

      <h1>拼版折手 · {doc.title}</h1>
      <p className="calibration-note no-print">
        把排好的正文页按装订方式摆到大纸上：一张大纸正反各印两页，沿中缝对折成 4 页一帖。
        换装订方式或改纸张大小会立即整版重排。打印时务必选「实际大小 / 100%」，
        双面打印按页面方向选「短边翻页」（沿竖轴翻面），否则正反面镜像错位。
      </p>

      {/* 参数区：换任何一项都重新拼版 */}
      <section className="imposition-controls no-print" aria-label="拼版参数">
        <fieldset>
          <legend>装订方式</legend>
          <div className="seg">
            {(['saddle', 'perfect'] as Binding[]).map((b) => (
              <label key={b} className={`seg-item${binding === b ? ' active' : ''}`}>
                <input
                  type="radio"
                  name="binding"
                  value={b}
                  checked={binding === b}
                  onChange={() => setBinding(b)}
                />{' '}
                {BINDING_LABELS[b]}
              </label>
            ))}
          </div>
          <p className="hint">{BINDING_DESCRIPTIONS[binding]}</p>
        </fieldset>

        <fieldset>
          <legend>大纸尺寸（mm，横向）</legend>
          <select value={preset} onChange={(e) => applyPreset(e.target.value)} aria-label="大纸预设">
            {PAPER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">自定义</option>
          </select>
          <div className="num-row">
            <label>
              宽
              <input
                type="number"
                min={50}
                max={2000}
                value={paperW}
                onChange={(e) => {
                  setPreset('custom');
                  setPaperW(Number(e.target.value) || paperW);
                }}
              />
            </label>
            <label>
              高
              <input
                type="number"
                min={50}
                max={2000}
                value={paperH}
                onChange={(e) => {
                  setPreset('custom');
                  setPaperH(Number(e.target.value) || paperH);
                }}
              />
            </label>
          </div>
          <p className="hint">
            单个正文页（纵放）：{pageW}×{pageH}mm；横放大纸每半张需 ≥ {pageW}×{pageH}mm。
          </p>
        </fieldset>

        <fieldset>
          <legend>显示</legend>
          <label>
            <input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} />{' '}
            折缝/页码角标/帖标等核对标记
          </label>
        </fieldset>
      </section>

      {/* 核对面板 */}
      <section className="imposition-check no-print" aria-label="拼版核对结果">
        <h2>核对</h2>
        <ul className="check-summary">
          <li>正文页：<strong>{plan.bodyPageCount}</strong> 页</li>
          <li>
            末尾补空白页：<strong>{plan.blankPageCount}</strong> 页
            {plan.blankPageCount > 0 && <span className="muted">（不占正文页码）</span>}
          </li>
          <li>
            含补白总版数：<strong>{plan.totalPageCount}</strong>（4 的倍数）
          </li>
          <li>
            大纸张数：<strong>{plan.sheets.length}</strong> 张 × 正反 2 面 × 每面 2 页
          </li>
          <li>
            纸张适配：
            {plan.fits ? (
              <strong className="ok">可容纳两页</strong>
            ) : (
              <strong className="bad">放不下</strong>
            )}
          </li>
        </ul>

        {plan.fits ? (
          validation.ok ? (
            <p className="check-ok" role="status">
              ✓ 核对通过：无漏页、无重页；{plan.bodyPageCount} 个正文页折好后按 1→{plan.bodyPageCount}{' '}
              顺序连读，页序正确。
            </p>
          ) : (
            <div className="check-bad" role="alert">
              <p>
                核对发现 {validation.issues.length} 个问题：
              </p>
              <ul>
                {validation.issues.slice(0, 50).map((iss, i) => (
                  <li key={i}>
                    <span className={`issue-tag tag-${iss.type}`}>{ISSUE_LABEL[iss.type]}</span>
                    {iss.sheet !== undefined && `第 ${iss.sheet} 张 · `}
                    {iss.message}
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : (
          <p className="check-bad" role="alert">
            {plan.fitIssue}。更换大纸或缩小正文页后会自动重新拼版。
          </p>
        )}

        <details>
          <summary>查看折好还原的阅读顺序</summary>
          <p className="hint">按装订折好后，依次读到的正文页（应与 1…{plan.bodyPageCount} 完全一致）：</p>
          <p className="reading-order" aria-label="折好后的阅读顺序">
            {validation.readingOrder.length > 0
              ? validation.readingOrder.join(' → ')
              : '（无正文页）'}
          </p>
        </details>
      </section>

      {/* 大纸一览：每张纸正/反两面 */}
      <h2 className="no-print">
        大纸摆放（{BINDING_LABELS[binding]}，共 {plan.sheets.length} 张）
      </h2>
      {plan.sheets.length === 0 && <p>还没有正文页，无法拼版。</p>}
      {svgCache.map((item) => {
        const sheet = plan.sheets.find((s) => s.index === item.index)!;
        const slotText = (side: 'front' | 'back') => {
          const slots = side === 'front' ? sheet.front.slots : sheet.back.slots;
          return slots
            .map((sl) => (sl.blank ? '空白补页' : `第 ${sl.pageNumber} 页`))
            .join(`　|　`);
        };
        return (
          <div className="sheet-block" key={item.index}>
            <h3 className="no-print">
              第 {item.index} 张大纸
              {binding === 'saddle'
                ? item.index === 1
                  ? '（最外层，含封面/封底）'
                  : item.index === plan.sheets.length
                    ? '（最内层，书心中缝）'
                    : '（中间层）'
                : item.index === 1
                  ? '（最上面一帖，含封面）'
                  : item.index === plan.sheets.length
                    ? '（最下面一帖，含封底）'
                    : ''}
            </h3>
            <div className="sheet-sides">
              <figure className="sheet-figure">
                <figcaption className="no-print">
                  正面（对折后朝外）· 左／右：{slotText('front')}
                </figcaption>
                <div className="sheet-svg-wrap" dangerouslySetInnerHTML={{ __html: item.front }} />
              </figure>
              <figure className="sheet-figure">
                <figcaption className="no-print">
                  反面（对折后朝内）· 左／右：{slotText('back')}
                </figcaption>
                <div className="sheet-svg-wrap" dangerouslySetInnerHTML={{ __html: item.back }} />
              </figure>
            </div>
            <p className="sheet-fold-hint no-print">
              {binding === 'saddle'
                ? '正面朝上印好后，沿中缝把纸对折（反面朝内），再与其他纸沿同一书脊套帖，折缝处钉 2 个骑马钉。'
                : '正面朝上印好后，沿中缝对折成帖，与其他帖页码顺序叠齐，折口侧铣背涂胶装订、三边裁齐。'}
            </p>
          </div>
        );
      })}

      <p className="muted no-print">
        提示：本视图每张大纸按真实尺寸（{plan.sheetWidthMm}×{plan.sheetHeightMm}
        mm）出图，屏幕上等比缩小显示；正文共 {bodyPages.length} 页，补白 {plan.blankPageCount} 页。
      </p>
    </div>
  );
}
