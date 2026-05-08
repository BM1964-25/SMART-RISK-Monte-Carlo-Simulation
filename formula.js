export function evaluateFormula(expression, context = {}) {
  const parsed = parseFormula(expression);
  if (!parsed.ok) {
    return { ok: false, value: 0, error: parsed.error };
  }
  try {
    const value = evaluateNode(parsed.ast, normalizeContext(context));
    if (!Number.isFinite(value)) {
      return { ok: false, value: 0, error: "Formel liefert keinen endlichen Zahlenwert." };
    }
    return { ok: true, value, error: "" };
  } catch (error) {
    return { ok: false, value: 0, error: error.message || "Formel konnte nicht ausgewertet werden." };
  }
}

export function validateFormula(expression, context = {}) {
  return evaluateFormula(expression, context);
}

export function parseFormula(expression) {
  try {
    const parser = new Parser(tokenize(translateFormula(String(expression || ""))));
    const ast = parser.parseExpression();
    parser.expectEnd();
    return { ok: true, ast };
  } catch (error) {
    return { ok: false, error: error.message || "Ungültige Formel." };
  }
}

export function localizeFormula(expression) {
  let result = String(expression || "");
  for (const [alias, canonical] of [...GERMAN_TOKEN_ALIASES, ...GERMAN_FUNCTION_ALIASES]) {
    const pattern = new RegExp(`\\b${escapeRegex(canonical)}\\b`, "gi");
    result = result.replace(pattern, alias);
  }
  return result;
}

export function createFormulaContext(values = {}) {
  const context = {};
  for (const [key, value] of Object.entries(values)) {
    const numeric = toNumber(value);
    context[key] = numeric;
    context[String(key).toUpperCase()] = numeric;
    context[String(key).toLowerCase()] = numeric;
  }
  return context;
}

export function createFormulaPlaceholderKey(value, fallbackPrefix = "TOKEN", usedTokens = null) {
  const source = String(value ?? "").trim();
  const cleaned = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
  let key = cleaned || String(fallbackPrefix || "TOKEN").trim() || "TOKEN";
  if (/^[0-9]/.test(key)) {
    key = `${fallbackPrefix || "TOKEN"}_${key}`;
  }
  if (usedTokens instanceof Set) {
    let uniqueKey = key;
    let suffix = 2;
    while (usedTokens.has(uniqueKey)) {
      uniqueKey = `${key}_${suffix}`;
      suffix += 1;
    }
    usedTokens.add(uniqueKey);
    return uniqueKey;
  }
  return key;
}

function evaluateNode(node, context) {
  switch (node.type) {
    case "number":
      return node.value;
    case "var":
      return resolveVariable(node.name, context);
    case "unary":
      return node.op === "-" ? -evaluateNode(node.argument, context) : evaluateNode(node.argument, context);
    case "binary":
      return evaluateBinary(node, context);
    case "call":
      return evaluateCall(node, context);
    default:
      throw new Error("Unbekannter Formel-Knoten.");
  }
}

function evaluateBinary(node, context) {
  const left = evaluateNode(node.left, context);
  const right = evaluateNode(node.right, context);
  switch (node.op) {
    case "+": return left + right;
    case "-": return left - right;
    case "*": return left * right;
    case "/":
      if (right === 0) throw new Error("Division durch 0 ist nicht zulässig.");
      return left / right;
    case "^":
      return Math.pow(left, right);
    case ">": return left > right ? 1 : 0;
    case ">=": return left >= right ? 1 : 0;
    case "<": return left < right ? 1 : 0;
    case "<=": return left <= right ? 1 : 0;
    case "==": return left === right ? 1 : 0;
    case "!=": return left !== right ? 1 : 0;
    default:
      throw new Error(`Operator "${node.op}" wird nicht unterstützt.`);
  }
}

function evaluateCall(node, context) {
  const name = node.name.toLowerCase();
  const args = node.args.map((arg) => evaluateNode(arg, context));
  switch (name) {
    case "min":
      return Math.min(...args);
    case "max":
      return Math.max(...args);
    case "abs":
      return Math.abs(args[0] ?? 0);
    case "round":
      return round(args[0] ?? 0, args[1] ?? 0);
    case "clamp":
      return clamp(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0);
    case "sum":
      return args.reduce((total, value) => total + value, 0);
    case "avg":
      return args.length ? args.reduce((total, value) => total + value, 0) / args.length : 0;
    case "pow":
      return Math.pow(args[0] ?? 0, args[1] ?? 0);
    case "if":
      if (args.length < 3) throw new Error("if() erwartet drei Argumente.");
      return args[0] ? args[1] : args[2];
    default:
      throw new Error(`Funktion "${node.name}" wird nicht unterstützt.`);
  }
}

function resolveVariable(name, context) {
  const direct = context[name];
  if (direct !== undefined) return toNumber(direct);
  const upper = context[String(name).toUpperCase()];
  if (upper !== undefined) return toNumber(upper);
  const lower = context[String(name).toLowerCase()];
  if (lower !== undefined) return toNumber(lower);
  return 0;
}

function round(value, digits = 0) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace(",", "."));
  return Number(value);
}

function normalizeContext(context) {
  const normalized = {};
  for (const [key, value] of Object.entries(context || {})) {
    const numeric = toNumber(value);
    normalized[key] = numeric;
    normalized[String(key).toUpperCase()] = numeric;
    normalized[String(key).toLowerCase()] = numeric;
  }
  return normalized;
}

const GERMAN_TOKEN_ALIASES = [
  ["Basiswert", "BASE_VALUE"],
  ["SummeAktiverParameter", "PARAM_SUM"],
  ["Risikokosten", "RISK_COST"],
  ["Terminwirkung", "RISK_TIME"],
  ["Jahresertrag", "ANNUAL_INCOME"],
  ["Jahreskosten", "ANNUAL_COST"],
  ["JahresCashflow", "ANNUAL_CASHFLOW"],
  ["Kapitalisierungszinssatz", "CAP_RATE"],
  ["Restwert", "RESIDUAL_VALUE"],
  ["Diskontierungszins", "DISCOUNT_RATE"],
  ["Haltedauer", "HOLDING_PERIOD"]
];

const GERMAN_FUNCTION_ALIASES = [
  ["wenn", "if"],
  ["min", "min"],
  ["max", "max"],
  ["betrag", "abs"],
  ["runden", "round"],
  ["begrenze", "clamp"],
  ["summe", "sum"],
  ["mittelwert", "avg"],
  ["potenz", "pow"]
];

function translateFormula(expression) {
  let result = String(expression || "");
  for (const [alias, canonical] of [...GERMAN_TOKEN_ALIASES, ...GERMAN_FUNCTION_ALIASES]) {
    const pattern = new RegExp(`\\b${escapeRegex(alias)}\\b`, "gi");
    result = result.replace(pattern, canonical);
  }
  return result;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(input) {
  const source = String(input || "").trim();
  if (!source) throw new Error("Die Formel ist leer.");
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const two = source.slice(index, index + 2);
    if (["<=", ">=", "==", "!="].includes(two)) {
      tokens.push({ type: "op", value: two });
      index += 2;
      continue;
    }
    if (/[+\-*/^(),<>]/.test(char)) {
      const type = char === "(" || char === ")" ? "paren" : char === "," ? "comma" : "op";
      tokens.push({ type, value: char });
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      const start = index;
      let hasDot = false;
      while (index < source.length && /[0-9.]/.test(source[index])) {
        if (source[index] === ".") {
          if (hasDot) break;
          hasDot = true;
        }
        index += 1;
      }
      const raw = source.slice(start, index);
      if (raw === "." || Number.isNaN(Number(raw))) {
        throw new Error(`Ungültige Zahl "${raw}".`);
      }
      tokens.push({ type: "number", value: Number(raw) });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
      tokens.push({ type: "identifier", value: source.slice(start, index) });
      continue;
    }
    throw new Error(`Unerwartetes Zeichen "${char}" in der Formel.`);
  }
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  parseExpression() {
    return this.parseComparison();
  }

  parseComparison() {
    let node = this.parseSum();
    while (this.matchOp(">", ">=", "<", "<=", "==", "!=")) {
      const op = this.previous().value;
      const right = this.parseSum();
      node = { type: "binary", op, left: node, right };
    }
    return node;
  }

  parseSum() {
    let node = this.parseProduct();
    while (this.matchOp("+", "-")) {
      const op = this.previous().value;
      const right = this.parseProduct();
      node = { type: "binary", op, left: node, right };
    }
    return node;
  }

  parseProduct() {
    let node = this.parsePower();
    while (this.matchOp("*", "/")) {
      const op = this.previous().value;
      const right = this.parsePower();
      node = { type: "binary", op, left: node, right };
    }
    return node;
  }

  parsePower() {
    let node = this.parseUnary();
    if (this.matchOp("^")) {
      const op = this.previous().value;
      const right = this.parsePower();
      node = { type: "binary", op, left: node, right };
    }
    return node;
  }

  parseUnary() {
    if (this.matchOp("+")) {
      return this.parseUnary();
    }
    if (this.matchOp("-")) {
      return { type: "unary", op: "-", argument: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    if (this.matchType("number")) {
      return { type: "number", value: this.previous().value };
    }
    if (this.matchType("identifier")) {
      const identifier = this.previous().value;
      if (this.matchParen("(")) {
        const args = [];
        if (!this.checkParen(")")) {
          do {
            args.push(this.parseExpression());
          } while (this.matchComma());
        }
        this.consumeParen(")");
        return { type: "call", name: identifier, args };
      }
      return { type: "var", name: identifier };
    }
    if (this.matchParen("(")) {
      const expression = this.parseExpression();
      this.consumeParen(")");
      return expression;
    }
    throw new Error("Die Formel ist unvollständig.");
  }

  matchType(type) {
    if (this.checkType(type)) {
      this.index += 1;
      return true;
    }
    return false;
  }

  matchOp(...values) {
    if (this.checkType("op") && values.includes(this.peek().value)) {
      this.index += 1;
      return true;
    }
    return false;
  }

  matchParen(value) {
    if (this.checkType("paren") && this.peek().value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  matchComma() {
    if (this.checkType("comma")) {
      this.index += 1;
      return true;
    }
    return false;
  }

  consumeParen(value) {
    if (!this.matchParen(value)) {
      throw new Error(`Erwartet wurde "${value}".`);
    }
  }

  checkType(type) {
    return this.index < this.tokens.length && this.tokens[this.index].type === type;
  }

  checkParen(value) {
    return this.checkType("paren") && this.peek().value === value;
  }

  peek() {
    return this.tokens[this.index];
  }

  previous() {
    return this.tokens[this.index - 1];
  }

  expectEnd() {
    if (this.index < this.tokens.length) {
      const token = this.tokens[this.index];
      throw new Error(`Unerwartetes Token "${token.value}".`);
    }
  }
}
