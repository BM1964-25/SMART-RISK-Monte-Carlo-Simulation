import { evaluateFormula, createFormulaContext, createFormulaPlaceholderKey } from "./formula.js?v=20260508-1";
import { getModelTemplate } from "./models.js?v=20260508-1";

export function runMonteCarlo(state, scenarioId) {
  const scenario = resolveScenario(state, scenarioId);
  const iterations = Number(state.settings.iterations) || 1000;
  const budget = Number(state.settings.budget) || 0;
  const model = resolveModel(state);
  const parameters = (state.parameters || []).filter(isActiveItem);
  const risks = (state.risks || []).filter(isActiveItem);

  const usedTokens = new Set();
  const parameterTokens = parameters.map((parameter, index) => ({
    token: createFormulaPlaceholderKey(parameter.id || parameter.label || `PAR_${index + 1}`, "PAR", usedTokens)
  }));
  const riskTokens = risks.map((risk, index) => ({
    token: createFormulaPlaceholderKey(risk.riskId || risk.id || risk.label || `RISK_${index + 1}`, "RISK", usedTokens)
  }));

  const driverNames = [];
  const driverSeries = [];
  const values = [];

  for (const parameter of parameters) {
    driverNames.push(`P: ${parameter.label || parameter.id}`);
    driverSeries.push([]);
  }

  for (const risk of risks) {
    driverNames.push(`R: ${risk.label || risk.riskId}`);
    driverSeries.push([]);
  }

  const timeSeries = [];
  const records = [];
  let hasTimeEffect = false;
  const formulaError = validateModelFormula(model, parameterTokens, riskTokens, parameters, risks);
  const templateDefinition = getModelTemplate(model.templateId || "custom");

  for (let i = 0; i < iterations; i += 1) {
    let paramSum = 0;
    let riskCost = 0;
    let totalTime = 0;
    let driverIndex = 0;
    const context = createFormulaContext({
      BASE_VALUE: model.baseValue,
      PARAM_SUM: 0,
      RISK_COST: 0,
      RISK_TIME: 0,
      ANNUAL_INCOME: model.annualIncome,
      ANNUAL_COST: model.annualCost,
      ANNUAL_CASHFLOW: model.annualCashflow,
      CAP_RATE: model.capRate,
      RESIDUAL_VALUE: model.residualValue,
      DISCOUNT_RATE: model.discountRate,
      HOLDING_PERIOD: model.holdingPeriod
    });
    for (const fieldDef of templateDefinition.fields || []) {
      const token = fieldDef.token || fieldDef.label || fieldDef.key;
      const numeric = toNumber(model?.[fieldDef.key]);
      context[token] = Number.isFinite(numeric) ? numeric : (fieldDef.defaultValue ?? 0);
    }

    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      const sampled = sampleParameter(parameter, scenario.parameterMultiplier);
      const numeric = toNumber(sampled);
      if (isFinite(numeric)) {
        paramSum += numeric;
        driverSeries[driverIndex].push(numeric);
        context[parameterTokens[index].token] = numeric;
      } else {
        driverSeries[driverIndex].push(0);
        context[parameterTokens[index].token] = 0;
      }
      driverIndex += 1;
    }

    for (let index = 0; index < risks.length; index += 1) {
      const risk = risks[index];
      const probability = clamp(toNumber(risk.probability) * scenario.riskProbabilityMultiplier, 0, 100);
      let realizedImpact = 0;
      if (Math.random() * 100 < probability) {
        const impact = sampleRiskImpact(risk, scenario.riskImpactMultiplier);
        realizedImpact = impact.cost;
        riskCost += impact.cost;
        totalTime += impact.time;
        if (impact.time !== 0) hasTimeEffect = true;
      }
      driverSeries[driverIndex].push(realizedImpact);
      context[riskTokens[index].token] = realizedImpact;
      driverIndex += 1;
    }

    context.PARAM_SUM = paramSum;
    context.RISK_COST = riskCost;
    context.RISK_TIME = totalTime;

    const evaluated = evaluateFormula(model.formula, context);
    const totalValue = evaluated.ok ? evaluated.value : paramSum + riskCost;

    values.push(totalValue);
    timeSeries.push(totalTime);
    records.push({
      run: i + 1,
      cost: totalValue,
      time: totalTime,
      formula: model.formula,
      formulaError: evaluated.ok ? "" : evaluated.error
    });
  }

  const summary = summarize(values, budget);
  const sensitivity = computeSensitivity(driverSeries, values, driverNames);
  const percentileSet = {
    p10: percentile(summary.sorted, 0.1),
    p50: percentile(summary.sorted, 0.5),
    p80: percentile(summary.sorted, 0.8),
    p90: percentile(summary.sorted, 0.9),
    p95: percentile(summary.sorted, 0.95)
  };

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    iterations,
    budget,
    values,
    timeSeries,
    records,
    summary: {
      ...summary,
      ...percentileSet,
      exceedanceProbability: summary.sorted.length ? summary.sorted.filter((x) => x > budget).length / summary.sorted.length : 0,
      recommendedBuffer: Math.max(0, percentileSet.p90 - budget)
    },
    sensitivity,
    hasTimeEffect,
    model: {
      id: model.id,
      name: model.name,
      outputLabel: model.outputLabel,
      formula: model.formula,
      validationError: formulaError.error || ""
    }
  };
}

export function compareScenarios(state) {
  return (state.scenarios || []).filter((scenario) => scenario.active !== false).map((scenario) => {
    const result = runMonteCarlo(state, scenario.id);
    return {
      scenarioId: scenario.id,
      name: scenario.name,
      summary: result.summary
    };
  });
}

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
  const sorted = sortedValues;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

export function computeCorrelationRanking(series, values, names) {
  return computeSensitivity(series, values, names).slice(0, 10);
}

function computeSensitivity(series, values, names) {
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

function resolveScenario(state, scenarioId) {
  const scenarios = state.scenarios || [];
  const fallback = scenarios[0] || {
    id: "baseline",
    name: "Basisszenario",
    parameterMultiplier: 1,
    riskProbabilityMultiplier: 1,
    riskImpactMultiplier: 1
  };
  return scenarios.find((scenario) => scenario.id === scenarioId) || fallback;
}

function resolveModel(state) {
  const selectedId = state.model?.templateId || "cost";
  const template = getModelTemplate(selectedId);
  const model = state.model || {};
  return {
    ...template,
    ...model,
    id: template.id,
    name: template.name,
    outputLabel: template.outputLabel,
    formula: String(model.formula || template.formula || "").trim()
  };
}

function validateModelFormula(model, parameterTokens = [], riskTokens = [], parameters = [], risks = []) {
  const context = createFormulaContext({
    BASE_VALUE: model.baseValue,
    PARAM_SUM: 1,
    RISK_COST: 1,
    RISK_TIME: 1,
    ANNUAL_INCOME: model.annualIncome,
    ANNUAL_COST: model.annualCost,
    ANNUAL_CASHFLOW: model.annualCashflow,
    CAP_RATE: model.capRate || 1,
    RESIDUAL_VALUE: model.residualValue,
    DISCOUNT_RATE: model.discountRate || 1,
    HOLDING_PERIOD: model.holdingPeriod || 1
  });
  const templateDefinition = getModelTemplate(model.templateId || "custom");
  for (const fieldDef of templateDefinition.fields || []) {
    const token = fieldDef.token || fieldDef.label || fieldDef.key;
    const numeric = toNumber(model?.[fieldDef.key]);
    context[token] = Number.isFinite(numeric) ? numeric : (fieldDef.defaultValue ?? 0);
  }
  parameterTokens.forEach((item, index) => {
    const parameter = parameters[index];
    context[item.token] = toNumber(parameter?.mode ?? parameter?.min ?? parameter?.max ?? 1) || 1;
  });
  riskTokens.forEach((item, index) => {
    const risk = risks[index];
    const probability = clamp(toNumber(risk?.probability ?? 0), 0, 100);
    const impact = toNumber(risk?.modeImpact ?? risk?.minImpact ?? risk?.maxImpact ?? 1) || 1;
    context[item.token] = ((probability / 100) * impact) || 1;
  });
  const result = evaluateFormula(model.formula, context);
  return result.ok ? { ok: true, error: "" } : { ok: false, error: result.error };
}

function sampleParameter(parameter, multiplier = 1) {
  const min = scaleValue(parameter.min, multiplier);
  const mode = scaleValue(parameter.mode, multiplier);
  const max = scaleValue(parameter.max, multiplier);
  switch ((parameter.distribution || "triangle").toLowerCase()) {
    case "uniform":
      return sampleUniform(min, max);
    case "normal":
      return sampleNormal(mode, Math.abs((max - min) / 6) || Math.max(Math.abs(mode) * 0.05, 1));
    case "beta-pert":
    case "beta_pert":
      return sampleBetaPert(min, mode, max);
    case "triangle":
    default:
      return sampleTriangular(min, mode, max);
  }
}

function sampleRiskImpact(risk, multiplier = 1) {
  const cost = sampleTriangular(scaleValue(risk.minImpact, multiplier), scaleValue(risk.modeImpact, multiplier), scaleValue(risk.maxImpact, multiplier));
  const time = toNumber(risk.timeImpact) * multiplier || 0;
  return { cost, time };
}

function sampleTriangular(min, mode, max) {
  min = Math.min(min, max);
  mode = clamp(mode, min, max);
  max = Math.max(max, min);
  if (max === min) return min;
  const u = Math.random();
  const c = (mode - min) / (max - min || 1);
  if (u <= c) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

function sampleUniform(min, max) {
  min = Math.min(min, max);
  max = Math.max(max, min);
  return min + Math.random() * (max - min);
}

function sampleNormal(mean, sd) {
  const u1 = Math.random() || 1e-12;
  const u2 = Math.random() || 1e-12;
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return Math.max(0, mean + z0 * sd);
}

function sampleBetaPert(min, mode, max) {
  min = Number(min) || 0;
  mode = clamp(Number(mode) || 0, min, max);
  max = Number(max) || min;
  if (max === min) return min;
  const alpha = 1 + 4 * ((mode - min) / (max - min));
  const beta = 1 + 4 * ((max - mode) / (max - min));
  const x = betaSample(alpha, beta);
  return min + x * (max - min);
}

function betaSample(alpha, beta) {
  const x = gammaSample(alpha);
  const y = gammaSample(beta);
  return x / (x + y || 1);
}

function gammaSample(shape) {
  if (shape < 1) {
    const u = Math.random();
    return gammaSample(1 + shape) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x;
    let v;
    do {
      x = sampleNormal(0, 1);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function scaleValue(value, multiplier) {
  const numeric = toNumber(value);
  return numeric * multiplier;
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace(",", "."));
  return Number(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isActiveItem(item) {
  return item && item.active !== false;
}
