import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatCents } from '../../state/calc';
import { loadNetCashHistory, clearNetCashHistory, type NetCashSnapshot } from '../../state/netCashHistory';
import { AnimatedNumber } from '../../ui/AnimatedNumber';

type Range = '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'ALL';

const RANGE_MS: Record<Range, number> = {
  '1W': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
  '3M': 90 * 24 * 60 * 60 * 1000,
  'YTD': 0,
  '1Y': 365 * 24 * 60 * 60 * 1000,
  'ALL': Infinity,
};

const CHART_HEIGHT = 180;
const CHART_PADDING_TOP = 20;
const CHART_PADDING_BOTTOM = 16;
const CHART_PADDING_LEFT = 6;
const CHART_PADDING_RIGHT = 40;

const HISTORY_KEY = 'iisauhwallet_net_cash_history_v1';

const UPDATE_INTERVALS = [
  { label: '1 min', ms: 60_000 },
  { label: '5 min', ms: 5 * 60_000 },
  { label: '10 min', ms: 10 * 60_000 },
  { label: '30 min', ms: 30 * 60_000 },
  { label: '1 hr', ms: 60 * 60_000 },
];
const UPDATE_INTERVAL_KEY = 'iisauhwallet_chart_update_interval';

function loadUpdateInterval(): number {
  try {
    const v = localStorage.getItem(UPDATE_INTERVAL_KEY);
    if (v) return Number(v);
  } catch {}
  return 60 * 60_000;
}
function saveUpdateInterval(ms: number) {
  try { localStorage.setItem(UPDATE_INTERVAL_KEY, String(ms)); } catch {}
}

function formatTimeLabel(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${time}, ${date}`;
}

/** Stepwise path: horizontal to next x, then vertical to next y */
function buildStepPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i - 1].y}`;
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

function buildTrailingPath(lastPt: { x: number; y: number }, endX: number): string {
  return `M ${lastPt.x} ${lastPt.y} L ${endX} ${lastPt.y}`;
}

/** Save a single snapshot directly to localStorage. Pass force=true to bypass dedup (used by interval ticks). */
function appendSnapshot(cents: number, force = false) {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr: NetCashSnapshot[] = raw ? JSON.parse(raw) : [];
    // Dedupe: skip if last entry has same value within 30 seconds (unless forced)
    if (!force) {
      const last = arr[arr.length - 1];
      if (last && last.cents === cents && now - last.ts < 30_000) return;
    }
    arr.push({ ts: now, cents });
    // Prune older than 30 days
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const pruned = arr.filter(s => s.ts >= cutoff);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(pruned));
  } catch {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify([{ ts: now, cents }]));
    } catch {}
  }
}

export function NetCashChart({
  currentCents,
  summaryContent,
}: {
  currentCents: number;
  summaryContent?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>('1W');
  const [scrubData, setScrubData] = useState<{ cents: number; ts: number; px: number; py: number } | null>(null);
  const [width, setWidth] = useState(340);
  const [showSummary, setShowSummary] = useState(false);
  const [lineAnimating, setLineAnimating] = useState(false);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Record current value every time the user visits the snapshot tab (mount).
  // Each visit = one scrub point on the chart.
  const [tick, setTick] = useState(0);
  const currentCentsRef = useRef(currentCents);
  currentCentsRef.current = currentCents;

  useEffect(() => {
    appendSnapshot(currentCentsRef.current, true);
    setTick(t => t + 1);
  }, []);

  // Clear + reload
  const [clearCount, setClearCount] = useState(0);

  // Load history
  const history = useMemo(() => {
    const all = loadNetCashHistory();
    if (range === 'ALL') return all.sort((a, b) => a.ts - b.ts);
    let cutoff: number;
    if (range === 'YTD') {
      const now = new Date();
      cutoff = new Date(now.getFullYear(), 0, 1).getTime();
    } else {
      cutoff = Date.now() - RANGE_MS[range];
    }
    return all.filter(s => s.ts >= cutoff).sort((a, b) => a.ts - b.ts);
  }, [range, tick, clearCount]);

  // Build data points: use history + always append "now" as the trailing edge
  const dataPoints: NetCashSnapshot[] = useMemo(() => {
    const pts = [...history];
    const now = Date.now();
    // Always add current value so the line extends to "now"
    if (pts.length === 0 || now - pts[pts.length - 1].ts > 1000) {
      pts.push({ ts: now, cents: currentCents });
    }
    return pts;
  }, [history, currentCents]);

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute SVG points
  const { points } = useMemo(() => {
    if (dataPoints.length === 0) return { points: [] };
    const minTs = dataPoints[0].ts;
    const maxTs = dataPoints[dataPoints.length - 1].ts;
    const tsRange = maxTs - minTs || 1;
    let minC = Infinity, maxC = -Infinity;
    for (const p of dataPoints) {
      if (p.cents < minC) minC = p.cents;
      if (p.cents > maxC) maxC = p.cents;
    }
    const cRange = maxC - minC;
    if (cRange === 0) {
      const pad = Math.max(Math.abs(maxC) * 0.1, 100);
      minC -= pad;
      maxC += pad;
    } else {
      const yPad = cRange * 0.05;
      minC -= yPad;
      maxC += yPad;
    }
    const drawH = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
    const drawW = width - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;

    const pts = dataPoints.map(p => ({
      x: CHART_PADDING_LEFT + ((p.ts - minTs) / tsRange) * drawW,
      y: CHART_PADDING_TOP + drawH - ((p.cents - minC) / (maxC - minC)) * drawH,
    }));
    return { points: pts };
  }, [dataPoints, width]);

  // Scrub: snap to nearest real data point
  const getScrubFromX = useCallback((clientX: number): { cents: number; ts: number; px: number; py: number } | null => {
    const el = containerRef.current;
    if (!el || points.length === 0 || dataPoints.length === 0) return null;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, width));

    if (points.length === 1) {
      return { cents: dataPoints[0].cents, ts: dataPoints[0].ts, px: points[0].x, py: points[0].y };
    }

    let closest = 0;
    let closestDist = Math.abs(x - points[0].x);
    for (let i = 1; i < points.length; i++) {
      const dist = Math.abs(x - points[i].x);
      if (dist < closestDist) {
        closest = i;
        closestDist = dist;
      }
    }
    return {
      cents: dataPoints[closest].cents,
      ts: dataPoints[closest].ts,
      px: points[closest].x,
      py: points[closest].y,
    };
  }, [points, dataPoints, width]);

  const handleScrubStart = useCallback((clientX: number) => {
    setScrubData(getScrubFromX(clientX));
  }, [getScrubFromX]);
  const handleScrubMove = useCallback((clientX: number) => {
    setScrubData(getScrubFromX(clientX));
  }, [getScrubFromX]);
  const handleScrubEnd = useCallback(() => {
    setScrubData(null);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => handleScrubStart(e.touches[0].clientX), [handleScrubStart]);
  const onTouchMove = useCallback((e: React.TouchEvent) => { e.preventDefault(); handleScrubMove(e.touches[0].clientX); }, [handleScrubMove]);
  const onMouseDown = useCallback((e: React.MouseEvent) => handleScrubStart(e.clientX), [handleScrubStart]);
  const onMouseMove = useCallback((e: React.MouseEvent) => { if (e.buttons > 0) handleScrubMove(e.clientX); }, [handleScrubMove]);

  const displayCents = scrubData ? scrubData.cents : currentCents;
  const displayTime = scrubData ? formatTimeLabel(scrubData.ts) : null;

  const firstCents = dataPoints.length > 0 ? dataPoints[0].cents : currentCents;
  const changeCents = displayCents - firstCents;
  const changePct = firstCents !== 0 ? (changeCents / Math.abs(firstCents)) * 100 : 0;
  const isPositiveChange = changeCents >= 0;

  // Dynamic line color: green if positive, red if negative, neutral at 0
  const lineColor = displayCents > 0 ? 'var(--green)' : displayCents < 0 ? 'var(--red)' : 'var(--text)';
  const hasData = dataPoints.length > 1;

  const handleRangeChange = useCallback((r: Range) => {
    if (r === range) return;
    setLineAnimating(true);
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = setTimeout(() => {
      setRange(r);
      setScrubData(null);
      requestAnimationFrame(() => setLineAnimating(false));
    }, 200);
  }, [range]);

  const handleValueClick = useCallback(() => {
    setShowSummary(prev => !prev);
  }, []);

  // Highlighted segment when scrubbing
  const highlightPath = useMemo(() => {
    if (!scrubData || points.length < 2) return '';
    const highlightPts: { x: number; y: number }[] = [];
    for (let i = 0; i < points.length; i++) {
      if (points[i].x <= scrubData.px) {
        highlightPts.push(points[i]);
      } else {
        if (highlightPts.length > 0) {
          highlightPts.push({ x: scrubData.px, y: highlightPts[highlightPts.length - 1].y });
        }
        break;
      }
    }
    return highlightPts.length > 0 ? buildStepPath(highlightPts) : '';
  }, [scrubData, points]);

  const handleClear = useCallback(() => {
    clearNetCashHistory();
    // Record current value as the fresh start
    appendSnapshot(currentCentsRef.current);
    setClearCount(c => c + 1);
  }, []);

  return (
    <div className="net-cash-chart-wrap">
      <div className="net-cash-chart-header">
        <div className="net-cash-chart-label">FINAL NET CASH</div>
        <div
          className="net-cash-chart-value"
          onClick={handleValueClick}
          style={{
            cursor: 'pointer',
            color: displayCents > 0 ? 'var(--green)' : displayCents < 0 ? 'var(--red)' : undefined,
          }}
        >
          {scrubData ? formatCents(displayCents) : (
            <AnimatedNumber value={displayCents} format={formatCents} bounce cacheKey="snap_hero" />
          )}
        </div>
        <div className="net-cash-chart-change-row">
          {hasData && (
            <>
              <div className="net-cash-chart-change" style={{ color: isPositiveChange ? 'var(--green)' : 'var(--red)' }}>
                {isPositiveChange ? '▲' : '▼'} {formatCents(Math.abs(changeCents))} ({Math.abs(changePct).toFixed(1)}%)
                {!scrubData && (
                  <span className="net-cash-chart-time">
                    {' '}{range === '1W' ? 'last week' : range === '1M' ? 'last month' : range === '3M' ? 'last 3 months' : range === 'YTD' ? 'year to date' : range === '1Y' ? 'last year' : 'all time'}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="net-cash-chart-body">
        <div className={`net-cash-chart-summary-layer${showSummary ? ' visible' : ''}`}>
          {summaryContent}
        </div>

        <div className={`net-cash-chart-graph-layer${showSummary ? ' hidden' : ''}`}>
          {scrubData && displayTime && (
            <div style={{ position: 'relative', height: 14, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: Math.max(CHART_PADDING_LEFT, Math.min(scrubData.px, width - CHART_PADDING_RIGHT)), transform: 'translateX(-50%)', bottom: 0, fontSize: '0.65rem', color: 'var(--ui-primary-text, var(--text))', whiteSpace: 'nowrap', pointerEvents: 'none', opacity: 0.6 }}>
                {displayTime}
              </div>
            </div>
          )}
          <div
            ref={containerRef}
            className="net-cash-chart-area"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={handleScrubEnd}
            onTouchCancel={handleScrubEnd}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={handleScrubEnd}
            onMouseLeave={handleScrubEnd}
            style={{ cursor: hasData ? 'crosshair' : 'pointer' }}
          >
            {hasData ? (
              <svg width={width} height={CHART_HEIGHT} style={{ display: 'block' }}>
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="trailFade" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                  </linearGradient>
                  <filter id="glowLine" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <filter id="glowDot" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                <g className={`net-cash-line-morph${lineAnimating ? ' morphing' : ''}`}>
                  <path
                    d={buildStepPath(points) + ` L ${points[points.length - 1].x} ${CHART_HEIGHT} L ${points[0].x} ${CHART_HEIGHT} Z`}
                    fill="url(#chartGrad)"
                  />
                  <path
                    d={buildStepPath(points)}
                    fill="none" stroke={lineColor} strokeWidth={2}
                    strokeLinejoin="miter" strokeLinecap="butt"
                    opacity={scrubData ? 0.3 : 1}
                    style={{ transition: 'opacity 0.15s ease' }}
                  />
                  {scrubData && highlightPath && (
                    <path
                      d={highlightPath}
                      fill="none" stroke={lineColor} strokeWidth={2.5}
                      strokeLinejoin="miter" strokeLinecap="butt"
                      filter="url(#glowLine)"
                    />
                  )}
                </g>
                {points.length > 0 && (
                  <path
                    d={buildTrailingPath(points[points.length - 1], width)}
                    fill="none" stroke="url(#trailFade)" strokeWidth={2} strokeDasharray="4 3"
                  />
                )}
                {scrubData && (
                  <>
                    <line x1={scrubData.px} y1={CHART_PADDING_TOP} x2={scrubData.px} y2={CHART_HEIGHT - CHART_PADDING_BOTTOM} stroke="var(--border)" strokeWidth={1} opacity={0.4} strokeDasharray="3 2" />
                    <circle cx={scrubData.px} cy={scrubData.py} r={5} fill={lineColor} filter="url(#glowDot)" />
                  </>
                )}
                {!scrubData && points.length > 0 && (
                  <circle
                    cx={points[points.length - 1].x} cy={points[points.length - 1].y}
                    r={4} fill={lineColor} filter="url(#glowDot)" className="net-cash-dot-pulse"
                  />
                )}
              </svg>
            ) : (
              <div className="net-cash-chart-empty">
                <span>Chart data will appear as your balances change</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="net-cash-chart-ranges">
        {(['1W', '1M', '3M', 'YTD', '1Y', 'ALL'] as Range[]).map(r => (
          <button
            key={r} type="button"
            className={`net-cash-chart-range${range === r ? ' active' : ''}`}
            onClick={() => handleRangeChange(r)}
          >{r}</button>
        ))}
      </div>
    </div>
  );
}
