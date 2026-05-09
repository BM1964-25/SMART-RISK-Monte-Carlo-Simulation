import { loadState, saveState, clearState } from "./storage.js?v=20260509-3";
import { runMonteCarlo, compareScenarios, buildHistogram, formatNumber, percentile } from "./simulation.js?v=20260509-7";
import { exportStateAsJson, exportResultsAsCsv, downloadTemplate } from "./export.js?v=20260509-3";
import { MODEL_TEMPLATES, FORMULA_TOKENS, FORMULA_LIBRARY_GROUPS, getModelTemplate } from "./models.js?v=20260509-7";
import { validateFormula, localizeFormula, stripFormulaAssignment, evaluateFormula, createFormulaPlaceholderKey } from "./formula.js?v=20260509-3";

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
  window.smartRiskInsertFormula = (formula) => insertFormulaExpression(formula);
  window.smartRiskApplyModelTemplate = (templateId) => applyModelTemplate(templateId);
  bindEvents();
  prepareBrandIcon().catch((error) => console.warn("Brand icon could not be prepared", error));
  renderAll();
  updateSaveStatus("Automatische Sicherung aktiv");
}

async function prepareBrandIcon() {
  const img = document.querySelector(".brand-mark img");
  if (!img) return;
  const source = img.getAttribute("src");
  if (!source) return;
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  const isBright = (r, g, b) => r >= 244 && g >= 244 && b >= 244;
  const stack = [];
  const seen = new Uint8Array(width * height);
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (seen[index]) return;
    const offset = index * 4;
    if (!isBright(data[offset], data[offset + 1], data[offset + 2])) return;
    seen[index] = 1;
    stack.push([x, y]);
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }
  while (stack.length) {
    const [x, y] = stack.pop();
    const offset = (y * width + x) * 4;
    data[offset + 3] = 0;
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }
  ctx.putImageData(imageData, 0, 0);
  img.src = canvas.toDataURL("image/png");
}

function cacheElements() {
  elements.sidebar = document.getElementById("sidebar");
  elements.nav = document.getElementById("nav");
  elements.projectTitle = document.getElementById("project-title");
  elements.projectSubtitle = document.getElementById("project-subtitle");
  elements.saveStatus = document.getElementById("save-status");
  elements.runStatus = document.getElementById("run-status");
  elements.dashboardMetrics = document.getElementById("dashboard-metrics");
  elements.launcherCard = document.getElementById("launcher-card");
  elements.decisionCallout = document.getElementById("decision-callout");
  elements.workflowSteps = document.getElementById("workflow-steps");
  elements.projectForm = document.getElementById("project-form");
  elements.parametersTable = document.getElementById("parameters-table");
  elements.risksTable = document.getElementById("risks-table");
  elements.simulationForm = document.getElementById("simulation-form");
  elements.simulationProgressLabel = document.getElementById("simulation-progress-label");
  elements.simulationProgressFill = document.getElementById("simulation-progress-fill");
  elements.simulationProgressSteps = document.getElementById("simulation-progress-steps");
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
  document.addEventListener("keydown", handleKeyDown);
  elements.nav.addEventListener("click", handleNav);
  elements.importFile.addEventListener("change", handleFileImport);
}

function setSimulationProgress(stage, percent, label = "", detail = "") {
  const stageOrder = ["validate", "sample", "compute", "finalize"];
  const currentIndex = stageOrder.indexOf(stage);
  const finished = stage === "finalize" && Number(percent) >= 100;
  if (elements.simulationProgressLabel) {
    elements.simulationProgressLabel.textContent = label || "Bereit";
  }
  if (elements.simulationProgressFill) {
    elements.simulationProgressFill.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
  }
  if (elements.simulationProgressSteps) {
    const steps = elements.simulationProgressSteps.querySelectorAll(".progress-step");
    steps.forEach((step, index) => {
      const isCurrent = index === currentIndex && !finished;
      const isComplete = currentIndex !== -1 && (index < currentIndex || (finished && index === currentIndex));
      step.classList.toggle("is-active", isCurrent);
      step.classList.toggle("is-complete", isComplete);
    });
  }
  if (elements.runStatus && detail) {
    elements.runStatus.textContent = detail;
  }
}

function resetSimulationProgress() {
  setSimulationProgress("validate", 0, "Bereit", "Simulation bereit");
}

function handleKeyDown(event) {
  if (event.key !== "Tab" || event.defaultPrevented) return;
  const section = getActiveSection();
  if (!section || !section.contains(document.activeElement)) return;
  const focusables = getFocusableElements(section);
  if (!focusables.length) return;
  const currentIndex = focusables.indexOf(document.activeElement);
  if (currentIndex === -1) return;
  const nextIndex = event.shiftKey
    ? (currentIndex - 1 + focusables.length) % focusables.length
    : (currentIndex + 1) % focusables.length;
  if (nextIndex === currentIndex) return;
  event.preventDefault();
  focusables[nextIndex].focus();
}

function getActiveSection() {
  return document.querySelector(".view-section.active") || document.querySelector(`[data-section="${currentView}"]`) || null;
}

function getFocusableElements(container) {
  return Array.from(container.querySelectorAll([
    "button:not([disabled])",
    "input:not([type='hidden']):not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[href]",
    "[tabindex]:not([tabindex='-1'])"
  ].join(","))).filter((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
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
    case "run-simulation":
      runSimulation().catch((error) => {
        console.error("runSimulation failed", error);
        flash("Simulation konnte nicht ausgeführt werden", true);
      });
      break;
    case "add-scenario":
      addScenario();
      break;
    case "compare-scenarios":
      runScenarioComparison().catch((error) => {
        console.error("runScenarioComparison failed", error);
        flash("Szenarienvergleich konnte nicht ausgeführt werden", true);
      });
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
    case "create-model-parameters":
      createModelParametersFromTemplate();
      break;
    case "use-model-result-budget":
      useModelResultAsBudget();
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
    case "navigate-view":
      setView(action.dataset.view);
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
    return value === "" ? "" : toNumeric(value);
  }
  return value;
}

function coerceStateValue(path, value, target) {
  if (target.type === "checkbox") return Boolean(value);
  if (target.dataset?.stateFormat === "money") {
    return value === "" ? 0 : toNumeric(value);
  }
  if (["settings.iterations", "settings.budget"].includes(path)) {
    return value === "" ? 0 : toNumeric(value);
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
    const model = getDisplayedOutcomeModel();
    elements.runStatus.textContent = hasSimulationResults()
      ? `Letzte Simulation: ${formatModelResult(model, latestRun.summary.mean)}`
      : "Keine Simulation gestartet";
    elements.runStatus.className = "badge badge-neutral";
  }, 2400);
}

function getDisplayedOutcomeModel() {
  if (hasSimulationResults() && latestRun?.model?.id) {
    return {
      templateId: latestRun.model.id,
      outputLabel: latestRun.model.outputLabel,
      resultUnit: latestRun.model.resultUnit
    };
  }
  return resolveCurrentModel();
}

function hasSimulationResults() {
  return Boolean(latestRun && latestRun.summary && Number(latestRun.summary.count) > 0);
}

function isDeterministicRun(run = latestRun) {
  if (!run || !run.summary || !Number(run.summary.count)) return false;
  return Number(run.summary.sd) === 0 && Number(run.summary.min) === Number(run.summary.max);
}

function renderAll() {
  applySidebarState();
  renderHeader();
  renderProjectForm();
  try {
    renderModelSection();
  } catch (error) {
    console.error("renderModelSection failed", error);
    if (elements.modelForm) {
      elements.modelForm.innerHTML = `
        <div class="formula-preview status-red">
          <strong>Fachinhalte konnten nicht geladen werden</strong>
          <span>${escapeHtml(error?.message || "Unbekannter Fehler beim Rendern der Modellsektion.")}</span>
        </div>
      `;
    }
  }
  renderParameterTable();
  renderRiskTable();
  renderSimulationForm();
  renderDashboard();
  try {
    renderWorkflow();
  } catch (error) {
    console.error("renderWorkflow failed", error);
    if (elements.workflowSteps) {
      elements.workflowSteps.innerHTML = `
        <div class="formula-preview status-red" style="grid-column: 1 / -1;">
          <strong>Prozessleiste konnte nicht geladen werden</strong>
          <span>${escapeHtml(error?.message || "Unbekannter Fehler beim Rendern der Ablaufleiste.")}</span>
        </div>
      `;
    }
  }
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
  if (hasSimulationResults()) {
    const model = getDisplayedOutcomeModel();
    const meta = getOutcomeMeta(model);
    const targetValue = Number(state.settings.budget) || 0;
    const statusText = trafficLightText(latestRun.summary, targetValue, meta);
    elements.runStatus.textContent = `Simulation: ${statusText}`;
    elements.runStatus.className = `badge ${trafficLightBadgeClass(latestRun.summary, targetValue, meta)}`;
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
  try {
    const metrics = dashboardMetrics();
    elements.dashboardMetrics.innerHTML = metrics.map(metricCard).join("");
    if (elements.launcherCard) {
      elements.launcherCard.innerHTML = buildLauncherCard();
    }
    const recommendation = buildRecommendation();
    elements.decisionCallout.innerHTML = `
      <h4>Zentrale Entscheidungsempfehlung</h4>
      <p>${recommendation.headline}</p>
      <ul>
        ${recommendation.points.map((point) => `<li>${point}</li>`).join("")}
      </ul>
    `;
  } catch (error) {
    console.error("renderDashboard failed", error);
    if (elements.dashboardMetrics) {
      elements.dashboardMetrics.innerHTML = "";
    }
    if (elements.launcherCard) {
      elements.launcherCard.innerHTML = `
        <div class="formula-preview status-red">
          <strong>Launcher konnte nicht geladen werden</strong>
          <span>${escapeHtml(error?.message || "Unbekannter Fehler beim Rendern des Launchers.")}</span>
        </div>
      `;
    }
    if (elements.decisionCallout) {
      elements.decisionCallout.innerHTML = `
        <h4>Zentrale Entscheidungsempfehlung</h4>
        <p>Die Auswertung wird angezeigt, sobald das Dashboard fehlerfrei gerendert werden kann.</p>
      `;
    }
  }
}

function buildLauncherCard() {
  const model = getDisplayedOutcomeModel();
  const meta = getOutcomeMeta(model);
  const steps = buildWorkflowSteps();
  const completedSteps = steps.filter((step) => step.completed).length;
  const nextStep = steps.find((step) => !step.completed)?.label || "Alle Kernschritte sind erledigt";
  const activeStep = steps.find((step) => step.active)?.label || "Dashboard";
  const activeParameters = (state.parameters || []).filter((item) => item.active !== false).length;
  const activeRisks = (state.risks || []).filter((item) => item.active !== false).length;
  const uncertaintyCount = activeParameters + activeRisks;
  const simulationStatus = hasSimulationResults()
    ? `Simulation: ${trafficLightText(latestRun.summary, Number(state.settings.budget) || 0, meta)}`
    : "Noch keine Simulation gestartet";
  const projectName = state.project.name || "Unbenanntes Projekt";
  const modelName = model.name || "Kein Bewertungsmodell gewählt";
  return `
    <div class="card-head">
      <div>
        <h4>Aktueller Stand</h4>
        <span class="launcher-eyebrow">Launcher</span>
      </div>
      <span class="badge badge-soft">${completedSteps}/${steps.length} Schritte erledigt</span>
    </div>
    <div class="launcher-grid">
      <article class="launcher-item">
        <span>Projekt</span>
        <strong>${escapeHtml(projectName)}</strong>
      </article>
      <article class="launcher-item">
        <span>Bewertungsmodell</span>
        <strong>${escapeHtml(modelName)}</strong>
      </article>
      <article class="launcher-item">
        <span>Aktive Unsicherheiten</span>
        <strong>${formatNumber(uncertaintyCount)}</strong>
      </article>
      <article class="launcher-item">
        <span>Simulation</span>
        <strong>${escapeHtml(simulationStatus)}</strong>
      </article>
    </div>
    <div class="launcher-foot">
      <span>Aktiver Bereich: ${escapeHtml(activeStep)}</span>
      <span>Nächster Schritt: ${escapeHtml(nextStep)}</span>
    </div>
    <div class="action-row launcher-actions">
      <button type="button" class="btn btn-secondary" data-action="navigate-view" data-view="project">Projekt öffnen</button>
      <button type="button" class="btn btn-secondary" data-action="navigate-view" data-view="model">Modell öffnen</button>
      <button type="button" class="btn btn-secondary" data-action="navigate-view" data-view="uncertainties">Unsicherheiten öffnen</button>
      <button type="button" class="btn btn-primary" data-action="navigate-view" data-view="simulation">Simulation öffnen</button>
    </div>
  `;
}

function renderWorkflow() {
  if (!elements.workflowSteps) return;
  const steps = buildWorkflowSteps();
  elements.workflowSteps.innerHTML = steps.map((step, index) => {
    const classes = ["workflow-stepper-item"];
    if (step.completed) classes.push("is-complete");
    if (step.active) classes.push("is-active");
    return `
      <article class="${classes.join(" ")}">
        <div class="workflow-stepper-index">${index + 1}</div>
        <div class="workflow-stepper-label">${escapeHtml(step.label)}</div>
      </article>
    `;
  }).join("");
}

function buildWorkflowSteps() {
  const defaultState = createDefaultState();
  const projectChanged = ["name", "client", "type", "location", "owner", "date", "description", "scope", "currency", "unit"].some((field) => String(state.project?.[field] ?? "").trim() && String(state.project?.[field] ?? "").trim() !== String(defaultState.project?.[field] ?? "").trim());
  const model = resolveCurrentModel();
  const modelValid = Boolean(model.templateId) && validateCurrentFormula(model).ok;
  const hasParameters = (state.parameters || []).some((item) => item.active !== false);
  const hasRisks = (state.risks || []).some((item) => item.active !== false);
  const hasSimulation = Boolean(latestRun);
  const hasAnalysis = Boolean(latestRun);
  const hasWorkflowData = {
    project: projectChanged,
    model: modelValid,
    uncertainties: hasParameters || hasRisks,
    simulation: hasSimulation,
    analysis: hasAnalysis
  };
  const steps = [
    { key: "project", label: "Projektstammdaten" },
    { key: "model", label: "Bewertungsmodell" },
    { key: "uncertainties", label: "Unsicherheiten" },
    { key: "simulation", label: "Simulation" },
    { key: "analysis", label: "Ergebnisanalyse" }
  ];
  return steps.map((step) => ({
    ...step,
    completed: hasWorkflowData[step.key],
    active: currentView === step.key || (currentView === "dashboard" && step.key === "project")
  }));
}

function dashboardMetrics() {
  const uncertainties = [
    ...(state.parameters || []).filter((item) => item.active !== false),
    ...(state.risks || []).filter((item) => item.active !== false)
  ].length;
  const simulations = state.settings.iterations;
  if (!hasSimulationResults()) {
    return [
      ["Projektname", state.project.name || "Unbenannt", state.project.client || "Kein Auftraggeber hinterlegt"],
      ["Unsicherheiten", String(uncertainties), `${(state.parameters.length + state.risks.length)} erfasst`],
      ["Simulationen", formatNumber(simulations), "Laufzahl"],
      ["Erwartungswert", "–", "Noch keine Simulation gestartet"],
      ["Median", "–", "Noch keine Simulation gestartet"],
      ["P50 / P80 / P90", "–", "Noch keine Simulation gestartet"],
      ["Verteilungsspanne (Δ)", "–", "Noch keine Simulation gestartet"],
      ["Abweichung zum Zielwert (P80)", "–", "Noch keine Simulation gestartet"]
    ];
  }
  const summary = latestRun.summary;
  const model = getDisplayedOutcomeModel();
  const meta = getOutcomeMeta(model);
  const targetValue = Number(state.settings.budget) || 0;
  return [
    ["Projektname", state.project.name || "Unbenannt", state.project.client || "Kein Auftraggeber hinterlegt"],
    ["Unsicherheiten", String(uncertainties), `${(state.parameters.length + state.risks.length)} erfasst`],
    ["Simulationen", formatNumber(simulations), "Laufzahl"],
    ["Erwartungswert", formatModelResult(model, summary.mean), "Mittelwert der Verteilung"],
    ["Median", formatModelResult(model, summary.median), "50%-Quantil"],
    ["P50 / P80 / P90", `${formatModelResult(model, summary.p50)} / ${formatModelResult(model, summary.p80)} / ${formatModelResult(model, summary.p90)}`, "Management-Perzentile"],
    { label: "Verteilungsspanne (Δ)", value: renderDeltaSummary(summary.max, summary.min, summary.max - summary.min, model), sub: "Maximum minus Minimum", html: true },
    {
      label: "Abweichung zum Zielwert (P80)",
      value: renderDeltaSummary(
        meta.higherIsBetter ? targetValue : summary.p80,
        meta.higherIsBetter ? summary.p80 : targetValue,
        getTargetDelta(summary, targetValue, meta),
        model
      ),
      sub: meta.higherIsBetter ? "Zielwert minus P80" : "P80 minus Zielwert",
      html: true
    }
  ];
}

function renderDeltaSummary(first, second, result, model) {
  return `
    <span class="delta-line">
      <span class="delta-value">${escapeHtml(formatModelResult(model, first))}</span>
      <span class="delta-symbol">-</span>
      <span class="delta-value">${escapeHtml(formatModelResult(model, second))}</span>
      <span class="delta-symbol">=</span>
      <span class="delta-result">${escapeHtml(formatModelResult(model, result))}</span>
    </span>
  `;
}

function buildRecommendation() {
  const summary = hasSimulationResults() ? latestRun.summary : emptySummary();
  const model = getDisplayedOutcomeModel();
  const target = Number(state.settings.budget) || 0;
  const meta = getOutcomeMeta(model);
  const p80 = summary.p80 || 0;
  const p90 = summary.p90 || 0;
  if (!hasSimulationResults()) {
    return {
      headline: "Die Empfehlung wird nach der ersten Simulation fachlich belastbar. Vorab sollte das Modell strukturiert vorbereitet werden.",
      points: [
        "Monte-Carlo ist ein Entscheidungswerkzeug und ersetzt keine fachliche Endprüfung.",
        "Prüfe zuerst, ob das gewählte Bewertungsmodell fachlich zur Aufgabe passt und ob die Formel die richtige Logik abbildet.",
        "Erfasse danach die wesentlichen Unsicherheiten mit plausiblen Bandbreiten oder Ereigniswirkungen und aktiviere nur die wirklich relevanten Bausteine.",
        `Lege eine realistische ${meta.targetLabel} fest, damit P80, P90 und der spätere Abgleich sinnvoll interpretierbar sind.`,
        "Starte anschließend die Simulation und prüfe die Ergebnisse im Kontext von Perzentilen, Zielabweichung und Sensitivität.",
        "Die App speichert Eingaben lokal und kann jederzeit erneut berechnet werden. Demo-Daten helfen beim Einstieg in ein vollständiges Beispiel."
      ]
    };
  }
  if (meta.higherIsBetter ? p80 >= target : p80 <= target) {
    return {
      headline: `Das Projekt wirkt aus Sicht des P80 steuerbar. Die ${meta.targetLabel} ist grundsätzlich belastbar, sofern die Annahmen fachlich stabil bleiben.`,
      points: [
        meta.higherIsBetter
          ? `P80 liegt mit ${formatModelResult(model, p80)} über der ${meta.targetLabel} von ${formatModelResult(model, target)}.`
          : `P80 liegt mit ${formatModelResult(model, p80)} innerhalb der ${meta.targetLabel} von ${formatModelResult(model, target)}.`,
        `${meta.bufferLabel}: ${formatModelResult(model, summary.recommendedBuffer)}.`,
        `${meta.exceedanceLabel}: ${formatPercent(summary.exceedanceProbability)}.`,
        "Empfehlung: kritische Treiber in den Unsicherheiten regelmäßig nachschärfen.",
        meta.higherIsBetter
          ? "Für Managemententscheidungen ist zusätzlich zu prüfen, ob die Renditespanne auch für Markt- und Kostenveränderungen ausreicht."
          : "Für Managemententscheidungen ist zusätzlich zu prüfen, ob die Reserve auch für Termin- und Marktveränderungen ausreicht."
      ]
    };
  }
  if (meta.higherIsBetter ? p90 >= target * 0.95 : p90 <= target * 1.05) {
    return {
      headline: `Die ${meta.targetLabel} ist angespannt. Vor Freigabe sollten Reserve, Maßnahmen und Annahmen aktiv nachgeschärft werden.`,
      points: [
        meta.higherIsBetter
          ? `P80 liegt unter der ${meta.targetLabel} von ${formatModelResult(model, target)}, P90 bleibt aber noch in einem vertretbaren Rahmen.`
          : `P80 liegt über der ${meta.targetLabel} von ${formatModelResult(model, target)}, P90 bleibt aber noch in einem vertretbaren Rahmen.`,
        meta.higherIsBetter
          ? "Die Ursache liegt typischerweise in wenigen dominanten Treibern, einer zu knappen Renditespanne oder einer noch zu groben Differenzierung der Unsicherheiten."
          : "Die Ursache liegt typischerweise in wenigen dominanten Treibern, einer zu engen Budgetreserve oder einer noch zu groben Differenzierung der Unsicherheiten.",
        `${meta.exceedanceLabel}: ${formatPercent(summary.exceedanceProbability)}.`,
        meta.higherIsBetter
          ? "Empfehlung: Zielrendite, Maßnahmenplan und die Annahmen der größten Treiber schärfen."
          : "Empfehlung: Reserve, Maßnahmenplan und die Annahmen der größten Treiber schärfen.",
        meta.higherIsBetter
          ? "Wenn zusätzliche Sicherheiten möglich sind, sollte die Zielrendite vor der nächsten Freigabe angepasst werden."
          : "Wenn zusätzliche Sicherheiten möglich sind, sollte das Projektbudget vor der nächsten Freigabe angepasst werden."
      ]
    };
  }
  return {
    headline: `Die aktuelle Konstellation ist kritisch. Ohne Anpassung von Annahmen, ${meta.targetLabel} oder Gegensteuerung besteht ein deutliches Risiko.`,
      points: [
        meta.higherIsBetter
          ? `P90 liegt deutlich unter der ${meta.targetLabel} von ${formatModelResult(model, target)}.`
          : `P90 liegt deutlich über der ${meta.targetLabel} von ${formatModelResult(model, target)}.`,
      `${meta.bufferLabel}: ${formatModelResult(model, summary.recommendedBuffer)}.`,
      "Prüfe Ansatz, Reserve, Risikominderungsmaßnahmen und die fachliche Plausibilität der Eingaben.",
      "Besonders die größten Einflussgrößen aus der Sensitivitätsanalyse sollten im Projektteam konkret adressiert werden.",
      meta.higherIsBetter
        ? "Empfehlung: Nur mit angepasster Zielrendite, belastbarer Gegensteuerung oder klarer Freigabeentscheidung fortsetzen."
        : "Empfehlung: Nur mit angepasstem Zielwert, belastbarer Gegensteuerung oder klarer Freigabeentscheidung fortsetzen."
      ]
  };
}

function renderProjectForm() {
  elements.projectForm.innerHTML = `
    <div class="form-grid project-form-grid">
      ${field("Projektname", "project.name", state.project.name, "text")}
      ${field("Auftraggeber", "project.client", state.project.client, "text")}
      ${field("Projektart", "project.type", state.project.type, "text")}
      ${field("Standort", "project.location", state.project.location, "text")}
      ${field("Bearbeiter", "project.owner", state.project.owner, "text")}
      ${field("Datum", "project.date", state.project.date, "date")}
      ${comboField(
        "Betrachtungsbereich",
        "project.scope",
        state.project.scope,
        [
          "Kosten-, Termin- und Risikobewertung",
          "Kostenbewertung",
          "Terminbewertung",
          "Risikobewertung",
          "Individuell"
        ],
        "Worauf bezieht sich die Analyse inhaltlich und fachlich?"
      )}
      <div class="field project-description-field">
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
  const meta = getOutcomeMeta(model);
  const templateDefinition = getModelTemplate(model.templateId || "custom");
  const templateFields = Array.isArray(templateDefinition.fields) ? templateDefinition.fields : [];
  const editableSpecs = templateFields.length ? templateFields : collectModelTransferSpecs(templateDefinition);
  let validation = { ok: false, error: "" };
  try {
    validation = validateCurrentFormula(model);
  } catch (error) {
    validation = { ok: false, error: error?.message || "Formel konnte nicht geprüft werden." };
  }
  const deterministicResult = evaluateFormula(model.formula, buildModelValidationContext(model));
  const deterministicResultLabel = deterministicResult.ok ? formatModelResult(model, deterministicResult.value) : "–";

  const renderTokenButton = (token, extraClass = "") => {
    const active = isTokenActiveInExpression(model.formula, token.token);
    return `<button class="chip ${extraClass} ${active ? "is-active" : ""}" data-action="insert-token" data-token="${escapeAttr(token.token)}" title="${escapeAttr(token.label)}">${escapeHtml(token.token)}</button>`;
  };

  const staticTokenButtons = (FORMULA_TOKENS || []).map((token) => renderTokenButton(token)).join("");

  const templateFieldCards = editableSpecs.length
    ? editableSpecs.map((spec) => {
      const value = model?.[spec.key];
      const resolvedValue = Number.isFinite(toNumeric(value)) ? value : (spec.defaultValue ?? "");
      const displayValue = spec.format === "money" ? formatMoneyInput(resolvedValue) : resolvedValue;
      const help = spec.format === "money" && spec.help ? `${spec.help} (in €)` : (spec.help || "");
      return spec.format === "money"
        ? moneyField(spec.label, `model.${spec.key}`, displayValue, help)
        : field(spec.label, `model.${spec.key}`, displayValue, spec.type || "number", help);
    }).join("")
    : `<div class="field" style="grid-column: 1 / -1;"><div class="field-help">Für dieses Modell sind keine zusätzlichen Eingabewerte erforderlich. Die Formel arbeitet mit den aktiven Formelbausteinen und den Daten aus den Unsicherheiten.</div></div>`;

  let formulaLibraryHeaders = "";
  let formulaLibraryItems = "";
  const sortedTemplates = getSortedModelTemplates();
  try {
    const activeTemplateId = String(model.templateId || "");
    formulaLibraryHeaders = (FORMULA_LIBRARY_GROUPS || []).map((group) => `
      <article class="formula-library-category">
        <strong>${escapeHtml(group.title)}</strong>
        <span>${escapeHtml(`${group.items.length} Modelle`)}</span>
      </article>
    `).join("");
    formulaLibraryItems = (FORMULA_LIBRARY_GROUPS || []).flatMap((group) => group.items || []).map((item) => {
      const expression = stripFormulaAssignment(item.formula);
      const isActive = activeTemplateId && activeTemplateId === String(item.templateId || "");
      return `
      <button type="button" class="formula-library-item ${isActive ? "is-active" : ""}" data-model-template="${escapeAttr(item.templateId || "")}" onclick="window.smartRiskApplyModelTemplate(this.dataset.modelTemplate)" aria-pressed="${isActive ? "true" : "false"}" title="${escapeAttr(item.note)}">
        <span class="formula-library-badge">Vorlage</span>
        <strong>${escapeHtml(item.title)}</strong>
        <code>${escapeHtml(expression)}</code>
        <span>${escapeHtml(item.note)}</span>
      </button>
    `;
    }).join("");
  } catch (error) {
    console.error("formulaLibraryGroups failed", error);
    formulaLibraryHeaders = `<div class="muted">Formelbibliothek konnte nicht geladen werden.</div>`;
    formulaLibraryItems = "";
  }

  let customLibraryCards = "";
  try {
    customLibraryCards = (state.model.customLibrary || []).map((item) => `
      <article class="custom-formula-card">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
        </div>
        <code>${escapeHtml(item.formula)}</code>
        <small>${escapeHtml(item.description || "")}</small>
        <div class="row-actions">
          <button class="icon-btn" data-action="load-custom-formula" data-custom-formula-id="${escapeAttr(item.id)}">Laden</button>
          <button class="icon-btn" data-action="delete-custom-formula" data-custom-formula-id="${escapeAttr(item.id)}">Löschen</button>
        </div>
      </article>
    `).join("");
  } catch (error) {
    console.error("customLibraryCards failed", error);
    customLibraryCards = `<div class="muted">Eigene Formeln konnten nicht geladen werden.</div>`;
  }
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
            ${sortedTemplates.map((template) => `<option value="${template.id}" ${template.id === model.templateId ? "selected" : ""}>${escapeHtml(template.name)}</option>`).join("")}
          </select>
      <div class="field-help">Vorlagen geben fachlich geprüfte Standardlogiken vor. Die Unsicherheiten werden im eigenen Bereich gepflegt und fließen getrennt in die Simulation ein.</div>
        </div>

        <div class="model-summary">
          <div>
            <div class="metric-label">Ausgabe</div>
            <div class="metric-value">${escapeHtml(model.outputLabel)}</div>
          </div>
          <div class="muted">${escapeHtml(model.description)}</div>
        </div>

        ${meta.kind === "time" ? `
          <div class="field">
            <label for="model-result-unit">Zeiteinheit</label>
            <select id="model-result-unit" data-state-field="model.resultUnit">
              ${selectOptionList(["Tage", "Wochen", "Monate", "Jahre"], model.resultUnit || "Tage")}
            </select>
            <div class="field-help">Wähle die Einheit, in der das Sofortergebnis und die Zielgröße angezeigt werden.</div>
          </div>
        ` : ""}

        <div class="card-soft model-result-card">
          <div class="toolbar-label">Sofortergebnis</div>
          <div class="model-result-value">${escapeHtml(deterministicResultLabel)}</div>
          <div class="field-help">${deterministicResult.ok ? "Deterministisch berechnetes Ergebnis aus den aktuellen Formelwerten." : escapeHtml(deterministicResult.error || "Noch keine auswertbare Formel vorhanden.")}</div>
        </div>

        <div class="action-row">
          <button type="button" class="btn btn-secondary" data-action="create-model-parameters">Modellvorlage als Unsicherheiten anlegen</button>
        </div>

        <div class="form-grid">
          ${templateFieldCards}
        </div>
      </div>

      <div class="module-column">
        <div class="field">
          <label for="model-formula">Formelgenerator</label>
          <textarea id="model-formula" data-state-field="model.formula" rows="6">${escapeHtml(model.formula)}</textarea>
          <div class="field-help">Deutsche Bezeichner sind erlaubt, zum Beispiel Basiswert, SummeAktiverParameter, Risikokosten, wenn, mittelwert, begrenze, runden und potenz. Die Unsicherheiten werden im separaten Bereich gepflegt.</div>
        </div>

        <div class="formula-toolbar card-soft">
          <div class="toolbar-label">Formelbausteine</div>
          <div class="token-grid token-grid-compact">${staticTokenButtons}</div>
        </div>

        <div class="formula-preview ${validation.ok ? "status-green" : "status-red"}">
          <strong>${validation.ok ? "Formel valide" : "Formel prüfen"}</strong>
          <span>${validation.ok ? "Die Formel kann in der Simulation verwendet werden." : escapeHtml(validation.error)}</span>
        </div>

        <div class="field">
          <label for="model-note">Methodischer Hinweis</label>
          <textarea id="model-note" data-state-field="model.note">${escapeHtml(model.note || "")}</textarea>
          <div class="field-help">Nutze das Modell, um fachliche Logik transparent zu dokumentieren. Die Unsicherheiten werden separat gepflegt.</div>
        </div>
      </div>
    </div>

    <div class="formula-library card-soft formula-library-full">
      <div class="toolbar-label">Fachliche Formelbibliothek</div>
      <div class="formula-library-categories">${formulaLibraryHeaders}</div>
      <div class="formula-library-grid formula-library-grid-full">${formulaLibraryItems}</div>
      <div class="custom-formula-section">
        <div class="toolbar-label">Eigene Formelbibliothek</div>
        <div class="custom-formula-form">
          ${field("Name der Formel", "model.name", model.name, "text", "Bezeichnung für die eigene Formel")}
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
  const visibleParameters = Array.isArray(state.parameters) ? state.parameters : [];
  const rows = visibleParameters.map((parameter) => {
    const validation = validateParameter(parameter);
    return `
      <tr class="${validation.valid ? "" : "invalid"}">
        <td>
          <input data-collection="parameters" data-id="${parameter.id}" data-field="label" value="${escapeAttr(parameter.label)}" placeholder="Formelbaustein" />
        </td>
        <td>
          <input class="money-input" type="text" inputmode="decimal" data-collection="parameters" data-id="${parameter.id}" data-field="min" value="${escapeAttr(formatMoneyInput(parameter.min))}" />
        </td>
        <td>
          <input class="money-input" type="text" inputmode="decimal" data-collection="parameters" data-id="${parameter.id}" data-field="mode" value="${escapeAttr(formatMoneyInput(parameter.mode))}" />
        </td>
        <td>
          <input class="money-input" type="text" inputmode="decimal" data-collection="parameters" data-id="${parameter.id}" data-field="max" value="${escapeAttr(formatMoneyInput(parameter.max))}" />
        </td>
        <td>
          <select data-collection="parameters" data-id="${parameter.id}" data-field="distribution">
            ${selectOption("triangle", "Dreieck", parameter.distribution)}
            ${selectOption("uniform", "Gleich", parameter.distribution)}
            ${selectOption("normal", "Normal", parameter.distribution)}
            ${selectOption("beta-pert", "Beta-PERT", parameter.distribution)}
          </select>
        </td>
        <td><input type="checkbox" data-collection="parameters" data-id="${parameter.id}" data-field="active" ${parameter.active !== false ? "checked" : ""} /></td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-action="delete-parameter" data-id="${parameter.id}">Löschen</button>
          </div>
          ${validation.valid ? "" : `<div class="error-text">${validation.message}</div>`}
        </td>
      </tr>
    `;
  }).join("");
  const distributionInfo = `
    <div class="info-grid">
      <article class="info-chip">
        <strong>Dreieck</strong>
        <span>Lineare Verteilung zwischen Minimum, Modus und Maximum.</span>
      </article>
      <article class="info-chip">
        <strong>Gleich</strong>
        <span>Alle Werte zwischen Minimum und Maximum sind gleich wahrscheinlich.</span>
      </article>
      <article class="info-chip">
        <strong>Normal</strong>
        <span>Symmetrische Verteilung um den wahrscheinlichsten Wert mit Streuung.</span>
      </article>
      <article class="info-chip">
        <strong>Beta-PERT</strong>
        <span>Glättet die Dreiecksverteilung und gewichtet den wahrscheinlichsten Wert stärker.</span>
      </article>
    </div>
  `;
  elements.parametersTable.innerHTML = `
    <div class="register-summary">
      <div class="register-stat"><strong>${summary.total}</strong><span>Formelbausteine gesamt</span></div>
      <div class="register-stat"><strong>${summary.active}</strong><span>Aktiv</span></div>
      <div class="register-stat"><strong>${summary.invalid}</strong><span>Ungültig</span></div>
      <div class="register-stat"><strong>${summary.inactive}</strong><span>Inaktiv</span></div>
    </div>
    <div class="register-meta card-soft">
      <div class="toolbar-label">Verteilungs-Hinweis</div>
      ${distributionInfo}
    </div>
    <table>
      <thead>
        <tr>
          <th>Formelbaustein</th><th>Min</th><th>Wahrsch. Wert</th><th>Max</th><th>Verteilung</th><th>Aktiv</th><th>Aktionen</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="7" class="muted">Noch keine Parameter vorhanden.</td></tr>`}</tbody>
    </table>
  `;
}

function renderRiskTable() {
  if (!elements.risksTable) return;
  const summary = riskRegisterSummary();
  const visibleRisks = Array.isArray(state.risks) ? state.risks : [];
  const rows = visibleRisks.map((risk) => {
    const validation = validateRisk(risk);
    return `
      <tr class="${validation.valid ? "" : "invalid"}">
        <td><input data-collection="risks" data-id="${risk.id}" data-field="riskId" value="${escapeAttr(risk.riskId)}" /></td>
        <td>
          <input data-collection="risks" data-id="${risk.id}" data-field="label" value="${escapeAttr(risk.label)}" placeholder="Bezeichnung" />
          <div class="register-cell-meta">
            <div><strong>Kategorie:</strong> <input data-collection="risks" data-id="${risk.id}" data-field="category" value="${escapeAttr(risk.category)}" placeholder="Kategorie" /></div>
            <div><strong>Beschreibung:</strong> <textarea data-collection="risks" data-id="${risk.id}" data-field="description" placeholder="Beschreibung">${escapeHtml(risk.description)}</textarea></div>
          </div>
        </td>
        <td><input type="number" step="any" data-collection="risks" data-id="${risk.id}" data-field="probability" value="${escapeAttr(risk.probability)}" /></td>
        <td><input class="money-input" type="text" inputmode="decimal" data-collection="risks" data-id="${risk.id}" data-field="minImpact" value="${escapeAttr(formatMoneyInput(risk.minImpact))}" /></td>
        <td><input class="money-input" type="text" inputmode="decimal" data-collection="risks" data-id="${risk.id}" data-field="modeImpact" value="${escapeAttr(formatMoneyInput(risk.modeImpact))}" /></td>
        <td><input class="money-input" type="text" inputmode="decimal" data-collection="risks" data-id="${risk.id}" data-field="maxImpact" value="${escapeAttr(formatMoneyInput(risk.maxImpact))}" /></td>
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
        ${field("Ereignisse suchen", "ui.riskSearch", state.ui.riskSearch || "", "text", "Suche nach Bezeichnung, Kategorie oder Beschreibung")}
      </div>
      <div class="register-stat"><strong>${summary.total}</strong><span>Ereignisse gesamt</span></div>
      <div class="register-stat"><strong>${summary.active}</strong><span>Aktiv</span></div>
      <div class="register-stat"><strong>${summary.invalid}</strong><span>Ungültig</span></div>
      <div class="register-stat"><strong>${summary.withTimeImpact}</strong><span>Mit Terminwirkung</span></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Ereignisbaustein</th><th>Wahrsch.</th><th>Min</th><th>Modus</th><th>Max</th><th>Termin</th><th>Verantwortlicher</th><th>Maßnahme</th><th>Status</th><th>Restgef.</th><th>Aktiv</th><th>Aktionen</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="13" class="muted">Noch keine Ereignisbausteine vorhanden.</td></tr>`}</tbody>
    </table>
  `;
}

function renderSimulationForm() {
  const model = resolveCurrentModel();
  const meta = getOutcomeMeta(model);
  const iterationsOptions = [
    { value: "1000", label: "1.000" },
    { value: "5000", label: "5.000" },
    { value: "10000", label: "10.000" },
    { value: "25000", label: "25.000" },
    { value: "50000", label: "50.000" }
  ];
  const deterministicResult = evaluateFormula(model.formula, buildModelValidationContext(model));
  const deterministicResultLabel = deterministicResult.ok ? formatModelResult(model, deterministicResult.value) : "–";
  const targetOptions = meta.kind === "time"
    ? ["Tage", "Wochen", "Monate", "Jahre"]
    : [];
  const deterministicResultHelp = deterministicResult.ok
    ? `Direkt aus der aktiven Formel berechnet. Als Vorschlag für ${meta.targetLabel} nutzbar.`
    : escapeHtml(deterministicResult.error || "Noch keine auswertbare Formel vorhanden.");
  const targetFieldMarkup = meta.kind === "money"
    ? moneyField(meta.targetLabel, "settings.budget", formatMoney(state.settings.budget), meta.targetHelp)
    : meta.kind === "percent"
      ? numericField(meta.targetLabel, "settings.budget", state.settings.budget, meta.targetHelp)
      : `
        <div class="field">
          <label for="simulation-target-value">${meta.targetLabel}</label>
          <div class="simulation-target-inline">
            <input id="simulation-target-value" data-state-field="settings.budget" type="text" inputmode="decimal" value="${escapeAttr(formatNumber(state.settings.budget))}" />
            <select id="simulation-result-unit" data-state-field="model.resultUnit">
              ${selectOptionList(targetOptions, model.resultUnit || "Tage")}
            </select>
          </div>
          <div class="field-help">${meta.targetHelp}</div>
        </div>`;
  elements.simulationForm.innerHTML = `
    <div class="form-grid simulation-form-grid">
      ${selectField("Anzahl Simulationen", "settings.iterations", String(state.settings.iterations), iterationsOptions, "Wählbare Laufzahl für die Monte-Carlo-Simulation")}
      ${targetFieldMarkup}
      ${field("Aktives Szenario", "settings.activeScenarioId", state.settings.activeScenarioId, "select", "", renderScenarioSelectOptions())}
      ${readOnlyField("Sofortergebnis", deterministicResultLabel, deterministicResultHelp)}
      <div class="field" style="grid-column: 1 / -1;">
        <label for="simulation-note">Hinweise</label>
        <textarea id="simulation-note" readonly>Empfehlung für die Laufzahl: 1.000 bis 5.000 für Tests und schnelle Plausibilitätsprüfungen, 5.000 bis 10.000 für typische Managementberichte, 10.000 bis 25.000 für belastbarere Aussagen. Bandbreiten sollten realistisch, umsetzbar und fachlich plausibel sein; am besten aus Planung, Marktwerten und Erfahrungswerten abgeleitet. Inaktive Unsicherheiten werden nicht berücksichtigt. Stichprobe bedeutet: pro Lauf werden Zufallswerte aus den aktiven Unsicherheiten gezogen. Die Simulation verarbeitet derzeit aktivierte, numerische Eingabefelder und berechnet aus den Ergebnissen P10, P50, P80, P90 und P95.</textarea>
      </div>
    </div>
    <div class="action-row" style="margin-top:18px;">
      <button class="btn btn-secondary" data-action="use-model-result-budget">${escapeHtml(meta.buttonLabel)}</button>
      <button class="btn btn-secondary" data-action="compare-scenarios">Szenarienvergleich</button>
    </div>
    <div class="field-help" style="margin-top:10px;">Die Übernahme aus dem Sofortergebnis ist modellabhängig und dient als Vorschlag für die jeweilige Zielgröße.</div>
  `;
}

function renderAnalysis() {
  const summary = hasSimulationResults() ? latestRun.summary : emptySummary();
  const model = getDisplayedOutcomeModel();
  const meta = getOutcomeMeta(model);
  if (hasSimulationResults()) {
    const deterministicNotice = isDeterministicRun()
      ? `
        <article class="card metric-card" style="grid-column: 1 / -1; border-color: var(--yellow); background: linear-gradient(180deg, rgba(237, 137, 54, 0.08), rgba(237, 137, 54, 0.02));">
          <div>
            <div class="metric-label">Hinweis</div>
            <div class="metric-value">Deterministisches Ergebnis</div>
          </div>
          <div class="metric-sub">Die aktiven Formelbausteine haben identische Min-, Wahrscheinlichster- und Max-Werte. Bitte Bandbreiten in den Unsicherheiten ergänzen, damit eine echte Monte-Carlo-Verteilung entsteht.</div>
        </article>
      `
      : "";
    const metricCards = [
      ["Minimum", formatModelResult(model, summary.min), "Niedrigster Simulationswert"],
      ["Maximum", formatModelResult(model, summary.max), "Höchster Simulationswert"],
      ["Mittelwert", formatModelResult(model, summary.mean), "Erwartungswert"],
      ["Standardabweichung", formatModelResult(model, summary.sd), "Streuung der Ergebnisse"],
      ["P10", formatModelResult(model, summary.p10), "Konservatives Unterperzentil"],
      ["P50", formatModelResult(model, summary.p50), "Median / Zentralwert"],
      ["P80", formatModelResult(model, summary.p80), "Management-Perzentil"],
      ["P95", formatModelResult(model, summary.p95), "Oberes Risikoperzentil"]
    ].map(metricCard).join("");
    elements.analysisMetrics.innerHTML = `${deterministicNotice}${metricCards}`;

    elements.percentileTable.innerHTML = `
      <div class="percentile-table">
        ${row("P10", summary.p10, "10 % der Werte liegen darunter")}
        ${row("P50", summary.p50, "Median")}
        ${row("P80", summary.p80, "80 % der Werte liegen darunter")}
        ${row("P90", summary.p90, "Konservative Entscheidungsschwelle")}
        ${row("P95", summary.p95, "Sehr vorsichtige Perspektive")}
      </div>
    `;
  } else {
    elements.analysisMetrics.innerHTML = `
      <article class="card metric-card" style="grid-column: 1 / -1;">
        <div>
          <div class="metric-label">Noch keine Simulation gestartet</div>
          <div class="metric-value">Ergebnisse erscheinen hier nach dem ersten Lauf</div>
        </div>
        <div class="metric-sub">Starte die Simulation, um Kennzahlen, Perzentile und Zielbewertung zu sehen.</div>
      </article>
    `;

    elements.percentileTable.innerHTML = `
      <div class="muted" style="padding: 6px 2px;">Nach dem ersten Simulationslauf erscheinen hier P10, P50, P80, P90 und P95.</div>
    `;
  }

  const targetValue = Number(state.settings.budget) || 0;
  const exceedance = summary.exceedanceProbability || 0;
  const buffer = summary.recommendedBuffer || 0;
  const targetLabel = meta.targetLabel;
  if (hasSimulationResults()) {
    elements.budgetAnalysis.innerHTML = `
      <div class="simple-list">
        ${listRow(targetLabel, formatModelResult(model, targetValue), "Managementvorgabe")}
        ${listRow(meta.exceedanceLabel, formatPercent(exceedance), meta.exceedanceHelp)}
        ${listRow(meta.bufferLabel, formatModelResult(model, buffer), meta.bufferHelp)}
        ${listRow("Interpretation", interpretationText(summary, targetValue, meta), "Managementhinweis")}
      </div>
    `;
    elements.trafficLight.className = `status-pill ${trafficLightClass(summary, targetValue, meta)}`;
    elements.trafficLight.textContent = trafficLightText(summary, targetValue, meta);
    elements.trafficLight.title = trafficLightText(summary, targetValue, meta);
  } else {
    elements.budgetAnalysis.innerHTML = `
      <div class="muted" style="padding: 6px 2px;">Die Zielbewertung erscheint nach dem ersten Simulationslauf.</div>
    `;
    elements.trafficLight.className = "status-pill badge-neutral";
    elements.trafficLight.textContent = "-";
  }
}

function renderSensitivity() {
  const ranking = hasSimulationResults() ? latestRun.sensitivity.slice(0, 10) : [];
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
  const model = getDisplayedOutcomeModel();
  elements.scenarioCompare.innerHTML = `
    <div class="simple-list">
      ${comparisonCache.length && hasSimulationResults() ? comparisonCache.map((scenario) => `
        <div class="compare-row">
          <strong>${escapeHtml(scenario.name)}</strong>
          <span>${formatModelResult(model, scenario.summary.p50)}</span>
          <span>${formatModelResult(model, scenario.summary.p80)}</span>
          <span>${formatModelResult(model, scenario.summary.p90)}</span>
        </div>
      `).join("") : `<div class="muted">Vergleich starten, um P50, P80 und P90 je Szenario zu sehen.</div>`}
    </div>
  `;
}

function renderReport() {
  elements.reportOutput.textContent = buildReportText();
}

function drawCharts() {
  if (hasSimulationResults()) {
    drawHistogram(elements.histogramCanvas, latestRun.values, latestRun.summary);
    drawCdf(elements.cdfCanvas, latestRun.values, latestRun.summary);
    drawTornado(elements.tornadoCanvas, latestRun.sensitivity.slice(0, 10));
  } else {
    clearCanvas(elements.histogramCanvas, "Bitte Simulation starten");
    clearCanvas(elements.cdfCanvas, "Bitte Simulation starten");
    clearCanvas(elements.tornadoCanvas, "Bitte Simulation starten");
  }
}

async function runSimulation() {
  if (!validateAll()) {
    flash("Bitte Eingaben prüfen", true);
    return;
  }
  const formulaCheck = validateCurrentFormula(resolveCurrentModel());
  if (!formulaCheck.ok) {
    flash(`Formel ungültig: ${formulaCheck.error}`, true);
    return;
  }
  const runButton = document.querySelector('[data-action="run-simulation"]');
  if (runButton) runButton.disabled = true;
  try {
    setSimulationProgress("validate", 10, "Validierung", "Eingaben werden geprüft");
    await nextFrame();
    latestRun = await runMonteCarlo(state, state.settings.activeScenarioId, ({ stage, percent, label, detail }) => {
      setSimulationProgress(stage, percent, label, detail);
    });
    state.lastRun = latestRun;
    state.lastRunAt = new Date().toISOString();
    scheduleSave(true);
    renderAll();
    setSimulationProgress("finalize", 100, "Abgeschlossen", `Simulation abgeschlossen: ${latestRun.iterations} Läufe`);
    if (isDeterministicRun(latestRun)) {
      flash("Die Simulation ist deterministisch. Bitte Bandbreiten in den Unsicherheiten ergänzen.", true);
    }
    flash(`Simulation abgeschlossen: ${latestRun.iterations} Läufe`);
  } catch (error) {
    console.error("Simulation failed", error);
    flash("Simulation konnte nicht ausgeführt werden", true);
  } finally {
    if (runButton) runButton.disabled = false;
  }
}

async function runScenarioComparison() {
  if (!validateAll()) {
    flash("Bitte Eingaben prüfen", true);
    return;
  }
  comparisonCache = await compareScenarios(state);
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

function useModelResultAsBudget() {
  const model = resolveCurrentModel();
  const meta = getOutcomeMeta(model);
  const result = evaluateFormula(model.formula, buildModelValidationContext(model));
  if (!result.ok) {
    flash(`Sofortergebnis konnte nicht übernommen werden: ${result.error}`, true);
    return;
  }
  state.settings.budget = Number(result.value) || 0;
  scheduleRender();
  scheduleSave();
  flash(`${meta.targetLabel} aus dem Sofortergebnis übernommen: ${formatModelResult(model, state.settings.budget)}`);
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
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

function sharedValue(items, field) {
  const values = (items || [])
    .map((item) => String(item?.[field] ?? "").trim())
    .filter((value) => value.length > 0);
  if (!values.length) return "";
  const first = values[0];
  return values.every((value) => value === first) ? first : "";
}

function isActiveItem(item) {
  return item?.active !== false;
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
  const normalized = String(value)
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/€/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d,.\-]/g, "");
  if (!normalized) return NaN;
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma && hasDot) {
    return Number(normalized.replace(/\./g, "").replace(",", "."));
  }
  if (hasComma) {
    return Number(normalized.replace(",", "."));
  }
  if (hasDot) {
    const parts = normalized.split(".");
    if (parts.length > 2) {
      return Number(parts.join(""));
    }
    if (parts[1] && parts[1].length === 3 && parts[0].length >= 1) {
      return Number(parts.join(""));
    }
  }
  return Number(normalized);
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

function moneyField(label, stateField, value, help = "", scenarioId = "") {
  const attr = scenarioId ? `data-scenario-id="${scenarioId}"` : "";
  return `
    <div class="field">
      <label for="${sanitizeId(stateField)}">${label}</label>
      <input
        id="${sanitizeId(stateField)}"
        data-state-field="${stateField}"
        data-state-format="money"
        ${attr}
        type="text"
        inputmode="decimal"
        value="${escapeAttr(value)}"
      />
      ${help ? `<div class="field-help">${help}</div>` : ""}
    </div>
  `.replace(/\s+/g, " ");
}

function selectField(label, stateField, currentValue, values, help = "") {
  const optionsMarkup = values.map((item) => {
    if (item && typeof item === "object") {
      const value = "value" in item ? item.value : item.label;
      const text = "label" in item ? item.label : String(value);
      return `<option value="${escapeAttr(value)}" ${String(value) === String(currentValue) ? "selected" : ""}>${escapeHtml(text)}</option>`;
    }
    return `<option value="${item}" ${String(item) === String(currentValue) ? "selected" : ""}>${item}</option>`;
  }).join("");
  return `
    <div class="field">
      <label for="${sanitizeId(stateField)}">${label}</label>
      <select id="${sanitizeId(stateField)}" data-state-field="${stateField}">
        ${optionsMarkup}
      </select>
      ${help ? `<div class="field-help">${help}</div>` : ""}
    </div>
  `;
}

function selectOptionList(values, currentValue) {
  return values.map((value) => `<option value="${escapeAttr(value)}" ${String(value) === String(currentValue) ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function comboField(label, stateField, value, suggestions, help = "") {
  const listId = `${sanitizeId(stateField)}-options`;
  return `
    <div class="field project-scope-field">
      <label for="${sanitizeId(stateField)}">${label}</label>
      <input
        id="${sanitizeId(stateField)}"
        data-state-field="${stateField}"
        list="${listId}"
        type="text"
        value="${escapeAttr(value)}"
      />
      <datalist id="${listId}">
        ${suggestions.map((item) => `<option value="${escapeAttr(item)}"></option>`).join("")}
      </datalist>
      ${help ? `<div class="field-help">${help}</div>` : ""}
    </div>
  `.replace(/\s+/g, " ");
}

function readOnlyField(label, value, help = "") {
  return `
    <div class="field readonly-field">
      <label>${label}</label>
      <div class="readonly-value">${escapeHtml(value)}</div>
      ${help ? `<div class="field-help">${help}</div>` : ""}
    </div>
  `.replace(/\s+/g, " ");
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

function getSortedModelTemplates() {
  const custom = MODEL_TEMPLATES.filter((template) => template.id === "custom");
  const others = MODEL_TEMPLATES
    .filter((template) => template.id !== "custom")
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "de"));
  return [...custom, ...others];
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
    formula: template.id === "custom" ? currentFormula : stripFormulaAssignment(template.formula),
    resultUnit: template.resultUnit || state.model?.resultUnit || "Tage"
  };
  scheduleRender();
  scheduleSave();
}

function createModelParametersFromTemplate(templateId = state.model?.templateId || "custom") {
  const template = getModelTemplate(templateId);
  const specs = collectModelTransferSpecs(template);
  if (!specs.length) {
    flash("Dieses Bewertungsmodell hat keine Modellvorlage zum Anlegen von Unsicherheiten", true);
    return;
  }
  const unit = state.project.unit || state.project.currency || "EUR";
  const category = template.name || "Bewertungsmodell";
  const nextParameters = [];
  for (const [index, spec] of specs.entries()) {
    const rawValue = Number(state.model?.[spec.key]);
    const value = Number.isFinite(rawValue) ? rawValue : Number(spec.defaultValue ?? 0);
    const entry = {
      id: `PAR_MODEL_${template.id}_${spec.key || spec.token || index + 1}`,
      label: spec.label || spec.token || spec.key || `Modellwert ${index + 1}`,
      formulaToken: spec.token || spec.label || spec.key || `PAR_${index + 1}`,
      category,
      description: spec.help || template.description || "",
      min: value,
      mode: value,
      max: value,
      distribution: "triangle",
      unit: spec.format === "money" ? unit : (spec.unit || ""),
      active: true,
      comment: "Aus Bewertungsmodell übernommen"
    };
    nextParameters.push(entry);
  }
  state.parameters = nextParameters;
  scheduleSave(true);
  setView("uncertainties");
  flash(`Unsicherheiten aus der Modellvorlage neu angelegt (${specs.length})`);
}

function collectModelTransferSpecs(template) {
  const fields = Array.isArray(template?.fields) ? template.fields : [];
  if (fields.length) return fields;
  return extractFormulaTransferSpecs(template?.formula || "");
}

function extractFormulaTransferSpecs(expression) {
  const source = stripFormulaAssignment(String(expression || ""));
  const tokens = source.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const seen = new Set();
  return tokens.filter((token) => {
    const normalized = token.trim();
    const lower = normalized.toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    if (["sum", "avg", "min", "max", "abs", "round", "clamp", "pow", "if", "wenn", "mittelwert", "begrenze", "runden", "potenz", "summe", "betrag"].includes(lower)) {
      return false;
    }
    seen.add(normalized);
    return true;
  }).map((token) => ({
    key: token,
    token,
    label: token,
    help: "Aus der gewählten Modellformel abgeleitet",
    type: "number",
    format: /\b(kg\d{3}|basiswert|basis|kosten|wert|miete|cashflow|budget|risiko|kapital|zinssatz|restwert|einnahmen|betriebskosten|finanzierungskosten)\b/i.test(token) ? "money" : undefined,
    defaultValue: 0
  }));
}

function saveCustomFormula() {
  const model = resolveCurrentModel();
  const formula = stripFormulaAssignment(String(model.formula || "").trim());
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
  const nextExpression = stripFormulaAssignment(expression);
  if (!nextExpression) return;
  const textarea = document.getElementById("model-formula");
  if (!textarea) return;
  textarea.value = nextExpression;
  state.model.formula = nextExpression;
  scheduleRender();
  scheduleSave();
  const nextPosition = nextExpression.length;
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

function buildModelValidationContext(model) {
  const context = {
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
  const templateDefinition = getModelTemplate(model.templateId || "custom");
  const transferSpecs = collectModelTransferSpecs(templateDefinition);
  const modelSpecs = (templateDefinition.fields || []).length ? (templateDefinition.fields || []) : transferSpecs;
  for (const fieldDef of modelSpecs) {
    const token = fieldDef.token || fieldDef.label || fieldDef.key;
    const numeric = toNumeric(model?.[fieldDef.key]);
    context[token] = Number.isFinite(numeric) ? numeric : (fieldDef.defaultValue ?? 0);
  }
  return context;
}

function validateCurrentFormula(model) {
  return validateFormulaExpression(model.formula, buildModelValidationContext(model));
}

function validateFormulaExpression(expression, context) {
  return validateFormula(expression, context);
}

function metricCard(metric) {
  const isObject = !Array.isArray(metric);
  const label = isObject ? metric.label : metric[0];
  const value = isObject ? metric.value : metric[1];
  const sub = isObject ? metric.sub : metric[2];
  const html = Boolean(isObject && metric.html);
  return `
    <article class="card metric-card">
      <div>
        <div class="metric-label">${escapeHtml(label)}</div>
        <div class="metric-value">${html ? value : escapeHtml(value)}</div>
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

function interpretationText(summary, targetValue, meta = getOutcomeMeta()) {
  const p80 = summary.p80 || 0;
  const p90 = summary.p90 || 0;
  if (meta.higherIsBetter) {
    if (p80 >= targetValue) return `Die Verteilung liegt mit Blick auf P80 innerhalb der ${meta.targetLabel}. Das Projekt wirkt auf dieser Basis steuerbar.`;
    if (p90 >= targetValue * 0.95) return `P80 verfehlt die ${meta.targetLabel}, P90 bleibt aber noch in einem vertretbaren Korridor. Reserven und Maßnahmen sollten geprüft werden.`;
    return `P90 liegt deutlich unter der ${meta.targetLabel}. Die Planung ist in dieser Form kritisch und sollte fachlich nachgeschärft werden.`;
  }
  if (p80 <= targetValue) return `Die Verteilung liegt mit Blick auf P80 innerhalb der ${meta.targetLabel}. Das Projekt wirkt auf dieser Basis steuerbar.`;
  if (p90 <= targetValue * 1.05) return `P80 überschreitet die ${meta.targetLabel}, P90 bleibt aber noch in einem vertretbaren Korridor. Reserven und Maßnahmen sollten geprüft werden.`;
  return `P90 liegt deutlich über der ${meta.targetLabel}. Die Planung ist in dieser Form kritisch und sollte fachlich nachgeschärft werden.`;
}

function trafficLightClass(summary, targetValue, meta = getOutcomeMeta()) {
  const state = trafficLightState(summary, targetValue, meta);
  if (state === "green") return "status-green";
  if (state === "warning") return "status-yellow";
  return "status-red";
}

function trafficLightBadgeClass(summary, targetValue, meta = getOutcomeMeta()) {
  const state = trafficLightState(summary, targetValue, meta);
  if (state === "green") return "badge-success";
  if (state === "warning") return "badge-warning";
  return "badge-danger";
}

function trafficLightState(summary, targetValue, meta = getOutcomeMeta()) {
  const p80 = summary.p80 || 0;
  const p90 = summary.p90 || 0;
  if (meta.higherIsBetter) {
    if (p80 >= targetValue) return "green";
    if (p90 >= targetValue * 0.95) return "warning";
    return "red";
  }
  if (p80 <= targetValue) return "green";
  if (p90 <= targetValue * 1.05) return "warning";
  return "red";
}

function trafficLightText(summary, targetValue, meta = getOutcomeMeta()) {
  const state = trafficLightState(summary, targetValue, meta);
  if (state === "green") return "Zielwert ist aus Sicht der Simulation gut erreicht";
  if (state === "warning") return "Noch vertretbar, aber aufmerksam prüfen";
  return "Kritisch, Gegensteuerung nötig";
}

function buildReportText() {
  const summary = hasSimulationResults() ? latestRun.summary : emptySummary();
  const targetValue = Number(state.settings.budget) || 0;
  const drivers = latestRun ? latestRun.sensitivity.slice(0, 5) : [];
  const model = getDisplayedOutcomeModel();
  const meta = getOutcomeMeta(model);
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
    "Die Analyse basiert auf einer Monte-Carlo-Simulation mit aktiven Unsicherheiten.",
    "Unsicherheiten werden als Bandbreitenparameter mit Min, wahrscheinlichstem Wert und Max modelliert.",
    `Aktives Bewertungsmodell: ${model.name}.`,
    `Verwendete Formel: ${model.formula}.`,
    "Inaktive Unsicherheiten werden nicht simuliert."
  ];
  const assumptionLines = [
    "Zentrale Annahmen:",
    `Anzahl Simulationen: ${formatNumber(state.settings.iterations)}.`,
    `${meta.targetLabel}: ${formatModelResult(model, targetValue)}.`,
    `Aktives Szenario: ${state.scenarios.find((scenario) => scenario.id === state.settings.activeScenarioId)?.name || "-"}.`,
    `Ergebnisgröße: ${model.outputLabel}.`
  ];
  const resultLines = hasSimulationResults() ? [
    "Simulationsergebnisse:",
    `Erwartungswert: ${formatModelResult(model, summary.mean)}.`,
    `Median: ${formatModelResult(model, summary.median)}.`,
    `P50: ${formatModelResult(model, summary.p50)}.`,
    `P80: ${formatModelResult(model, summary.p80)}.`,
    `P90: ${formatModelResult(model, summary.p90)}.`,
    `P95: ${formatModelResult(model, summary.p95)}.`,
    `${meta.exceedanceLabel}: ${formatPercent(summary.exceedanceProbability)}.`
  ] : ["Simulationsergebnisse:", "Noch keine Simulation durchgeführt."];
  const driverLines = hasSimulationResults() && drivers.length ? [
    "Risikotreiber:",
    ...drivers.map((driver) => `${driver.name}: Korrelationsindikator ${driver.correlation.toFixed(2)}.`)
  ] : ["Risikotreiber:", "Nach einer Simulation werden die wichtigsten Treiber sichtbar."];
  const budgetLines = [
    "Zielbewertung:",
    trafficLightState(summary, targetValue, meta) === "green"
      ? (meta.higherIsBetter ? `P80 liegt innerhalb der ${meta.targetLabel}.` : `P80 liegt innerhalb der ${meta.targetLabel}.`)
      : trafficLightState(summary, targetValue, meta) === "warning"
        ? (meta.higherIsBetter ? `P80 verfehlt die ${meta.targetLabel}, P90 ist jedoch noch vertretbar.` : `P80 liegt über der ${meta.targetLabel}, P90 ist jedoch noch vertretbar.`)
        : (meta.higherIsBetter ? `P90 liegt deutlich unter der ${meta.targetLabel} und erfordert Gegensteuerung.` : `P90 liegt deutlich über der ${meta.targetLabel} und erfordert Gegensteuerung.`)
  ];
  const actionLines = [
    "Handlungsempfehlungen:",
    hasSimulationResults() ? buildRecommendation().points.map((point) => `- ${point}`).join("\n") : "- Simulation ausführen und Eingaben fachlich prüfen."
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
  return `${Number(value || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatModelResult(model, value) {
  return formatOutcomeValue(model, value);
}

function getOutcomeMeta(model = resolveCurrentModel()) {
  const templateId = String(model?.templateId || "");
  const outputLabel = String(model?.outputLabel || "").toLowerCase();
  if (templateId === "roi" || outputLabel.includes("roi") || outputLabel.includes("%") || outputLabel.includes("rendite")) {
    return {
      kind: "percent",
      targetLabel: "Zielrendite",
      targetHelp: "Renditeziel in Prozent.",
      buttonLabel: "Sofortergebnis als Zielrendite übernehmen",
      bufferLabel: "Empfohlener Renditeabstand",
      bufferHelp: "Abstand zwischen Zielrendite und Untergrenze",
      exceedanceLabel: "Unterschreitungswahrscheinlichkeit",
      exceedanceHelp: "Anteil der Läufe unterhalb des Ziels",
      higherIsBetter: true
    };
  }
  if (templateId === "schedule" || outputLabel.includes("termin") || outputLabel.includes("dauer")) {
    const unit = String(model?.resultUnit || model?.unit || "Tage");
    return {
      kind: "time",
      targetLabel: "Zieldauer",
      unit,
      targetHelp: `Zeitvorgabe in ${unit}.`,
      buttonLabel: "Sofortergebnis als Zieldauer übernehmen",
      bufferLabel: "Empfohlener Zeitpuffer",
      bufferHelp: "Abstand zwischen Ziel und oberem Risikorand",
      exceedanceLabel: "Überschreitungswahrscheinlichkeit",
      exceedanceHelp: "Anteil der Läufe über dem Ziel",
      higherIsBetter: false
    };
  }
  return {
    kind: "money",
    targetLabel: "Zielbudget",
    targetHelp: "Budget in Euro.",
    buttonLabel: "Sofortergebnis als Zielbudget übernehmen",
    bufferLabel: "Empfohlener Risikopuffer",
    bufferHelp: "Ableitung aus P90 gegenüber dem Zielbudget",
    exceedanceLabel: "Überschreitungswahrscheinlichkeit",
    exceedanceHelp: "Anteil der Läufe über dem Zielbudget",
    higherIsBetter: false
  };
}

function getTargetDelta(summary, targetValue, meta = getOutcomeMeta()) {
  const p80 = Number(summary?.p80) || 0;
  return meta.higherIsBetter ? (targetValue - p80) : (p80 - targetValue);
}

function formatOutcomeValue(model, value) {
  const meta = getOutcomeMeta(model);
  if (meta.kind === "percent") {
    return `${formatNumber(value)} %`;
  }
  if (meta.kind === "time") {
    return `${formatNumber(value)} ${meta.unit || "Tage"}`;
  }
  return formatMoney(value);
}

function numericField(label, stateField, value, help = "", scenarioId = "") {
  const attr = scenarioId ? `data-scenario-id="${scenarioId}"` : "";
  return `
    <div class="field">
      <label for="${sanitizeId(stateField)}">${label}</label>
      <input
        id="${sanitizeId(stateField)}"
        data-state-field="${stateField}"
        ${attr}
        type="text"
        inputmode="decimal"
        value="${escapeAttr(value)}"
      />
      ${help ? `<div class="field-help">${help}</div>` : ""}
    </div>
  `.replace(/\s+/g, " ");
}

function formatMoneyInput(value) {
  if (value === "" || value === null || value === undefined) return "";
  return formatMoney(value);
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
      description: "Referenzannahme mit unveränderten Unsicherheiten.",
      parameterMultiplier: 1,
      riskProbabilityMultiplier: 1,
      riskImpactMultiplier: 1,
      active: true
    },
    {
      id: "optimistic",
      name: "Optimistisches Szenario",
      description: "Leicht günstigere Kostenannahmen und reduzierte Wirkungsunsicherheit.",
      parameterMultiplier: 0.96,
      riskProbabilityMultiplier: 0.85,
      riskImpactMultiplier: 0.9,
      active: true
    },
    {
      id: "critical",
      name: "Kritisches Szenario",
      description: "Erhöhte Kosten, Eintrittswahrscheinlichkeit und Wirkungsunsicherheit.",
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
    note: "Kostenmodell mit aktiven Unsicherheiten und Wirkungsbausteinen."
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
    formulaToken: item.formulaToken || createFormulaPlaceholderKey(item.label || item.id || `PAR_${index + 1}`, "PAR"),
    active: item.active !== false,
    distribution: item.distribution || "triangle"
  })).filter((item) => !String(item.id || "").startsWith("MODEL_"));
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
    resultUnit: "Tage",
    baseValue: 0,
    annualIncome: 0,
    annualCost: 0,
    annualCashflow: 0,
    capRate: 0.05,
    residualValue: 0,
    discountRate: 0.05,
    holdingPeriod: 10,
    note: "Die Formel lässt sich innerhalb der verfügbaren Formelbausteine anpassen.",
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
    formula: localizeFormula(stripFormulaAssignment(String(incoming?.formula || template.formula || ""))),
    resultUnit: String(incoming?.resultUnit || base.resultUnit || template.resultUnit || "Tage"),
    baseValue: Number(incoming?.baseValue ?? base.baseValue ?? 0),
    annualIncome: Number(incoming?.annualIncome ?? base.annualIncome ?? 0),
    annualCost: Number(incoming?.annualCost ?? base.annualCost ?? 0),
    annualCashflow: Number(incoming?.annualCashflow ?? base.annualCashflow ?? 0),
    capRate: Number(incoming?.capRate ?? base.capRate ?? 0.05),
    residualValue: Number(incoming?.residualValue ?? base.residualValue ?? 0),
    discountRate: Number(incoming?.discountRate ?? base.discountRate ?? 0.05),
    holdingPeriod: Number(incoming?.holdingPeriod ?? base.holdingPeriod ?? 10),
    note: note.includes("verfügbaren Tokens")
      ? note.replace("verfügbaren Tokens", "verfügbaren Formelbausteine")
      : note.includes("verfügbaren Platzhalter")
        ? note.replace("verfügbaren Platzhalter", "verfügbaren Formelbausteine")
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
    formula: stripFormulaAssignment(String(item.formula || "")),
    createdAt: item.createdAt || new Date().toISOString()
  }));
}
