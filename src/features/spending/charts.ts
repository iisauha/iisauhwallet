import Chart from 'chart.js/auto';
import { CATEGORY_COLOR_MAP_KEY } from '../../state/keys';
import { CATEGORY_COLORS, getCategoryName, loadCategoryConfig } from '../../state/storage';

export type SpendingSlice = { categoryId: string; amountCents: number };

// Old palette colors that should be replaced with the new distinct ones
const OLD_PALETTE_COLORS = new Set([
  '#FF8C42', '#3B82F6', '#6366F1', '#F59E0B', '#8B5CF6',
  '#14B8A6', '#0EA5E9', '#EC4899', '#22C55E', '#F97316',
  '#A855F7', '#EAB308'
]);

function loadCategoryColorMap() {
  const base = { ...CATEGORY_COLORS };
  let stored: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(CATEGORY_COLOR_MAP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') stored = parsed;
    }
  } catch (_) {}
  // Strip out old palette colors so they get reassigned from the new palette
  for (const key of Object.keys(stored)) {
    if (OLD_PALETTE_COLORS.has(stored[key])) delete stored[key];
  }
  return { ...stored, ...base };
}

function saveCategoryColorMapMerge(newAssignments: Record<string, string>) {
  if (!newAssignments || typeof newAssignments !== 'object') return;
  try {
    const existingRaw = localStorage.getItem(CATEGORY_COLOR_MAP_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) || {} : {};
    const merged = { ...existing, ...newAssignments };
    localStorage.setItem(CATEGORY_COLOR_MAP_KEY, JSON.stringify(merged));
    if ((categoryColorMap as any).cache) {
      (categoryColorMap as any).cache = { ...(categoryColorMap as any).cache, ...newAssignments };
    }
  } catch (_) {}
}

export function categoryColorMap(): Record<string, string> {
  const anyFn = categoryColorMap as any;
  if (!anyFn.cache) {
    anyFn.cache = loadCategoryColorMap();
    // Persist cleaned map so old colors don't come back
    try { localStorage.setItem(CATEGORY_COLOR_MAP_KEY, JSON.stringify(anyFn.cache)); } catch (_) {}
  }
  return anyFn.cache;
}

const CATEGORY_COLOR_PALETTE = [
  '#FF6B35',  // orange
  '#2D7DD2',  // blue
  '#10B981',  // emerald
  '#8338EC',  // purple
  '#F7B32B',  // gold
  '#EF4444',  // red
  '#E056A0',  // pink
  '#06B6D4',  // cyan
  '#97CC04',  // lime
  '#FF4365',  // coral
  '#845EC2',  // deep violet
  '#00C9A7',  // mint
  '#F77F00',  // tangerine
  '#4895EF',  // periwinkle
  '#D62828',  // crimson
  '#2EC4B6',  // teal
  '#BC4749',  // brick
  '#44AF69',  // forest
  '#9B5DE5',  // lavender
  '#F15BB5',  // magenta
];

function hashStringToInt(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function hslToHex(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * v);
  };
  const r = f(0);
  const g = f(8);
  const b = f(4);
  const toHex = (x: number) => x.toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function generateDeterministicColorForCategory(id: string) {
  const cfg = loadCategoryConfig();
  const name = getCategoryName(cfg, id) || id || '';
  const h = hashStringToInt(name) % 360;
  const s = 65;
  const l = 50;
  return hslToHex(h, s, l);
}

export function getCategoryColor(categoryId: string) {
  const map = categoryColorMap();
  if (map[categoryId]) return map[categoryId];
  const existingColors = Object.values(map);
  let color = '#64748b';
  for (let i = 0; i < CATEGORY_COLOR_PALETTE.length; i++) {
    if (!existingColors.includes(CATEGORY_COLOR_PALETTE[i])) {
      color = CATEGORY_COLOR_PALETTE[i];
      break;
    }
  }
  if (color === '#64748b' && CATEGORY_COLOR_PALETTE.every((c) => existingColors.includes(c))) {
    color = generateDeterministicColorForCategory(categoryId);
  }
  saveCategoryColorMapMerge({ [categoryId]: color });
  return color;
}

const PIE_SLICES_KEY = 'pie_last_slices_key';

export function renderSpendingPieChart(
  canvas: HTMLCanvasElement,
  slices: SpendingSlice[],
  onSliceClick?: (categoryId: string) => void,
  animate: boolean = true
) {
  const cfg = loadCategoryConfig();
  const labels = slices.map((s) => getCategoryName(cfg, s.categoryId));
  const data = slices.map((s) => Math.max(0, s.amountCents) / 100);
  const colors = slices.map((s) => getCategoryColor(s.categoryId));

  // Persist slices key so refresh doesn't re-trigger spin
  const key = JSON.stringify(slices.map((s) => [s.categoryId, s.amountCents]));
  let shouldAnimate = animate;
  try {
    const prev = localStorage.getItem(PIE_SLICES_KEY);
    if (prev === key) shouldAnimate = false;
    else localStorage.setItem(PIE_SLICES_KEY, key);
  } catch (_) {}

  const existing: Chart | undefined = (canvas as any).__chart;
  if (existing) existing.destroy();

  // Create radial gradients for a richer look
  const ctx = canvas.getContext('2d');
  const cx = canvas.clientWidth / 2;
  const cy = canvas.clientHeight / 2;
  const r = Math.min(cx, cy);
  const gradientColors = (ctx && r > 0) ? colors.map((hex) => {
    const g = ctx.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
    g.addColorStop(0, hex + 'DD');
    g.addColorStop(1, hex);
    return g;
  }) : colors;

  const bgColor = ctx ? getComputedStyle(canvas).getPropertyValue('--bg').trim() || '#1a1a2e' : '#1a1a2e';

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: gradientColors, borderWidth: 2, borderColor: bgColor }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      animation: { duration: shouldAnimate ? 600 : 0, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      onClick: (_event, elements, chartInstance) => {
        if (onSliceClick && elements.length > 0 && chartInstance.data.datasets[0]) {
          const idx = elements[0].index;
          if (idx >= 0 && idx < slices.length) onSliceClick(slices[idx].categoryId);
        }
      },
      elements: {
        arc: {
          hoverBackgroundColor: (ctx: any) => colors[ctx.dataIndex],
          hoverBorderWidth: 0,
        }
      }
    }
  });
  (canvas as any).__chart = chart;
  return chart;
}

