export function buildHistogram(values, bins = 24) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const bucketWidth = span / bins;
  const buckets = Array.from({ length: bins }, (_, index) => ({
    x0: min + index * bucketWidth,
    x1: min + (index + 1) * bucketWidth,
    count: 0
  }));
  for (const value of values) {
    const index = Math.min(Math.floor((value - min) / bucketWidth), bins - 1);
    buckets[index].count += 1;
  }
  return buckets;
}

export function summarize(values, budget = 0) {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const min = count ? sorted[0] : 0;
  const max = count ? sorted[count - 1] : 0;
  const mean = count ? sorted.reduce((sum, value) => sum + value, 0) / count : 0;
  const median = percentile(sorted, 0.5);
  const sd = count ? Math.sqrt(sorted.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / count) : 0;
  return {
    sorted,
    count,
    min,
    max,
    mean,
    median,
    sd
  };
}

export function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

export function computeCorrelationRanking(series, values, names) {
  return computeSensitivity(series, values, names).slice(0, 10);
}

export function computeSensitivity(series, values, names) {
  const ranking = names.map((name, index) => ({
    name,
    correlation: pearson(series[index] || [], values)
  }));
  return ranking
    .filter((item) => Number.isFinite(item.correlation))
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (!n) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  for (let i = 0; i < n; i += 1) {
    const xi = Number(x[i]) || 0;
    const yi = Number(y[i]) || 0;
    sumX += xi;
    sumY += yi;
    sumXY += xi * yi;
    sumX2 += xi * xi;
    sumY2 += yi * yi;
  }
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(Math.max(n * sumX2 - sumX * sumX, 0) * Math.max(n * sumY2 - sumY * sumY, 0));
  return denominator === 0 ? 0 : numerator / denominator;
}
