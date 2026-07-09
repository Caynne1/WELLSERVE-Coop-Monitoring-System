// DashboardPage.jsx - Updated with React Portal for modals

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  CreditCard,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  RefreshCw,
  Clock,
  CalendarDays,
  PiggyBank,
  Wallet,
  X,
  Mail,
} from 'lucide-react';
import PesoSign from '../../components/shared/PesoSign';
import { useNavigate } from 'react-router-dom';
import { useRealtimeDashboard } from '../../hooks/useRealtimeDashboard';
import { formatCurrency, formatRelativeTime, formatDate } from '../../utils/formatters';
import { format } from 'date-fns';

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────────────────────────────

function Tooltip({ text, x, y, visible }) {
  if (!visible || !text) return null;
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg whitespace-nowrap"
      style={{ left: x + 12, top: y - 8 }}
    >
      {text}
      <div className="absolute -left-1 top-2 h-2 w-2 rotate-45 bg-gray-900" />
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

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Loader
// ─────────────────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }) {
  return (
    <div className={`animate-pulse rounded-lg bg-gray-100 ${className}`} />
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 space-y-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BarChart — with hover tooltip + click handler per bar
// ─────────────────────────────────────────────────────────────────────────────

function BarChart({ data, valueKey, color = '#2563EB', height = 100, formatValue, onBarClick }) {
  const { tooltip, show, move, hide } = useTooltip();
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!data || data.length === 0)
    return <div className="text-xs text-gray-400 py-4 text-center">No data available</div>;

  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  const fmt = formatValue || (v => String(v));
  const labelH = 20;
  const innerH = height - labelH;

  return (
    <>
      <Tooltip {...tooltip} />
      <div className="flex items-end gap-1.5 w-full" style={{ height }}>
        {data.map((d, i) => {
          const barH = Math.max(((d[valueKey] || 0) / max) * innerH, d[valueKey] > 0 ? 4 : 2);
          const isHovered = hoveredIdx === i;

          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1 flex-1 cursor-pointer group"
              onClick={() => onBarClick?.(d)}
              onMouseEnter={(e) => { setHoveredIdx(i); show(e, `${d.label}: ${fmt(d[valueKey] || 0)}`); }}
              onMouseMove={move}
              onMouseLeave={() => { setHoveredIdx(null); hide(); }}
            >
              <span
                className="text-[9px] font-semibold tabular-nums transition-opacity duration-150"
                style={{ color, opacity: isHovered ? 1 : 0 }}
              >
                {fmt(d[valueKey] || 0)}
              </span>
              <div
                className="w-full rounded-t-md transition-all duration-300"
                style={{
                  height: `${barH}px`,
                  background: color,
                  opacity: hoveredIdx === null ? 0.82 : isHovered ? 1 : 0.35,
                  transform: isHovered ? 'scaleX(1.06)' : 'scaleX(1)',
                  transformOrigin: 'bottom',
                }}
              />
              <span
                className="text-[9px] leading-none transition-colors duration-150"
                style={{ color: isHovered ? '#111827' : '#9ca3af' }}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CashFlowChart — diverging bar chart
// ─────────────────────────────────────────────────────────────────────────────

function CashFlowChart({ data, height = 152, onBarClick }) {
  const { tooltip, show, move, hide } = useTooltip();
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const containerRef = useRef(null);
  const [W, setW] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.clientWidth > 0) setW(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length === 0)
    return <div className="text-xs text-gray-400 py-4 text-center">No data available</div>;

  const H      = height;
  const PAD    = { t: 26, b: 22, l: 4, r: 10 };
  const iW     = W - PAD.l - PAD.r;
  const iH     = H - PAD.t - PAD.b;
  const midY   = PAD.t + iH / 2;
  const halfH  = iH / 2;

  const n      = data.length;
  const groupW = iW / n;
  const margin = Math.max(groupW * 0.14, 3);
  const barW   = groupW - margin * 2;

  const maxVal = Math.max(...data.flatMap(d => [d.cashIn || 0, d.cashOut || 0]), 1);
  const sh     = v => (v / maxVal) * halfH;
  const barX   = i => PAD.l + i * groupW + margin;
  const mX     = i => PAD.l + i * groupW + groupW / 2;

  const netPts = data.map((d, i) => {
    const net = (d.cashIn || 0) - (d.cashOut || 0);
    const y   = midY - (net / maxVal) * halfH;
    return { x: mX(i), y: Math.max(PAD.t + 1, Math.min(PAD.t + iH - 1, y)), net };
  });

  const curve = pts => {
    if (pts.length < 2) return '';
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], c = pts[i];
      const cx = ((p.x + c.x) / 2).toFixed(1);
      d += ` C${cx},${p.y.toFixed(1)} ${cx},${c.y.toFixed(1)} ${c.x.toFixed(1)},${c.y.toFixed(1)}`;
    }
    return d;
  };

  const linePath = curve(netPts);

  const fmtShort = v => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${(abs / 1_000).toFixed(1)}K`;
    return abs.toLocaleString();
  };

  const fmtNet = v => {
    const sign = v >= 0 ? '+' : '-';
    return `${sign}₱${fmtShort(v)}`;
  };

  return (
    <>
      <Tooltip {...tooltip} />
      <div ref={containerRef} className="w-full">
        {W > 0 && (
          <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="cf-div-green" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#047857" stopOpacity="1" />
                <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0.45" />
              </linearGradient>
              <linearGradient id="cf-div-red" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#FCA5A5" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#B91C1C" stopOpacity="1" />
              </linearGradient>
            </defs>

            <rect x={PAD.l} y={PAD.t} width={iW} height={halfH}
              fill="#F0FDF4" opacity={0.65} />
            <rect x={PAD.l} y={midY} width={iW} height={halfH}
              fill="#FFF5F5" opacity={0.65} />

            <line
              x1={PAD.l} y1={PAD.t + halfH * 0.5} x2={W - PAD.r} y2={PAD.t + halfH * 0.5}
              stroke="#D1FAE5" strokeWidth={1} strokeDasharray="4 5"
            />
            <line
              x1={PAD.l} y1={midY + halfH * 0.5} x2={W - PAD.r} y2={midY + halfH * 0.5}
              stroke="#FEE2E2" strokeWidth={1} strokeDasharray="4 5"
            />

            <line x1={PAD.l} y1={midY} x2={W - PAD.r} y2={midY}
              stroke="#94A3B8" strokeWidth={1.5} />
            <text x={W - PAD.r + 2} y={midY + 3.5} fontSize={7} fill="#94A3B8" textAnchor="start">0</text>

            <text x={PAD.l + 2} y={PAD.t + 9} fontSize={7} fill="#059669" fontWeight="700">↑ In</text>
            <text x={PAD.l + 2} y={PAD.t + iH - 3} fontSize={7} fill="#DC2626" fontWeight="700">↓ Out</text>

            {data.map((d, i) => {
              const ciH    = Math.max(sh(d.cashIn  || 0), (d.cashIn  || 0) > 0 ? 3 : 0);
              const coH    = Math.max(sh(d.cashOut || 0), (d.cashOut || 0) > 0 ? 3 : 0);
              const bx     = barX(i);
              const bw     = barW;
              const isHov  = hoveredIdx === i;
              const dimmed = hoveredIdx !== null && !isHov;
              const op     = dimmed ? 0.18 : 1;

              return (
                <g key={i} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => {
                    setHoveredIdx(i);
                    const net = (d.cashIn || 0) - (d.cashOut || 0);
                    show(e,
                      `${d.label}  ·  In: ${formatCurrency(d.cashIn || 0)}  ·  Out: ${formatCurrency(d.cashOut || 0)}  ·  Net: ${net >= 0 ? '+' : ''}${formatCurrency(net)}`
                    );
                  }}
                  onMouseMove={move}
                  onMouseLeave={() => { setHoveredIdx(null); hide(); }}
                  onClick={() => onBarClick?.(d)}
                >
                  {isHov && (
                    <rect x={bx - 2} y={PAD.t} width={bw + 4} height={iH}
                      fill="#6366F1" opacity={0.05} rx={3} />
                  )}

                  {ciH > 0 && (
                    <>
                      <rect
                        x={bx} y={midY - ciH}
                        width={bw} height={ciH}
                        fill="url(#cf-div-green)" opacity={op} rx={2.5}
                      />
                      {isHov && (
                        <text
                          x={bx + bw / 2} y={midY - ciH - 4}
                          textAnchor="middle" fontSize={7} fontWeight="700" fill="#065F46"
                        >
                          {fmtShort(d.cashIn || 0)}
                        </text>
                      )}
                    </>
                  )}

                  {coH > 0 && (
                    <>
                      <rect
                        x={bx} y={midY}
                        width={bw} height={coH}
                        fill="url(#cf-div-red)" opacity={op} rx={2.5}
                      />
                      {isHov && (
                        <text
                          x={bx + bw / 2} y={midY + coH + 9}
                          textAnchor="middle" fontSize={7} fontWeight="700" fill="#7F1D1D"
                        >
                          {fmtShort(d.cashOut || 0)}
                        </text>
                      )}
                    </>
                  )}

                  <text x={mX(i)} y={H - 6} textAnchor="middle" fontSize={9}
                    fill={isHov ? '#374151' : '#9CA3AF'}
                    fontWeight={isHov ? '600' : '400'}>
                    {d.label}
                  </text>
                </g>
              );
            })}

            {netPts.length > 1 && (
              <g style={{ pointerEvents: 'none' }}>
                <path d={linePath} fill="none" stroke="#818CF8"
                  strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" opacity={0.18} />
                <path d={linePath} fill="none" stroke="#6366F1"
                  strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round"
                  strokeDasharray="5 3" />

                {netPts.map((p, i) => {
                  const isHov    = hoveredIdx === i;
                  const neg      = p.net < 0;
                  const dotColor = neg ? '#F59E0B' : '#6366F1';
                  const ringR    = isHov ? 5 : 3;
                  const dotR     = isHov ? 3 : 1.75;
                  const lw       = 58;
                  const showAbove = p.y > midY;
                  const rectY    = showAbove ? p.y - 21 : p.y + 6;
                  const textY    = showAbove ? p.y - 9   : p.y + 17;

                  return (
                    <g key={i}>
                      <circle cx={p.x} cy={p.y} r={ringR}
                        fill="white" stroke={dotColor} strokeWidth={isHov ? 2 : 1.5} />
                      <circle cx={p.x} cy={p.y} r={dotR} fill={dotColor} />
                      {isHov && (
                        <g>
                          <rect
                            x={p.x - lw / 2} y={rectY} width={lw} height={14} rx={4}
                            fill={neg ? '#FEF3C7' : '#EEF2FF'}
                            stroke={neg ? '#FCD34D' : '#C7D2FE'} strokeWidth={0.75}
                          />
                          <text x={p.x} y={textY} textAnchor="middle"
                            fontSize={7.5} fontWeight="700"
                            fill={neg ? '#B45309' : '#4338CA'}>
                            {fmtNet(p.net)}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            )}
          </svg>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DonutChart
// ─────────────────────────────────────────────────────────────────────────────

const DONUT_COLORS = ['#059669', '#2563EB', '#F59E0B', '#DC2626', '#8B5CF6', '#6B7280'];

function DonutChart({ data, size = 110, onSegmentClick }) {
  const { tooltip, show, move, hide } = useTooltip();
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!data || data.length === 0)
    return <div className="text-xs text-gray-400 py-4 text-center">No data available</div>;

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0)
    return <div className="text-xs text-gray-400 py-4 text-center">No data available</div>;

  const r = 38;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * r;

  let cumulative = 0;
  const segments = data.map((d, i) => {
    const pct = d.value / total;
    const dash = pct * circumference;
    const offset = circumference - cumulative * circumference;
    cumulative += pct;
    return { ...d, dash, offset, color: DONUT_COLORS[i % DONUT_COLORS.length], pct };
  });

  const hovered = hoveredIdx !== null ? segments[hoveredIdx] : null;

  return (
    <>
      <Tooltip {...tooltip} />
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            className="overflow-visible"
          >
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth="14" />

            {segments.map((seg, i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={hoveredIdx === i ? 17 : 14}
                strokeDasharray={`${seg.dash} ${circumference}`}
                strokeDashoffset={seg.offset}
                strokeLinecap="butt"
                transform="rotate(-90 50 50)"
                className="cursor-pointer transition-all duration-200"
                style={{
                  opacity: hoveredIdx === null ? 1 : hoveredIdx === i ? 1 : 0.35,
                  filter: hoveredIdx === i ? 'drop-shadow(0 0 3px rgba(0,0,0,0.2))' : 'none',
                }}
                onMouseEnter={(e) => {
                  setHoveredIdx(i);
                  show(e, `${seg.label}: ${seg.value} (${Math.round(seg.pct * 100)}%)`);
                }}
                onMouseMove={move}
                onMouseLeave={() => { setHoveredIdx(null); hide(); }}
                onClick={() => onSegmentClick?.(seg)}
              />
            ))}

            {hovered ? (
              <>
                <text x="50" y="46" textAnchor="middle" fontSize="9" fill="#6B7280" fontWeight="500">
                  {hovered.label.length > 8 ? hovered.label.slice(0, 8) + '…' : hovered.label}
                </text>
                <text x="50" y="58" textAnchor="middle" fontSize="13" fontWeight="700" fill={hovered.color}>
                  {hovered.value}
                </text>
              </>
            ) : (
              <>
                <text x="50" y="46" textAnchor="middle" fontSize="9" fill="#6B7280" fontWeight="500">
                  Total
                </text>
                <text x="50" y="58" textAnchor="middle" fontSize="13" fontWeight="700" fill="#111827">
                  {total}
                </text>
              </>
            )}
          </svg>
        </div>

        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {segments.map((seg, i) => (
            <button
              key={i}
              type="button"
              className="flex items-center gap-2 text-xs text-left rounded-md px-1.5 py-1 transition-colors cursor-pointer"
              style={{
                background: hoveredIdx === i ? `${seg.color}12` : 'transparent',
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onSegmentClick?.(seg)}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform duration-150"
                style={{
                  background: seg.color,
                  transform: hoveredIdx === i ? 'scale(1.3)' : 'scale(1)',
                }}
              />
              <span className="text-gray-600 capitalize truncate">{seg.label}</span>
              <span className="ml-auto font-semibold text-gray-800 tabular-nums">{seg.value}</span>
              <span className="text-gray-400 tabular-nums">{Math.round(seg.pct * 100)}%</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary Card
// ─────────────────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, icon, accent = '#059669', accentBg = 'rgba(5,150,105,0.08)', onClick, trend, trendInverse = false, delay = 0 }) {
  const trendIsGood = trend === undefined ? null : (trendInverse ? trend <= 0 : trend >= 0);
  return (
    <button
      type="button"
      onClick={onClick}
      className="app-card app-card-hover dash-fade-in w-full text-left p-5 flex flex-col group"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-2xl flex-shrink-0 transition-transform duration-150 group-hover:scale-110"
          style={{ background: accentBg }}
        >
          <span style={{ color: accent }}>{icon}</span>
        </div>
      </div>

      <p className="tabular-nums text-2xl font-bold leading-none tracking-tight text-gray-900 mt-3">
        {value}
      </p>

      <div className="mt-2 flex items-center gap-1.5">
        {trend !== undefined && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${trendIsGood ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Card Wrapper
// ─────────────────────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children, action, footerNote, delay = 0 }) {
  return (
    <div className="app-card dash-fade-in p-5 sm:p-6 flex flex-col gap-4" style={{ animationDelay: `${delay}s` }}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-gray-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
      {footerNote && (
        <p className="text-[10px] text-gray-400 border-t border-gray-50 pt-2">{footerNote}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent Transactions
// ─────────────────────────────────────────────────────────────────────────────

const INFLOW_TYPES = ['deposit', 'loan_release', 'payment', 'interest'];

function StatusBadge({ isInflow }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        isInflow ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isInflow ? 'bg-emerald-500' : 'bg-red-500'}`} />
      {isInflow ? 'Credit' : 'Debit'}
    </span>
  );
}

function RecentTransactionsCard({ stats, navigate }) {
  return (
    <ChartCard
      title="Recent Transactions"
      subtitle={`Latest activity · ${stats?.periodLabel || 'selected period'}`}
      action={
        <button
          onClick={() => navigate('/transactions')}
          className="text-xs font-medium text-emerald-700 hover:underline"
        >
          View all →
        </button>
      }
    >
      {!stats?.recentTransactions?.length ? (
        <div className="text-center text-sm text-gray-400 py-8">No transactions in this period</div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm border-separate" style={{ borderSpacing: '0 2px' }}>
            <thead>
              <tr className="text-left">
                <th className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Member</th>
                <th className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Type</th>
                <th className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 hidden sm:table-cell">Date</th>
                <th className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 hidden md:table-cell">Status</th>
                <th className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentTransactions.slice(0, 6).map((tx) => {
                const isInflow = INFLOW_TYPES.includes(tx.type);
                return (
                  <tr
                    key={tx.id}
                    className="group cursor-pointer"
                    onClick={() => navigate('/transactions')}
                  >
                    <td className="px-1 py-2 rounded-l-lg group-hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 transition-transform duration-150 group-hover:scale-110 ${
                            isInflow ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                          }`}
                        >
                          {isInflow ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                        </div>
                        <p className="text-sm font-medium text-gray-900 leading-tight truncate max-w-[120px] sm:max-w-none">
                          {tx.member_name || 'Cooperative'}
                        </p>
                      </div>
                    </td>
                    <td className="px-1 py-2 group-hover:bg-gray-50 transition-colors">
                      <p className="text-xs text-gray-500 capitalize">{tx.type?.replace(/_/g, ' ')}</p>
                    </td>
                    <td className="px-1 py-2 group-hover:bg-gray-50 transition-colors hidden sm:table-cell">
                      <p className="text-xs text-gray-400">{formatRelativeTime(tx.created_at)}</p>
                    </td>
                    <td className="px-1 py-2 group-hover:bg-gray-50 transition-colors hidden md:table-cell">
                      <StatusBadge isInflow={isInflow} />
                    </td>
                    <td className="px-1 py-2 rounded-r-lg group-hover:bg-gray-50 transition-colors text-right">
                      <span className={`text-sm font-semibold tabular-nums ${isInflow ? 'text-emerald-600' : 'text-red-500'}`}>
                        {isInflow ? '+' : '-'}{formatCurrency(tx.amount)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Member Growth Drill-down Modal - Using React Portal
// ─────────────────────────────────────────────────────────────────────────────

// Always resolves to a readable, complete date — falls back through the
// service-formatted string, the shared formatDate utility, then a manual
// long-form date, so the modal never shows a blank/missing registration date.
function getRegistrationDateLabel(member) {
  if (member.date_joined_formatted) return member.date_joined_formatted;
  if (member.created_at) {
    try {
      const shared = formatDate(member.created_at);
      if (shared) return shared;
    } catch { /* fall through to manual formatting */ }
    const d = new Date(member.created_at);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
  }
  return 'Registration date unavailable';
}

function getRegistrationRelativeLabel(member) {
  if (!member.created_at) return null;
  try {
    return formatRelativeTime(member.created_at);
  } catch {
    return null;
  }
}

function MemberGrowthModal({ item, onClose, navigate }) {
  if (!item) return null;

  const members = item.members || [];

  // Use useEffect to prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const modalContent = (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4" 
      onClick={onClose}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
        onClick={onClose}
      />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ zIndex: 101 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              New Members — {item.label}
            </h3>
            <p className="text-sm text-gray-500">
              {members.length} member{members.length !== 1 ? 's' : ''} registered
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {members.length === 0 ? (
            <div className="text-center py-12">
              <Users size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">No members registered this month</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {members.map((member, index) => {
                const dateLabel = getRegistrationDateLabel(member);
                const relativeLabel = getRegistrationRelativeLabel(member);
                return (
                  <div
                    key={member.id || index}
                    className="flex items-start gap-3 p-4 rounded-xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all cursor-pointer group"
                    onClick={() => {
                      onClose();
                      navigate(`/members/${member.id}`);
                    }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-semibold flex-shrink-0">
                      {member.full_name?.charAt(0) || member.first_name?.charAt(0) || 'M'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-emerald-700 transition-colors">
                        {member.full_name || member.first_name || 'Unknown Member'}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 flex-wrap">
                        {member.membership_type && (
                          <span className="inline-flex items-center gap-1">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                              member.membership_type === 'regular' ? 'bg-blue-500' : 
                              member.membership_type === 'kiddy' ? 'bg-teal-500' : 'bg-indigo-500'
                            }`} />
                            {member.membership_type}
                          </span>
                        )}
                        <span className="text-gray-300">·</span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={10} />
                          {dateLabel}
                        </span>
                      </div>
                      {relativeLabel && (
                        <p className="mt-0.5 text-[11px] text-gray-400">{relativeLabel}</p>
                      )}
                      {member.email && (
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400 truncate">
                          <Mail size={10} />
                          {member.email}
                        </div>
                      )}
                    </div>
                    <ArrowUpRight size={14} className="text-gray-300 group-hover:text-emerald-600 transition-colors flex-shrink-0 mt-1" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-400">
            Click a member to view their profile
          </span>
          <button
            onClick={() => {
              onClose();
              navigate('/members');
            }}
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            View all members →
          </button>
        </div>
      </div>
    </div>
  );

  // Use createPortal to render at document.body level
  return createPortal(modalContent, document.body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Drill-down Drawer — for other chart clicks (using Portal)
// ─────────────────────────────────────────────────────────────────────────────

function DrillDownDrawer({ item, onClose, navigate }) {
  if (!item) return null;
  if (item.members) return null; // Handled by MemberGrowthModal

  // Use useEffect to prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const drawerContent = (
    <div 
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" 
      onClick={onClose}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-sm" 
        onClick={onClose}
      />
      <div
        className="relative bg-white rounded-t-2xl sm:rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md mx-4 mb-0 sm:mb-4 p-5 z-[101] max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 capitalize">{item.label}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {item.value !== undefined
                ? `${item.value} loan${item.value !== 1 ? 's' : ''}`
                : item.cashIn !== undefined
                ? `In: ${formatCurrency(item.cashIn)} · Out: ${formatCurrency(item.cashOut)}`
                : `${item.count} member${item.count !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          {item.value !== undefined && (
            <button
              onClick={() => { navigate(`/loans?status=${item.label}`); onClose(); }}
              className="flex-1 text-xs font-medium py-2 px-3 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              View {item.label} loans →
            </button>
          )}
          {(item.cashIn !== undefined || item.cashOut !== undefined) && (
            <button
              onClick={() => { navigate('/transactions'); onClose(); }}
              className="flex-1 text-xs font-medium py-2 px-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              View transactions →
            </button>
          )}
          {item.count !== undefined && (
            <button
              onClick={() => { navigate('/members'); onClose(); }}
              className="flex-1 text-xs font-medium py-2 px-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              View members →
            </button>
          )}
        </div>

        {item.cashIn !== undefined && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
              <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wide mb-1">Cash In</p>
              <p className="text-base font-bold text-emerald-700 tabular-nums">{formatCurrency(item.cashIn || 0)}</p>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-100 p-3">
              <p className="text-[10px] text-red-600 font-medium uppercase tracking-wide mb-1">Cash Out</p>
              <p className="text-base font-bold text-red-600 tabular-nums">{formatCurrency(item.cashOut || 0)}</p>
            </div>
            <div className="col-span-2 rounded-lg bg-gray-50 border border-gray-100 p-3">
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1">Net Flow</p>
              <p className={`text-base font-bold tabular-nums ${(item.cashIn - item.cashOut) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {(item.cashIn - item.cashOut) >= 0 ? '+' : ''}{formatCurrency((item.cashIn || 0) - (item.cashOut || 0))}
              </p>
            </div>
          </div>
        )}
        {item.count !== undefined && (
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
            <p className="text-[10px] text-blue-600 font-medium uppercase tracking-wide mb-1">New Members</p>
            <p className="text-base font-bold text-blue-700 tabular-nums">{item.count}</p>
          </div>
        )}
        {item.value !== undefined && (
          <div className="rounded-lg border border-gray-100 p-3 bg-gray-50">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1">Count</p>
            <p className="text-base font-bold text-gray-800 tabular-nums">{item.value} loans</p>
          </div>
        )}
      </div>
    </div>
  );

  // Use createPortal to render at document.body level
  return createPortal(drawerContent, document.body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Time Period Filter — segmented control
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week',  label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year',  label: 'Year' },
];

function TimePeriodFilter({ value, onChange }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl bg-gray-100 p-1">
      {PERIOD_OPTIONS.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 ${
              active
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Picker Button — mini calendar popover for selecting a specific day.
// Expands (zoom in) on open, collapses (zoom out) once a date is picked.
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a, b) {
  return !!a && !!b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

// Year Picker — lets the user jump to a distant year quickly instead of
// clicking the month arrows one step at a time.
function YearPicker({ year, onSelect, onClose }) {
  const [decadeStart, setDecadeStart] = useState(Math.floor(year / 12) * 12);
  const years = Array.from({ length: 12 }, (_, i) => decadeStart + i);
  const currentYear = new Date().getFullYear();

  return (
    <div className="absolute inset-0 z-10 rounded-2xl bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setDecadeStart(y => y - 12)}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          ‹
        </button>
        <p className="text-xs font-semibold text-gray-700">
          {decadeStart} – {decadeStart + 11}
        </p>
        <button
          type="button"
          onClick={() => setDecadeStart(y => y + 12)}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {years.map(y => {
          const isSelected = y === year;
          const isCurrent = y === currentYear;
          return (
            <button
              key={y}
              type="button"
              onClick={() => onSelect(y)}
              className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                isSelected
                  ? 'bg-emerald-600 text-white font-semibold'
                  : isCurrent
                  ? 'border border-emerald-300 text-emerald-700 font-semibold'
                  : 'text-gray-600 hover:bg-emerald-50 hover:text-emerald-700'
              }`}
            >
              {y}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-2 w-full text-center text-[10px] text-gray-400 hover:text-gray-600"
      >
        Back to calendar
      </button>
    </div>
  );
}

function DatePickerButton({ selectedDate, onSelect, onClear }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(selectedDate || new Date());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (selectedDate) setViewDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setShowYearPicker(false); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const today = new Date();
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const handlePick = (day) => {
    const picked = new Date(year, month, day);
    onSelect(picked);
    setOpen(false); // collapses (zoom out) immediately after a date is chosen
    setShowYearPicker(false);
  };

  const handleYearPick = (y) => {
    setViewDate(new Date(y, month, 1));
    setShowYearPicker(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Pick a specific date"
        className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
          selectedDate
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            : 'bg-gray-100 text-gray-500 hover:text-gray-800 border border-transparent'
        }`}
      >
        <CalendarDays size={14} />
        {selectedDate ? format(selectedDate, 'MMM d, yyyy') : 'Pick date'}
        {selectedDate && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="ml-0.5 text-emerald-400 hover:text-emerald-700"
          >
            ×
          </span>
        )}
      </button>

      {/* Popover — always mounted; scale/opacity animate the expand/collapse */}
      <div
        className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 origin-top-right rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl"
        style={{
          transform: open ? 'scale(1)' : 'scale(0.85)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'transform 0.16s ease, opacity 0.14s ease',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setShowYearPicker(true)}
            title="Pick a year"
            className="rounded-lg px-2 py-0.5 text-xs font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
          >
            {format(viewDate, 'MMMM yyyy')}
          </button>
          <button
            type="button"
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ›
          </button>
        </div>

        {showYearPicker && (
          <YearPicker
            year={year}
            onSelect={handleYearPick}
            onClose={() => setShowYearPicker(false)}
          />
        )}

        <div className="grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAY_LABELS.map((w, i) => (
            <span key={i} className="text-[10px] font-medium text-gray-300">{w}</span>
          ))}
          {cells.map((day, i) => {
            if (!day) return <span key={i} />;
            const cellDate = new Date(year, month, day);
            const isToday = isSameDay(cellDate, today);
            const isSelected = isSameDay(cellDate, selectedDate);
            return (
              <button
                key={i}
                type="button"
                onClick={() => handlePick(day)}
                className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors ${
                  isSelected
                    ? 'bg-emerald-600 text-white font-semibold'
                    : isToday
                    ? 'border border-emerald-300 text-emerald-700 font-semibold'
                    : 'text-gray-600 hover:bg-emerald-50 hover:text-emerald-700'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Balance Card
// ─────────────────────────────────────────────────────────────────────────────

function ProductStatCard({ label, value, sub, icon, iconColorClass = 'text-gray-400', valueHoverClass = '', onClick, delay = 0 }) {
  return (
    <div
      className="app-card app-card-hover dash-fade-in p-5 cursor-pointer group"
      style={{ animationDelay: `${delay}s` }}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={iconColorClass}>{icon}</span>
        <p className="stat-label truncate">{label}</p>
      </div>
      <p className={`tabular-nums text-2xl font-bold text-gray-900 transition-colors ${valueHoverClass}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('month');
  const [customDate, setCustomDate] = useState(null);
  const effectivePeriod = customDate ? `custom:${toDateKey(customDate)}` : period;
  const { stats, loading, refetch } = useRealtimeDashboard(effectivePeriod);

  // Presets and the custom date picker are mutually exclusive — choosing one clears the other.
  const handlePeriodChange = useCallback((p) => {
    setCustomDate(null);
    setPeriod(p);
  }, []);
  const handleCustomDateSelect = useCallback((d) => {
    setCustomDate(d);
  }, []);
  const handleCustomDateClear = useCallback(() => {
    setCustomDate(null);
  }, []);
  const [drillItem, setDrillItem] = useState(null);
  const [memberGrowthItem, setMemberGrowthItem] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefetch() {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 600);
  }

  // Handle bar click on Member Growth chart
  const handleMemberGrowthClick = useCallback((item) => {
    // Find members who registered in this month
    const members = stats?.monthlyMembers?.[item.label] || [];
    setMemberGrowthItem({
      ...item,
      members: members,
    });
  }, [stats]);

  if (loading) return <DashboardSkeleton />;

  const netCashFlow = (stats?.periodIncome ?? 0) - (stats?.periodExpense ?? 0);

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-subtitle flex items-center gap-1.5 flex-wrap">
            <span>WELLSERVE Cooperative — live overview</span>
            {stats?.periodLabel && (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <span className="text-gray-300">·</span>
                <CalendarDays size={12} />
                {stats.periodLabel}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TimePeriodFilter value={customDate ? null : period} onChange={handlePeriodChange} />
          <DatePickerButton
            selectedDate={customDate}
            onSelect={handleCustomDateSelect}
            onClear={handleCustomDateClear}
          />
          <button
            onClick={handleRefetch}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors px-3 py-2 rounded-xl hover:bg-gray-100"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Summary Cards (scoped to the selected period — no all-time totals) ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="New Members"
          value={stats?.periodNewMembers ?? 0}
          sub={
            <span className="flex gap-2 flex-wrap">
              <span className="text-blue-600 font-medium">{stats?.periodRegularMembers ?? 0} Regular</span>
              <span className="text-gray-300">·</span>
              <span className="text-indigo-500 font-medium">{stats?.periodAssociateMembers ?? 0} Associate</span>
            </span>
          }
          icon={<Users size={18} />}
          accent="#2563EB"
          accentBg="rgba(37,99,235,0.08)"
          onClick={() => navigate('/members')}
          delay={0}
        />
        <SummaryCard
          label="New Kiddy Members"
          value={stats?.periodNewKiddyMembers ?? 0}
          sub="Registered this period"
          icon={<Users size={18} />}
          accent="#0D9488"
          accentBg="rgba(13,148,136,0.08)"
          onClick={() => navigate('/members?type=kiddy')}
          delay={0.06}
        />
        <SummaryCard
          label="New Loans"
          value={stats?.periodNewLoans ?? 0}
          sub={formatCurrency(stats?.periodLoanAmount ?? 0) + ' issued'}
          icon={<CreditCard size={18} />}
          accent="#059669"
          accentBg="rgba(5,150,105,0.08)"
          onClick={() => navigate('/loans')}
          delay={0.12}
        />
        <SummaryCard
          label="Overdue Payments"
          value={stats?.periodOverdue ?? 0}
          sub="Past due loans"
          icon={<AlertTriangle size={18} />}
          accent={stats?.periodOverdue > 0 ? '#D97706' : '#6B7280'}
          accentBg={stats?.periodOverdue > 0 ? 'rgba(217,119,6,0.08)' : 'rgba(107,114,128,0.08)'}
          onClick={() => navigate('/loans')}
          delay={0.18}
        />
      </div>

      {/* ── Hero row: Income + Cash Flow (2/3) · Loan Status (1/3) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Hero: Income summary + Cash Flow chart combined */}
        <div
          className="app-card dash-fade-in lg:col-span-2 p-5 sm:p-6 flex flex-col gap-4"
          style={{ animationDelay: '0.22s' }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 flex-shrink-0">
                <PesoSign size={20} className="text-emerald-700" />
              </div>
              <div>
                <p className="stat-label">Income</p>
                <p className="text-2xl font-bold text-emerald-700 tabular-nums">{formatCurrency(stats?.periodIncome ?? 0)}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 sm:gap-6">
              <div className="text-right">
                <p className="stat-label">Net Cash Flow</p>
                <p className={`text-lg font-bold tabular-nums ${netCashFlow >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {netCashFlow >= 0 ? '+' : ''}{formatCurrency(netCashFlow)}
                </p>
              </div>
              <div className="hidden items-center gap-2.5 text-[10px] text-gray-400 md:flex">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 opacity-80" />
                  In
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500 opacity-80" />
                  Out
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 border-t-2 border-dashed border-indigo-500" style={{ height: 0, verticalAlign: 'middle', display: 'inline-block' }} />
                  Net
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-50 pt-4">
            <CashFlowChart
              data={stats?.cashFlowChart ?? []}
              height={190}
              onBarClick={(item) => setDrillItem(item)}
            />
          </div>

          <p className="text-[10px] text-gray-400 border-t border-gray-50 pt-2">
            {stats?.periodLabel || 'Selected period'} · click any bar to view its transaction breakdown.
          </p>
        </div>

        {/* Loan Status Donut */}
        <ChartCard
          title="Loan Status"
          subtitle="Click a segment to drill down"
          footerNote="Click any segment or legend item to filter loans by status."
          delay={0.28}
          action={
            <button onClick={() => navigate('/loans')} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
              All loans →
            </button>
          }
        >
          <DonutChart
            data={stats?.loanStatusChart ?? []}
            size={126}
            onSegmentClick={(seg) => setDrillItem(seg)}
          />
        </ChartCard>
      </div>

      {/* ── Second row: Member Growth (1/3) · Product Balances (2/3) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Member Growth"
          subtitle="Click a bar to see members"
          footerNote={`${stats?.periodLabel || 'Selected period'} · click any bar to see members who joined then.`}
          delay={0.34}
          action={
            <button onClick={() => navigate('/members')} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
              All members →
            </button>
          }
        >
          <BarChart
            data={stats?.memberGrowthChart ?? []}
            valueKey="count"
            color="#2563EB"
            height={150}
            formatValue={v => `${v} member${v !== 1 ? 's' : ''}`}
            onBarClick={handleMemberGrowthClick}
          />
        </ChartCard>

        <div className="lg:col-span-2">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Product Balances · {stats?.periodLabel || 'Selected period'} net flow
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <ProductStatCard
              label="Capital Build-Up"
              value={`${(stats?.periodCBUNet ?? 0) >= 0 ? '+' : ''}${formatCurrency(stats?.periodCBUNet ?? 0)}`}
              sub={`Total balance: ${formatCurrency(stats?.totalCBU ?? 0)}`}
              icon={<PiggyBank size={13} />}
              iconColorClass="text-emerald-400"
              valueHoverClass="group-hover:text-emerald-700"
              onClick={() => navigate('/cbu')}
              delay={0.4}
            />
            <ProductStatCard
              label="Savings"
              value={`${(stats?.periodSavingsNet ?? 0) >= 0 ? '+' : ''}${formatCurrency(stats?.periodSavingsNet ?? 0)}`}
              sub={`Total balance: ${formatCurrency(stats?.totalSavings ?? 0)}`}
              icon={<Wallet size={13} />}
              iconColorClass="text-emerald-400"
              valueHoverClass="group-hover:text-emerald-700"
              onClick={() => navigate('/savings')}
              delay={0.44}
            />
            <ProductStatCard
              label="Time Deposits"
              value={`${(stats?.periodTimeDepositNet ?? 0) >= 0 ? '+' : ''}${formatCurrency(stats?.periodTimeDepositNet ?? 0)}`}
              sub={`${stats?.timeDepositCount ?? 0} active · total ${formatCurrency(stats?.totalTimeDeposit ?? 0)}`}
              icon={<Clock size={13} />}
              iconColorClass="text-violet-400"
              valueHoverClass="group-hover:text-violet-700"
              onClick={() => navigate('/time-deposit')}
              delay={0.48}
            />
            <ProductStatCard
              label="Savings Booster"
              value={`${(stats?.periodSavingsBoosterNet ?? 0) >= 0 ? '+' : ''}${formatCurrency(stats?.periodSavingsBoosterNet ?? 0)}`}
              sub={`${stats?.savingsBoosterCount ?? 0} accounts · total ${formatCurrency(stats?.totalSavingsBooster ?? 0)}`}
              icon={<TrendingUp size={13} />}
              iconColorClass="text-amber-400"
              valueHoverClass="group-hover:text-amber-600"
              onClick={() => navigate('/savings-booster')}
              delay={0.52}
            />
          </div>
        </div>
      </div>

      {/* ── Recent Transactions ── */}
      <div className="dash-fade-in" style={{ animationDelay: '0.6s' }}>
        <RecentTransactionsCard stats={stats} navigate={navigate} />
      </div>

      {/* ── Modals rendered via Portal ── */}
      <MemberGrowthModal
        item={memberGrowthItem}
        onClose={() => setMemberGrowthItem(null)}
        navigate={navigate}
      />

      <DrillDownDrawer
        item={drillItem}
        onClose={() => setDrillItem(null)}
        navigate={navigate}
      />

    </div>
  );
}