export function sampleParameter(parameter, multiplier = 1) {
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
    case "lognormal":
    case "log-normal":
    case "log_normal":
      return sampleLogNormal(min, mode, max);
    case "triangle":
    default:
      return sampleTriangular(min, mode, max);
  }
}

export function sampleRiskImpact(risk, multiplier = 1) {
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
  return Math.max(0, sampleGaussian(mean, sd));
}

function sampleGaussian(mean, sd) {
  const u1 = Math.random() || 1e-12;
  const u2 = Math.random() || 1e-12;
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z0 * sd;
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

function sampleLogNormal(min, mode, max) {
  const safeMin = Math.max(Number(min) || 0, 1e-9);
  const safeMode = Math.max(Number(mode) || safeMin, 1e-9);
  const safeMax = Math.max(Number(max) || safeMode, safeMin, safeMode);
  if (safeMin <= 0 || safeMode <= 0 || safeMax <= 0) {
    return sampleTriangular(safeMin, safeMode, safeMax);
  }
  if (safeMax === safeMin) return safeMin;
  const spread = Math.max(
    Math.log(Math.max(safeMode / safeMin, 1.000001)),
    Math.log(Math.max(safeMax / safeMode, 1.000001))
  );
  const sigma = Math.max(spread / 1.281551565545, 1e-6);
  const mu = Math.log(safeMode) + sigma * sigma;
  return clamp(Math.exp(sampleGaussian(mu, sigma)), safeMin, safeMax);
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

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
