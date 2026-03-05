import Chart from 'chart.js/auto';
import { CATEGORY_COLOR_MAP_KEY } from '../../state/keys';
import { CATEGORY_COLORS, getCategoryName, loadCategoryConfig } from '../../state/storage';

export type SpendingSlice = { categoryId: string; amountCents: number };

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
  return { ...base, ...stored };
}

function saveCategoryColorMapMerge(newAssignments: Record<string, string>) {
  if (!newAssignments || typeof newAssignments !== 'object') return;
  try {
    const existingRaw = localStorage.getItem(CATEGORY_COLOR_MAP_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) || {} : {};
    const merged = { ...existing, ...newAssignments };
    localStorage.setItem(CATEGORY_COLOR_MAP_KEY, JSON.stringify(merged));
    if ((getCategoryColorMap as any).cache) {
      (getCategoryColorMap as any).cache = { ...(getCategoryColorMap as any).cache, ...newAssignments };
    }
  } catch (_) {}
}

function getCategoryColorMap(): Record<string, string> {
  const anyFn = getCategoryColorMap as any;
  if (!anyFn.cache) anyFn.cache = loadCategoryColorMap();
  return anyFn.cache;
}

const CATEGORY_COLOR_PALETTE = [
  '#FF8C42',
  '#3B82F6',
  '#10B981',
  '#6366F1',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#14B8A6',
  '#0EA5E9',
  '#EC4899',
  '#22C55E',
  '#F97316',
  '#A855F7',
  '#06B6D4',
  '#EAB308'
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
  const map = getCategoryColorMap();
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

export function renderSpendingPieChart(canvas: HTMLCanvasElement, slices: SpendingSlice[]) {
  const cfg = loadCategoryConfig();
  const labels = slices.map((s) => getCategoryName(cfg, s.categoryId));
  const data = slices.map((s) => Math.max(0, s.amountCents) / 100);
  const colors = slices.map((s) => getCategoryColor(s.categoryId));

  const existing: Chart | undefined = (canvas as any).__chart;
  if (existing) existing.destroy();

  const chart = new Chart(canvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      }
    }
  });
  (canvas as any).__chart = chart;
  return chart;
}

