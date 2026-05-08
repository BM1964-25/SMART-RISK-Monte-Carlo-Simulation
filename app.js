import { loadState, saveState, clearState } from "./storage.js";
import { runMonteCarlo, compareScenarios, buildHistogram, formatNumber, percentile } from "./simulation.js";
import { exportStateAsJson, exportResultsAsCsv, downloadTemplate } from "./export.js";
import { MODEL_TEMPLATES, FORMULA_TOKENS, getModelTemplate } from "./models.js";
import { validateFormula, localizeFormula } from "./formula.js";

const STORAGE_BASENAME = "smart-risk-monte-carlo";

const DEFAULT_STATE = createDefaultState();
let state = loadState(DEFAULT_STATE);
let latestRun = state.lastRun || null;
let comparisonCache = state.lastComparison || [];
let currentView = "dashboard";
let saveTimer = null;
let copiedToastTimer = null;
let pendingCsvImport = null;

const elements = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  normalizeState();
  latestRun = state.lastRun || null;
  comparisonCache = state.lastComparison || [];
  window.smartRiskNavigate = (view) => setView(view);
  window.smartRiskToggleSidebar = () => toggleSidebar();
  bindEvents();
  renderAll();
  updateSaveStatus("Autosave bereit");
}

function cacheElements() {
  elements.sidebar = document.getElementById("sidebar");
  elements.nav = document.getElementById("nav");
  elements.projectTitle = document.getElementById("project-title");
  elements.projectSubtitle = document.getElementById("project-subtitle");
  elements.saveStatus = document.getElementById("save-status");
  elements.runStatus = document.getElementById("run-status");
  elements.dashboardMetrics = document.getElementById("dashboard-metrics");
  elements.decisionCallout = document.getElementById("decision-callout");
  elements.projectForm = document.getElementById("project-form");
  elements.parametersTable = document.getElementById("parameters-table");
  elements.risksTable = document.getElementById("risks-table");
  elements.simulationForm = document.getElementById("simulation-form");
  elements.modelForm = document.getElementById("model-form");
  elements.analysisMetrics = document.getElementById("analysis-metrics");
  elements.percentileTable = document.getElementById("percentile-table");
  elements.budgetAnalysis = document.getElementById("budget-analysis");
  elements.trafficLight = document.getElementById("traffic-light");
  elements.sensitivityRanking = document.getElementById("sensitivity-ranking");
  elements.scenarioCards = document.getElementById("scenario-cards");
  elements.scenarioCompare = document.getElementById("scenario-compare");
  elements.reportOutput = document.getElementById("report-output");
  elements.histogramCanvas = document.getElementById("histogram-canvas");
  elements.cdfCanvas = document.getElementById("cdf-canvas");
  elements.tornadoCanvas = document.getElementById("tornado-canvas");
  elements.importFile = document.getElementById("import-file");
  elements.sections = document.querySelectorAll(".view-section");
}

function bindEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  elements.nav.addEventListener("click", handleNav);
  elements.importFile.addEventListener("change", handleFileImport);
}

function handleNav(event) {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  setView(button.dataset.view);
}

function handleClick(event) {
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const { action: name } = action.dataset;
  switch (name) {
    case "new-project":
      resetToDefaultState();
      break;
    case "save-project":
      manualSave();
      break;
    case "load-demo":
      loadDemoData();
      break;
    case "add-parameter":
      addParameter();
      break;
    case "add-parameter-template":
      addParameterTemplate();
      break;
    case "add-risk":
      addRisk();
      break;
    case "add-risk-template":
      addRiskTemplate();
      break;
    case "run-simulation":
      runSimulation();
      break;
    case "add-scenario":
      addScenario();
      break;
    case "compare-scenarios":
      runScenarioComparison();
      break;
    case "toggle-sidebar":
      toggleSidebar();
      break;
    case "insert-token":
      insertFormulaToken(action.dataset.token);
      break;
    case "insert-formula":
      insertFormulaExpression(action.dataset.formula || "");
      break;
    case "apply-model-template":
      applyModelTemplate(action.dataset.modelTemplate);
      break;
    case "save-custom-formula":
      saveCustomFormula();
      break;
    case "load-custom-formula":
      loadCustomFormula(action.dataset.customFormulaId);
      break;
    case "delete-custom-formula":
      deleteCustomFormula(action.dataset.customFormulaId);
      break;
    case "copy-report":
      copyReport();
      break;
    case "export-json":
      exportStateAsJson(state);
      flash("JSON-Export erstellt");
      break;
    case "import-json":
      pendingCsvImport = null;
      elements.importFile.value = "";
      elements.importFile.click();
      break;
    case "import-parameter-csv":
      pendingCsvImport = "parameters";
      elements.importFile.value = "";
      elements.importFile.click();
      break;
    case "import-risk-csv":
      pendingCsvImport = "risks";
      elements.importFile.value = "";
      elements.importFile.click();
      break;
    case "export-csv":
      if (!latestRun) {
        flash("Bitte zuerst eine Simulation starten", true);
      } else {
        exportResultsAsCsv(latestRun.records);
        flash("CSV-Export erstellt");
      }
      break;
    case "download-template":
      downloadTemplate(state);
      flash("Datenvorlage exportiert");
      break;
    case "reset-all":
      if (confirm("Alle lokal gespeicherten Daten wirklich zurücksetzen?")) {
        clearState();
        resetToDefaultState();
        flash("Alle Daten wurden zurückgesetzt");
      }
      break;
    case "delete-parameter":
      deleteItem("parameters", action.dataset.id);
      break;
    case "duplicate-parameter":
      duplicateParameter(action.dataset.id);
      break;
    case "delete-risk":
      deleteItem("risks", action.dataset.id);
      break;
    case "duplicate-risk":
      duplicateRisk(action.dataset.id);
      break;
    case "delete-scenario":
      deleteItem("scenarios", action.dataset.id);
      break;
    case "duplicate-scenario":
      duplicateScenario(action.dataset.id);
      break;
    case "set-active-scenario":
      state.settings.activeScenarioId = action.dataset.id;
      scheduleRender();
      scheduleSave();
      break;
    default:
      break;
  }
}

function handleInput(event) {
  const target = event.target;
  const field = target.dataset.field;
  const collection = target.dataset.collection;
  const id = target.dataset.id;
  if (field && collection && id) {
    updateCollectionItem(collection, id, field, target, false);
    return;
  }
  if (target.matches("[data-state-field]")) {
    updateStateField(target.dataset.stateField, target, false);
  }
}

function handleChange(event) {
  const target = event.target;
  if (target.matches("[data-model-template]")) {
    applyModelTemplate(target.value);
    return;
  }
  if (target.dataset.field && target.dataset.collection && target.dataset.id) {
    updateCollectionItem(target.dataset.collection, target.dataset.id, target.dataset.field, target, true);
    return;
  }
  if (target.matches("[data-state-field]")) {
    updateStateField(target.dataset.stateField, target, true);
  }
}

function handleFileImport(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const isCsv = /\.csv$/i.test(file.name) || !!pendingCsvImport;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      if (isCsv) {
        const rows = parseDelimitedText(String(reader.result || ""));
        if (!pendingCsvImport) {
          flash("CSV-Import benötigt ein Zielmodul", true);
          return;
        }
        importRegisterCsv(pendingCsvImport, rows);
        pendingCsvImport = null;
        flash("CSV erfolgreich importiert");
        return;
      }
      const imported = JSON.parse(String(reader.result || "{}"));
      state = normalizeImportedState(imported);
      latestRun = null;
      comparisonCache = [];
      normalizeState();
      renderAll();
      scheduleSave(true);
      flash("JSON erfolgreich importiert");
    } catch (error) {
      flash(isCsv ? "CSV-Import fehlgeschlagen" : "Import fehlgeschlagen: ungültige JSON-Datei", true);
    }
  };
  reader.readAsText(file);
}

function updateStateField(path, target, shouldRender = true) {
  const rawValue = target.type === "checkbox" ? target.checked : target.value;
  const value = coerceStateValue(path, rawValue, target);
  setDeepValue(state, path, value);
  if (path === "settings.activeScenarioId") {
    // no-op
  }
  if (shouldRender) scheduleRender();
  scheduleSave();
}

function updateCollectionItem(collection, id, field, target, shouldRender = true) {
  const items = state[collection] || [];
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  const value = target.type === "checkbox" ? target.checked : target.value;
  item[field] = coerceValue(field, value, target);
  if (shouldRender) scheduleRender();
  scheduleSave();
}

function coerceValue(field, value, target) {
  if (target.type === "checkbox") return Boolean(value);
  if (target.type === "number" || ["min", "mode", "max", "probability", "minImpact", "modeImpact", "maxImpact", "timeImpact", "parameterMultiplier", "riskProbabilityMultiplier", "riskImpactMultiplier", "iterations", "budget"].includes(field)) {
    return value === "" ? "" : Number(value);
  }
  return value;
}

function coerceStateValue(path, value, target) {
  if (target.type === "checkbox") return Boolean(value);
  if (["settings.iterations", "settings.budget"].includes(path)) {
    return value === "" ? 0 : Number(value);
  }
  return value;
}

function setView(view) {
  currentView = view;
  for (const button of elements.nav.querySelectorAll("[data-view]")) {
    button.classList.toggle("active", button.dataset.view === view);
  }
  for (const section of elements.sections) {
    section.classList.toggle("active", section.dataset.section === view);
  }
  window.scrollTo(0, 0);
  scheduleRender();
}

function toggleSidebar() {
  state.ui.sidebarCollapsed = !state.ui.sidebarCollapsed;
  applySidebarState();
  scheduleSave();
}

function scheduleRender() {
  window.requestAnimationFrame(() => {
    renderAll();
  });
}

function scheduleSave(immediate = false) {
  if (saveTimer) clearTimeout(saveTimer);
  const perform = () => {
    try {
      saveState(state);
      updateSaveStatus("Automatisch gespeichert");
    } catch {
      updateSaveStatus("Speichern fehlgeschlagen", true);
    }
  };
  if (immediate) {
    perform();
    return;
  }
  saveTimer = window.setTimeout(perform, 350);
}

function manualSave() {
  try {
    saveState(state);
    updateSaveStatus("Projekt gespeichert");
    flash("Projekt gespeichert");
  } catch {
    updateSaveStatus("Speichern fehlgeschlagen", true);
    flash("Speichern fehlgeschlagen", true);
  }
}

function updateSaveStatus(text, isError = false) {
  elements.saveStatus.textContent = text;
  elements.saveStatus.className = `badge ${isError ? "badge-danger" : "badge-neutral"}`;
}

function flash(message, isError = false) {
  elements.runStatus.textContent = message;
  elements.runStatus.className = `badge ${isError ? "badge-danger" : "badge-success"}`;
  if (copiedToastTimer) clearTimeout(copiedToastTimer);
  copiedToastTimer = window.setTimeout(() => {
    elements.runStatus.textContent = latestRun ? `Letzte Simulation: ${formatNumber(latestRun.summary.mean)} ${state.project.unit}` : "Keine Simulation gestartet";
    elements.runStatus.className = "badge badge-neutral";
  }, 2400);
}

function renderAll() {
  applySidebarState();
  renderHeader();
  renderProjectForm();
  renderModelSection();
  renderParameterTable();
  renderRiskTable();
  renderSimulationForm();
  renderDashboard();
  renderAnalysis();
  renderSensitivity();
  renderScenarioCards();
  renderScenarioComparison();
  renderReport();
  drawCharts();
}

function renderHeader() {
  elements.projectTitle.textContent = state.project.name || "SMART RISK Monte-Carlo-Simulation";
  elements.projectSubtitle.innerHTML = "Probabilistische Risiko- und Szenarioanalyse<br />für Bau, Immobilien und Projektsteuerung.";
  elements.projectSubtitle.title = state.project.description || "";
  if (latestRun) {
    elements.runStatus.textContent = `Letzte Simulation: ${formatNumber(latestRun.summary.mean)} ${state.project.unit || "EUR"}`;
    elements.runStatus.className = "badge badge-success";
  } else {
    elements.runStatus.textContent = "Keine Simulation gestartet";
    elements.runStatus.className = "badge badge-neutral";
  }
}

function applySidebarState() {
  if (!elements.sidebar) return;
  elements.sidebar.classList.toggle("collapsed", !!state.ui?.sidebarCollapsed);
}

function renderDashboard() {
  const metrics = dashboardMetrics();
  elements.dashboardMetrics.innerHTML = metrics.map(metricCard).join("");
  const recommendation = buildRecommendation();
  elements.decisionCallout.innerHTML = `
    <h4>Zentrale Entscheidungsempfehlung</h4>
    <p>${recommendation.headline}</p>
    <ul>
      ${recommendation.points.map((point) => `<li>${point}</li>`).join("")}
    </ul>
  `;
}

function dashboardMetrics() {
  const summary = latestRun ? latestRun.summary : emptySummary();
  const inputs = state.parameters.filter((item) => item.active !== false).length;
  const risks = state.risks.filter((item) => item.active !== false).length;
  const simulations = state.settings.iterations;
  return [
    ["Projektname", state.project.name || "Unbenannt", state.project.client || "Kein Auftraggeber hinterlegt"],
    ["Eingangsparameter", String(inputs), `${state.parameters.length} erfasst`],
    ["Risiken", String(risks), `${state.risks.length} erfasst`],
    ["Simulationen", formatNumber(simulations), "Laufzahl"],
    ["Erwartungswert", formatMoney(summary.mean), "Mittelwert der Verteilung"],
    ["Median", formatMoney(summary.median), "50%-Quantil"],
    ["P50 / P80 / P90", `${formatMoney(summary.p50)} / ${formatMoney(summary.p80)} / ${formatMoney(summary.p90)}`, "Management-Perzentile"],
    ["Spanne", `${formatMoney(summary.min)} - ${formatMoney(summary.max)}`, "Minimum bis Maximum"]
  ];
}

function buildRecommendation() {
  const summary = latestRun ? latestRun.summary : emptySummary();
  const budget = Number(state.settings.budget) || 0;
  const p80 = summary.p80 || 0;
  const p90 = summary.p90 || 0;
  if (!latestRun) {
    return {
      headline: "Bitte zuerst eine Simulation starten, um eine belastbare Empfehlung zu erzeugen.",
      points: [
        "Die App speichert Eingaben lokal und kann jederzeit erneut berechnet werden.",
        "Nutze Demo-Daten als Ausgangspunkt, wenn du ein vollständiges Beispiel sehen möchtest."
      ]
    };
  }
  if (p80 <= budget) {
    return {
      headline: "Das Zielbudget ist aus Sicht des P80 derzeit belastbar. Das Projekt wirkt auf dieser Basis steuerbar.",
      points: [
        `P80 liegt mit ${formatMoney(p80)} innerhalb des Zielbudgets von ${formatMoney(budget)}.`,
        `Empfohlener Risikopuffer gegenüber dem Budget: ${formatMoney(summary.recommendedBuffer)}.`,
        `Budgetüberschreitungswahrscheinlichkeit: ${formatPercent(summary.exceedanceProbability)}.`
      ]
    };
  }
  if (p90 <= budget * 1.05) {
    return {
      headline: "Das Zielbudget ist angespannt. Zusätzliche Steuerungsmaßnahmen sollten vor Freigabe geprüft werden.",
      points: [
        `P80 liegt über dem Zielbudget von ${formatMoney(budget)}, P90 bleibt aber noch in einem vertretbaren Rahmen.`,
        "Die Ursache liegt typischerweise in wenigen dominanten Treibern oder einer zu engen Budgetreserve.",
        "Empfehlung: Budgetreserve, Maßnahmenplan und Risikoverantwortung schärfen."
      ]
    };
  }
  return {
    headline: "Das Zielbudget erscheint in der aktuellen Konstellation kritisch. Eine Überarbeitung der Annahmen ist ratsam.",
    points: [
      `P90 liegt deutlich über dem Zielbudget von ${formatMoney(budget)}.`,
      "Prüfe Kostenansätze, Reserven, Risikominderungsmaßnahmen und die fachliche Plausibilität der Eingaben.",
      "Empfehlung: Nur mit angepasstem Budget oder wirksamem Gegensteuerungsprogramm fortsetzen."
    ]
  };
}

function renderProjectForm() {
  elements.projectForm.innerHTML = `
    <div class="form-grid">
      ${field("Projektname", "project.name", state.project.name, "text")}
      ${field("Auftraggeber", "project.client", state.project.client, "text")}
      ${field("Projektart", "project.type", state.project.type, "text")}
      ${field("Standort", "project.location", state.project.location, "text")}
      ${field("Bearbeiter", "project.owner", state.project.owner, "text")}
      ${field("Datum", "project.date", state.project.date, "date")}
      ${field("Betrachtungsbereich", "project.scope", state.project.scope, "text")}
      ${field("Währung", "project.currency", state.project.currency, "text")}
      ${field("Einheit", "project.unit", state.project.unit, "text")}
      <div class="field" style="grid-column: 1 / -1;">
        <label for="project-description">Beschreibung</label>
        <textarea id="project-description" data-state-field="project.description" placeholder="Kurzbeschreibung des Projekts">${escapeHtml(state.project.description)}</textarea>
        <div class="field-help">Diese Angaben werden im Bericht und Dashboard verwendet.</div>
      </div>
    </div>
  `;
}

function renderModelSection() {
  if (!elements.modelForm) return;
  const model = resolveCurrentModel();
  const validation = validateCurrentFormula(model);
  const tokenButtons = FORMULA_TOKENS.map((token) => {
    const active = isTokenActiveInExpression(model.formula, token.token);
    return `<button class="chip ${active ? "is-active" : ""}" data-action="insert-token" data-token="${token.token}" title="${escapeAttr(token.label)}">${escapeHtml(token.token)}</button>`;
  }).join("");
  const modelLibraryCards = MODEL_TEMPLATES.map((template) => `
    <button class="model-library-card ${template.id === model.templateId ? "is-active" : ""}" type="button" data-action="apply-model-template" data-model-template="${escapeAttr(template.id)}">
      <strong>${escapeHtml(template.name)}</strong>
      <span>${escapeHtml(template.outputLabel)}</span>
      <code>${escapeHtml(template.formula)}</code>
      <small>${escapeHtml(template.description)}</small>
    </button>
  `).join("");
  const customLibraryCards = (state.model.customLibrary || []).map((item) => `
    <article class="custom-formula-card">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.outputLabel || "Ergebnis")}</span>
      </div>
      <code>${escapeHtml(item.formula)}</code>
      <small>${escapeHtml(item.description || "")}</small>
      <div class="row-actions">
        <button class="icon-btn" data-action="load-custom-formula" data-custom-formula-id="${escapeAttr(item.id)}">Laden</button>
        <button class="icon-btn" data-action="delete-custom-formula" data-custom-formula-id="${escapeAttr(item.id)}">Löschen</button>
      </div>
    </article>
  `).join("");
  elements.modelForm.innerHTML = `
    <div class="model-hero">
      <div>
        <div class="metric-label">Aktives Bewertungsmodell</div>
        <div class="metric-value">${escapeHtml(model.name)}</div>
        <div class="muted">${escapeHtml(model.description)}</div>
      </div>
      <div class="model-hero-formula">
        <span>Aktive Formel</span>
        <strong>${escapeHtml(model.formula)}</strong>
      </div>
    </div>
    <div class="module-grid">
      <div class="module-column">
        <div class="field">
          <label for="model-template">Bewertungsmodell</label>
          <select id="model-template" data-model-template>
            ${MODEL_TEMPLATES.map((template) => `<option value="${template.id}" ${template.id === model.templateId ? "selected" : ""}>${escapeHtml(template.name)}</option>`).join("")}
          </select>
          <div class="field-help">Vorlagen geben fachlich geprüfte Standardlogiken vor. Die Formel lässt sich innerhalb der verfügbaren Platzhalter anpassen.</div>
        </div>

        <div class="model-summary">
          <div>
            <div class="metric-label">Ausgabe</div>
            <div class="metric-value">${escapeHtml(model.outputLabel)}</div>
          </div>
          <div class="muted">${escapeHtml(model.description)}</div>
        </div>

        <div class="form-grid">
          ${field("Basiswert", "model.baseValue", model.baseValue, "number", "Z. B. Bodenwert, Kaufpreis oder Basisbudget")}
          ${field("Jahresertrag", "model.annualIncome", model.annualIncome, "number", "Für Ertragswert oder DCF")}
          ${field("Jahreskosten", "model.annualCost", model.annualCost, "number", "Laufende Kosten oder Bewirtschaftung")}
          ${field("Jahres-Cashflow", "model.annualCashflow", model.annualCashflow, "number", "Für DCF-Berechnungen")}
          ${field("Kapitalisierungszins", "model.capRate", model.capRate, "number", "z. B. 0,05")}
          ${field("Restwert", "model.residualValue", model.residualValue, "number", "Verkaufserlös oder Exit-Wert")}
          ${field("Diskontierungszins", "model.discountRate", model.discountRate, "number", "z. B. 0,05")}
          ${field("Haltedauer", "model.holdingPeriod", model.holdingPeriod, "number", "Jahre")}
        </div>
      </div>

      <div class="module-column">
        <div class="field">
          <label for="model-formula">Formelgenerator</label>
          <textarea id="model-formula" data-state-field="model.formula" rows="6">${escapeHtml(model.formula)}</textarea>
          <div class="field-help">Deutsche Bezeichner sind erlaubt, zum Beispiel Basiswert, SummeAktiverParameter, Risikokosten, wenn, mittelwert, begrenze, runden und potenz.</div>
        </div>

        <div class="formula-toolbar card-soft">
          <div class="toolbar-label">Verfügbare Platzhalter / Formelbausteine</div>
          <div class="token-grid">${tokenButtons}</div>
        </div>

        <div class="formula-preview ${validation.ok ? "status-green" : "status-red"}">
          <strong>${validation.ok ? "Formel valide" : "Formel prüfen"}</strong>
          <span>${validation.ok ? "Die Formel kann in der Simulation verwendet werden." : escapeHtml(validation.error)}</span>
        </div>

        <div class="field">
          <label for="model-note">Methodischer Hinweis</label>
          <textarea id="model-note" data-state-field="model.note">${escapeHtml(model.note || "")}</textarea>
          <div class="field-help">Nutze das Modell, um fachliche Logik transparent zu dokumentieren.</div>
        </div>
      </div>
    </div>

    <div class="formula-library card-soft formula-library-full">
      <div class="toolbar-label">Fachliche Formelbibliothek</div>
      <div class="toolbar-label">Bewertungsmodelle</div>
      <div class="model-library-grid">${modelLibraryCards}</div>
      <div class="custom-formula-section">
        <div class="toolbar-label">Eigene Formelbibliothek</div>
        <div class="custom-formula-form">
          ${field("Name der Formel", "model.name", model.name, "text", "Bezeichnung für die eigene Formel")}
          ${field("Ausgabe", "model.outputLabel", model.outputLabel, "text", "z. B. Ergebnis, Wert, Budget")}
          <div class="field" style="grid-column: 1 / -1;">
            <label for="custom-formula-description">Beschreibung</label>
            <textarea id="custom-formula-description" data-state-field="model.description">${escapeHtml(model.description || "")}</textarea>
            <div class="field-help">Beschreibe kurz, wofür die Formel fachlich verwendet wird.</div>
          </div>
        </div>
        <div class="action-row" style="margin-top: 12px;">
          <button class="btn btn-primary" data-action="save-custom-formula">Formel speichern</button>
        </div>
      </div>
      <div class="custom-formula-list">
        ${customLibraryCards || `<div class="muted">Noch keine eigenen Formeln gespeichert.</div>`}
      </div>
    </div>
  `;
}

function renderParameterTable() {
  const summary = parameterRegisterSummary();
  const query = String(state.ui.parameterSearch || "").trim().toLowerCase();
  const rows = state.parameters.filter((parameter) => matchesParameterSearch(parameter, query)).map((parameter) => {
    const validation = validateParameter(parameter);
    return `
      <tr class="${validation.valid ? "" : "invalid"}">
        <td><input data-collection="parameters" data-id="${parameter.id}" data-field="id" value="${escapeAttr(parameter.id)}" readonly /></td>
        <td><input data-collection="parameters" data-id="${parameter.id}" data-field="label" value="${escapeAttr(parameter.label)}" placeholder="Bezeichnung" /></td>
        <td><input data-collection="parameters" data-id="${parameter.id}" data-field="category" value="${escapeAttr(parameter.category)}" placeholder="Kategorie" /></td>
        <td><textarea data-collection="parameters" data-id="${parameter.id}" data-field="description" placeholder="Beschreibung">${escapeHtml(parameter.description)}</textarea></td>
        <td><input type="number" step="any" data-collection="parameters" data-id="${parameter.id}" data-field="min" value="${escapeAttr(parameter.min)}" /></td>
        <td><input type="number" step="any" data-collection="parameters" data-id="${parameter.id}" data-field="mode" value="${escapeAttr(parameter.mode)}" /></td>
        <td><input type="number" step="any" data-collection="parameters" data-id="${parameter.id}" data-field="max" value="${escapeAttr(parameter.max)}" /></td>
        <td>
          <select data-collection="parameters" data-id="${parameter.id}" data-field="distribution">
            ${selectOption("triangle", "Dreieck", parameter.distribution)}
            ${selectOption("uniform", "Gleich", parameter.distribution)}
            ${selectOption("normal", "Normal", parameter.distribution)}
            ${selectOption("beta-pert", "Beta-PERT", parameter.distribution)}
          </select>
        </td>
        <td><input data-collection="parameters" data-id="${parameter.id}" data-field="unit" value="${escapeAttr(parameter.unit)}" placeholder="EUR, Tage, m²" /></td>
        <td><input type="checkbox" data-collection="parameters" data-id="${parameter.id}" data-field="active" ${parameter.active !== false ? "checked" : ""} /></td>
        <td><input data-collection="parameters" data-id="${parameter.id}" data-field="comment" value="${escapeAttr(parameter.comment)}" placeholder="Kommentar" /></td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-action="duplicate-parameter" data-id="${parameter.id}">Duplizieren</button>
            <button class="icon-btn" data-action="delete-parameter" data-id="${parameter.id}">Löschen</button>
          </div>
          ${validation.valid ? "" : `<div class="error-text">${validation.message}</div>`}
        </td>
      </tr>
    `;
  }).join("");
  elements.parametersTable.innerHTML = `
    <div class="register-summary">
      <div class="field" style="grid-column: 1 / -1;">
        ${field("Parameter suchen", "ui.parameterSearch", state.ui.parameterSearch || "", "text", "Suche nach Bezeichnung, Kategorie oder Beschreibung")}
      </div>
      <div class="register-stat"><strong>${summary.total}</strong><span>Parameter gesamt</span></div>
      <div class="register-stat"><strong>${summary.active}</strong><span>Aktiv</span></div>
      <div class="register-stat"><strong>${summary.invalid}</strong><span>Ungültig</span></div>
      <div class="register-stat"><strong>${summary.inactive}</strong><span>Inaktiv</span></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Bezeichnung</th><th>Kategorie</th><th>Beschreibung</th><th>Min</th><th>Modus</th><th>Max</th><th>Verteilung</th><th>Einheit</th><th>Aktiv</th><th>Kommentar</th><th>Aktionen</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="12" class="muted">Noch keine Parameter vorhanden.</td></tr>`}</tbody>
    </table>
  `;
}

function renderRiskTable() {
  const summary = riskRegisterSummary();
  const query = String(state.ui.riskSearch || "").trim().toLowerCase();
  const rows = state.risks.filter((risk) => matchesRiskSearch(risk, query)).map((risk) => {
    const validation = validateRisk(risk);
    return `
      <tr class="${validation.valid ? "" : "invalid"}">
        <td><input data-collection="risks" data-id="${risk.id}" data-field="riskId" value="${escapeAttr(risk.riskId)}" /></td>
        <td><input data-collection="risks" data-id="${risk.id}" data-field="label" value="${escapeAttr(risk.label)}" placeholder="Bezeichnung" /></td>
        <td><input data-collection="risks" data-id="${risk.id}" data-field="category" value="${escapeAttr(risk.category)}" placeholder="Kategorie" /></td>
        <td><textarea data-collection="risks" data-id="${risk.id}" data-field="description" placeholder="Beschreibung">${escapeHtml(risk.description)}</textarea></td>
        <td><input type="number" step="any" data-collection="risks" data-id="${risk.id}" data-field="probability" value="${escapeAttr(risk.probability)}" /></td>
        <td><input type="number" step="any" data-collection="risks" data-id="${risk.id}" data-field="minImpact" value="${escapeAttr(risk.minImpact)}" /></td>
        <td><input type="number" step="any" data-collection="risks" data-id="${risk.id}" data-field="modeImpact" value="${escapeAttr(risk.modeImpact)}" /></td>
        <td><input type="number" step="any" data-collection="risks" data-id="${risk.id}" data-field="maxImpact" value="${escapeAttr(risk.maxImpact)}" /></td>
        <td><input type="number" step="any" data-collection="risks" data-id="${risk.id}" data-field="timeImpact" value="${escapeAttr(risk.timeImpact)}" /></td>
        <td><input data-collection="risks" data-id="${risk.id}" data-field="responsible" value="${escapeAttr(risk.responsible)}" /></td>
        <td><input data-collection="risks" data-id="${risk.id}" data-field="measure" value="${escapeAttr(risk.measure)}" /></td>
        <td><input data-collection="risks" data-id="${risk.id}" data-field="status" value="${escapeAttr(risk.status)}" /></td>
        <td><input data-collection="risks" data-id="${risk.id}" data-field="residualRisk" value="${escapeAttr(risk.residualRisk)}" /></td>
        <td><input type="checkbox" data-collection="risks" data-id="${risk.id}" data-field="active" ${risk.active !== false ? "checked" : ""} /></td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-action="duplicate-risk" data-id="${risk.id}">Duplizieren</button>
            <button class="icon-btn" data-action="delete-risk" data-id="${risk.id}">Löschen</button>
          </div>
          ${validation.valid ? "" : `<div class="error-text">${validation.message}</div>`}
        </td>
      </tr>
    `;
  }).join("");
  elements.risksTable.innerHTML = `
    <div class="register-summary">
      <div class="field" style="grid-column: 1 / -1;">
        ${field("Risiken suchen", "ui.riskSearch", state.ui.riskSearch || "", "text", "Suche nach Bezeichnung, Kategorie oder Beschreibung")}
      </div>
      <div class="register-stat"><strong>${summary.total}</strong><span>Risiken gesamt</span></div>
      <div class="register-stat"><strong>${summary.active}</strong><span>Aktiv</span></div>
      <div class="register-stat"><strong>${summary.invalid}</strong><span>Ungültig</span></div>
      <div class="register-stat"><strong>${summary.withTimeImpact}</strong><span>Mit Terminwirkung</span></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Bezeichnung</th><th>Kategorie</th><th>Beschreibung</th><th>Wahrsch.</th><th>Min</th><th>Modus</th><th>Max</th><th>Termin</th><th>Verantwortlicher</th><th>Maßnahme</th><th>Status</th><th>Restgef.</th><th>Aktiv</th><th>Aktionen</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="15" class="muted">Noch keine Risiken vorhanden.</td></tr>`}</tbody>
    </table>
  `;
}

function renderSimulationForm() {
  elements.simulationForm.innerHTML = `
    <div class="form-grid">
      ${selectField("Anzahl Simulationen", "settings.iterations", String(state.settings.iterations), ["1000", "5000", "10000", "25000", "50000"], "Wählbare Laufzahl für die Monte-Carlo-Simulation")}
      ${field("Zielbudget", "settings.budget", state.settings.budget, "number", `Budget in ${state.project.currency || "EUR"}`)}
      ${field("Aktives Szenario", "settings.activeScenarioId", state.settings.activeScenarioId, "select", "", renderScenarioSelectOptions())}
      ${field("Projektwährung", "project.currency", state.project.currency, "text", "Wird im Ergebnis verwendet")}
      ${field("Einheit", "project.unit", state.project.unit, "text", "z. B. EUR")}
      <div class="field" style="grid-column: 1 / -1;">
        <label for="simulation-note">Hinweise</label>
        <textarea id="simulation-note" readonly>Nutze die vorgegebene Laufzahl. Inaktive Parameter und Risiken werden nicht berücksichtigt. Die Simulation verarbeitet derzeit aktivierte, numerische Eingabefelder und berechnet aus den Ergebnissen P10, P50, P80, P90 und P95.</textarea>
      </div>
    </div>
    <div class="action-row" style="margin-top:18px;">
      <button class="btn btn-secondary" data-action="compare-scenarios">Szenarienvergleich</button>
    </div>
  `;
}

function renderAnalysis() {
  const summary = latestRun ? latestRun.summary : emptySummary();
  elements.analysisMetrics.innerHTML = [
    ["Minimum", formatMoney(summary.min), "Niedrigster Simulationswert"],
    ["Maximum", formatMoney(summary.max), "Höchster Simulationswert"],
    ["Mittelwert", formatMoney(summary.mean), "Erwartungswert"],
    ["Standardabweichung", formatMoney(summary.sd), "Streuung der Ergebnisse"],
    ["P10", formatMoney(summary.p10), "Konservatives Unterperzentil"],
    ["P50", formatMoney(summary.p50), "Median / Zentralwert"],
    ["P80", formatMoney(summary.p80), "Management-Perzentil"],
    ["P95", formatMoney(summary.p95), "Oberes Risikoperzentil"]
  ].map(metricCard).join("");

  elements.percentileTable.innerHTML = `
    <div class="percentile-table">
      ${row("P10", summary.p10, "10 % der Werte liegen darunter")}
      ${row("P50", summary.p50, "Median")}
      ${row("P80", summary.p80, "80 % der Werte liegen darunter")}
      ${row("P90", summary.p90, "Konservative Entscheidungsschwelle")}
      ${row("P95", summary.p95, "Sehr vorsichtige Perspektive")}
    </div>
  `;

  const budget = Number(state.settings.budget) || 0;
  const exceedance = summary.exceedanceProbability || 0;
  const buffer = summary.recommendedBuffer || 0;
  elements.budgetAnalysis.innerHTML = `
    <div class="simple-list">
      ${listRow("Zielbudget", formatMoney(budget), "Managementvorgabe")}
      ${listRow("Überschreitungswahrscheinlichkeit", formatPercent(exceedance), "Anteil der Läufe über Budget")}
      ${listRow("Empfohlener Risikopuffer", formatMoney(buffer), "Ableitung aus P90 gegenüber Budget")}
      ${listRow("Interpretation", latestRun ? interpretationText(summary, budget) : "Noch keine Simulation ausgeführt.", "Kurztext")}
    </div>
  `;
  if (latestRun) {
    elements.trafficLight.className = `status-pill ${trafficLightClass(summary, budget)}`;
    elements.trafficLight.textContent = trafficLightText(summary, budget);
  } else {
    elements.trafficLight.className = "status-pill badge-neutral";
    elements.trafficLight.textContent = "-";
  }
}

function renderSensitivity() {
  const ranking = latestRun ? latestRun.sensitivity.slice(0, 10) : [];
  elements.sensitivityRanking.innerHTML = `
    <div class="simple-list">
      ${ranking.length ? ranking.map((item, index) => `<div class="list-row"><strong>${index + 1}. ${escapeHtml(item.name)}</strong><span>${item.correlation.toFixed(2)}</span><span>${Math.abs(item.correlation * 100).toFixed(0)} % Einfluss</span></div>`).join("") : `<div class="muted">Nach der Simulation werden die wichtigsten Treiber hier angezeigt.</div>`}
    </div>
  `;
}

function renderScenarioCards() {
  elements.scenarioCards.innerHTML = state.scenarios.map((scenario) => `
    <article class="scenario-card">
      <header>
        <div>
          <h4>${escapeHtml(scenario.name)}</h4>
          <p>${escapeHtml(scenario.description || "")}</p>
        </div>
        <input type="radio" name="active-scenario" ${state.settings.activeScenarioId === scenario.id ? "checked" : ""} data-action="set-active-scenario" data-id="${scenario.id}" />
      </header>
      <div class="scenario-fields">
        ${scenarioField(scenario.id, "name", "Name", scenario.name, "text")}
        ${scenarioField(scenario.id, "description", "Beschreibung", scenario.description, "text")}
        ${scenarioField(scenario.id, "parameterMultiplier", "Parameter-Multiplikator", scenario.parameterMultiplier, "number")}
        ${scenarioField(scenario.id, "riskProbabilityMultiplier", "Wahrscheinlichkeit-Multiplikator", scenario.riskProbabilityMultiplier, "number")}
        ${scenarioField(scenario.id, "riskImpactMultiplier", "Wirkungs-Multiplikator", scenario.riskImpactMultiplier, "number")}
      </div>
      <div class="action-row">
        <button class="btn btn-secondary" data-action="duplicate-scenario" data-id="${scenario.id}">Duplizieren</button>
        <button class="btn btn-secondary" data-action="delete-scenario" data-id="${scenario.id}">Löschen</button>
      </div>
    </article>
  `).join("");
}

function renderScenarioComparison() {
  elements.scenarioCompare.innerHTML = `
    <div class="simple-list">
      ${comparisonCache.length ? comparisonCache.map((scenario) => `
        <div class="compare-row">
          <strong>${escapeHtml(scenario.name)}</strong>
          <span>${formatMoney(scenario.summary.p50)}</span>
          <span>${formatMoney(scenario.summary.p80)}</span>
          <span>${formatMoney(scenario.summary.p90)}</span>
        </div>
      `).join("") : `<div class="muted">Vergleich starten, um P50, P80 und P90 je Szenario zu sehen.</div>`}
    </div>
  `;
}

function renderReport() {
  elements.reportOutput.textContent = buildReportText();
}

function drawCharts() {
  if (latestRun) {
    drawHistogram(elements.histogramCanvas, latestRun.values, latestRun.summary);
    drawCdf(elements.cdfCanvas, latestRun.values, latestRun.summary);
    drawTornado(elements.tornadoCanvas, latestRun.sensitivity.slice(0, 10));
  } else {
    clearCanvas(elements.histogramCanvas, "Bitte Simulation starten");
    clearCanvas(elements.cdfCanvas, "Bitte Simulation starten");
    clearCanvas(elements.tornadoCanvas, "Bitte Simulation starten");
  }
}

function runSimulation() {
  if (!validateAll()) {
    flash("Bitte Eingaben prüfen", true);
    return;
  }
  const formulaCheck = validateCurrentFormula(resolveCurrentModel());
  if (!formulaCheck.ok) {
    flash(`Formel ungültig: ${formulaCheck.error}`, true);
    return;
  }
  latestRun = runMonteCarlo(state, state.settings.activeScenarioId);
  state.lastRun = latestRun;
  state.lastRunAt = new Date().toISOString();
  scheduleSave(true);
  renderAll();
  flash(`Simulation abgeschlossen: ${latestRun.iterations} Läufe`);
}

function runScenarioComparison() {
  if (!validateAll()) {
    flash("Bitte Eingaben prüfen", true);
    return;
  }
  comparisonCache = compareScenarios(state);
  state.lastComparison = comparisonCache;
  renderScenarioComparison();
  scheduleSave(true);
  flash("Szenarienvergleich aktualisiert");
}

function copyReport() {
  const text = buildReportText();
  navigator.clipboard.writeText(text).then(() => {
    flash("Bericht kopiert");
  }).catch(() => {
    flash("Kopieren fehlgeschlagen", true);
  });
}

function loadDemoData() {
  state = createDemoState();
  latestRun = null;
  comparisonCache = [];
  normalizeState();
  renderAll();
  scheduleSave(true);
  flash("Demo-Daten geladen");
}

function resetToDefaultState() {
  state = createDefaultState();
  latestRun = null;
  comparisonCache = [];
  normalizeState();
  renderAll();
  scheduleSave(true);
}

function addParameter() {
  state.parameters.push({
    id: makeId("PAR"),
    label: "Neuer Parameter",
    category: "Allgemein",
    description: "",
    min: 0,
    mode: 0,
    max: 0,
    distribution: "triangle",
    unit: state.project.currency || "EUR",
    active: true,
    comment: ""
  });
  scheduleRender();
  scheduleSave();
}

function duplicateParameter(id) {
  const source = state.parameters.find((parameter) => parameter.id === id);
  if (!source) return;
  state.parameters.push({
    ...structuredClone(source),
    id: makeId("PAR"),
    label: (source.label || "Parameter") + " Kopie"
  });
  scheduleRender();
  scheduleSave();
}

function addParameterTemplate() {
  state.parameters.push({
    id: makeId("PAR"),
    label: "Baukosten KG 300",
    category: "Kosten",
    description: "Vorlage für Rohbau und Ausbau",
    min: 9200000,
    mode: 9800000,
    max: 10900000,
    distribution: "triangle",
    unit: state.project.currency || "EUR",
    active: true,
    comment: "Vorlage"
  });
  scheduleRender();
  scheduleSave();
}

function addRisk() {
  state.risks.push({
    id: makeId("RISK"),
    riskId: "R-" + (state.risks.length + 1),
    label: "Neues Risiko",
    category: "Allgemein",
    description: "",
    probability: 10,
    minImpact: 0,
    modeImpact: 0,
    maxImpact: 0,
    timeImpact: 0,
    responsible: "",
    measure: "",
    status: "Offen",
    residualRisk: "",
    active: true
  });
  scheduleRender();
  scheduleSave();
}

function duplicateRisk(id) {
  const source = state.risks.find((risk) => risk.id === id);
  if (!source) return;
  state.risks.push({
    ...structuredClone(source),
    id: makeId("RISK"),
    riskId: "R-" + (state.risks.length + 1),
    label: (source.label || "Risiko") + " Kopie"
  });
  scheduleRender();
  scheduleSave();
}

function addRiskTemplate() {
  state.risks.push({
    id: makeId("RISK"),
    riskId: "R-" + (state.risks.length + 1),
    label: "Nachtragsrisiko",
    category: "Vertrag",
    description: "Vorlage für Nachträge und Leistungsänderungen",
    probability: 24,
    minImpact: 220000,
    modeImpact: 650000,
    maxImpact: 1800000,
    timeImpact: 0,
    responsible: "Vergabe",
    measure: "Nachtragsmanagement schärfen",
    status: "Offen",
    residualRisk: "Hoch",
    active: true
  });
  scheduleRender();
  scheduleSave();
}

function deleteItem(collection, id) {
  if (collection === "scenarios" && state[collection].length <= 1) {
    flash("Mindestens ein Szenario muss erhalten bleiben", true);
    return;
  }
  state[collection] = state[collection].filter((item) => item.id !== id);
  scheduleRender();
  scheduleSave();
}

function normalizeState() {
  state = normalizeImportedState(state);
  if (!state.settings.activeScenarioId && state.scenarios[0]) {
    state.settings.activeScenarioId = state.scenarios[0].id;
  }
}

function matchesParameterSearch(parameter, query) {
  if (!query) return true;
  const haystack = [parameter.label, parameter.category, parameter.description, parameter.unit, parameter.comment].join(" ").toLowerCase();
  return haystack.includes(query);
}

function matchesRiskSearch(risk, query) {
  if (!query) return true;
  const haystack = [risk.riskId, risk.label, risk.category, risk.description, risk.responsible, risk.measure, risk.status, risk.residualRisk].join(" ").toLowerCase();
  return haystack.includes(query);
}

function parseDelimitedText(text) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const parseLine = (line) => {
    const cells = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && quoted && next === '"') { current += '"'; i += 1; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (char === delimiter && !quoted) { cells.push(current.trim()); current = ""; continue; }
      current += char;
    }
    cells.push(current.trim());
    return cells;
  };
  const headers = parseLine(lines[0]).map((header) => header.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ""; });
    return row;
  });
}

function importRegisterCsv(kind, rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  if (kind === "parameters") {
    state.parameters = rows.map((row, index) => ({
      id: row.id || makeId("PAR", index + 1),
      label: row.label || row.bezeichnung || `Parameter ${index + 1}`,
      category: row.category || row.kategorie || "Allgemein",
      description: row.description || row.beschreibung || "",
      min: row.min ?? row.minimum ?? 0,
      mode: row.mode ?? row.modus ?? 0,
      max: row.max ?? row.maximum ?? 0,
      distribution: row.distribution || row.verteilung || "triangle",
      unit: row.unit || row.einheit || "EUR",
      active: String(row.active ?? row.aktiv ?? "true").toLowerCase() !== "false",
      comment: row.comment || row.kommentar || ""
    }));
  } else if (kind === "risks") {
    state.risks = rows.map((row, index) => ({
      id: row.id || makeId("RISK", index + 1),
      riskId: row.riskId || row.risiko_id || row.riskid || `R-${index + 1}`,
      label: row.label || row.bezeichnung || `Risiko ${index + 1}`,
      category: row.category || row.kategorie || "Allgemein",
      description: row.description || row.beschreibung || "",
      probability: row.probability ?? row.wahrscheinlichkeit ?? 0,
      minImpact: row.minImpact ?? row.min ?? 0,
      modeImpact: row.modeImpact ?? row.modus ?? 0,
      maxImpact: row.maxImpact ?? row.max ?? 0,
      timeImpact: row.timeImpact ?? row.termin ?? 0,
      responsible: row.responsible || row.verantwortlicher || "",
      measure: row.measure || row.massnahme || "",
      status: row.status || "Offen",
      residualRisk: row.residualRisk || row.restgefahr || "",
      active: String(row.active ?? row.aktiv ?? "true").toLowerCase() !== "false"
    }));
  }
  latestRun = null;
  comparisonCache = [];
  normalizeState();
  renderAll();
  scheduleSave(true);
}

function parameterRegisterSummary() {
  const valid = state.parameters.filter((parameter) => validateParameter(parameter).valid);
  const active = state.parameters.filter((parameter) => parameter.active !== false).length;
  return {
    total: state.parameters.length,
    active,
    inactive: state.parameters.length - active,
    invalid: state.parameters.length - valid.length
  };
}

function riskRegisterSummary() {
  const valid = state.risks.filter((risk) => validateRisk(risk).valid);
  const active = state.risks.filter((risk) => risk.active !== false).length;
  const withTimeImpact = state.risks.filter((risk) => toNumeric(risk.timeImpact) !== 0).length;
  return {
    total: state.risks.length,
    active,
    invalid: state.risks.length - valid.length,
    withTimeImpact
  };
}

function validateAll() {
  const parameterValid = state.parameters.every((parameter) => validateParameter(parameter).valid);
  const riskValid = state.risks.every((risk) => validateRisk(risk).valid);
  return parameterValid && riskValid;
}

function validateParameter(parameter) {
  const min = toNumeric(parameter.min);
  const mode = toNumeric(parameter.mode);
  const max = toNumeric(parameter.max);
  if (![min, mode, max].every(Number.isFinite)) {
    return { valid: false, message: "Alle Zahlenfelder müssen numerisch sein." };
  }
  if (min > mode) return { valid: false, message: "Minimalwert darf nicht größer sein als der wahrscheinlichste Wert." };
  if (mode > max) return { valid: false, message: "Wahrscheinlichster Wert darf nicht größer sein als der Maximalwert." };
  return { valid: true, message: "" };
}

function validateRisk(risk) {
  const probability = toNumeric(risk.probability);
  const min = toNumeric(risk.minImpact);
  const mode = toNumeric(risk.modeImpact);
  const max = toNumeric(risk.maxImpact);
  if (![probability, min, mode, max].every(Number.isFinite)) {
    return { valid: false, message: "Alle Zahlenfelder müssen numerisch sein." };
  }
  if (min > mode) return { valid: false, message: "Minimale Kostenwirkung darf nicht größer sein als die wahrscheinlichste." };
  if (mode > max) return { valid: false, message: "Wahrscheinlichste Kostenwirkung darf nicht größer sein als die maximale." };
  return { valid: true, message: "" };
}

function toNumeric(value) {
  if (value === "" || value === null || value === undefined) return NaN;
  return Number(String(value).replace(",", "."));
}

function field(label, stateField, value, type, help = "", options = "", scenarioId = "") {
  const attr = scenarioId ? `data-scenario-id="${scenarioId}"` : "";
  if (type === "select") {
    return `
      <div class="field">
        <label>${label}</label>
        <select data-state-field="${stateField}" ${attr}>
          ${options}
        </select>
        ${help ? `<div class="field-help">${help}</div>` : ""}
      </div>
    `;
  }
  return `
    <div class="field ${type === "checkbox" ? "checkbox-field" : ""}">
      <label for="${sanitizeId(stateField)}">${label}</label>
      <${type === "textarea" ? "textarea" : "input"}
        id="${sanitizeId(stateField)}"
        data-state-field="${stateField}"
        ${attr}
        ${type === "textarea" ? "" : `type="${type}"`}
        value="${type === "textarea" ? "" : escapeAttr(value)}"
      >${type === "textarea" ? escapeHtml(value || "") : ""}</${type === "textarea" ? "textarea" : "input"}>
      ${help ? `<div class="field-help">${help}</div>` : ""}
    </div>
  `.replace(/\s+/g, " ");
}

function selectField(label, stateField, currentValue, values, help = "") {
  return `
    <div class="field">
      <label for="${sanitizeId(stateField)}">${label}</label>
      <select id="${sanitizeId(stateField)}" data-state-field="${stateField}">
        ${values.map((value) => `<option value="${value}" ${String(value) === String(currentValue) ? "selected" : ""}>${value}</option>`).join("")}
      </select>
      ${help ? `<div class="field-help">${help}</div>` : ""}
    </div>
  `;
}

function scenarioField(id, fieldName, label, value, type) {
  return `
    <div class="field">
      <label for="${sanitizeId(`scenario-${id}-${fieldName}`)}">${label}</label>
      <input
        id="${sanitizeId(`scenario-${id}-${fieldName}`)}"
        data-collection="scenarios"
        data-id="${id}"
        data-field="${fieldName}"
        type="${type}"
        value="${escapeAttr(value)}"
      />
    </div>
  `;
}

function renderScenarioSelectOptions() {
  return state.scenarios.map((scenario) => `<option value="${escapeAttr(scenario.id)}" ${scenario.id === state.settings.activeScenarioId ? "selected" : ""}>${escapeHtml(scenario.name)}</option>`).join("");
}

function selectOption(value, label, current) {
  return `<option value="${value}" ${String(current) === String(value) ? "selected" : ""}>${label}</option>`;
}

function resolveCurrentModel() {
  const template = getModelTemplate(state.model?.templateId || "cost");
  return {
    ...template,
    ...(state.model || {}),
    templateId: state.model?.templateId || template.id,
    formula: String(state.model?.formula || template.formula || ""),
    outputLabel: state.model?.outputLabel || template.outputLabel
  };
}

function applyModelTemplate(templateId) {
  const template = getModelTemplate(templateId);
  const currentFormula = String(state.model?.formula || "");
  const currentName = String(state.model?.name || "");
  const currentOutputLabel = String(state.model?.outputLabel || "");
  const currentDescription = String(state.model?.description || "");
  state.model = {
    ...(state.model || {}),
    templateId: template.id,
    name: template.id === "custom" ? currentName || template.name : template.name,
    outputLabel: template.id === "custom" ? currentOutputLabel || template.outputLabel : template.outputLabel,
    description: template.id === "custom" ? currentDescription || template.description : template.description,
    formula: template.id === "custom" ? currentFormula : template.formula
  };
  scheduleRender();
  scheduleSave();
}

function saveCustomFormula() {
  const model = resolveCurrentModel();
  const formula = String(model.formula || "").trim();
  if (!formula) {
    flash("Bitte zuerst eine Formel eingeben", true);
    return;
  }
  const name = String(state.model?.name || "").trim() || "Eigene Formel";
  const outputLabel = String(state.model?.outputLabel || "").trim() || "Ergebnis";
  const description = String(state.model?.description || "").trim();
  const library = Array.isArray(state.model.customLibrary) ? [...state.model.customLibrary] : [];
  library.unshift({
    id: makeLibraryId(),
    name,
    description,
    outputLabel,
    formula,
    createdAt: new Date().toISOString()
  });
  state.model.customLibrary = dedupeCustomLibrary(library);
  state.model.templateId = "custom";
  state.model.name = name;
  state.model.outputLabel = outputLabel;
  state.model.description = description;
  state.model.formula = formula;
  scheduleRender();
  scheduleSave(true);
  flash("Eigene Formel gespeichert");
}

function loadCustomFormula(id) {
  const item = (state.model.customLibrary || []).find((entry) => entry.id === id);
  if (!item) return;
  state.model = {
    ...(state.model || {}),
    templateId: "custom",
    name: item.name,
    outputLabel: item.outputLabel,
    description: item.description,
    formula: item.formula
  };
  scheduleRender();
  scheduleSave();
  flash("Eigene Formel geladen");
}

function deleteCustomFormula(id) {
  const current = Array.isArray(state.model.customLibrary) ? state.model.customLibrary : [];
  state.model.customLibrary = current.filter((item) => item.id !== id);
  scheduleRender();
  scheduleSave(true);
  flash("Eigene Formel gelöscht");
}

function insertFormulaToken(token) {
  insertIntoFormula(token);
}

function insertFormulaExpression(expression) {
  if (!expression) return;
  const textarea = document.getElementById("model-formula");
  if (!textarea) return;
  textarea.value = expression;
  state.model.formula = expression;
  scheduleRender();
  scheduleSave();
  const nextPosition = expression.length;
  window.requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(nextPosition, nextPosition);
  });
}

function dedupeCustomLibrary(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${String(item.name).trim().toLowerCase()}|${String(item.formula).trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function insertIntoFormula(token) {
  const textarea = document.getElementById("model-formula");
  if (!textarea) return;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const insertion = before && !/\s$/.test(before) ? ` ${token}` : token;
  const nextValue = `${before}${insertion}${after}`;
  textarea.value = nextValue;
  state.model.formula = nextValue;
  scheduleRender();
  scheduleSave();
  const nextPosition = (before + insertion).length;
  window.requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(nextPosition, nextPosition);
  });
}

function isTokenActiveInExpression(expression, token) {
  if (!expression || !token) return false;
  const pattern = new RegExp(`(^|[^\\w])${escapeRegex(token)}([^\\w]|$)`);
  return pattern.test(String(expression));
}

function validateCurrentFormula(model) {
  const sampleContext = {
    BASE_VALUE: model.baseValue,
    PARAM_SUM: 1000,
    RISK_COST: 100,
    RISK_TIME: 10,
    ANNUAL_INCOME: model.annualIncome || 1000,
    ANNUAL_COST: model.annualCost || 200,
    ANNUAL_CASHFLOW: model.annualCashflow || 800,
    CAP_RATE: model.capRate || 0.05,
    RESIDUAL_VALUE: model.residualValue || 100,
    DISCOUNT_RATE: model.discountRate || 0.05,
    HOLDING_PERIOD: model.holdingPeriod || 10
  };
  const validation = validateFormulaExpression(model.formula, sampleContext);
  return validation;
}

function validateFormulaExpression(expression, context) {
  return validateFormula(expression, context);
}

function metricCard(metric) {
  const [label, value, sub] = metric;
  return `
    <article class="card metric-card">
      <div>
        <div class="metric-label">${escapeHtml(label)}</div>
        <div class="metric-value">${escapeHtml(value)}</div>
      </div>
      <div class="metric-sub">${escapeHtml(sub)}</div>
    </article>
  `;
}

function row(label, value, note) {
  return `
    <div class="percentile-row">
      <strong>${escapeHtml(label)}</strong>
      <span>${formatMoney(value)}</span>
      <span class="muted">${escapeHtml(note)}</span>
      <span>${describePercentile(label)}</span>
    </div>
  `;
}

function listRow(label, value, note) {
  return `
    <div class="list-row">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(value)}</span>
      <span class="muted">${escapeHtml(note)}</span>
    </div>
  `;
}

function describePercentile(label) {
  switch (label) {
    case "P10": return "Frühe Konservative Grenze";
    case "P50": return "Zentraler Wert";
    case "P80": return "Management-Standard";
    case "P90": return "Konservativ";
    case "P95": return "Sehr konservativ";
    default: return "";
  }
}

function interpretationText(summary, budget) {
  const p80 = summary.p80 || 0;
  const p90 = summary.p90 || 0;
  if (p80 <= budget) return "Die Verteilung liegt mit Blick auf P80 innerhalb des Zielbudgets. Das Projekt wirkt auf dieser Basis steuerbar.";
  if (p90 <= budget * 1.05) return "P80 überschreitet das Zielbudget, P90 bleibt aber noch in einem vertretbaren Korridor. Reserven und Maßnahmen sollten geprüft werden.";
  return "P90 liegt deutlich über dem Zielbudget. Die Planung ist in dieser Form kritisch und sollte fachlich nachgeschärft werden.";
}

function trafficLightClass(summary, budget) {
  const p80 = summary.p80 || 0;
  const p90 = summary.p90 || 0;
  if (p80 <= budget) return "status-green";
  if (p90 <= budget * 1.05) return "status-yellow";
  return "status-red";
}

function trafficLightText(summary, budget) {
  const p80 = summary.p80 || 0;
  const p90 = summary.p90 || 0;
  if (p80 <= budget) return "Grün";
  if (p90 <= budget * 1.05) return "Gelb";
  return "Rot";
}

function buildReportText() {
  const summary = latestRun ? latestRun.summary : emptySummary();
  const budget = Number(state.settings.budget) || 0;
  const drivers = latestRun ? latestRun.sensitivity.slice(0, 5) : [];
  const model = resolveCurrentModel();
  const projectLines = [
    `Projekt: ${state.project.name || "Unbenannt"}`,
    `Auftraggeber: ${state.project.client || "-"}`,
    `Projektart: ${state.project.type || "-"}`,
    `Standort: ${state.project.location || "-"}`,
    `Bearbeiter: ${state.project.owner || "-"}`,
    `Datum: ${state.project.date || "-"}`,
    `Währung: ${state.project.currency || "EUR"}`
  ];
  const methodLines = [
    "Methodische Einordnung:",
    "Die Analyse basiert auf einer Monte-Carlo-Simulation mit aktiven Eingangsparametern und aktivierten Einzelrisiken.",
    "Für die Risikowirkung werden Eintrittswahrscheinlichkeit sowie minimale, wahrscheinlichste und maximale Kostenwirkung berücksichtigt.",
    `Aktives Bewertungsmodell: ${model.name}.`,
    `Verwendete Formel: ${model.formula}.`,
    "Inaktive Parameter und Risiken werden nicht simuliert."
  ];
  const assumptionLines = [
    "Zentrale Annahmen:",
    `Anzahl Simulationen: ${formatNumber(state.settings.iterations)}.`,
    `Zielbudget: ${formatMoney(budget)}.`,
    `Aktives Szenario: ${state.scenarios.find((scenario) => scenario.id === state.settings.activeScenarioId)?.name || "-"}.`,
    `Ergebnisgröße: ${model.outputLabel}.`
  ];
  const resultLines = latestRun ? [
    "Simulationsergebnisse:",
    `Erwartungswert: ${formatMoney(summary.mean)}.`,
    `Median: ${formatMoney(summary.median)}.`,
    `P50: ${formatMoney(summary.p50)}.`,
    `P80: ${formatMoney(summary.p80)}.`,
    `P90: ${formatMoney(summary.p90)}.`,
    `P95: ${formatMoney(summary.p95)}.`,
    `Überschreitungswahrscheinlichkeit: ${formatPercent(summary.exceedanceProbability)}.`
  ] : ["Simulationsergebnisse:", "Noch keine Simulation durchgeführt."];
  const driverLines = drivers.length ? [
    "Risikotreiber:",
    ...drivers.map((driver) => `${driver.name}: Korrelationsindikator ${driver.correlation.toFixed(2)}.`)
  ] : ["Risikotreiber:", "Nach einer Simulation werden die wichtigsten Treiber sichtbar."];
  const budgetLines = [
    "Budgetbewertung:",
    trafficLightText(summary, budget) === "Grün"
      ? "P80 liegt innerhalb des Zielbudgets."
      : trafficLightText(summary, budget) === "Gelb"
        ? "P80 liegt über dem Budget, P90 ist jedoch noch vertretbar."
        : "P90 liegt deutlich über dem Budget und erfordert Gegensteuerung."
  ];
  const actionLines = [
    "Handlungsempfehlungen:",
    latestRun ? buildRecommendation().points.map((point) => `- ${point}`).join("\n") : "- Simulation ausführen und Eingaben fachlich prüfen."
  ];
  const disclaimer = [
    "Hinweis zur fachlichen Prüfung:",
    "Die Ergebnisse sind entscheidungsunterstützend und ersetzen keine technische, kaufmännische oder rechtliche Prüfung."
  ];
  return [
    ...projectLines,
    "",
    ...methodLines,
    "",
    ...assumptionLines,
    "",
    ...resultLines,
    "",
    ...driverLines,
    "",
    ...budgetLines,
    "",
    ...actionLines,
    "",
    ...disclaimer
  ].join("\n");
}

function emptySummary() {
  return {
    min: 0,
    max: 0,
    mean: 0,
    median: 0,
    sd: 0,
    p10: 0,
    p50: 0,
    p80: 0,
    p90: 0,
    p95: 0,
    exceedanceProbability: 0,
    recommendedBuffer: 0,
    sorted: []
  };
}

function drawHistogram(canvas, values, summary) {
  const ctx = canvas.getContext("2d");
  resizeCanvas(canvas);
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  drawFrame(ctx, width, height, "Histogramm");
  const bins = buildHistogram(values, 24);
  if (!bins.length) return;
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
  const padding = 46;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;
  const barWidth = chartWidth / bins.length;
  bins.forEach((bin, index) => {
    const barHeight = (bin.count / maxCount) * (chartHeight - 20);
    const x = padding + index * barWidth + 2;
    const y = height - padding - barHeight;
    ctx.fillStyle = "rgba(31, 71, 120, 0.78)";
    ctx.fillRect(x, y, barWidth - 4, barHeight);
  });
  drawPercentileMarkers(ctx, width, height, summary, values);
}

function drawCdf(canvas, values, summary) {
  const ctx = canvas.getContext("2d");
  resizeCanvas(canvas);
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  drawFrame(ctx, width, height, "Kumulative Verteilung");
  if (!values.length) return;
  const padding = 46;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const span = Math.max(max - min, 1);
  ctx.beginPath();
  ctx.strokeStyle = "#1f4778";
  ctx.lineWidth = 3;
  sorted.forEach((value, index) => {
    const x = padding + ((value - min) / span) * chartWidth;
    const y = height - padding - ((index + 1) / sorted.length) * chartHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  drawPercentileLines(ctx, width, height, summary, values);
}

function drawTornado(canvas, ranking) {
  const ctx = canvas.getContext("2d");
  resizeCanvas(canvas);
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  drawFrame(ctx, width, height, "Sensitivität");
  if (!ranking.length) return;
  const padding = 58;
  const rowHeight = (height - padding * 2) / ranking.length;
  const centerX = width * 0.48;
  ctx.strokeStyle = "#c6d3e3";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX, padding - 10);
  ctx.lineTo(centerX, height - padding + 8);
  ctx.stroke();
  ranking.forEach((item, index) => {
    const y = padding + index * rowHeight + rowHeight * 0.15;
    const barHeight = rowHeight * 0.55;
    const influence = Math.min(Math.abs(item.correlation), 1);
    const barWidth = influence * (width * 0.34);
    ctx.fillStyle = item.correlation >= 0 ? "rgba(31, 71, 120, 0.8)" : "rgba(196, 59, 59, 0.78)";
    const x = item.correlation >= 0 ? centerX : centerX - barWidth;
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "#172033";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.fillText(item.name.slice(0, 32), 14, y + barHeight * 0.75);
  });
}

function drawFrame(ctx, width, height, title) {
  ctx.fillStyle = "#172033";
  ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.fillText(title, 16, 22);
  ctx.strokeStyle = "#d8e0ea";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
}

function drawPercentileMarkers(ctx, width, height, summary, values) {
  if (!values.length) return;
  const padding = 46;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const markers = [
    { value: summary.p50, label: "P50" },
    { value: summary.p80, label: "P80" },
    { value: summary.p90, label: "P90" }
  ];
  markers.forEach((marker) => {
    const x = padding + ((marker.value - min) / span) * (width - padding * 2);
    ctx.strokeStyle = marker.label === "P50" ? "#1c8c5a" : marker.label === "P80" ? "#b58b00" : "#c43b3b";
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 42);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(marker.label, x + 4, 38);
  });
}

function drawPercentileLines(ctx, width, height, summary, values) {
  const padding = 46;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const markers = [
    { value: summary.p50, label: "P50", color: "#1c8c5a" },
    { value: summary.p80, label: "P80", color: "#b58b00" },
    { value: summary.p90, label: "P90", color: "#c43b3b" }
  ];
  markers.forEach((marker) => {
    const x = padding + ((marker.value - min) / span) * (width - padding * 2);
    ctx.strokeStyle = marker.color;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 42);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = marker.color;
    ctx.fillText(marker.label, x + 4, 38);
  });
}

function clearCanvas(canvas, message) {
  const ctx = canvas.getContext("2d");
  resizeCanvas(canvas);
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  drawFrame(ctx, width, height, message);
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(220, Math.round(rect.height));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function formatMoney(value) {
  return `${formatNumber(value)} ${state.project.currency || "EUR"}`;
}

function formatPercent(value) {
  return `${((Number(value) || 0) * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
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

function setDeepValue(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

function makeId(prefix, index = null) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${index || Math.random().toString(36).slice(2, 10)}`;
}

function makeLibraryId(index = null) {
  return makeId("LIB", index);
}

function sanitizeId(text) {
  return String(text).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/`/g, "&#96;");
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createDefaultState() {
  const scenarios = [
    {
      id: "baseline",
      name: "Basisszenario",
      description: "Referenzannahme mit unveränderten Parametern und Risiken.",
      parameterMultiplier: 1,
      riskProbabilityMultiplier: 1,
      riskImpactMultiplier: 1,
      active: true
    },
    {
      id: "optimistic",
      name: "Optimistisches Szenario",
      description: "Leicht günstigere Kostenannahmen und reduzierte Risikowirkung.",
      parameterMultiplier: 0.96,
      riskProbabilityMultiplier: 0.85,
      riskImpactMultiplier: 0.9,
      active: true
    },
    {
      id: "critical",
      name: "Kritisches Szenario",
      description: "Erhöhte Kosten, Eintrittswahrscheinlichkeit und Risikowirkung.",
      parameterMultiplier: 1.08,
      riskProbabilityMultiplier: 1.2,
      riskImpactMultiplier: 1.15,
      active: true
    }
  ];
  return {
    meta: {
      app: STORAGE_BASENAME,
      createdAt: new Date().toISOString()
    },
    project: {
      name: "Neues Projekt",
      client: "",
      type: "Bau- und Immobilienprojekt",
      location: "",
      owner: "",
      date: new Date().toISOString().slice(0, 10),
      description: "",
      scope: "Kosten-, Termin- und Risikobewertung",
      currency: "EUR",
      unit: "EUR"
    },
    settings: {
      iterations: 10000,
      budget: 0,
      activeScenarioId: "baseline"
    },
    ui: {
      sidebarCollapsed: false,
      parameterSearch: "",
      riskSearch: ""
    },
    model: createDefaultModelState(),
    lastRun: null,
    lastComparison: [],
    parameters: [],
    risks: [],
    scenarios
  };
}

function createDemoState() {
  const base = createDefaultState();
  base.project = {
    name: "Neubau Mixed-Use Campus",
    client: "Bauträger Nord GmbH",
    type: "Bau- und Immobilienprojekt",
    location: "Hamburg",
    owner: "Projektsteuerung / Risikomanagement",
    date: new Date().toISOString().slice(0, 10),
    description: "Monte-Carlo-basierte Risikoanalyse für ein Neubauprojekt mit Gewerbe- und Wohnanteil.",
    scope: "Baukosten, Baunebenkosten, Risikoreserve und ausgewählte Terminrisiken",
    currency: "EUR",
    unit: "EUR"
  };
  base.settings = {
    iterations: 10000,
    budget: 28500000,
    activeScenarioId: "baseline"
  };
  base.model = {
    ...createDefaultModelState(),
    baseValue: 0,
    note: "Kostenmodell mit aktiven Eingangsparametern und Risikotreibern."
  };
  base.parameters = [
    demoParameter("PAR-1", "Baukosten KG 300", "KG 300", 9200000, 9800000, 10900000, "triangle", "EUR"),
    demoParameter("PAR-2", "Baukosten KG 400", "KG 400", 11200000, 12100000, 13400000, "beta-pert", "EUR"),
    demoParameter("PAR-3", "Baunebenkosten", "Nebenkosten", 1400000, 1550000, 1850000, "triangle", "EUR"),
    demoParameter("PAR-4", "Preissteigerung", "Markt", 300000, 650000, 1200000, "normal", "EUR"),
    demoParameter("PAR-5", "Planungsänderungen", "Planung", 250000, 600000, 1350000, "beta-pert", "EUR")
  ];
  base.risks = [
    demoRisk("R-1", "Baugrundrisiko", "Technisch", 18, 150000, 400000, 950000, 20, "Geotechnik", "Bodengutachten vertiefen", "Offen", "Mittel"),
    demoRisk("R-2", "Nachtragsrisiko", "Vertrag", 24, 220000, 650000, 1800000, 0, "Vergabe", "Nachtragsmanagement schärfen", "Offen", "Hoch"),
    demoRisk("R-3", "Terminverzug", "Termin", 28, 0, 180000, 780000, 45, "Terminsteuerung", "Taktplanung und Puffer prüfen", "Offen", "Mittel"),
    demoRisk("R-4", "Marktpreisrisiko", "Markt", 20, 120000, 420000, 1100000, 0, "Einkauf", "Preisgleitklauseln prüfen", "Offen", "Mittel")
  ];
  return base;
}

function demoParameter(id, label, category, min, mode, max, distribution, unit) {
  return {
    id,
    label,
    category,
    description: "",
    min,
    mode,
    max,
    distribution,
    unit,
    active: true,
    comment: ""
  };
}

function demoRisk(id, label, category, probability, minImpact, modeImpact, maxImpact, timeImpact, responsible, measure, status, residualRisk) {
  return {
    id,
    riskId: id,
    label,
    category,
    description: "",
    probability,
    minImpact,
    modeImpact,
    maxImpact,
    timeImpact,
    responsible,
    measure,
    status,
    residualRisk,
    active: true
  };
}

function normalizeIterations(value) {
  const allowed = [1000, 5000, 10000, 25000, 50000];
  const numeric = Number(value) || 1000;
  return allowed.includes(numeric) ? numeric : 1000;
}

function normalizeImportedState(incoming) {
  const base = createDefaultState();
  const merged = deepMerge(base, incoming || {});
  merged.parameters = Array.isArray(merged.parameters) ? merged.parameters : [];
  merged.risks = Array.isArray(merged.risks) ? merged.risks : [];
  merged.scenarios = Array.isArray(merged.scenarios) ? merged.scenarios : [];
  if (!merged.scenarios.length) merged.scenarios = base.scenarios;
  merged.project = { ...base.project, ...(merged.project || {}) };
  merged.settings = { ...base.settings, ...(merged.settings || {}) };
  merged.ui = { ...base.ui, ...(merged.ui || {}) };
  merged.model = normalizeModelState(merged.model, base.model);
  merged.parameters = merged.parameters.map((item, index) => ({
    ...item,
    id: item.id || makeId("PAR", index + 1),
    active: item.active !== false,
    distribution: item.distribution || "triangle"
  }));
  merged.risks = merged.risks.map((item, index) => ({
    ...item,
    id: item.id || makeId("RISK", index + 1),
    riskId: item.riskId || item.id || `R-${index + 1}`,
    active: item.active !== false
  }));
  merged.scenarios = merged.scenarios.map((item, index) => ({
    id: item.id || makeId("SCN", index + 1),
    name: item.name || `Szenario ${index + 1}`,
    description: item.description || "",
    parameterMultiplier: Number(item.parameterMultiplier ?? 1),
    riskProbabilityMultiplier: Number(item.riskProbabilityMultiplier ?? 1),
    riskImpactMultiplier: Number(item.riskImpactMultiplier ?? 1),
    active: item.active !== false
  }));
  merged.settings.iterations = normalizeIterations(merged.settings.iterations);
  merged.settings.budget = Number(merged.settings.budget) || 0;
  if (!merged.settings.activeScenarioId || !merged.scenarios.some((scenario) => scenario.id === merged.settings.activeScenarioId)) {
    merged.settings.activeScenarioId = merged.scenarios[0]?.id || "baseline";
  }
  return merged;
}

function createDefaultModelState() {
  const template = getModelTemplate("cost");
  return {
    templateId: template.id,
    name: template.name,
    outputLabel: template.outputLabel,
    description: template.description,
    formula: template.formula,
    baseValue: 0,
    annualIncome: 0,
    annualCost: 0,
    annualCashflow: 0,
    capRate: 0.05,
    residualValue: 0,
    discountRate: 0.05,
    holdingPeriod: 10,
    note: "Die Formel lässt sich innerhalb der verfügbaren Platzhalter anpassen.",
    customLibrary: []
  };
}

function normalizeModelState(incoming, fallback) {
  const base = fallback || createDefaultModelState();
  const template = getModelTemplate(incoming?.templateId || base.templateId || "cost");
  const note = String(incoming?.note ?? base.note ?? "");
  return {
    ...base,
    ...(incoming || {}),
    templateId: template.id,
    name: incoming?.name || template.name,
    outputLabel: incoming?.outputLabel || template.outputLabel,
    description: incoming?.description || template.description,
    formula: localizeFormula(String(incoming?.formula || template.formula || "")),
    baseValue: Number(incoming?.baseValue ?? base.baseValue ?? 0),
    annualIncome: Number(incoming?.annualIncome ?? base.annualIncome ?? 0),
    annualCost: Number(incoming?.annualCost ?? base.annualCost ?? 0),
    annualCashflow: Number(incoming?.annualCashflow ?? base.annualCashflow ?? 0),
    capRate: Number(incoming?.capRate ?? base.capRate ?? 0.05),
    residualValue: Number(incoming?.residualValue ?? base.residualValue ?? 0),
    discountRate: Number(incoming?.discountRate ?? base.discountRate ?? 0.05),
    holdingPeriod: Number(incoming?.holdingPeriod ?? base.holdingPeriod ?? 10),
    note: note.includes("verfügbaren Tokens")
      ? note.replace("verfügbaren Tokens", "verfügbaren Platzhalter")
      : note,
    customLibrary: normalizeCustomLibrary(incoming?.customLibrary ?? base.customLibrary ?? [])
  };
}

function normalizeCustomLibrary(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    id: item.id || makeLibraryId(index + 1),
    name: String(item.name || `Eigene Formel ${index + 1}`),
    description: String(item.description || ""),
    outputLabel: String(item.outputLabel || "Ergebnis"),
    formula: String(item.formula || ""),
    createdAt: item.createdAt || new Date().toISOString()
  }));
}
