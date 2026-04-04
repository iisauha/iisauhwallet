import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatCents } from '../../state/calc';
import { loadNetCashHistory, type NetCashSnapshot } from '../../state/netCashHistory';
import { AnimatedNumber } from '../../ui/AnimatedNumber';

type Range = '1D' | '1W' | '1M' | 'ALL';

const RANGE_MS: Record<Range, number> = {
  '1D': 24 * 60 * 60 * 1000,
  '1W': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
  'ALL': Infinity,
};

const CHART_HEIGHT = 160;
const CHART_PADDING_TOP = 12;
const CHART_PADDING_BOTTOM = 8;

function formatTimeLabel(ts: number, range: Range): string {
  const d = new Date(ts);
  if (range === '1D') {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
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
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const [width, setWidth] = useState(340);

  // Load history
  const history = useMemo(() => {
    const all = loadNetCashHistory();
    if (range === 'ALL') return all.sort((a, b) => a.ts - b.ts);
    const cutoff = Date.now() - RANGE_MS[range];
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

  // Compute SVG points
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

    const pts = dataPoints.map(p => ({
      x: ((p.ts - minTs) / tsRange) * width,
      y: CHART_PADDING_TOP + drawH - ((p.cents - minC) / (maxC - minC)) * drawH,
    }));
    return { points: pts, minCents: minC, maxCents: maxC };
  }, [dataPoints, width]);

  // Scrub handling
  const getIdxFromX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el || points.length === 0) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    // Find nearest point
    let closest = 0;
    let closestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(points[i].x - x);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    }
    return closest;
  }, [points]);

  const handleScrubStart = useCallback((clientX: number) => {
    setScrubIdx(getIdxFromX(clientX));
  }, [getIdxFromX]);

  const handleScrubMove = useCallback((clientX: number) => {
    setScrubIdx(getIdxFromX(clientX));
  }, [getIdxFromX]);

  const handleScrubEnd = useCallback(() => {
    setScrubIdx(null);
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
  const displayCents = scrubIdx !== null && dataPoints[scrubIdx] ? dataPoints[scrubIdx].cents : currentCents;
  const displayTime = scrubIdx !== null && dataPoints[scrubIdx] ? formatTimeLabel(dataPoints[scrubIdx].ts, range) : null;

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
      {/* Hero Value */}
      <div className="net-cash-chart-header">
        <div className="net-cash-chart-label">FINAL NET CASH</div>
        <div className="net-cash-chart-value" style={{ color: displayCents >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {scrubIdx !== null ? formatCents(displayCents) : (
            <AnimatedNumber value={displayCents} format={formatCents} bounce cacheKey="snap_hero" />
          )}
        </div>
        {hasData && (
          <div className="net-cash-chart-change" style={{ color: isPositiveChange ? 'var(--green)' : 'var(--red)' }}>
            {isPositiveChange ? '▲' : '▼'} {formatCents(Math.abs(changeCents))} ({Math.abs(changePct).toFixed(1)}%)
            {displayTime ? <span className="net-cash-chart-time"> • {displayTime}</span> : null}
          </div>
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
            {/* Gradient fill under line */}
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* Fill area */}
            <path
              d={buildPath(points) + ` L ${points[points.length - 1].x} ${CHART_HEIGHT} L ${points[0].x} ${CHART_HEIGHT} Z`}
              fill="url(#chartGrad)"
            />
            {/* Line */}
            <path
              d={buildPath(points)}
              fill="none"
              stroke={lineColor}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Scrub indicator */}
            {scrubIdx !== null && points[scrubIdx] && (
              <>
                <line
                  x1={points[scrubIdx].x} y1={0}
                  x2={points[scrubIdx].x} y2={CHART_HEIGHT}
                  stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5}
                />
                <circle
                  cx={points[scrubIdx].x} cy={points[scrubIdx].y}
                  r={5} fill={lineColor} stroke="var(--text)" strokeWidth={2}
                />
              </>
            )}
            {/* End dot when not scrubbing */}
            {scrubIdx === null && points.length > 0 && (
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
        {(['1D', '1W', '1M', 'ALL'] as Range[]).map(r => (
          <button
            key={r}
            type="button"
            className={`net-cash-chart-range${range === r ? ' active' : ''}`}
            onClick={() => { setRange(r); setScrubIdx(null); }}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
