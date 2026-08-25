import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  TrendingUp, TrendingDown,  RefreshCw, ArrowUpRight, ArrowDownRight,
  LayoutDashboard, Plus, AlertTriangle, Calendar,
  X, Printer, Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import PesoSign from '../../components/shared/PesoSign';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import {
  computeCoopSummaryFromInvoices,
  CATEGORY_LABEL,
  CATEGORY_COLOR,
  recordManualFundDeposit,
  getIncomeBreakdown,
} from '../../services/coopFundService';
import { supabase } from '../../services/supabase';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_MODE_OPTIONS = [
  { value: '', label: 'Select mode of payment' },
  { value: 'Cash', label: 'Cash' },
  { value: 'GCash', label: 'GCash' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Check', label: 'Check' },
  { value: 'Others', label: 'Others' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MIN_LEDGER_YEAR = 2023;
const MAX_VISIBLE_FUND_ROWS = 250;

function parseLedgerDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const maxYear = new Date().getFullYear() + 10;
  if (year < MIN_LEDGER_YEAR || year > maxYear) return null;

  return date;
}

function txDisplayDate(tx) {
  if (parseLedgerDate(tx?.transaction_date)) return tx.transaction_date;
  if (parseLedgerDate(tx?.created_at)) return tx.created_at;
  return null;
}

function normalizeCategoryText(value = '') {
  return String(value || '').trim().toLowerCase();
}

function isLoanReleaseCategory(category = '') {
  const text = normalizeCategoryText(category);
  return text === 'loan_release' || text === 'loan release' || text === 'capital';
}

function isWithdrawalCategory(category = '') {
  const text = normalizeCategoryText(category);
  return ['cbu_withdrawal', 'savings_withdrawal'].includes(text) ||
    text.includes('withdrawal');
}

function isOtherExpenseCategory(category = '') {
  const text = normalizeCategoryText(category);
  return !text || text === 'others' || text === 'other expenses' ||
    text === 'other withdrawal/expenses' || text === 'needs manual review';
}

function originalExpenseCategory(tx) {
  const notes = String(tx?.description || tx?.notes || '');
  const categoryMatch = notes.match(/Original expense category:\s*([^\n\r|]+)/i);
  const detailMatch = notes.match(/Category detail:\s*([^\n\r|]+)/i);
  const original = categoryMatch?.[1]?.trim();
  if (original && !isOtherExpenseCategory(original)) return original;
  return detailMatch?.[1]?.trim() || original || tx?.category || '';
}

function displayCategoryLabel(category = '') {
  const fromMap = CATEGORY_LABEL[category];
  if (fromMap) return fromMap;
  return String(category || 'Other Expenses')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function CategoryBadge({ category }) {
  const label = CATEGORY_LABEL[category] || category || '—';
  const cls = CATEGORY_COLOR[category] || 'text-gray-600 bg-gray-100';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip + hooks
// ─────────────────────────────────────────────────────────────────────────────

function Tooltip({ text, x, y, visible }) {
  if (!visible || !text) return null;
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg whitespace-nowrap"
      style={{ left: x + 12, top: y - 8 }}
    >
      {text}
    </div>
  );
}

function useTooltip() {
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });
  const show = useCallback((e, text) => {
    setTooltip({ visible: true, text, x: e.clientX, y: e.clientY });
  }, []);
  const move = useCallback((e) => {
    setTooltip(t => t.visible ? { ...t, x: e.clientX, y: e.clientY } : t);
  }, []);
  const hide = useCallback(() => {
    setTooltip(t => ({ ...t, visible: false }));
  }, []);
  return { tooltip, show, move, hide };
}

function useChartWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.clientWidth > 0) setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card — enhanced with hover accent
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, bg, textColor, accentColor, border }) {
  return (
    <div className={`bg-white rounded-xl border ${border || 'border-gray-100'} p-5 flex items-center gap-4 group hover:shadow-md transition-all duration-200 relative overflow-hidden`}>
      <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center flex-shrink-0 transition-transform duration-150 group-hover:scale-110`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        <p className={`text-xl font-bold tabular-nums leading-tight ${textColor}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className={`absolute bottom-0 left-0 h-0.5 w-0 group-hover:w-full transition-all duration-300 rounded-full ${accentColor || 'bg-emerald-400'}`} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cash Flow Area-Line Chart
// ResizeObserver + smooth bezier curves + gradient area fills + hover
// ─────────────────────────────────────────────────────────────────────────────

function CashFlowLineChart({ cashInData, cashOutData, labels, height = 180 }) {
  const { tooltip, show, move, hide } = useTooltip();
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [containerRef, W] = useChartWidth();

  const n = labels.length;
  const H = height;
  const PAD = { t: 22, b: 32, l: 14, r: 14 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  const maxVal = Math.max(...cashInData, ...cashOutData, 1);
  const px = i => PAD.l + (n <= 1 ? iW / 2 : (i / (n - 1)) * iW);
  const py = v => PAD.t + iH - (v / maxVal) * iH;

  const fmtShort = v => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${(abs / 1_000).toFixed(1)}K`;
    return abs.toLocaleString();
  };

  const makeBezier = (data) => {
    if (data.length < 2) return `M${px(0).toFixed(1)},${py(data[0] || 0).toFixed(1)}`;
    let d = `M${px(0).toFixed(1)},${py(data[0]).toFixed(1)}`;
    for (let i = 1; i < data.length; i++) {
      const cx = ((px(i - 1) + px(i)) / 2).toFixed(1);
      d += ` C${cx},${py(data[i-1]).toFixed(1)} ${cx},${py(data[i]).toFixed(1)} ${px(i).toFixed(1)},${py(data[i]).toFixed(1)}`;
    }
    return d;
  };

  const makeArea = (data, path) => {
    const BL = PAD.t + iH;
    return `${path} L${px(n - 1).toFixed(1)},${BL.toFixed(1)} L${px(0).toFixed(1)},${BL.toFixed(1)} Z`;
  };

  const gridYs = [0.25, 0.5, 0.75, 1].map(f => py(maxVal * f));
  const inPath  = makeBezier(cashInData);
  const outPath = makeBezier(cashOutData);

  return (
    <>
      <Tooltip {...tooltip} />
      <div ref={containerRef} className="w-full">
        {W > 0 && n >= 2 && (
          <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="cm-area-in" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#10b981" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.03" />
              </linearGradient>
              <linearGradient id="cm-area-out" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#f43f5e" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.03" />
              </linearGradient>
              <filter id="cm-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.08" />
              </filter>
            </defs>

            <rect
              x={PAD.l}
              y={PAD.t - 6}
              width={iW}
              height={iH + 6}
              rx={12}
              fill="#f8fafc"
            />

            {/* Dashed grid lines */}
            {gridYs.map((y, i) => (
              <line key={i} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                stroke={i === gridYs.length - 1 ? '#e2e8f0' : '#e5e7eb'}
                strokeWidth={1}
                strokeDasharray={i === gridYs.length - 1 ? '0' : '4 6'}
                opacity={i === gridYs.length - 1 ? 1 : 0.75}
              />
            ))}

            {/* Hover vertical guide */}
            {hoveredIdx !== null && (
              <line
                x1={px(hoveredIdx)} y1={PAD.t}
                x2={px(hoveredIdx)} y2={PAD.t + iH}
                stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="4 5"
              />
            )}

            {/* Gradient area fills */}
            <path d={makeArea(cashInData, inPath)}   fill="url(#cm-area-in)"  />
            <path d={makeArea(cashOutData, outPath)} fill="url(#cm-area-out)" />

            {/* Line glows */}
            <path d={inPath}  fill="none" stroke="#10b981" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" opacity={0.12} />
            <path d={outPath} fill="none" stroke="#f43f5e" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" opacity={0.12} />

            {/* Lines */}
            <path d={inPath}  fill="none" stroke="#059669" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" filter="url(#cm-soft-shadow)" />
            <path d={outPath} fill="none" stroke="#e11d48" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" filter="url(#cm-soft-shadow)" />

            {/* Per-column interaction zones + dots */}
            {labels.map((lbl, i) => {
              const isHov = hoveredIdx === i;
              const inV   = cashInData[i]  || 0;
              const outV  = cashOutData[i] || 0;

              const zoneX = i === 0 ? PAD.l
                : (px(i - 1) + px(i)) / 2;
              const zoneW = i === n - 1
                ? (W - PAD.r) - (px(n - 2) + px(n - 1)) / 2
                : i === 0
                ? (px(0) + px(1)) / 2 - PAD.l
                : (px(i) + px(i + 1)) / 2 - (px(i - 1) + px(i)) / 2;

              return (
                <g key={i}>
                  <rect
                    x={zoneX} y={PAD.t} width={zoneW} height={iH}
                    fill="transparent" style={{ cursor: 'crosshair' }}
                    onMouseEnter={e => {
                      setHoveredIdx(i);
                      show(e, `${lbl}  ·  In: ${formatCurrency(inV)}  ·  Out: ${formatCurrency(outV)}`);
                    }}
                    onMouseMove={move}
                    onMouseLeave={() => { setHoveredIdx(null); hide(); }}
                  />

                  {/* Cash In dot */}
                  <circle cx={px(i)} cy={py(inV)} r={isHov ? 6 : 3.8}
                    fill="white" stroke="#059669" strokeWidth={isHov ? 3 : 2} />
                  <circle cx={px(i)} cy={py(inV)} r={isHov ? 2.2 : 1.4}
                    fill="#059669" opacity={isHov ? 1 : 0.8} />
                  {/* Cash Out dot */}
                  <circle cx={px(i)} cy={py(outV)} r={isHov ? 6 : 3.8}
                    fill="white" stroke="#e11d48" strokeWidth={isHov ? 3 : 2} />
                  <circle cx={px(i)} cy={py(outV)} r={isHov ? 2.2 : 1.4}
                    fill="#e11d48" opacity={isHov ? 1 : 0.8} />

                  {/* Hover value labels */}
                  {isHov && inV > 0 && (
                    <text x={px(i)} y={py(inV) - 9} textAnchor="middle" fontSize={8} fontWeight="700" fill="#15803d">
                      {fmtShort(inV)}
                    </text>
                  )}
                  {isHov && outV > 0 && (
                    <text x={px(i)} y={py(outV) - 9} textAnchor="middle" fontSize={8} fontWeight="700" fill="#dc2626">
                      {fmtShort(outV)}
                    </text>
                  )}

                  {/* X-axis label */}
                  <text x={px(i)} y={H - 8} textAnchor="middle" fontSize={10}
                    fill={isHov ? '#0f172a' : '#94a3b8'}
                    fontWeight={isHov ? '600' : '400'}>
                    {lbl}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Diverging Bar Chart — Cash In ↑, Cash Out ↓ from center zero-line
// ─────────────────────────────────────────────────────────────────────────────

function MonthlyDivergingChart({ cashInData, cashOutData, labels, height = 136 }) {
  const { tooltip, show, move, hide } = useTooltip();
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [containerRef, W] = useChartWidth();

  const H      = height;
  const PAD    = { t: 26, b: 30, l: 14, r: 18 };
  const iW     = W - PAD.l - PAD.r;
  const iH     = H - PAD.t - PAD.b;
  const midY   = PAD.t + iH / 2;
  const halfH  = iH / 2;
  const n      = labels.length;
  const groupW = iW / n;
  const margin = Math.max(groupW * 0.24, 4);
  const barW   = groupW - margin * 2;

  const maxVal = Math.max(...cashInData, ...cashOutData, 1);
  const sh     = v => (v / maxVal) * halfH;
  const bx     = i => PAD.l + i * groupW + margin;
  const mX     = i => PAD.l + i * groupW + groupW / 2;

  const fmtShort = v => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${(abs / 1_000).toFixed(1)}K`;
    return abs.toLocaleString();
  };

  return (
    <>
      <Tooltip {...tooltip} />
      <div ref={containerRef} className="w-full">
        {W > 0 && (
          <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="mdiv-green" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#059669" stopOpacity="1" />
                <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0.72" />
              </linearGradient>
              <linearGradient id="mdiv-red" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#fecdd3" stopOpacity="0.72" />
                <stop offset="100%" stopColor="#e11d48" stopOpacity="1" />
              </linearGradient>
              <filter id="mdiv-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.08" />
              </filter>
            </defs>

            {/* Half-backgrounds */}
            <rect x={PAD.l} y={PAD.t - 8} width={iW} height={iH + 8} rx={12} fill="#f8fafc" />
            <rect x={PAD.l} y={PAD.t - 8} width={iW} height={halfH + 8} rx={12} fill="#ecfdf5" opacity={0.75} />
            <rect x={PAD.l} y={midY} width={iW} height={halfH} rx={12} fill="#fff1f2" opacity={0.74} />

            {/* Quarter guide lines */}
            <line x1={PAD.l} y1={PAD.t + halfH * 0.5} x2={W - PAD.r} y2={PAD.t + halfH * 0.5}
              stroke="#bbf7d0" strokeWidth={1} strokeDasharray="5 7" />
            <line x1={PAD.l} y1={midY  + halfH * 0.5} x2={W - PAD.r} y2={midY  + halfH * 0.5}
              stroke="#fecdd3" strokeWidth={1} strokeDasharray="5 7" />

            {/* Center zero line */}
            <line x1={PAD.l} y1={midY} x2={W - PAD.r} y2={midY} stroke="#64748b" strokeWidth={1.4} />
            <text x={W - PAD.r + 3} y={midY + 3.5} fontSize={8} fill="#64748b" textAnchor="start">0</text>

            {/* Corner axis labels */}
            <text x={PAD.l + 8} y={PAD.t + 6} fontSize={8} fill="#047857" fontWeight="700">Cash In</text>
            <text x={PAD.l + 8} y={PAD.t + iH - 4} fontSize={8} fill="#be123c" fontWeight="700">Cash Out</text>

            {labels.map((lbl, i) => {
              const ciH    = Math.max(sh(cashInData[i]  || 0), cashInData[i]  > 0 ? 3 : 0);
              const coH    = Math.max(sh(cashOutData[i] || 0), cashOutData[i] > 0 ? 3 : 0);
              const isHov  = hoveredIdx === i;
              const dimmed = hoveredIdx !== null && !isHov;
              const op     = dimmed ? 0.18 : 1;

              return (
                <g key={i} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => {
                    setHoveredIdx(i);
                    show(e, `${lbl}  ·  In: ${formatCurrency(cashInData[i] || 0)}  ·  Out: ${formatCurrency(cashOutData[i] || 0)}`);
                  }}
                  onMouseMove={move}
                  onMouseLeave={() => { setHoveredIdx(null); hide(); }}
                >
                  {/* Column hover highlight */}
                  {isHov && (
                    <rect x={bx(i) - 6} y={PAD.t - 8} width={barW + 12} height={iH + 8}
                      fill="#0f172a" opacity={0.05} rx={8} />
                  )}

                  {/* Cash In bar — rises upward */}
                  {ciH > 0 && (
                    <>
                      <rect x={bx(i)} y={midY - ciH} width={barW} height={ciH}
                        fill="url(#mdiv-green)" opacity={op} rx={6} filter="url(#mdiv-soft-shadow)" />
                      {isHov && (
                        <text x={bx(i) + barW / 2} y={midY - ciH - 4}
                          textAnchor="middle" fontSize={8} fontWeight="700" fill="#065f46">
                          {fmtShort(cashInData[i] || 0)}
                        </text>
                      )}
                    </>
                  )}

                  {/* Cash Out bar — drops downward */}
                  {coH > 0 && (
                    <>
                      <rect x={bx(i)} y={midY} width={barW} height={coH}
                        fill="url(#mdiv-red)" opacity={op} rx={6} filter="url(#mdiv-soft-shadow)" />
                      {isHov && (
                        <text x={bx(i) + barW / 2} y={midY + coH + 9}
                          textAnchor="middle" fontSize={8} fontWeight="700" fill="#9f1239">
                          {fmtShort(cashOutData[i] || 0)}
                        </text>
                      )}
                    </>
                  )}

                  {/* Month label */}
                  <text x={mX(i)} y={H - 8} textAnchor="middle" fontSize={10}
                    fill={isHov ? '#0f172a' : '#94a3b8'}
                    fontWeight={isHov ? '600' : '400'}>
                    {lbl}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhanced Donut Chart — hover with animated center label
// ─────────────────────────────────────────────────────────────────────────────

function EnhancedDonut({ slices, size = 100 }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) return <div className="text-xs text-gray-400 py-4 text-center">No data</div>;

  const cx = size / 2, cy = size / 2;
  const r = size * 0.4, innerR = size * 0.265;
  let angle = -Math.PI / 2;

  const arc = (startA, endA, outerR) => {
    const x1 = cx + outerR * Math.cos(startA), y1 = cy + outerR * Math.sin(startA);
    const x2 = cx + outerR * Math.cos(endA),   y2 = cy + outerR * Math.sin(endA);
    const xi1 = cx + innerR * Math.cos(endA),   yi1 = cy + innerR * Math.sin(endA);
    const xi2 = cx + innerR * Math.cos(startA), yi2 = cy + innerR * Math.sin(startA);
    const large = endA - startA > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${innerR} ${innerR} 0 ${large} 0 ${xi2} ${yi2} Z`;
  };

  const segments = slices.map(sl => {
    const sweep = (sl.value / total) * 2 * Math.PI;
    const startA = angle;
    angle += sweep;
    return { ...sl, startA, endA: angle };
  });

  const hovered = hoveredIdx !== null ? segments[hoveredIdx] : null;

  const fmtCenter = v => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
    return String(Math.round(v));
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full" style={{ maxWidth: size, overflow: 'visible' }}>
      {/* Background track */}
      <circle cx={cx} cy={cy} r={(r + innerR) / 2}
        fill="none" stroke="#F3F4F6" strokeWidth={r - innerR} />

      {segments.map((seg, i) => {
        const isHov  = hoveredIdx === i;
        const outerR = isHov ? r + 4 : r;
        return (
          <path
            key={i}
            d={arc(seg.startA, seg.endA, outerR)}
            fill={seg.color}
            opacity={hoveredIdx === null ? 0.88 : isHov ? 1 : 0.28}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s, d 0.1s' }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          />
        );
      })}

      {/* Center label */}
      {hovered ? (
        <>
          <text x={cx} y={cy - 5} textAnchor="middle" fontSize={size * 0.08} fill="#6B7280" fontWeight="500">
            {hovered.label.length > 8 ? hovered.label.slice(0, 8) + '…' : hovered.label}
          </text>
          <text x={cx} y={cy + 9} textAnchor="middle" fontSize={size * 0.115} fontWeight="700" fill={hovered.color}>
            {Math.round((hovered.value / total) * 100)}%
          </text>
        </>
      ) : (
        <>
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize={size * 0.08} fill="#6B7280" fontWeight="500">Total</text>
          <text x={cx} y={cy + 9} textAnchor="middle" fontSize={size * 0.105} fontWeight="700" fill="#111827">
            {fmtCenter(total)}
          </text>
        </>
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cash-In Breakdown horizontal bars
// ─────────────────────────────────────────────────────────────────────────────

function CashInBreakdown({ transactions, incomeData }) {
  const cashInTx = transactions.filter(tx => tx.type === 'cash_in');
  const membershipTotals = {
    membership: Number(incomeData?.membership_fee || 0),
    membership_cbu: Number(incomeData?.membership_cbu || 0),
    membership_savings: Number(incomeData?.membership_savings || 0),
  };

  const groups = [
    { key: 'loan_payment', label: 'Loan Payments',       color: '#f97316', bg: 'bg-orange-400' },
    { key: 'cbu',          label: 'CBU Deposits',         color: '#22c55e', bg: 'bg-green-400'  },
    { key: 'membership_cbu', label: 'Membership CBU',     color: '#16a34a', bg: 'bg-green-500'  },
    { key: 'savings',      label: 'Savings Deposits',     color: '#3b82f6', bg: 'bg-blue-400'   },
    { key: 'membership_savings', label: 'Membership Savings', color: '#0284c7', bg: 'bg-sky-500' },
    { key: 'membership',   label: 'Membership Fees',      color: '#a855f7', bg: 'bg-purple-400' },
    { key: 'capital',      label: 'Capital / Fund',       color: '#6366f1', bg: 'bg-indigo-400' },
    { key: 'time_deposit', label: 'Time Deposits',        color: '#8b5cf6', bg: 'bg-violet-400' },
    { key: 'invoice',      label: 'Other Invoices',       color: '#9ca3af', bg: 'bg-gray-400'   },
  ].map(g => ({
    ...g,
    total: Object.prototype.hasOwnProperty.call(membershipTotals, g.key)
      ? membershipTotals[g.key]
      : cashInTx.filter(tx => tx.category === g.key).reduce((s, tx) => s + tx.amount, 0),
    count: cashInTx.filter(tx => tx.category === g.key).length,
  })).filter(g => g.total > 0);

  if (groups.length === 0) return null;

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Cash In — Breakdown by Type</h3>
          <p className="text-xs text-gray-400 mt-0.5">All-time totals by category</p>
        </div>
        <span className="text-xs font-semibold text-gray-700 tabular-nums">
          {formatCurrency(grandTotal)}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {groups.map(g => {
          const pct = grandTotal > 0 ? (g.total / grandTotal) * 100 : 0;
          return (
            <div key={g.key} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: g.color }} />
                <p className="text-xs text-gray-500 truncate">{g.label}</p>
              </div>
              <p className="text-sm font-bold text-gray-800 tabular-nums pl-3.5">{formatCurrency(g.total)}</p>
              <p className="text-xs text-gray-400 pl-3.5">{g.count} tx · {pct.toFixed(1)}%</p>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-0.5">
                <div
                  className={`h-1.5 rounded-full ${g.bg} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Charts Panel — enhanced 2-row layout
// ─────────────────────────────────────────────────────────────────────────────

function DashboardCharts({ transactions, incomeData }) {
  const now = new Date();
  const txDates = transactions
    .map(tx => parseLedgerDate(txDisplayDate(tx)))
    .filter(Boolean);

  const firstMonth = txDates.length
    ? new Date(Math.min(...txDates.map(d => new Date(d.getFullYear(), d.getMonth(), 1).getTime())))
    : new Date(now.getFullYear(), 0, 1);
  const lastMonth = txDates.length
    ? new Date(Math.max(...txDates.map(d => new Date(d.getFullYear(), d.getMonth(), 1).getTime())))
    : new Date(now.getFullYear(), 11, 1);
  const hasMultipleYears = firstMonth.getFullYear() !== lastMonth.getFullYear();
  const months = [];

  for (
    let d = new Date(firstMonth.getFullYear(), firstMonth.getMonth(), 1);
    d <= lastMonth;
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  ) {
    months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: hasMultipleYears
        ? `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`
        : MONTH_NAMES[d.getMonth()],
    });
  }

  const bucket = (tx) => {
    const d = parseLedgerDate(txDisplayDate(tx));
    if (!d) return -1;
    return months.findIndex(m => m.year === d.getFullYear() && m.month === d.getMonth());
  };

  const cashInByMonth  = Array(months.length).fill(0);
  const cashOutByMonth = Array(months.length).fill(0);

  transactions.forEach(tx => {
    const idx = bucket(tx);
    if (idx < 0) return;
    if (tx.type === 'cash_in') cashInByMonth[idx]  += tx.amount;
    else                       cashOutByMonth[idx] += tx.amount;
  });

  const labels = months.map(m => m.label);
  const chartMinWidth = Math.max(640, labels.length * 72);

  const cashInTx   = transactions.filter(tx => tx.type === 'cash_in');
  const breakdownDefs = [
    { key: 'loan_payment', label: 'Loan Payments', color: '#f97316' },
    { key: 'cbu',          label: 'CBU Deposits',  color: '#22c55e' },
    { key: 'membership_cbu', label: 'Membership CBU', color: '#16a34a' },
    { key: 'savings',      label: 'Savings',        color: '#3b82f6' },
    { key: 'membership_savings', label: 'Membership Savings', color: '#0284c7' },
    { key: 'membership',   label: 'Membership/Admin & Regulatory Fees', color: '#a855f7' },
    { key: 'vip_card',     label: 'WELLife VIP Card', color: '#ec4899' },
    { key: 'loan_interest', label: 'Loan Interest', color: '#16a34a' },
    { key: 'service_fee',  label: 'Service Fee',    color: '#fb923c' },
    { key: 'cbu_retention', label: 'CBU Retention', color: '#059669' },
    { key: 'regular_savings', label: 'Regular Savings', color: '#2563eb' },
    { key: 'legal_fees',   label: 'Legal Fees',     color: '#475569' },
    { key: 'clpi_insurance', label: 'CLPI/Insurance', color: '#dc2626' },
    { key: 'annual_dues',  label: 'Annual Due',     color: '#9333ea' },
    { key: 'penalty_due',  label: 'Penalty Due',    color: '#d97706' },
    { key: 'petty_cash',   label: 'Petty Cash',     color: '#65a30d' },
    { key: 'capital',      label: 'Capital',        color: '#6366f1' },
    { key: 'time_deposit', label: 'Time Deposits',  color: '#8b5cf6' },
    { key: 'savings_booster', label: 'Savings Booster', color: '#0f766e' },
    { key: 'invoice',      label: 'Other',          color: '#9ca3af' },
  ];
  const knownBreakdownKeys = new Set(breakdownDefs.map(def => def.key));
  const extraBreakdownDefs = [...new Set(cashInTx.map(tx => tx.category).filter(Boolean))]
    .filter(key => !knownBreakdownKeys.has(key))
    .map(key => ({ key, label: displayCategoryLabel(key), color: '#64748b' }));
  const membershipTotals = {
    membership: Number(incomeData?.membership_fee || 0) + Number(incomeData?.admin_regulatory_fees || 0),
    membership_cbu: Number(incomeData?.membership_cbu || 0),
    membership_savings: Number(incomeData?.membership_savings || 0),
    vip_card: Number(incomeData?.vip_card || 0),
  };
  const donutSlices = [...breakdownDefs, ...extraBreakdownDefs].map(d => ({
    ...d,
    value: Object.prototype.hasOwnProperty.call(membershipTotals, d.key)
      ? membershipTotals[d.key]
      : cashInTx.filter(tx => tx.category === d.key).reduce((s, tx) => s + tx.amount, 0),
  })).filter(d => d.value > 0);
  const grandCashIn = donutSlices.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-4 mb-6">

      {/* ── Row 1: Cash Flow Line + Cash-In Donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Cash Flow Area-Line Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Cash Flow Trend</h3>
              <p className="text-xs text-gray-400 mt-0.5">Monthly inflow vs. outflow trend · hover to inspect</p>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                <span className="w-4 h-1 bg-emerald-500 inline-block rounded-full" />
                Cash In
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
                <span className="w-4 h-1 bg-rose-500 inline-block rounded-full" />
                Cash Out
              </span>
            </div>
          </div>
          <div className="overflow-x-auto pb-1">
            <div style={{ minWidth: chartMinWidth }}>
              <CashFlowLineChart
                cashInData={cashInByMonth}
                cashOutData={cashOutByMonth}
                labels={labels}
                height={180}
              />
            </div>
          </div>
        </div>

        {/* Cash-In Donut */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-0.5">Cash In — Breakdown</h3>
          <p className="text-xs text-gray-400 mb-3">By category · hover to inspect</p>
          {donutSlices.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-xs text-gray-400">No data</div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-24">
                <EnhancedDonut slices={donutSlices} size={96} />
              </div>
              <div className="flex flex-col gap-1.5 min-w-0 flex-1 mt-1">
                {donutSlices.map(d => (
                  <div key={d.key} className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-xs text-gray-500 truncate flex-1">{d.label}</span>
                    <span className="text-xs font-semibold text-gray-700 tabular-nums flex-shrink-0">
                      {grandCashIn > 0 ? `${((d.value / grandCashIn) * 100).toFixed(0)}%` : '0%'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Monthly Diverging Bars + Penalty Card ── */}
      <div className="grid grid-cols-1 gap-4">

        {/* Diverging monthly comparison */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Monthly Comparison</h3>
              <p className="text-xs text-gray-400 mt-0.5">Cash In ↑ rises · Cash Out ↓ falls from center line</p>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 opacity-80" /> In
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-500 opacity-80" /> Out
              </span>
            </div>
          </div>
          <div className="overflow-x-auto pb-1">
            <div style={{ minWidth: chartMinWidth }}>
              <MonthlyDivergingChart
                cashInData={cashInByMonth}
                cashOutData={cashOutByMonth}
                labels={labels}
                height={136}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Range Picker
// ─────────────────────────────────────────────────────────────────────────────

function DateRangePicker({ from, to, onChange, years = [] }) {
  const selectedYear = years.find(year => from === `${year}-01-01` && to === `${year}-12-31`) || '';
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {years.length > 0 && (
        <select
          value={selectedYear}
          onChange={e => {
            const year = e.target.value;
            onChange(year ? { from: `${year}-01-01`, to: `${year}-12-31` } : { from: '', to: '' });
          }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] bg-white text-gray-700"
        >
          <option value="">All Years</option>
          {years.map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
        <Calendar size={13} className="text-gray-400 flex-shrink-0" />
        <span className="text-gray-400 text-xs">From</span>
        <input
          type="date"
          value={from}
          onChange={e => onChange({ from: e.target.value, to })}
          className="text-sm text-gray-700 bg-transparent border-none outline-none"
        />
      </div>
      <span className="text-gray-300 text-sm">—</span>
      <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
        <Calendar size={13} className="text-gray-400 flex-shrink-0" />
        <span className="text-gray-400 text-xs">To</span>
        <input
          type="date"
          value={to}
          onChange={e => onChange({ from, to: e.target.value })}
          className="text-sm text-gray-700 bg-transparent border-none outline-none"
        />
      </div>
      {(from || to) && (
        <button
          onClick={() => onChange({ from: '', to: '' })}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
        >
          <X size={11} /> Clear
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Row
// ─────────────────────────────────────────────────────────────────────────────

function TxRow({ tx }) {
  const isCashIn = tx.type === 'cash_in';
  const displayDate = txDisplayDate(tx);
  return (
    <tr className="hover:bg-gray-50/60 transition-colors">
      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
        {displayDate ? formatDateTime(displayDate) : '—'}
        {tx.source === 'imported' && tx.imported_at && (
          <div className="text-[10px] text-gray-400">
            Imported {formatDateTime(tx.imported_at)}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          isCashIn
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {isCashIn ? 'IN' : 'OUT'}
        </span>
      </td>
      <td className="px-4 py-3">
        <CategoryBadge category={tx.category} />
      </td>
      <td className="px-4 py-3 text-right">
        <span className={`text-sm font-semibold ${isCashIn ? 'text-green-700' : 'text-red-600'}`}>
          {formatCurrency(tx.amount)}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">
        {tx.member_name || '—'}
      </td>
      <td className="px-4 py-3 text-xs font-mono text-gray-500">
        {tx.ref_no || '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {tx.description || '—'}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">
        {tx.created_by || '—'}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Penalty Income Table
// ─────────────────────────────────────────────────────────────────────────────

function PenaltyIncomeTable({ penalties, loading }) {
  if (loading) {
    return <div className="flex justify-center py-10"><Spinner /></div>;
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-amber-100 flex items-center gap-2 bg-amber-50/40">
        <AlertTriangle size={14} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-amber-800">Penalty Income Records</h3>
        <span className="ml-auto text-xs text-amber-600 font-medium">
          {penalties.length} record{penalties.length !== 1 ? 's' : ''}
        </span>
      </div>

      {penalties.length === 0 ? (
        <div className="py-12 text-center">
          <AlertTriangle size={28} className="text-amber-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No penalty records found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                {['Date', 'Member', 'Description', 'Amount'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                      i === 3 ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {penalties.map(p => (
                <tr key={p.id} className="hover:bg-amber-50/20 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {p.penalty_date ? formatDate(p.penalty_date) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {p.members
                      ? `${p.members.first_name || ''} ${p.members.last_name || ''}`.trim() || '—'
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.description || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-amber-600 tabular-nums">
                      {formatCurrency(p.amount)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-amber-50/60 border-t border-amber-100">
                <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-amber-700">
                  Total Penalty Income
                </td>
                <td className="px-4 py-3 text-right text-sm font-bold text-amber-700 tabular-nums">
                  {formatCurrency(penalties.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CoopMonitoringPage() {
  const { user, hasPermission } = useAuth();
  const canCreate = hasPermission('account_monitoring', 'create');

  const [loading, setLoading]               = useState(true);
  const [fund, setFund]                     = useState({ balance: 0, cash_in: 0, cash_out: 0 });
  const [transactions, setTransactions]     = useState([]);
  const [penalties, setPenalties]           = useState([]);
  const [penaltiesLoading, setPenaltiesLoading] = useState(true);
  const [refreshing, setRefreshing]         = useState(false);

  const [typeFilter, setTypeFilter]   = useState('');
  const [catFilter, setCatFilter]     = useState('');
  const [dateRange, setDateRange]     = useState({ from: '', to: '' });

  const [fundModalOpen, setFundModalOpen]       = useState(false);
  const [fundAmount, setFundAmount]             = useState('');
  const [fundDate, setFundDate]                 = useState(new Date().toISOString().split('T')[0]);
  const [fundDescription, setFundDescription]   = useState('');
  const [siNo, setSiNo]                         = useState('');
  const [paymentMode, setPaymentMode]           = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes]         = useState('');
  const [savingFund, setSavingFund]             = useState(false);

  // ── Income Monitoring ──────────────────────────────────────────────────────
  const [incomePeriod, setIncomePeriod]     = useState('all');
  const [incomeRange, setIncomeRange]       = useState({ from: '', to: '' });
  const [incomeData, setIncomeData]         = useState(null);
  const [incomeLoading, setIncomeLoading]   = useState(true);

  function getDateRangeForPeriod(period) {
    const today = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const toStr = fmt(today);
    if (period === 'daily')        return { from: toStr, to: toStr };
    if (period === 'weekly')       { const d = new Date(today); d.setDate(d.getDate() - 6); return { from: fmt(d), to: toStr }; }
    if (period === 'semi_monthly') { const d = new Date(today); d.setDate(d.getDate() - 14); return { from: fmt(d), to: toStr }; }
    if (period === 'monthly')      { return { from: `${today.getFullYear()}-${pad(today.getMonth()+1)}-01`, to: toStr }; }
    if (period === 'yearly')       { return { from: `${today.getFullYear()}-01-01`, to: toStr }; }
    if (period === 'custom')       return incomeRange;
    return { from: null, to: null };
  }

  function applyIncomePeriod(period) {
    setIncomePeriod(period);
    if (period !== 'custom') {
      const range = getDateRangeForPeriod(period);
      setDateRange({ from: range.from || '', to: range.to || '' });
    }
  }

  const fetchIncome = useCallback(async (period = incomePeriod, range = incomeRange) => {
    try {
      setIncomeLoading(true);
      const dr = dateRange.from || dateRange.to
        ? dateRange
        : period === 'custom' ? range : getDateRangeForPeriod(period);
      const data = await getIncomeBreakdown({ from: dr.from || null, to: dr.to || null });
      setIncomeData(data);
    } catch (err) {
      console.error('[CoopMonitoringPage] income fetch error:', err);
    } finally {
      setIncomeLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomePeriod, incomeRange, dateRange]);

  const fetchPenalties = useCallback(async () => {
    try {
      setPenaltiesLoading(true);
      const { data, error } = await supabase
        .from('penalties')
        .select('*, members(first_name, last_name)')
        .order('penalty_date', { ascending: false });
      if (error) throw error;
      setPenalties(data || []);
    } catch (err) {
      console.error('[CoopMonitoringPage] penalty fetch error:', err);
    } finally {
      setPenaltiesLoading(false);
    }
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      const { fund: f, transactions: txs } = await computeCoopSummaryFromInvoices();
      setFund(f);
      setTransactions(txs);
    } catch (err) {
      console.error('[CoopMonitoringPage] fetch error:', err);
      toast.error('Failed to load cooperative fund data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchPenalties();
  }, [fetchData, fetchPenalties]);

  useEffect(() => { fetchIncome(incomePeriod, incomeRange); }, [incomePeriod, incomeRange, dateRange, fetchIncome]);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        fetchData(true),
        fetchPenalties(),
        fetchIncome(incomePeriod, incomeRange),
      ]);
      toast.success('Fund monitoring refreshed.');
    } catch (err) {
      console.error('[CoopMonitoringPage] refresh error:', err);
      toast.error(err.message || 'Failed to refresh fund monitoring.');
    } finally {
      setRefreshing(false);
    }
  }, [fetchData, fetchPenalties, fetchIncome, incomePeriod, incomeRange]);

  async function handleAddFund() {
    if (!canCreate) {
      return toast.error('You do not have permission to add fund movements');
    }
    const value = parseFloat(fundAmount) || 0;
    const referenceRequired = ['GCash', 'Bank Transfer', 'Check'].includes(paymentMode);

    if (!siNo.trim())          return toast.error('SI# is required.');
    if (!paymentMode)          return toast.error('Mode of payment is required.');
    if (referenceRequired && !paymentReference.trim())
      return toast.error('Reference is required for selected payment mode.');
    if (value <= 0)            return toast.error('Enter a valid amount.');
    if (!fundDate)             return toast.error('Date is required.');

    setSavingFund(true);
    try {
      await recordManualFundDeposit({
        invoice_no:        siNo.trim(),
        amount:            value,
        date:              fundDate,
        description:       fundDescription,
        created_by:        user?.id ?? null,
        payment_mode:      paymentMode,
        payment_mode_note: [paymentReference.trim(), paymentNotes.trim()].filter(Boolean).join(' | ') || null,
      });
      toast.success('Fund added successfully.');
      setFundModalOpen(false);
      setFundAmount(''); setFundDescription(''); setSiNo('');
      setPaymentMode(''); setPaymentReference(''); setPaymentNotes('');
      setFundDate(new Date().toISOString().split('T')[0]);
      await fetchData(true);
    } catch (err) {
      console.error('[CoopMonitoringPage] add fund error:', err);
      toast.error(err.message || 'Failed to add fund.');
    } finally {
      setSavingFund(false);
    }
  }

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const baseYears = Array.from({ length: Math.max(8, currentYear - 2024 + 5) }, (_, i) => 2024 + i);
    const transactionYears = transactions
      .map(tx => parseLedgerDate(txDisplayDate(tx)))
      .filter(Boolean)
      .map(d => d.getFullYear());

    return [...new Set([...baseYears, ...transactionYears])].sort((a, b) => b - a);
  }, [transactions]);

  const dateFilteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const txDate = parseLedgerDate(txDisplayDate(tx));
      if (!txDate) return !dateRange.from && !dateRange.to;
      if (dateRange.from && txDate < new Date(dateRange.from)) return false;
      if (dateRange.to) {
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        if (txDate > toDate) return false;
      }
      return true;
    });
  }, [transactions, dateRange]);

  const scopedFund = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return fund;
    const cashIn = dateFilteredTransactions
      .filter(tx => tx.type === 'cash_in')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const cashOut = dateFilteredTransactions
      .filter(tx => tx.type === 'cash_out')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    return {
      cash_in: Math.round(cashIn * 100) / 100,
      cash_out: Math.round(cashOut * 100) / 100,
      balance: Math.round((cashIn - cashOut) * 100) / 100,
    };
  }, [fund, dateFilteredTransactions, dateRange]);

  const filtered = useMemo(() => {
    return dateFilteredTransactions.filter(tx => {
      if (typeFilter && tx.type !== typeFilter) return false;
      if (catFilter  && tx.category !== catFilter) return false;
      return true;
    });
  }, [dateFilteredTransactions, typeFilter, catFilter]);

  const visibleTransactions = useMemo(
    () => filtered.slice(0, MAX_VISIBLE_FUND_ROWS),
    [filtered]
  );

  const loanPaymentTotal = useMemo(() => {
    return dateFilteredTransactions
      .filter(tx => tx.type === 'cash_in' && (tx.category === 'loan_payment' || tx.raw_type === 'loan_payment'))
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }, [dateFilteredTransactions]);

  const loanReleaseTotal = useMemo(() => {
    return dateFilteredTransactions
      .filter(tx => tx.type === 'cash_out' && isLoanReleaseCategory(tx.category))
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }, [dateFilteredTransactions]);

  const totalExpenseAmount = useMemo(() => {
    return dateFilteredTransactions
      .filter(tx => (
        tx.type === 'cash_out' &&
        !isLoanReleaseCategory(tx.category) &&
        !isWithdrawalCategory(tx.category)
      ))
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }, [dateFilteredTransactions]);

  const expenseMonitoring = useMemo(() => {
    const cashOutRows = dateFilteredTransactions.filter(tx => tx.type === 'cash_out');
    const expenseRows = cashOutRows.filter(tx => (
      !isLoanReleaseCategory(tx.category) &&
      !isWithdrawalCategory(tx.category)
    ));
    const sumBy = predicate => cashOutRows
      .filter(predicate)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const expenseSumBy = predicate => expenseRows
      .filter(predicate)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const groupedExpenseCards = Object.entries(
      expenseRows
        .filter(tx => !isOtherExpenseCategory(originalExpenseCategory(tx)))
        .reduce((groups, tx) => {
          const key = originalExpenseCategory(tx) || 'others';
          groups[key] = (groups[key] || 0) + Number(tx.amount || 0);
          return groups;
        }, {})
    )
      .map(([category, value], index) => ({
        label: displayCategoryLabel(category),
        value: Math.round(value * 100) / 100,
        color: [
          'bg-rose-50 border-rose-100',
          'bg-orange-50 border-orange-100',
          'bg-amber-50 border-amber-100',
          'bg-sky-50 border-sky-100',
          'bg-violet-50 border-violet-100',
          'bg-cyan-50 border-cyan-100',
        ][index % 6],
        text: [
          'text-rose-700',
          'text-orange-700',
          'text-amber-700',
          'text-sky-700',
          'text-violet-700',
          'text-cyan-700',
        ][index % 6],
        sub: 'Recorded expense category',
      }))
      .sort((a, b) => b.value - a.value);

    return {
      total: expenseSumBy(() => true),
      loanReleases: sumBy(tx => isLoanReleaseCategory(tx.category)),
      withdrawals: sumBy(tx => ['cbu_withdrawal', 'savings_withdrawal'].includes(tx.category)),
      otherExpenses: expenseSumBy(tx => isOtherExpenseCategory(originalExpenseCategory(tx))),
      cards: groupedExpenseCards,
      count: cashOutRows.length,
      expenseCount: expenseRows.length,
    };
  }, [dateFilteredTransactions]);

  const filteredPenalties = useMemo(() => {
    return penalties.filter(p => {
      if (dateRange.from && p.penalty_date < dateRange.from) return false;
      if (dateRange.to   && p.penalty_date > dateRange.to)   return false;
      return true;
    });
  }, [penalties, dateRange]);

  const penaltyTotal = filteredPenalties.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const categories   = [...new Set(dateFilteredTransactions.map(tx => tx.category).filter(Boolean))];
  const hasFilters   = typeFilter || catFilter || dateRange.from || dateRange.to;
  const hasDateFilter = dateRange.from || dateRange.to;

  const cashInRows = useMemo(() => filtered.filter(tx => tx.type === 'cash_in'), [filtered]);
  const cashOutRows = useMemo(() => filtered.filter(tx => tx.type === 'cash_out'), [filtered]);
  const incomeMonitoringRows = useMemo(() => (incomeData ? [
    ['Loan Interest', incomeData.loan_interest || 0],
    ['Service Fee', incomeData.service_fee || 0],
    ['CBU Retention', incomeData.cbu_retention || 0],
    ['Membership CBU', incomeData.membership_cbu || 0],
    ['Legal Fees', incomeData.legal_fees || 0],
    ['CLPI/Insurance', incomeData.clpi_insurance || 0],
    ['Regular Savings', incomeData.regular_savings || 0],
    ['Membership Savings', incomeData.membership_savings || 0],
    ['Penalty Due', incomeData.penalty_due || 0],
    ['Annual Due', incomeData.annual_dues || 0],
    ['CBU Completion', incomeData.cbu_completion || 0],
    ['Petty Cash', incomeData.petty_cash || 0],
    ['Membership/Admin & Regulatory Fees', Number(incomeData.membership_fee || 0) + Number(incomeData.admin_regulatory_fees || 0)],
    ['WELLife VIP Card', incomeData.vip_card || 0],
    ['Total Coop Income', incomeData.total_income || 0],
  ] : []), [incomeData]);
  const expenseMonitoringRows = useMemo(() => [
    ['Loan Releases', expenseMonitoring.loanReleases || 0],
    ...expenseMonitoring.cards.map(card => [card.label, card.value || 0]),
    ['Other Expenses', expenseMonitoring.otherExpenses || 0],
    ['Total Expense', expenseMonitoring.total || 0],
  ], [expenseMonitoring]);
  const fmt = (n) => 'PHP ' + Number(n ?? 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const reportTransactionRows = useCallback(rows => rows.map(tx => {
    const displayDate = txDisplayDate(tx);
    return {
      'Date & Time': displayDate ? formatDateTime(displayDate) : '',
      Type: tx.type === 'cash_in' ? 'IN' : 'OUT',
      Category: CATEGORY_LABEL[tx.category] || tx.category || '',
      Amount: Number(tx.amount || 0),
      Member: tx.member_name || '',
      Reference: tx.ref_no || '',
      Description: tx.description || '',
      'Created By': tx.created_by || '',
    };
  }), []);
  const printableTransactionRows = rows => rows.map(tx => {
    const displayDate = txDisplayDate(tx);
    return `<tr>
      <td style="white-space:nowrap">${escapeHtml(displayDate ? formatDateTime(displayDate) : '-')}</td>
      <td style="text-align:center">${escapeHtml(tx.type === 'cash_in' ? 'IN' : 'OUT')}</td>
      <td>${escapeHtml(CATEGORY_LABEL[tx.category] || tx.category || '-')}</td>
      <td style="text-align:right;font-weight:600;color:${tx.type === 'cash_in' ? '#065f46' : '#b91c1c'}">${escapeHtml(fmt(tx.amount))}</td>
      <td>${escapeHtml(tx.member_name || '-')}</td>
      <td style="font-family:monospace">${escapeHtml(tx.ref_no || '-')}</td>
      <td>${escapeHtml(tx.description || '-')}</td>
      <td>${escapeHtml(tx.created_by || '-')}</td>
    </tr>`;
  }).join('');
  const printableSummaryRows = rows => rows.map(([label, value]) => `<tr>
    <td>${escapeHtml(label)}</td>
    <td style="text-align:right;font-weight:600">${escapeHtml(fmt(value))}</td>
  </tr>`).join('');
  function appendSheet(workbook, rows, sheetName) {
    const sheet = Array.isArray(rows?.[0])
      ? XLSX.utils.aoa_to_sheet(rows)
      : XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
  }

  function handlePrint() {
    const fmt = (n) => 'PHP ' + Number(n ?? 0).toLocaleString('en-PH', {minimumFractionDigits:2,maximumFractionDigits:2});
    const rows = filtered.map(tx => {
      const displayDate = txDisplayDate(tx);
      return `<tr>
      <td style="white-space:nowrap">${displayDate ? formatDateTime(displayDate) : '—'}</td>
      <td>${CATEGORY_LABEL[tx.category]||tx.category||'—'}</td>
      <td>${tx.description||'—'}</td>
      <td style="font-family:monospace">${tx.ref_no||'—'}</td>
      <td style="text-align:right;font-weight:600;color:${tx.type==='cash_in'?'#065f46':'#b91c1c'}">${fmt(tx.amount)}</td>
      <td style="text-align:center">${tx.type==='cash_in'?'Cash In':'Cash Out'}</td>
    </tr>`;
    }).join('');
    const html = `
      <h1 class="report-title">Cooperative Fund Monitoring</h1>
      <div class="report-meta">Fund transactions &nbsp;|&nbsp; ${filtered.length} records &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-PH')}</div>
      <table>
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Ref No.</th><th style="text-align:right">Amount</th><th style="text-align:center">Flow</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="confidential">WELLSERVE Cooperative Monitoring System — Authorized personnel only.</div>
    `;
    const win = printHtmlDocument(wrapWithLetterhead(html, {title:'Coop Fund Monitoring — WELLSERVE'}), {
      onBlocked: () => toast.error('Pop-up blocked. Please allow pop-ups and try again.'),
    });
    if (win) toast.success('Print dialog opened.');
  }

  function handleExportCSV() {
    try {
      if (filtered.length === 0) { toast.error('No transactions to export.'); return; }
      const rows = filtered.map(tx => {
        const displayDate = txDisplayDate(tx);
        return {
          date:        displayDate ? formatDateTime(displayDate) : '',
          type:        tx.type === 'cash_in' ? 'IN' : 'OUT',
          category:    CATEGORY_LABEL[tx.category] || tx.category || '',
          amount:      tx.amount || 0,
          member:      tx.member_name || '',
          loan_no:     tx.ref_no || '',
          description: tx.description || '',
          created_by:  tx.created_by || '',
        };
      });
      handleExportFundMonitoring();
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV');
    }
  }

  function handlePrintFundMonitoring() {
    const generatedAt = new Date().toLocaleString('en-PH');
    const emptyTransactionRow = '<tr><td colspan="8" style="text-align:center;color:#64748b">No transactions found.</td></tr>';
    const transactionRows = printableTransactionRows(filtered) || emptyTransactionRow;
    const cashInPrintRows = printableTransactionRows(cashInRows) || emptyTransactionRow;
    const cashOutPrintRows = printableTransactionRows(cashOutRows) || emptyTransactionRow;

    const html = `
      <h1 class="report-title">Fund Monitoring</h1>
      <div class="report-meta">Fund summary | ${filtered.length} transactions | Generated: ${escapeHtml(generatedAt)}</div>
      <div class="summary-grid">
        <div><strong>Current Fund Balance</strong><span>${escapeHtml(formatCurrency(scopedFund.balance))}</span></div>
        <div><strong>Cash In</strong><span>${escapeHtml(formatCurrency(scopedFund.cash_in))}</span></div>
        <div><strong>Cash Out</strong><span>${escapeHtml(formatCurrency(scopedFund.cash_out))}</span></div>
        <div><strong>Net Cash Flow</strong><span>${escapeHtml(formatCurrency(scopedFund.cash_in - scopedFund.cash_out))}</span></div>
      </div>

      <h2>Income Monitoring</h2>
      <table>
        <thead><tr><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${printableSummaryRows(incomeMonitoringRows)}</tbody>
      </table>

      <h2>Expense Monitoring</h2>
      <table>
        <thead><tr><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${printableSummaryRows(expenseMonitoringRows)}</tbody>
      </table>

      <h2>Cash In</h2>
      <table>
        <thead><tr><th>Date & Time</th><th>Type</th><th>Category</th><th style="text-align:right">Amount</th><th>Member</th><th>Reference</th><th>Description</th><th>Created By</th></tr></thead>
        <tbody>${cashInPrintRows}</tbody>
      </table>

      <h2>Cash Out</h2>
      <table>
        <thead><tr><th>Date & Time</th><th>Type</th><th>Category</th><th style="text-align:right">Amount</th><th>Member</th><th>Reference</th><th>Description</th><th>Created By</th></tr></thead>
        <tbody>${cashOutPrintRows}</tbody>
      </table>

      <h2>All Fund Transactions</h2>
      <table>
        <thead><tr><th>Date & Time</th><th>Type</th><th>Category</th><th style="text-align:right">Amount</th><th>Member</th><th>Reference</th><th>Description</th><th>Created By</th></tr></thead>
        <tbody>${transactionRows}</tbody>
      </table>
      <div class="confidential">WELLSERVE Cooperative Monitoring System - Authorized personnel only.</div>
    `;

    const printDocument = `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Fund Monitoring - WELLSERVE</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 28px; background: #fff; color: #0f172a; font-family: Arial, sans-serif; font-size: 12px; }
          .print-header { border-bottom: 2px solid #059669; margin-bottom: 18px; padding-bottom: 12px; }
          .brand { font-size: 18px; font-weight: 800; letter-spacing: .12em; color: #0f172a; }
          .brand-sub { color: #059669; font-size: 10px; font-weight: 700; letter-spacing: .16em; margin-top: 2px; }
          h1.report-title { margin: 18px 0 4px; font-size: 20px; color: #0f172a; }
          .report-meta { color: #64748b; margin-bottom: 16px; }
          h2 { margin: 22px 0 8px; font-size: 14px; color: #0f172a; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0 20px; }
          .summary-grid div { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
          .summary-grid strong { display: block; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
          .summary-grid span { display: block; margin-top: 4px; font-size: 14px; font-weight: 700; color: #0f172a; }
          table { table-layout: fixed; width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th { background: #f8fafc; color: #64748b; text-align: left; font-size: 10px; text-transform: uppercase; padding: 8px; border-bottom: 1px solid #e5e7eb; }
          td { padding: 8px; border-bottom: 1px solid #eef2f7; vertical-align: top; word-break: break-word; }
          .confidential { color: #64748b; font-size: 10px; font-style: italic; margin-top: 20px; text-align: center; }
          @media print { body { padding: 18px; } }
        </style>
      </head>
      <body>
        <div class="print-header">
          <div class="brand">WELLSERVE</div>
          <div class="brand-sub">CREDIT COOPERATIVE</div>
        </div>
        ${html}
      </body>
      </html>`;

    const win = window.open('', '_blank', 'width=1100,height=900');
    if (!win) {
      toast.error('Pop-up blocked. Please allow pop-ups and try again.');
      return;
    }

    win.document.open();
    win.document.write(printDocument);
    win.document.close();
    win.focus();

    window.setTimeout(() => {
      if (!win.closed) win.print();
    }, 500);
    toast.success('Print preview opened.');
  }

  function handleExportFundMonitoring() {
    try {
      const workbook = XLSX.utils.book_new();
      appendSheet(workbook, [
        ['Metric', 'Amount'],
        ['Current Fund Balance', scopedFund.balance],
        ['Cash In', scopedFund.cash_in],
        ['Cash Out', scopedFund.cash_out],
        ['Net Cash Flow', scopedFund.cash_in - scopedFund.cash_out],
      ], 'Summary');
      appendSheet(workbook, [['Category', 'Amount'], ...incomeMonitoringRows], 'Income Monitoring');
      appendSheet(workbook, [['Category', 'Amount'], ...expenseMonitoringRows], 'Expense Monitoring');
      appendSheet(workbook, reportTransactionRows(cashInRows), 'Cash In');
      appendSheet(workbook, reportTransactionRows(cashOutRows), 'Cash Out');
      appendSheet(workbook, reportTransactionRows(filtered), 'All Transactions');
      XLSX.writeFile(workbook, `fund_monitoring_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Excel workbook exported successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to export fund monitoring workbook');
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Fund Monitoring"
        subtitle="Cooperative fund — cash inflow and outflow overview"
        action={
          <div className="flex items-center gap-2">
            {canCreate && (
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setFundModalOpen(true)}>
              Add Fund
            </Button>
            )}
            <Button variant="outline" icon={<Printer size={14} />} onClick={handlePrintFundMonitoring}>
              Print
            </Button>
            <Button variant="outline" icon={<Download size={14} />} onClick={handleExportFundMonitoring}>
              Export
            </Button>
            <Button
              variant="outline"
              icon={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-24"><Spinner /></div>
      ) : (
        <>
          <div className="mt-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <DateRangePicker
                from={dateRange.from}
                to={dateRange.to}
                onChange={range => {
                  setIncomePeriod(range.from || range.to ? 'custom' : 'all');
                  setDateRange(range);
                }}
                years={availableYears}
              />
            </div>
          </div>

          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mt-4 mb-6">
            <StatCard
              icon={<PesoSign size={22} className="text-emerald-600" />}
              label="Current Fund Balance"
              value={formatCurrency(scopedFund.balance)}
              sub={hasDateFilter ? 'Selected period: Cash In minus Cash Out' : 'Cash In minus Cash Out'}
              bg="bg-emerald-50"
              textColor={scopedFund.balance >= 0 ? 'text-emerald-700' : 'text-red-600'}
              accentColor={scopedFund.balance >= 0 ? 'bg-emerald-400' : 'bg-red-400'}
            />
            <StatCard
              icon={<ArrowUpRight size={22} className="text-orange-600" />}
              label="Loan Payment"
              value={formatCurrency(loanPaymentTotal)}
              sub="Loan Principal Collected"
              bg="bg-orange-50"
              textColor="text-orange-700"
              accentColor="bg-orange-400"
            />
            <StatCard
              icon={<TrendingUp size={22} className="text-green-600" />}
              label="Loan Interest"
              value={formatCurrency(incomeData?.loan_interest || 0)}
              sub="Interest earned from loan"
              bg="bg-green-50"
              textColor="text-green-700"
              accentColor="bg-green-400"
            />
            <StatCard
              icon={<TrendingDown size={22} className="text-red-500" />}
              label="Loan Release"
              value={formatCurrency(loanReleaseTotal)}
              sub="Released loan proceeds"
              bg="bg-red-50"
              textColor="text-red-600"
              accentColor="bg-red-400"
            />
            <StatCard
              icon={<ArrowDownRight size={22} className="text-slate-600" />}
              label="Total Expense"
              value={formatCurrency(totalExpenseAmount)}
              sub="Cooperative expenses"
              bg="bg-slate-50"
              textColor="text-slate-700"
              accentColor="bg-slate-400"
            />
          </div>

          {/* ── Dashboard Charts ── */}
          <DashboardCharts transactions={dateFilteredTransactions} incomeData={incomeData} />

          {/* ── Cash-In Breakdown ── */}
          {/* ── Income Monitoring Breakdown ── */}
          <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-bold text-gray-800">Income Monitoring</h2>
                <p className="text-xs text-gray-400 mt-0.5">Breakdown by income source — loans, membership, fees</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: 'daily',        label: 'Daily' },
                  { key: 'weekly',       label: 'Weekly' },
                  { key: 'semi_monthly', label: 'Semi-Monthly' },
                  { key: 'monthly',      label: 'Monthly' },
                  { key: 'yearly',       label: 'Yearly' },
                  { key: 'all',          label: 'All Time' },
                  { key: 'custom',       label: 'Custom' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => applyIncomePeriod(key)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                      incomePeriod === key
                        ? 'bg-[#07A04E] text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => fetchIncome(incomePeriod, incomeRange)}
                  className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={13} className={incomeLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Custom date range */}
            {incomePeriod === 'custom' && (
              <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={e => {
                    setIncomeRange(r => ({ ...r, from: e.target.value }));
                    setDateRange(r => ({ ...r, from: e.target.value }));
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={e => {
                    setIncomeRange(r => ({ ...r, to: e.target.value }));
                    setDateRange(r => ({ ...r, to: e.target.value }));
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
                />
              </div>
            )}

            {/* Income cards */}
            <div className="p-5">
              {incomeLoading ? (
                <div className="flex items-center justify-center h-24 text-gray-300">
                  <RefreshCw size={20} className="animate-spin" />
                </div>
              ) : incomeData ? (
                <>
                  {/* Total Income highlight */}
                  <div className="mb-4 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Total Coop Income</p>
                      <p className="text-2xl font-bold text-emerald-800 mt-0.5">{formatCurrency(incomeData.total_income)}</p>
                      <p className="text-xs text-emerald-600 mt-0.5">
                        {incomeData.loan_count} loan{incomeData.loan_count !== 1 ? 's' : ''} · {incomeData.tx_count} fund tx
                        {incomePeriod !== 'all' ? ` · ${incomePeriod.replace('_', '-')}` : ' · all time'}
                      </p>
                    </div>
                    <TrendingUp size={32} className="text-emerald-300" />
                  </div>

                  {/* Income cards grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {[
                      { label: 'Service Fee', value: incomeData.service_fee, color: 'bg-orange-50 border-orange-100', text: 'text-orange-700', sub: 'Processing fees collected' },
                      { label: 'CBU Retention', value: incomeData.cbu_retention, color: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700', sub: 'Capital build-up deductions' },
                      { label: 'Membership CBU', value: incomeData.membership_cbu, color: 'bg-green-50 border-green-100', text: 'text-green-700', sub: 'Initial CBU from membership payments' },
                      { label: 'Legal Fees', value: incomeData.legal_fees, color: 'bg-slate-50 border-slate-100', text: 'text-slate-700', sub: 'Legal and notarial deductions' },
                      { label: 'CLPI/Insurance', value: incomeData.clpi_insurance, color: 'bg-red-50 border-red-100', text: 'text-red-700', sub: 'Loan protection and insurance' },
                      { label: 'Regular Savings', value: incomeData.regular_savings, color: 'bg-blue-50 border-blue-100', text: 'text-blue-700', sub: 'Savings deductions' },
                      { label: 'Membership Savings', value: incomeData.membership_savings, color: 'bg-sky-50 border-sky-100', text: 'text-sky-700', sub: 'Initial savings from membership payments' },
                      { label: 'Penalty Due', value: incomeData.penalty_due, color: 'bg-amber-50 border-amber-100', text: 'text-amber-700', sub: 'Penalty deductions' },
                      { label: 'Annual Due', value: incomeData.annual_dues, color: 'bg-purple-50 border-purple-100', text: 'text-purple-700', sub: 'Yearly membership dues' },
                      { label: 'CBU Completion', value: incomeData.cbu_completion, color: 'bg-teal-50 border-teal-100', text: 'text-teal-700', sub: 'CBU completion deductions' },
                      { label: 'Petty Cash', value: incomeData.petty_cash, color: 'bg-lime-50 border-lime-100', text: 'text-lime-700', sub: 'Petty cash deductions' },
                      { label: 'Membership/Admin & Regulatory Fees', value: Number(incomeData.membership_fee || 0) + Number(incomeData.admin_regulatory_fees || 0), color: 'bg-violet-50 border-violet-100', text: 'text-violet-700', sub: 'Old membership fees and new admin fees' },
                      { label: 'WELLife VIP Card', value: incomeData.vip_card, color: 'bg-pink-50 border-pink-100', text: 'text-pink-700', sub: 'VIP card collections' },
                    ].map(card => (
                      <div key={card.label} className={`rounded-xl border p-4 ${card.color}`}>
                        <p className={`text-[10px] font-semibold uppercase tracking-wide ${card.text}`}>{card.label}</p>
                        <p className={`text-lg font-bold mt-1 ${card.text}`}>{formatCurrency(card.value)}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{card.sub}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">No income data available.</p>
              )}
            </div>
          </section>

          {/* ── Filters Row ── */}
          <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-bold text-gray-800">Expense Monitoring</h2>
                <p className="text-xs text-gray-400 mt-0.5">Breakdown by recorded expense category</p>
              </div>
              <div className="text-xs text-gray-400">
                {expenseMonitoring.expenseCount} expense record{expenseMonitoring.expenseCount !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="p-5">
              <div className="mb-4 p-4 bg-gradient-to-r from-red-50 to-slate-50 rounded-xl border border-red-100 flex items-center justify-between">
                <div>
                  <p className="text-xs text-red-600 font-semibold uppercase tracking-wide">Total Expense</p>
                  <p className="text-2xl font-bold text-red-700 mt-0.5">{formatCurrency(expenseMonitoring.total)}</p>
                  <p className="text-xs text-red-500 mt-0.5">
                    Expense categories only. Loan releases and member withdrawals are tracked separately.
                  </p>
                </div>
                <TrendingDown size={32} className="text-red-300" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: 'Loan Releases', value: expenseMonitoring.loanReleases, color: 'bg-red-50 border-red-100', text: 'text-red-700', sub: 'Released loan net proceeds' },
                  ...expenseMonitoring.cards,
                  { label: 'Other Expenses', value: expenseMonitoring.otherExpenses, color: 'bg-gray-50 border-gray-100', text: 'text-gray-700', sub: 'Uncategorized or manual-review expenses' },
                ].map(card => (
                  <div key={card.label} className={`rounded-xl border p-4 ${card.color}`}>
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${card.text}`}>{card.label}</p>
                    <p className={`text-lg font-bold mt-1 ${card.text}`}>{formatCurrency(card.value)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{card.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] bg-white text-gray-700"
            >
              <option value="">All Types</option>
              <option value="cash_in">Cash In</option>
              <option value="cash_out">Cash Out</option>
            </select>

            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] bg-white text-gray-700"
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{CATEGORY_LABEL[c] || c}</option>
              ))}
            </select>

            {hasFilters && (
              <button
                onClick={() => { setTypeFilter(''); setCatFilter(''); setIncomePeriod('all'); setDateRange({ from: '', to: '' }); }}
                className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
              >
                Clear all filters
              </button>
            )}

            <p className="ml-auto self-center text-xs text-gray-400">
              {filtered.length} of {dateFilteredTransactions.length} transactions
            </p>
          </div>

          {/* ── Transactions Table ── */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <LayoutDashboard size={15} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700">All Fund Transactions</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    {['Date', 'Type', 'Category', 'Amount', 'Member', 'Reference', 'Description', 'Created By'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                          i === 1 ? 'text-center' : i === 3 ? 'text-right' : 'text-left'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <PesoSign size={32} className="text-gray-200" />
                          <p className="text-sm">
                            {hasFilters
                              ? 'No transactions match your filters.'
                              : 'No fund transactions recorded yet.'}
                          </p>
                          {!hasFilters && (
                            <p className="text-xs text-gray-400 max-w-xs text-center">
                              Transactions appear here automatically when payments are posted
                              and invoices are marked paid.
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visibleTransactions.map(tx => <TxRow key={tx.id} tx={tx} />)
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Showing <span className="font-medium text-gray-600">{visibleTransactions.length}</span> of{' '}
                  <span className="font-medium text-gray-600">{filtered.length}</span> filtered /{' '}
                  <span className="font-medium text-gray-600">{dateFilteredTransactions.length}</span> transactions
                </p>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-green-700 font-medium tabular-nums">
                    In: {formatCurrency(
                      filtered.filter(tx => tx.type === 'cash_in').reduce((s, tx) => s + tx.amount, 0)
                    )}
                  </span>
                  <span className="text-red-600 font-medium tabular-nums">
                    Out: {formatCurrency(
                      filtered.filter(tx => tx.type === 'cash_out').reduce((s, tx) => s + tx.amount, 0)
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Add Fund Modal ── */}
      <Modal open={fundModalOpen} onClose={() => setFundModalOpen(false)} title="Add Fund" size="sm">
        <div className="space-y-4">
          {[
            { label: 'SI#', value: siNo, set: setSiNo, placeholder: 'Enter SI#', type: 'text' },
            { label: 'Amount', value: fundAmount, set: setFundAmount, placeholder: '0.00', type: 'number' },
            { label: 'Date', value: fundDate, set: setFundDate, placeholder: '', type: 'date' },
          ].map(({ label, value, set, placeholder, type }) => (
            <div key={label}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type={type}
                step={type === 'number' ? '0.01' : undefined}
                min={type === 'number' ? '0' : undefined}
                value={value}
                onChange={e => set(e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
              />
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mode of Payment</label>
            <select
              value={paymentMode}
              onChange={e => setPaymentMode(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] bg-white"
            >
              {PAYMENT_MODE_OPTIONS.map(opt => (
                <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reference / Account / Check No.
            </label>
            <input
              type="text"
              value={paymentReference}
              onChange={e => setPaymentReference(e.target.value)}
              placeholder="Optional for Cash, required for GCash/Bank/Check"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Notes</label>
            <textarea
              value={paymentNotes}
              onChange={e => setPaymentNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={fundDescription}
              onChange={e => setFundDescription(e.target.value)}
              placeholder="Manual fund deposit"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <Button variant="outline" onClick={() => setFundModalOpen(false)}>Cancel</Button>
          <Button loading={savingFund} onClick={handleAddFund} icon={<Plus size={14} />}>
            Add Fund
          </Button>
        </div>
      </Modal>
    </div>
  );
}

