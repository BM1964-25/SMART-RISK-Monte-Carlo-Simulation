const STORAGE_KEY = "smart-risk-monte-carlo:v1";

export function loadState(defaultState) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return mergeDefaults(defaultState, parsed);
  } catch {
    return structuredClone(defaultState);
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportableState(state) {
  return {
    ...state,
    meta: {
      version: 1,
      exportedAt: new Date().toISOString()
    }
  };
}

function mergeDefaults(defaultState, incoming) {
  const merged = structuredClone(defaultState);
  return deepMerge(merged, incoming);
}

function deepMerge(target, source) {
  if (Array.isArray(target) || Array.isArray(source)) {
    return Array.isArray(source) ? structuredClone(source) : structuredClone(target);
  }
  if (source && typeof source === "object") {
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
        target[key] = deepMerge(target[key], value);
      } else {
        target[key] = structuredClone(value);
      }
    }
  }
  return target;
}
