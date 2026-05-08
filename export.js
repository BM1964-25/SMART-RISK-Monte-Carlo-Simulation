import { exportableState } from "./storage.js";

export function triggerDownload(filename, content, mimeType = "application/json;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportStateAsJson(state) {
  const payload = JSON.stringify(exportableState(state), null, 2);
  triggerDownload("smart-risk-monte-carlo-export.json", payload);
}

export function buildResultsCsv(records) {
  const rows = ["run,cost,time"];
  for (const record of records || []) {
    rows.push([record.run, record.cost, record.time].join(","));
  }
  return rows.join("\n");
}

export function exportResultsAsCsv(records) {
  const csv = buildResultsCsv(records);
  triggerDownload("smart-risk-monte-carlo-results.csv", csv, "text/csv;charset=utf-8");
}

export function downloadTemplate(state) {
  const template = {
    ...exportableState(state),
    simulationExample: {
      iterations: 10000,
      budget: 1000000
    }
  };
  triggerDownload("smart-risk-monte-carlo-template.json", JSON.stringify(template, null, 2));
}

