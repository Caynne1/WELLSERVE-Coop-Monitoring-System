import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  TrendingUp, TrendingDown,  RefreshCw, ArrowUpRight, ArrowDownRight,
  LayoutDashboard, Plus, AlertTriangle, Calendar,
  X, Printer, Download,
} from 'lucide-react';
import PesoSign from '../../components/shared/PesoSign';
import { exportToCSV } from '../../utils/csvExport';
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
  const PAD = { t: 16, b: 26, l: 6, r: 6 };
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
                <stop offset="0%"   stopColor="#22c55e" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="cm-area-out" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#ef4444" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Dashed grid lines */}
            {gridYs.map((y, i) => (
              <line key={i} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                stroke="#F3F4F6" strokeWidth={1} strokeDasharray="3 4" />
            ))}

            {/* Hover vertical guide */}
            {hoveredIdx !== null && (
              <line
                x1={px(hoveredIdx)} y1={PAD.t}
                x2={px(hoveredIdx)} y2={PAD.t + iH}
                stroke="#CBD5E1" strokeWidth={1} strokeDasharray="3 3"
              />
            )}

            {/* Gradient area fills */}
            <path d={makeArea(cashInData, inPath)}   fill="url(#cm-area-in)"  />
            <path d={makeArea(cashOutData, outPath)} fill="url(#cm-area-out)" />

            {/* Line glows */}
            <path d={inPath}  fill="none" stroke="#22c55e" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.15} />
            <path d={outPath} fill="none" stroke="#ef4444" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.15} />

            {/* Lines */}
            <path d={inPath}  fill="none" stroke="#16a34a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            <path d={outPath} fill="none" stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

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
                  <circle cx={px(i)} cy={py(inV)} r={isHov ? 5 : 3}
                    fill="white" stroke="#16a34a" strokeWidth={isHov ? 2.5 : 1.5} />
                  {/* Cash Out dot */}
                  <circle cx={px(i)} cy={py(outV)} r={isHov ? 5 : 3}
                    fill="white" stroke="#dc2626" strokeWidth={isHov ? 2.5 : 1.5} />

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
                  <text x={px(i)} y={H - 6} textAnchor="middle" fontSize={9}
                    fill={isHov ? '#374151' : '#9CA3AF'}
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
  const PAD    = { t: 22, b: 22, l: 4, r: 10 };
  const iW     = W - PAD.l - PAD.r;
  const iH     = H - PAD.t - PAD.b;
  const midY   = PAD.t + iH / 2;
  const halfH  = iH / 2;
  const n      = labels.length;
  const groupW = iW / n;
  const margin = Math.max(groupW * 0.15, 2);
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
                <stop offset="0%"   stopColor="#047857" stopOpacity="1" />
                <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0.45" />
              </linearGradient>
              <linearGradient id="mdiv-red" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#FCA5A5" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#B91C1C" stopOpacity="1" />
              </linearGradient>
            </defs>

            {/* Half-backgrounds */}
            <rect x={PAD.l} y={PAD.t}  width={iW} height={halfH} fill="#F0FDF4" opacity={0.65} />
            <rect x={PAD.l} y={midY}   width={iW} height={halfH} fill="#FFF5F5" opacity={0.65} />

            {/* Quarter guide lines */}
            <line x1={PAD.l} y1={PAD.t + halfH * 0.5} x2={W - PAD.r} y2={PAD.t + halfH * 0.5}
              stroke="#D1FAE5" strokeWidth={1} strokeDasharray="4 5" />
            <line x1={PAD.l} y1={midY  + halfH * 0.5} x2={W - PAD.r} y2={midY  + halfH * 0.5}
              stroke="#FEE2E2" strokeWidth={1} strokeDasharray="4 5" />

            {/* Center zero line */}
            <line x1={PAD.l} y1={midY} x2={W - PAD.r} y2={midY} stroke="#94A3B8" strokeWidth={1.5} />
            <text x={W - PAD.r + 2} y={midY + 3.5} fontSize={7} fill="#94A3B8" textAnchor="start">0</text>

            {/* Corner axis labels */}
            <text x={PAD.l + 2} y={PAD.t + 9}     fontSize={7} fill="#059669" fontWeight="700">↑ In</text>
            <text x={PAD.l + 2} y={PAD.t + iH - 3} fontSize={7} fill="#DC2626" fontWeight="700">↓ Out</text>

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
                    <rect x={bx(i) - 2} y={PAD.t} width={barW + 4} height={iH}
                      fill="#6366F1" opacity={0.05} rx={3} />
                  )}

                  {/* Cash In bar — rises upward */}
                  {ciH > 0 && (
                    <>
                      <rect x={bx(i)} y={midY - ciH} width={barW} height={ciH}
                        fill="url(#mdiv-green)" opacity={op} rx={2.5} />
                      {isHov && (
                        <text x={bx(i) + barW / 2} y={midY - ciH - 4}
                          textAnchor="middle" fontSize={7} fontWeight="700" fill="#065F46">
                          {fmtShort(cashInData[i] || 0)}
                        </text>
                      )}
                    </>
                  )}

                  {/* Cash Out bar — drops downward */}
                  {coH > 0 && (
                    <>
                      <rect x={bx(i)} y={midY} width={barW} height={coH}
                        fill="url(#mdiv-red)" opacity={op} rx={2.5} />
                      {isHov && (
                        <text x={bx(i) + barW / 2} y={midY + coH + 9}
                          textAnchor="middle" fontSize={7} fontWeight="700" fill="#7F1D1D">
                          {fmtShort(cashOutData[i] || 0)}
                        </text>
                      )}
                    </>
                  )}

                  {/* Month label */}
                  <text x={mX(i)} y={H - 6} textAnchor="middle" fontSize={9}
                    fill={isHov ? '#374151' : '#9CA3AF'}
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

function CashInBreakdown({ transactions }) {
  const cashInTx = transactions.filter(tx => tx.type === 'cash_in');

  const groups = [
    { key: 'loan_payment', label: 'Loan Payments',       color: '#f97316', bg: 'bg-orange-400' },
    { key: 'cbu',          label: 'CBU Deposits',         color: '#22c55e', bg: 'bg-green-400'  },
    { key: 'savings',      label: 'Savings Deposits',     color: '#3b82f6', bg: 'bg-blue-400'   },
    { key: 'membership',   label: 'Membership Fees',      color: '#a855f7', bg: 'bg-purple-400' },
    { key: 'capital',      label: 'Capital / Fund',       color: '#6366f1', bg: 'bg-indigo-400' },
    { key: 'time_deposit', label: 'Time Deposits',        color: '#8b5cf6', bg: 'bg-violet-400' },
    { key: 'invoice',      label: 'Other Invoices',       color: '#9ca3af', bg: 'bg-gray-400'   },
  ].map(g => ({
    ...g,
    total: cashInTx.filter(tx => tx.category === g.key).reduce((s, tx) => s + tx.amount, 0),
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

function DashboardCharts({ transactions }) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: MONTH_NAMES[d.getMonth()] };
  });

  const bucket = (tx) => {
    const d = new Date(tx.created_at);
    return months.findIndex(m => m.year === d.getFullYear() && m.month === d.getMonth());
  };

  const cashInByMonth  = Array(6).fill(0);
  const cashOutByMonth = Array(6).fill(0);

  transactions.forEach(tx => {
    const idx = bucket(tx);
    if (idx < 0) return;
    if (tx.type === 'cash_in') cashInByMonth[idx]  += tx.amount;
    else                       cashOutByMonth[idx] += tx.amount;
  });

  const labels = months.map(m => m.label);

  const breakdownDefs = [
    { key: 'loan_payment', label: 'Loan Payments', color: '#f97316' },
    { key: 'cbu',          label: 'CBU Deposits',  color: '#22c55e' },
    { key: 'savings',      label: 'Savings',        color: '#3b82f6' },
    { key: 'membership',   label: 'Membership',     color: '#a855f7' },
    { key: 'capital',      label: 'Capital',        color: '#6366f1' },
    { key: 'time_deposit', label: 'Time Deposits',  color: '#8b5cf6' },
    { key: 'invoice',      label: 'Other',          color: '#9ca3af' },
  ];

  const cashInTx   = transactions.filter(tx => tx.type === 'cash_in');
  const donutSlices = breakdownDefs.map(d => ({
    ...d,
    value: cashInTx.filter(tx => tx.category === d.key).reduce((s, tx) => s + tx.amount, 0),
  })).filter(d => d.value > 0);
  const grandCashIn = donutSlices.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-4 mb-6">

      {/* ── Row 1: Cash Flow Line + Cash-In Donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Cash Flow Area-Line Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Cash Flow — Last 6 Months</h3>
              <p className="text-xs text-gray-400 mt-0.5">Monthly inflow vs. outflow trend · hover to inspect</p>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5 text-green-700">
                <span className="w-5 h-0.5 bg-green-500 inline-block rounded-full" />
                Cash In
              </span>
              <span className="flex items-center gap-1.5 text-red-600">
                <span className="w-5 h-0.5 bg-red-400 inline-block rounded-full" />
                Cash Out
              </span>
            </div>
          </div>
          <CashFlowLineChart
            cashInData={cashInByMonth}
            cashOutData={cashOutByMonth}
            labels={labels}
            height={180}
          />
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
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Monthly Comparison</h3>
              <p className="text-xs text-gray-400 mt-0.5">Cash In ↑ rises · Cash Out ↓ falls from center line</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 opacity-80" /> In
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500 opacity-80" /> Out
              </span>
            </div>
          </div>
          <MonthlyDivergingChart
            cashInData={cashInByMonth}
            cashOutData={cashOutByMonth}
            labels={labels}
            height={136}
          />
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Range Picker
// ─────────────────────────────────────────────────────────────────────────────

function DateRangePicker({ from, to, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
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
  return (
    <tr className="hover:bg-gray-50/60 transition-colors">
      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
        {tx.created_at ? formatDateTime(tx.created_at) : '—'}
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

  const fetchIncome = useCallback(async (period = incomePeriod, range = incomeRange) => {
    try {
      setIncomeLoading(true);
      const dr = period === 'custom' ? range : getDateRangeForPeriod(period);
      const data = await getIncomeBreakdown({ from: dr.from || null, to: dr.to || null });
      setIncomeData(data);
    } catch (err) {
      console.error('[CoopMonitoringPage] income fetch error:', err);
    } finally {
      setIncomeLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomePeriod, incomeRange]);

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

  useEffect(() => { fetchIncome(incomePeriod, incomeRange); }, [incomePeriod, incomeRange, fetchIncome]);

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

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (typeFilter && tx.type !== typeFilter) return false;
      if (catFilter  && tx.category !== catFilter) return false;
      if (dateRange.from) {
        const txDate = new Date(tx.created_at);
        if (txDate < new Date(dateRange.from)) return false;
      }
      if (dateRange.to) {
        const txDate = new Date(tx.created_at);
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        if (txDate > toDate) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, catFilter, dateRange]);

  const filteredPenalties = useMemo(() => {
    return penalties.filter(p => {
      if (dateRange.from && p.penalty_date < dateRange.from) return false;
      if (dateRange.to   && p.penalty_date > dateRange.to)   return false;
      return true;
    });
  }, [penalties, dateRange]);

  const penaltyTotal = filteredPenalties.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const categories   = [...new Set(transactions.map(tx => tx.category).filter(Boolean))];
  const hasFilters   = typeFilter || catFilter || dateRange.from || dateRange.to;

  function handlePrint() {
    const fmt = (n) => 'PHP ' + Number(n ?? 0).toLocaleString('en-PH', {minimumFractionDigits:2,maximumFractionDigits:2});
    const rows = filtered.map(tx => `<tr>
      <td style="white-space:nowrap">${tx.created_at?formatDateTime(tx.created_at):'—'}</td>
      <td>${CATEGORY_LABEL[tx.category]||tx.category||'—'}</td>
      <td>${tx.description||'—'}</td>
      <td style="font-family:monospace">${tx.ref_no||'—'}</td>
      <td style="text-align:right;font-weight:600;color:${tx.type==='cash_in'?'#065f46':'#b91c1c'}">${fmt(tx.amount)}</td>
      <td style="text-align:center">${tx.type==='cash_in'?'Cash In':'Cash Out'}</td>
    </tr>`).join('');
    const totalIn  = filtered.filter(t=>t.type==='cash_in').reduce((s,t)=>s+(t.amount||0),0);
    const totalOut = filtered.filter(t=>t.type==='cash_out').reduce((s,t)=>s+(t.amount||0),0);
    const html = `
      <h1 class="report-title">Cooperative Fund Monitoring</h1>
      <div class="report-meta">Fund transactions &nbsp;|&nbsp; ${filtered.length} records &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-PH')}</div>
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:5mm">
        <div class="stat-box"><div class="stat-label">Total Cash In</div><div class="stat-value" style="font-size:10pt;color:#065f46">${fmt(totalIn)}</div></div>
        <div class="stat-box"><div class="stat-label">Total Cash Out</div><div class="stat-value" style="font-size:10pt;color:#b91c1c">${fmt(totalOut)}</div></div>
        <div class="stat-box"><div class="stat-label">Net</div><div class="stat-value" style="font-size:10pt">${fmt(totalIn-totalOut)}</div></div>
      </div>
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
      const rows = filtered.map(tx => ({
        date:        tx.created_at ? formatDateTime(tx.created_at) : '',
        type:        tx.type === 'cash_in' ? 'IN' : 'OUT',
        category:    CATEGORY_LABEL[tx.category] || tx.category || '',
        amount:      tx.amount || 0,
        member:      tx.member_name || '',
        loan_no:     tx.ref_no || '',
        description: tx.description || '',
        created_by:  tx.created_by || '',
      }));
      exportToCSV('coop_monitoring_transactions.csv', rows);
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV');
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Account Monitoring"
        subtitle="Cooperative fund — cash inflow and outflow overview"
        action={
          <div className="flex items-center gap-2">
            {canCreate && (
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setFundModalOpen(true)}>
              Add Fund
            </Button>
            )}
            <Button
              variant="outline"
              icon={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />}
              onClick={() => fetchData(true)}
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
          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 mb-6">
            <StatCard
              icon={<PesoSign size={22} className="text-emerald-600" />}
              label="Current Fund Balance"
              value={formatCurrency(fund.balance)}
              sub="Cash In minus Cash Out"
              bg="bg-emerald-50"
              textColor={fund.balance >= 0 ? 'text-emerald-700' : 'text-red-600'}
              accentColor={fund.balance >= 0 ? 'bg-emerald-400' : 'bg-red-400'}
            />
            <StatCard
              icon={<TrendingUp size={22} className="text-green-600" />}
              label="Loan Interest"
              value={formatCurrency(incomeData?.loan_interest || 0)}
              sub="Interest earned from loan payments"
              bg="bg-green-50"
              textColor="text-green-700"
              accentColor="bg-green-400"
            />
            <StatCard
              icon={<TrendingDown size={22} className="text-red-500" />}
              label="Total Cash Out"
              value={formatCurrency(fund.cash_out)}
              sub="Approved vouchers"
              bg="bg-red-50"
              textColor="text-red-600"
              accentColor="bg-red-400"
            />
          </div>

          {/* ── Dashboard Charts ── */}
          <DashboardCharts transactions={transactions} />

          {/* ── Cash-In Breakdown ── */}
          <CashInBreakdown transactions={transactions} />

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
                    onClick={() => setIncomePeriod(key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      incomePeriod === key
                        ? 'bg-[#07A04E] text-white'
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
                  value={incomeRange.from}
                  onChange={e => setIncomeRange(r => ({ ...r, from: e.target.value }))}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={incomeRange.to}
                  onChange={e => setIncomeRange(r => ({ ...r, to: e.target.value }))}
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
                      { label: 'Legal Fees', value: incomeData.legal_fees, color: 'bg-slate-50 border-slate-100', text: 'text-slate-700', sub: 'Legal and notarial deductions' },
                      { label: 'CLPI/Insurance', value: incomeData.clpi_insurance, color: 'bg-red-50 border-red-100', text: 'text-red-700', sub: 'Loan protection and insurance' },
                      { label: 'Regular Savings', value: incomeData.regular_savings, color: 'bg-blue-50 border-blue-100', text: 'text-blue-700', sub: 'Savings deductions' },
                      { label: 'Penalty Due', value: incomeData.penalty_due, color: 'bg-amber-50 border-amber-100', text: 'text-amber-700', sub: 'Penalty deductions' },
                      { label: 'Annual Due', value: incomeData.annual_dues, color: 'bg-purple-50 border-purple-100', text: 'text-purple-700', sub: 'Yearly membership dues' },
                      { label: 'CBU Completion', value: incomeData.cbu_completion, color: 'bg-teal-50 border-teal-100', text: 'text-teal-700', sub: 'CBU completion deductions' },
                      { label: 'Petty Cash', value: incomeData.petty_cash, color: 'bg-lime-50 border-lime-100', text: 'text-lime-700', sub: 'Petty cash deductions' },
                      { label: 'Membership Fee', value: incomeData.membership_fee, color: 'bg-violet-50 border-violet-100', text: 'text-violet-700', sub: 'Registration fees' },
                      { label: 'WELLife VIP Card', value: incomeData.vip_card, color: 'bg-pink-50 border-pink-100', text: 'text-pink-700', sub: 'VIP card collections' },
                      { label: 'Admin & Regulatory Fees', value: incomeData.admin_regulatory_fees, color: 'bg-cyan-50 border-cyan-100', text: 'text-cyan-700', sub: 'Administrative charges' },
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

            <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={setDateRange} />

            {hasFilters && (
              <button
                onClick={() => { setTypeFilter(''); setCatFilter(''); setDateRange({ from: '', to: '' }); }}
                className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
              >
                Clear all filters
              </button>
            )}

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              <Printer size={14} /> Print
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              <Download size={14} /> Export CSV
            </button>

            <p className="ml-auto self-center text-xs text-gray-400">
              {filtered.length} of {transactions.length} transactions
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
                    {['Date', 'Type', 'Category', 'Amount', 'Member', 'Loan No.', 'Description', 'Created By'].map((h, i) => (
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
                    filtered.map(tx => <TxRow key={tx.id} tx={tx} />)
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Showing <span className="font-medium text-gray-600">{filtered.length}</span> of{' '}
                  <span className="font-medium text-gray-600">{transactions.length}</span> transactions
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