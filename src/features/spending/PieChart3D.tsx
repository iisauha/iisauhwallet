import { useMemo } from 'react';

type Slice = {
  label: string;
  value: number;
  color: string;
  id: string;
};

type Props = {
  slices: Slice[];
  size?: number;
  activeId?: string | null;
  onSliceClick?: (id: string) => void;
};

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToXY(cx, cy, r, endAngle);
  const end = polarToXY(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

/** Push label positions apart so they don't overlap vertically. */
function resolveOverlaps(labels: { x: number; y: number; side: 'left' | 'right' }[], minGap: number) {
  // Separate into left and right sides, resolve each independently
  for (const side of ['left', 'right'] as const) {
    const group = labels.filter(l => l.side === side);
    group.sort((a, b) => a.y - b.y);
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1];
      const curr = group[i];
      if (curr.y - prev.y < minGap) {
        curr.y = prev.y + minGap;
      }
    }
  }
}

function formatDollars(cents: number) {
  const abs = Math.abs(cents);
  if (abs >= 100000) return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PieChart3D({ slices, size = 260, activeId, onSliceClick }: Props) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  const activeSlice = activeId ? slices.find(s => s.id === activeId) : null;

  const computed = useMemo(() => {
    if (total <= 0) return [];
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 40;

    const items: {
      id: string;
      label: string;
      color: string;
      value: number;
      pct: number;
      startAngle: number;
      endAngle: number;
      radius: number;
      midAngle: number;
      path: string;
    }[] = [];

    let angle = 0;
    slices.forEach((sl, i) => {
      const pct = sl.value / total;
      const sweep = pct * 360;
      const startAngle = angle;
      const endAngle = angle + sweep;
      const depth = i % 3;
      const radius = depth === 0 ? maxR : depth === 1 ? maxR * 0.85 : maxR * 0.7;
      const midAngle = startAngle + sweep / 2;
      const path = describeArc(cx, cy, radius, startAngle, endAngle);

      items.push({
        id: sl.id,
        label: sl.label,
        color: sl.color,
        value: sl.value,
        pct: Math.round(pct * 100),
        startAngle,
        endAngle,
        radius,
        midAngle,
        path,
      });
      angle = endAngle;
    });
    return items;
  }, [slices, total, size]);

  // Compute label positions with overlap resolution
  const labels = useMemo(() => {
    if (computed.length === 0) return [];
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 40;
    const labelR = maxR + 22;

    const visible = computed.filter(sl => sl.pct >= 3);
    const positions = visible.map(sl => {
      const pos = polarToXY(cx, cy, labelR, sl.midAngle);
      const edge = polarToXY(cx, cy, sl.radius, sl.midAngle);
      return {
        id: sl.id,
        pct: sl.pct,
        rawX: pos.x,
        x: pos.x,
        y: pos.y,
        edgeX: edge.x,
        edgeY: edge.y,
        side: (pos.x > cx ? 'right' : 'left') as 'left' | 'right',
      };
    });

    resolveOverlaps(positions, 14);
    return positions;
  }, [computed, size]);

  if (total <= 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const innerR = (size / 2 - 40) * 0.35;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        style={{ maxWidth: size, overflow: 'visible' }}
      >
        {/* Shadow / depth layer */}
        {computed.map((sl) => (
          <path
            key={`shadow-${sl.id}`}
            d={sl.path}
            fill="rgba(0,0,0,0.25)"
            transform="translate(0, 4)"
          />
        ))}

        {/* Main slices */}
        {computed.map((sl) => {
          const isActive = activeId === sl.id;
          const offset = isActive ? 6 : 0;
          const pushDir = polarToXY(0, 0, offset, sl.midAngle);
          return (
            <path
              key={sl.id}
              d={sl.path}
              fill={sl.color}
              opacity={activeId && !isActive ? 0.45 : 1}
              transform={`translate(${pushDir.x}, ${pushDir.y})`}
              onClick={() => onSliceClick?.(sl.id)}
              style={{ cursor: 'pointer', transition: 'opacity 0.2s ease, transform 0.2s ease' }}
            />
          );
        })}

        {/* Gradient overlay for depth illusion */}
        {computed.map((sl) => {
          const isActive = activeId === sl.id;
          const offset = isActive ? 6 : 0;
          const pushDir = polarToXY(0, 0, offset, sl.midAngle);
          return (
            <path
              key={`highlight-${sl.id}`}
              d={sl.path}
              fill="url(#pieHighlight)"
              opacity={activeId && !isActive ? 0.2 : 0.35}
              transform={`translate(${pushDir.x}, ${pushDir.y})`}
              style={{ pointerEvents: 'none' }}
            />
          );
        })}

        {/* Center circle (donut hole) */}
        <circle cx={cx} cy={cy} r={innerR} fill="var(--ui-card-bg, var(--surface))" />
        <circle cx={cx} cy={cy} r={innerR} fill="rgba(0,0,0,0.15)" />

        {/* Active slice info in center */}
        {activeSlice && (
          <g style={{ pointerEvents: 'none' }}>
            <text
              x={cx}
              y={cy - 6}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--ui-primary-text, var(--text))"
              fontSize={14}
              fontWeight={700}
              fontFamily="var(--app-font-family)"
            >
              {formatDollars(activeSlice.value)}
            </text>
            <text
              x={cx}
              y={cy + 10}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--muted)"
              fontSize={9}
              fontWeight={500}
              fontFamily="var(--app-font-family)"
            >
              {Math.round((activeSlice.value / total) * 100)}%
            </text>
          </g>
        )}

        {/* Connector lines + percentage labels (>= 3% only, anti-overlap) */}
        {labels.map((lbl) => (
          <g key={`label-${lbl.id}`}>
            <line
              x1={lbl.edgeX} y1={lbl.edgeY}
              x2={lbl.x} y2={lbl.y}
              stroke="var(--ui-primary-text, var(--text))"
              strokeWidth={1}
              opacity={0.3}
            />
            <text
              x={lbl.x + (lbl.side === 'right' ? 4 : -4)}
              y={lbl.y}
              textAnchor={lbl.side === 'right' ? 'start' : 'end'}
              dominantBaseline="central"
              fill="var(--ui-primary-text, var(--text))"
              fontSize={11}
              fontWeight={600}
              fontFamily="var(--app-font-family)"
            >
              {lbl.pct}%
            </text>
          </g>
        ))}

        {/* Radial gradient for 3D highlight effect */}
        <defs>
          <radialGradient id="pieHighlight" cx="30%" cy="30%">
            <stop offset="0%" stopColor="white" stopOpacity={0.4} />
            <stop offset="100%" stopColor="white" stopOpacity={0} />
          </radialGradient>
        </defs>
      </svg>

      {/* Legend */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '6px 14px',
        padding: '0 8px',
      }}>
        {computed.map((sl) => (
          <button
            key={`legend-${sl.id}`}
            type="button"
            onClick={() => onSliceClick?.(sl.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'none',
              border: 'none',
              padding: '3px 0',
              cursor: 'pointer',
              fontFamily: 'var(--app-font-family)',
              opacity: activeId && activeId !== sl.id ? 0.45 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: sl.color,
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '0.72rem',
              color: 'var(--ui-primary-text, var(--text))',
              whiteSpace: 'nowrap',
            }}>
              {sl.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
