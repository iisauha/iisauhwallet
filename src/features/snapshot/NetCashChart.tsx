import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatCents } from '../../state/calc';
import { loadNetCashHistory, type NetCashSnapshot } from '../../state/netCashHistory';
import { AnimatedNumber } from '../../ui/AnimatedNumber';

type Range = '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'ALL';

const RANGE_MS: Record<Range, number> = {
  '1W': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
  '3M': 90 * 24 * 60 * 60 * 1000,
  'YTD': 0, // computed dynamically
  '1Y': 365 * 24 * 60 * 60 * 1000,
  'ALL': Infinity,
};

const CHART_HEIGHT = 180;
const CHART_PADDING_TOP = 20;
const CHART_PADDING_BOTTOM = 16;
const CHART_PADDING_LEFT = 6;
const CHART_PADDING_RIGHT = 40;

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
  return 60 * 60_000; // default 1hr
}
function saveUpdateInterval(ms: number) {
  try { localStorage.setItem(UPDATE_INTERVAL_KEY, String(ms)); } catch {}
}

function formatTimeLabel(ts: number, range: Range): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (range === '1W') return `${time}, ${date}`;
  return `${time}, ${date}`;
}

/** Stepwise path: horizontal to next x, then vertical to next y (step-after) */
function buildStepPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i - 1].y}`;
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

/** Extend the last point rightward to simulate "still going" */
function buildTrailingPath(lastPt: { x: number; y: number }, endX: number): string {
  return `M ${lastPt.x} ${lastPt.y} L ${endX} ${lastPt.y}`;
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
  const [prevRange, setPrevRange] = useState<Range>('1W');
  const [scrubData, setScrubData] = useState<{ cents: number; ts: number; px: number; py: number } | null>(null);
  const [width, setWidth] = useState(340);
  const [showSummary, setShowSummary] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [updateInterval, setUpdateInterval] = useState(loadUpdateInterval);
  const [lineAnimKey, setLineAnimKey] = useState(0);

  // Live "creating" tick — force re-render at update interval to extend line
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), updateInterval);
    return () => clearInterval(id);
  }, [updateInterval]);

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
  }, [range]);

  // Add current value as the last point
  const dataPoints: NetCashSnapshot[] = useMemo(() => {
    const pts = [...history];
    const now = Date.now();
    if (pts.length === 0 || now - pts[pts.length - 1].ts > 60_000) {
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
    const cRange = maxC - minC || 1;
    const yPad = cRange * 0.05;
    minC -= yPad;
    maxC += yPad;
    const drawH = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
    const drawW = width - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;

    const pts = dataPoints.map(p => ({
      x: CHART_PADDING_LEFT + ((p.ts - minTs) / tsRange) * drawW,
      y: CHART_PADDING_TOP + drawH - ((p.cents - minC) / (maxC - minC)) * drawH,
    }));
    return { points: pts };
  }, [dataPoints, width]);

  // Scrub: stepwise values (snap to data point values) but smooth position along line
  // Time interpolates smoothly, but cents snap to the step value (previous point's value until next step)
  const getScrubFromX = useCallback((clientX: number): { cents: number; ts: number; px: number; py: number } | null => {
    const el = containerRef.current;
    if (!el || points.length === 0 || dataPoints.length === 0) return null;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, width));

    if (points.length === 1) {
      return { cents: dataPoints[0].cents, ts: dataPoints[0].ts, px: points[0].x, py: points[0].y };
    }

    // Find which segment we're in for stepwise value, but allow smooth px movement
    // In a step chart, between point[i].x and point[i+1].x, the value is dataPoints[i].cents
    // until we reach point[i+1].x where it jumps to dataPoints[i+1].cents
    for (let i = 0; i < points.length - 1; i++) {
      if (x >= points[i].x && x <= points[i + 1].x) {
        const segWidth = points[i + 1].x - points[i].x;
        const t = segWidth > 0 ? (x - points[i].x) / segWidth : 0;
        // Time interpolates smoothly
        const ts = Math.round(dataPoints[i].ts + (dataPoints[i + 1].ts - dataPoints[i].ts) * t);
        // Cents use the step value (current segment's start value)
        const cents = dataPoints[i].cents;
        // py stays at the current step's y (horizontal part of step)
        const py = points[i].y;
        return { cents, ts, px: x, py };
      }
    }
    const last = points.length - 1;
    return { cents: dataPoints[last].cents, ts: dataPoints[last].ts, px: points[last].x, py: points[last].y };
  }, [points, dataPoints, width]);

  const handleScrubStart = useCallback((clientX: number) => {
    const s = getScrubFromX(clientX);
    setScrubData(s);
  }, [getScrubFromX]);

  const handleScrubMove = useCallback((clientX: number) => {
    const s = getScrubFromX(clientX);
    setScrubData(s);
  }, [getScrubFromX]);

  const handleScrubEnd = useCallback(() => {
    setScrubData(null);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    handleScrubStart(e.touches[0].clientX);
  }, [handleScrubStart]);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    handleScrubMove(e.touches[0].clientX);
  }, [handleScrubMove]);
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    handleScrubStart(e.clientX);
  }, [handleScrubStart]);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (e.buttons > 0) handleScrubMove(e.clientX);
  }, [handleScrubMove]);

  // Display values
  const displayCents = scrubData ? scrubData.cents : currentCents;
  const displayTime = scrubData ? formatTimeLabel(scrubData.ts, range) : null;

  // Change from first to current
  const firstCents = dataPoints.length > 0 ? dataPoints[0].cents : currentCents;
  const changeCents = displayCents - firstCents;
  const changePct = firstCents !== 0 ? (changeCents / Math.abs(firstCents)) * 100 : 0;
  const isPositiveChange = changeCents >= 0;

  // Line color = accent
  const lineColor = 'var(--accent)';

  const hasData = dataPoints.length > 1;

  // Range switch with line animation
  const handleRangeChange = useCallback((r: Range) => {
    setPrevRange(range);
    setRange(r);
    setScrubData(null);
    setLineAnimKey(k => k + 1);
  }, [range]);

  // Toggle summary ↔ chart
  const handleValueClick = useCallback(() => {
    setShowSummary(prev => !prev);
  }, []);

  // Build the highlighted segment path when scrubbing
  const highlightPath = useMemo(() => {
    if (!scrubData || points.length < 2) return '';
    // Highlight from start to scrub position
    const highlightPts: { x: number; y: number }[] = [];
    for (let i = 0; i < points.length; i++) {
      if (points[i].x <= scrubData.px) {
        highlightPts.push(points[i]);
      } else {
        // Add the last horizontal segment to the scrub position
        if (highlightPts.length > 0) {
          highlightPts.push({ x: scrubData.px, y: highlightPts[highlightPts.length - 1].y });
        }
        break;
      }
    }
    if (highlightPts.length === 0) return '';
    // If scrub is past all points
    if (scrubData.px >= points[points.length - 1].x && highlightPts.length === points.length) {
      // all points included
    }
    return buildStepPath(highlightPts);
  }, [scrubData, points]);

  return (
    <div className="net-cash-chart-wrap">
      {/* Hero Value */}
      <div className="net-cash-chart-header">
        <div className="net-cash-chart-label">FINAL NET CASH</div>
        <div
          className="net-cash-chart-value"
          onClick={handleValueClick}
          style={{ cursor: 'pointer' }}
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
              {scrubData && displayTime && (
                <div className="net-cash-chart-scrub-time">{displayTime}</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chart / Summary toggle area */}
      <div className="net-cash-chart-body">
        {/* Summary overlay */}
        <div
          className={`net-cash-chart-summary-layer${showSummary ? ' visible' : ''}`}
        >
          {summaryContent}
        </div>

        {/* Chart layer */}
        <div
          className={`net-cash-chart-graph-layer${showSummary ? ' hidden' : ''}`}
        >
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
                  {/* Glow filter for scrub highlight */}
                  <filter id="glowLine" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  {/* Glow filter for dot */}
                  <filter id="glowDot" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {/* Fill area under stepwise line */}
                <g key={lineAnimKey} className="net-cash-line-anim">
                  <path
                    d={buildStepPath(points) + ` L ${points[points.length - 1].x} ${CHART_HEIGHT} L ${points[0].x} ${CHART_HEIGHT} Z`}
                    fill="url(#chartGrad)"
                  />
                  {/* Base stepwise line — dimmed when scrubbing */}
                  <path
                    d={buildStepPath(points)}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth={2}
                    strokeLinejoin="miter"
                    strokeLinecap="butt"
                    opacity={scrubData ? 0.3 : 1}
                    style={{ transition: 'opacity 0.15s ease' }}
                  />
                  {/* Highlighted portion when scrubbing */}
                  {scrubData && highlightPath && (
                    <path
                      d={highlightPath}
                      fill="none"
                      stroke={lineColor}
                      strokeWidth={2.5}
                      strokeLinejoin="miter"
                      strokeLinecap="butt"
                      filter="url(#glowLine)"
                    />
                  )}
                </g>
                {/* Trailing line — fades out */}
                {points.length > 0 && (
                  <path
                    d={buildTrailingPath(points[points.length - 1], width)}
                    fill="none"
                    stroke="url(#trailFade)"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                )}
                {/* Scrub dot — glowing */}
                {scrubData && (
                  <circle
                    cx={scrubData.px} cy={scrubData.py}
                    r={6} fill={lineColor} stroke="var(--text)" strokeWidth={2}
                    filter="url(#glowDot)"
                  />
                )}
                {/* Pulsing end dot when not scrubbing */}
                {!scrubData && points.length > 0 && (
                  <circle
                    cx={points[points.length - 1].x} cy={points[points.length - 1].y}
                    r={4} fill={lineColor}
                    filter="url(#glowDot)"
                    className="net-cash-dot-pulse"
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

      {/* Range Selector + Settings */}
      <div className="net-cash-chart-ranges">
        {(['1W', '1M', '3M', 'YTD', '1Y', 'ALL'] as Range[]).map(r => (
          <button
            key={r}
            type="button"
            className={`net-cash-chart-range${range === r ? ' active' : ''}`}
            onClick={() => handleRangeChange(r)}
          >
            {r}
          </button>
        ))}
        <button
          type="button"
          className={`net-cash-chart-range net-cash-settings-btn${showSettings ? ' active' : ''}`}
          onClick={() => setShowSettings(prev => !prev)}
          aria-label="Chart settings"
        >
          ⚙
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="net-cash-settings-panel">
          <div className="net-cash-settings-label">Update interval</div>
          <div className="net-cash-settings-options">
            {UPDATE_INTERVALS.map(opt => (
              <button
                key={opt.ms}
                type="button"
                className={`net-cash-chart-range${updateInterval === opt.ms ? ' active' : ''}`}
                onClick={() => { setUpdateInterval(opt.ms); saveUpdateInterval(opt.ms); }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
