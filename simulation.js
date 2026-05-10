import { evaluateFormula, createFormulaContext, createFormulaPlaceholderKey } from "./formula.js?v=20260509-3";
import { getModelTemplate } from "./models.js?v=20260510-17";
import { percentile, summarize, computeSensitivity } from "./statistics.js?v=20260510-3";
import { sampleParameter, sampleRiskImpact, clamp } from "./distributions.js?v=20260510-5";

export async function runMonteCarlo(state, scenarioId, onProgress = null) {
  const scenario = resolveScenario(state, scenarioId);
  const iterations = Number(state.settings.iterations) || 1000;
  const budget = Number(state.settings.budget) || 0;
  const model = resolveModel(state);
  const outcome = resolveOutcomeMeta(model);
  const parameters = (state.parameters || []).filter(isActiveItem);
  const risks = (state.risks || []).filter(isActiveItem);

  const notify = (stage, percent, label, detail = "") => {
    if (typeof onProgress === "function") {
      onProgress({ stage, percent, label, detail });
    }
  };

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
  const chunkSize = Math.max(1, Math.floor(iterations / 60));
  notify("validate", 5, "Validierung", "Formel und Eingaben werden geprüft");
  await yieldToUI();

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
      const resolvedValue = Number.isFinite(numeric) ? numeric : (fieldDef.defaultValue ?? 0);
      context[token] = isPercentField(fieldDef) ? normalizePercentLikeNumber(resolvedValue) : resolvedValue;
    }

    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      const sampled = sampleParameter(parameter, scenario.parameterMultiplier);
      const numeric = toNumber(sampled);
      const formulaKey = resolveFormulaKey(parameter, index, "PAR");
      if (isFinite(numeric)) {
        paramSum += numeric;
        driverSeries[driverIndex].push(numeric);
        context[parameterTokens[index].token] = numeric;
        context[formulaKey] = numeric;
      } else {
        driverSeries[driverIndex].push(0);
        context[parameterTokens[index].token] = 0;
        context[formulaKey] = 0;
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

    if (i % chunkSize === 0 || i === iterations - 1) {
      const percent = 10 + Math.round(((i + 1) / iterations) * 70);
      notify("sample", Math.min(percent, 80), "Ziehen", `Läufe ${i + 1} / ${iterations}`);
      await yieldToUI();
    }
  }

  notify("compute", 88, "Berechnung", "Kennzahlen werden verdichtet");
  await yieldToUI();
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
      exceedanceProbability: summary.sorted.length
        ? summary.sorted.filter((x) => outcome.higherIsBetter ? x < budget : x > budget).length / summary.sorted.length
        : 0,
      recommendedBuffer: outcome.higherIsBetter
        ? Math.max(0, budget - percentileSet.p10)
        : Math.max(0, percentileSet.p90 - budget)
    },
    sensitivity,
    hasTimeEffect,
    outcome,
    model: {
      id: model.id,
      name: model.name,
      outputLabel: model.outputLabel,
      formula: model.formula,
      validationError: formulaError.error || "",
      resultUnit: model.resultUnit || "Tage"
    }
  };
}

export async function compareScenarios(state) {
  const scenarios = (state.scenarios || []).filter((scenario) => scenario.active !== false);
  const results = [];
  for (const scenario of scenarios) {
    const result = await runMonteCarlo(state, scenario.id);
    results.push({
      scenarioId: scenario.id,
      name: scenario.name,
      summary: result.summary
    });
  }
  return results;
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

function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

function resolveOutcomeMeta(model) {
  const templateId = String(model?.templateId || "");
  const outputLabel = String(model?.outputLabel || "").toLowerCase();
  if (templateId === "roi" || outputLabel.includes("roi") || outputLabel.includes("%") || outputLabel.includes("rendite")) {
    return { kind: "percent", higherIsBetter: true };
  }
  if (templateId === "schedule" || outputLabel.includes("termin") || outputLabel.includes("dauer")) {
    return { kind: "time", higherIsBetter: false };
  }
  return { kind: "money", higherIsBetter: false };
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
      context[token] = normalizeTemplateFieldValue(fieldDef, model?.[fieldDef.key]);
    }
    parameterTokens.forEach((item, index) => {
      const parameter = parameters[index];
      const numeric = toNumber(parameter?.mode ?? parameter?.min ?? parameter?.max ?? 1) || 1;
      context[item.token] = numeric;
      context[resolveFormulaKey(parameter, index, "PAR")] = numeric;
    });
    riskTokens.forEach((item, index) => {
      const risk = risks[index];
      const probability = clamp(toNumber(risk?.probability ?? 0), 0, 100);
      const impact = toNumber(risk?.modeImpact ?? risk?.minImpact ?? risk?.maxImpact ?? 1) || 1;
      context[item.token] = ((probability / 100) * impact) || 1;
      context[resolveFormulaKey(risk, index, "RISK")] = context[item.token];
    });
  const result = evaluateFormula(model.formula, context);
  return result.ok ? { ok: true, error: "" } : { ok: false, error: result.error };
}

function normalizeTemplateFieldValue(fieldDef, rawValue) {
  const numeric = toNumber(rawValue);
  const resolvedValue = Number.isFinite(numeric) ? numeric : (fieldDef?.defaultValue ?? 0);
  return isPercentField(fieldDef) ? normalizePercentLikeNumber(resolvedValue) : resolvedValue;
}

function resolveFormulaKey(item, index, fallbackPrefix) {
  const source = item?.formulaToken || item?.token || item?.label || item?.id || `${fallbackPrefix}_${index + 1}`;
  return createFormulaPlaceholderKey(source, fallbackPrefix);
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace(",", "."));
  return Number(value);
}

function isPercentField(fieldDef) {
  const unit = String(fieldDef?.unit || fieldDef?.format || "").toLowerCase();
  const label = String(fieldDef?.label || "").toLowerCase();
  const token = String(fieldDef?.token || fieldDef?.key || "").toLowerCase();
  return /(%|prozent)/.test(`${unit} ${label} ${token}`);
}

function normalizePercentLikeNumber(value) {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) return value;
  return Math.abs(numeric) > 1 ? numeric / 100 : numeric;
}

function isActiveItem(item) {
  return item && item.active !== false;
}
