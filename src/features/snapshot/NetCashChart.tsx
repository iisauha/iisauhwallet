import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatCents } from '../../state/calc';
import { loadNetCashHistory, type NetCashSnapshot } from '../../state/netCashHistory';
import { AnimatedNumber } from '../../ui/AnimatedNumber';

type Range = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'ALL';

const RANGE_MS: Record<Range, number> = {
  '1D': 24 * 60 * 60 * 1000,
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
const CHART_PADDING_RIGHT = 40; // extra room so line "never reaches end"

function formatTimeLabel(ts: number, range: Range): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (range === '1D') return time;
  return `${time}, ${date}`;
}

/** Stepwise path: horizontal to next x, then vertical to next y (step-after) */
function buildStepPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    // horizontal line to the next point's x at the current y
    d += ` L ${points[i].x} ${points[i - 1].y}`;
    // vertical line down/up to the next point's y
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
  onExpandSummary,
}: {
  currentCents: number;
  onExpandSummary?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>('1W');
  const [scrubData, setScrubData] = useState<{ cents: number; ts: number; px: number; py: number } | null>(null);
  const [width, setWidth] = useState(340);

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
    // Always include current value as final point
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

  // Compute SVG points — uses left/right padding so line never reaches edges
  const { points, minCents, maxCents } = useMemo(() => {
    if (dataPoints.length === 0) return { points: [], minCents: 0, maxCents: 0 };
    const minTs = dataPoints[0].ts;
    const maxTs = dataPoints[dataPoints.length - 1].ts;
    const tsRange = maxTs - minTs || 1;
    let minC = Infinity, maxC = -Infinity;
    for (const p of dataPoints) {
      if (p.cents < minC) minC = p.cents;
      if (p.cents > maxC) maxC = p.cents;
    }
    // Add 5% padding to y range
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
    return { points: pts, minCents: minC, maxCents: maxC };
  }, [dataPoints, width]);

  // Scrub handling — stepwise: snap to nearest data point (no interpolation)
  const getScrubFromX = useCallback((clientX: number): { idx: number; cents: number; ts: number; px: number; py: number } | null => {
    const el = containerRef.current;
    if (!el || points.length === 0 || dataPoints.length === 0) return null;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, width));

    if (points.length === 1) {
      return { idx: 0, cents: dataPoints[0].cents, ts: dataPoints[0].ts, px: points[0].x, py: points[0].y };
    }

    // Snap to nearest data point — stepwise, no interpolation
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
      idx: closest,
      cents: dataPoints[closest].cents,
      ts: dataPoints[closest].ts,
      px: points[closest].x,
      py: points[closest].y,
    };
  }, [points, dataPoints, width]);

  const handleScrubStart = useCallback((clientX: number) => {
    const s = getScrubFromX(clientX);
    setScrubData(s ? { cents: s.cents, ts: s.ts, px: s.px, py: s.py } : null);
  }, [getScrubFromX]);

  const handleScrubMove = useCallback((clientX: number) => {
    const s = getScrubFromX(clientX);
    setScrubData(s ? { cents: s.cents, ts: s.ts, px: s.px, py: s.py } : null);
  }, [getScrubFromX]);

  const handleScrubEnd = useCallback(() => {
    setScrubData(null);
  }, []);

  // Touch handlers
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

  // Line color based on change
  const lineColor = dataPoints.length > 1
    ? (dataPoints[dataPoints.length - 1].cents >= dataPoints[0].cents ? 'var(--green)' : 'var(--red)')
    : 'var(--accent)';

  const hasData = dataPoints.length > 1;

  return (
    <div className="net-cash-chart-wrap">
      {/* Hero Value — tap to expand summary */}
      <div className="net-cash-chart-header">
        <div className="net-cash-chart-label">FINAL NET CASH</div>
        <div
          className="net-cash-chart-value"
          style={{ color: displayCents >= 0 ? 'var(--green)' : 'var(--red)', cursor: 'pointer' }}
          onClick={onExpandSummary}
        >
          {scrubData ? formatCents(displayCents) : (
            <AnimatedNumber value={displayCents} format={formatCents} bounce cacheKey="snap_hero" />
          )}
        </div>
        {hasData && (
          <>
            <div className="net-cash-chart-change" style={{ color: isPositiveChange ? 'var(--green)' : 'var(--red)' }}>
              {isPositiveChange ? '▲' : '▼'} {formatCents(Math.abs(changeCents))} ({Math.abs(changePct).toFixed(1)}%)
              {!scrubData && (
                <span className="net-cash-chart-time">
                  {' '}{range === '1D' ? 'today' : range === '1W' ? 'last week' : range === '1M' ? 'last month' : range === '3M' ? 'last 3 months' : range === 'YTD' ? 'year to date' : range === '1Y' ? 'last year' : 'all time'}
                </span>
              )}
            </div>
            {scrubData && displayTime && (
              <div className="net-cash-chart-scrub-time">{displayTime}</div>
            )}
          </>
        )}
      </div>

      {/* Chart */}
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
        onClick={!hasData ? onExpandSummary : undefined}
        style={{ cursor: hasData ? 'crosshair' : 'pointer' }}
      >
        {hasData ? (
          <svg width={width} height={CHART_HEIGHT} style={{ display: 'block' }}>
            <defs>
              {/* Gradient fill under line */}
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
              {/* Fade-out gradient for trailing line */}
              <linearGradient id="trailFade" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.6} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* Fill area under stepwise line */}
            <path
              d={buildStepPath(points) + ` L ${points[points.length - 1].x} ${CHART_HEIGHT} L ${points[0].x} ${CHART_HEIGHT} Z`}
              fill="url(#chartGrad)"
            />
            {/* Stepwise line */}
            <path
              d={buildStepPath(points)}
              fill="none"
              stroke={lineColor}
              strokeWidth={2}
              strokeLinejoin="miter"
              strokeLinecap="butt"
            />
            {/* Trailing line — fades out to suggest "still updating" */}
            {points.length > 0 && (
              <path
                d={buildTrailingPath(points[points.length - 1], width)}
                fill="none"
                stroke="url(#trailFade)"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
            )}
            {/* Scrub indicator — snaps to data points */}
            {scrubData && (
              <>
                <line
                  x1={scrubData.px} y1={0}
                  x2={scrubData.px} y2={CHART_HEIGHT}
                  stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5}
                />
                <circle
                  cx={scrubData.px} cy={scrubData.py}
                  r={5} fill={lineColor} stroke="var(--text)" strokeWidth={2}
                />
              </>
            )}
            {/* Pulsing end dot when not scrubbing */}
            {!scrubData && points.length > 0 && (
              <circle
                cx={points[points.length - 1].x} cy={points[points.length - 1].y}
                r={4} fill={lineColor}
              >
                <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
          </svg>
        ) : (
          <div className="net-cash-chart-empty">
            <span>Chart data will appear as your balances change</span>
          </div>
        )}
      </div>

      {/* Range Selector */}
      <div className="net-cash-chart-ranges">
        {(['1W', '1M', '3M', 'YTD', '1Y', 'ALL'] as Range[]).map(r => (
          <button
            key={r}
            type="button"
            className={`net-cash-chart-range${range === r ? ' active' : ''}`}
            onClick={() => { setRange(r); setScrubData(null); }}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
