const FORMULA_TOKENS_RAW = [
  { token: "Basiswert", label: "Startwert des Modells" },
  { token: "SummeAktiverParameter", label: "Summe der aktiven Parameter" },
  { token: "Risikokosten", label: "Kostenwirkung der Risiken" },
  { token: "Terminwirkung", label: "Terminwirkung der Risiken" },
  { token: "Jahresertrag", label: "Jährlicher Ertrag" },
  { token: "Jahreskosten", label: "Jährliche Kosten" },
  { token: "JahresCashflow", label: "Jährlicher Cashflow" },
  { token: "Kapitalisierungszinssatz", label: "Kapitalisierungszinssatz" },
  { token: "Restwert", label: "Restwert" },
  { token: "Reinertrag", label: "Reinertrag" },
  { token: "Bodenwertverzinsung", label: "Bodenwertverzinsung" },
  { token: "Kapitalisierungsfaktor", label: "Kapitalisierungsfaktor" },
  { token: "Bodenwert", label: "Bodenwert" },
  { token: "SonstigeWertbeeinflussendeUmstaende", label: "Sonstige wertbeeinflussende Umstände" },
  { token: "Diskontierungszins", label: "Diskontierungszins" },
  { token: "Haltedauer", label: "Haltedauer in Jahren" },
  { token: "KG100", label: "KG 100" },
  { token: "KG200", label: "KG 200" },
  { token: "KG300", label: "KG 300" },
  { token: "KG400", label: "KG 400" },
  { token: "KG500", label: "KG 500" },
  { token: "KG600", label: "KG 600" },
  { token: "KG700", label: "KG 700" },
  { token: "KG800", label: "KG 800" },
  { token: "Basiskosten", label: "Gesamtkosten nach DIN 276" },
  { token: "Gesamtrisiko", label: "Gesamtrisiko" },
  { token: "Projektbudget", label: "Gesamtbudget des Projekts" },
  { token: "Risikoaufschlag", label: "Risikoaufschlag" },
  { token: "Eintrittswahrscheinlichkeit", label: "Eintrittswahrscheinlichkeit" },
  { token: "Schadenshoehe", label: "Schadenshöhe" },
  { token: "Risiko_1", label: "Risiko(1)" },
  { token: "Risiko_2", label: "Risiko(2)" },
  { token: "Risiko_3", label: "Risiko(3)" },
  { token: "Risiko_4", label: "Risiko(4)" },
  { token: "Risiko_5", label: "Risiko(5)" },
  { token: "Einnahmen", label: "Einnahmen" },
  { token: "Betriebskosten", label: "Betriebskosten" },
  { token: "Finanzierungskosten", label: "Finanzierungskosten" },
  { token: "Cashflow", label: "Cashflow" },
  { token: "Gewinn", label: "Gewinn" },
  { token: "Investition", label: "Investition" },
  { token: "I_0", label: "Anfangsinvestition (I₀, €)" },
  { token: "Planung", label: "Planung" },
  { token: "Vergabe", label: "Vergabe" },
  { token: "Bau", label: "Bau" },
  { token: "Inbetriebnahme", label: "Inbetriebnahme" },
  { token: "Flaeche", label: "Fläche" },
  { token: "Mietpreis", label: "Mietpreis" },
  { token: "Vermietungsquote", label: "Vermietungsquote" },
  { token: "Jahresnettomiete", label: "Jahresnettomiete" },
  { token: "Vervielfaeltiger", label: "Vervielfältiger" },
  { token: "Kosten_0", label: "Ausgangskosten (K0)" },
  { token: "i", label: "Preissteigerungsrate (i, %)" },
  { token: "n", label: "Laufzeit (n, Jahre)" },
  { token: "Kapital", label: "Kapital" },
  { token: "Zinssatz", label: "Zinssatz" },
  { token: "Laufzeit", label: "Laufzeit" }
];

export const FORMULA_TOKENS = [...FORMULA_TOKENS_RAW].sort((a, b) => sortByVisibleLabel(a, b));

function sortByVisibleLabel(a, b) {
  const left = String(a?.label || a?.token || "");
  const right = String(b?.label || b?.token || "");
  return left.localeCompare(right, "de", { sensitivity: "base" });
}

export const MODEL_TEMPLATES = [
  {
    id: "custom",
    name: "Eigene Formel erstellen",
    outputLabel: "Ergebnis",
    description: "Freie Modellvorlage für eigene fachliche Formeln und Spezialfälle.",
    formula: "",
    fields: []
  },
  {
    id: "cost",
    name: "Kosten- / Budgetmodell",
    outputLabel: "Gesamtwert",
    description: "Summiert Budget, aktive Parameter und Risiken zu einer Kostenverteilung.",
    formula: "Basiswert + SummeAktiverParameter + Risikokosten",
    fields: [
      { key: "baseValue", token: "Basiswert", label: "Basiswert", help: "Z. B. Bodenwert, Kaufpreis oder Basisbudget", type: "number", format: "money", defaultValue: 0 },
      { key: "parameterSum", token: "SummeAktiverParameter", label: "Summe aktiver Parameter", help: "Summe der aktuellen Unsicherheiten", type: "number", format: "money", defaultValue: 0 },
      { key: "riskCosts", token: "Risikokosten", label: "Risikokosten", help: "Zusätzliche Risikoauswirkungen", type: "number", format: "money", defaultValue: 0 }
    ]
  },
  {
    id: "cost-total",
    name: "Gesamtkostenmodell",
    outputLabel: "Gesamtkosten",
    description: "Fasst die wesentlichen Kostenblöcke zu einer Gesamtkostenperspektive zusammen.",
    formula: "KG300 + KG400 + KG500 + Baunebenkosten + Risiken",
    fields: []
  },
  {
    id: "din276",
    name: "Gesamtkosten nach DIN 276",
    outputLabel: "Gesamtkosten",
    description: "Aggregiert die Kostengruppen 100 bis 800 zu den Gesamtkosten nach DIN 276.",
    formula: "KG100 + KG200 + KG300 + KG400 + KG500 + KG600 + KG700 + KG800",
    fields: []
  },
  {
    id: "budget",
    name: "Gesamtbudget",
    outputLabel: "Projektbudget",
    description: "Verbindet Basiskosten und separat simulierte Risiken zum Projektbudget.",
    formula: "Basiskosten + Gesamtrisiko",
    fields: []
  },
  {
    id: "yield",
    name: "Ertragswertverfahren",
    outputLabel: "Ertragswert",
    description: "Leitet den Ertragswert aus Reinertrag, Bodenwertverzinsung, Kapitalisierungsfaktor, Bodenwert und weiteren wertbeeinflussenden Umständen ab.",
    formula: "Ertragswert = (Reinertrag - Bodenwertverzinsung) * Kapitalisierungsfaktor + Bodenwert + SonstigeWertbeeinflussendeUmstaende",
    fields: [
      { key: "netIncome", token: "Reinertrag", label: "Reinertrag", help: "Jährlicher Reinertrag vor Kapitalisierung", type: "number", format: "money", defaultValue: 0 },
      { key: "groundRent", token: "Bodenwertverzinsung", label: "Bodenwertverzinsung", help: "Jährliche Verzinsung des Bodenwerts", type: "number", format: "money", defaultValue: 0 },
      { key: "capitalizationFactor", token: "Kapitalisierungsfaktor", label: "Kapitalisierungsfaktor", help: "Multiplikator auf den Reinertrag", type: "number", defaultValue: 1 },
      { key: "landValue", token: "Bodenwert", label: "Bodenwert", help: "Bodenwert oder Grundstückswert", type: "number", format: "money", defaultValue: 0 },
      { key: "otherInfluences", token: "SonstigeWertbeeinflussendeUmstaende", label: "Sonstige wertbeeinflussende Umstände", help: "Positive oder negative wertbeeinflussende Einflüsse", type: "number", format: "money", defaultValue: 0 }
    ]
  },
  {
    id: "cashflow",
    name: "Cashflow-Modell",
    outputLabel: "Cashflow",
    description: "Bilden den laufenden Netto-Cashflow aus Einnahmen und Kosten ab.",
    formula: "Einnahmen - Betriebskosten - Finanzierungskosten",
    fields: [
      { key: "income", token: "Einnahmen", label: "Einnahmen", help: "Laufende Erlöse oder Mieterträge", type: "number", format: "money", defaultValue: 0 },
      { key: "operatingCosts", token: "Betriebskosten", label: "Betriebskosten", help: "Laufende Aufwendungen", type: "number", format: "money", defaultValue: 0 },
      { key: "financingCosts", token: "Finanzierungskosten", label: "Finanzierungskosten", help: "Zins- und Finanzierungskosten", type: "number", format: "money", defaultValue: 0 }
    ]
  },
  {
    id: "dcf",
    name: "DCF- / Barwertmodell",
    outputLabel: "Barwert",
    description: "Diskontiert wiederkehrende Cashflows über eine definierte Haltedauer.",
    formula: "Basiswert + (JahresCashflow * (1 - (1 + Diskontierungszins) ^ (-Haltedauer)) / Diskontierungszins) + Restwert - Risikokosten",
    fields: [
      { key: "baseValue", token: "Basiswert", label: "Basiswert", help: "Ausgangswert oder Anfangsinvestition", type: "number", format: "money", defaultValue: 0 },
      { key: "annualCashflow", token: "JahresCashflow", label: "Jahres-Cashflow", help: "Jährlicher Netto-Cashflow", type: "number", format: "money", defaultValue: 0, unit: "EUR" },
      { key: "discountRate", token: "Diskontierungszins", label: "Diskontierungszins", help: "z. B. 0,05", type: "number", defaultValue: 0.05, unit: "%" },
      { key: "holdingPeriod", token: "Haltedauer", label: "Haltedauer", help: "Jahre", type: "number", defaultValue: 10, unit: "Jahre" },
      { key: "residualValue", token: "Restwert", label: "Restwert", help: "Verkaufserlös oder Exit-Wert", type: "number", format: "money", defaultValue: 0 }
    ]
  },
  {
    id: "npv",
    name: "Kapitalwert / NPV",
    outputLabel: "Barwert",
    description: "Ermittelt den Kapitalwert aus den aktiven Annahmen, dem abgezinsten Jahres-Cashflow und der Anfangsinvestition.",
    formula: "SummeAktiverParameter + (JahresCashflow / (1 + Diskontierungszins) ^ Haltedauer) - Investition",
    fields: [
      { key: "annualCashflow", token: "JahresCashflow", label: "Jahres-Cashflow", help: "Netto-Zahlungsstrom pro Jahr vor Abzinsung", type: "number", format: "money", defaultValue: 0, unit: "EUR" },
      { key: "discountRate", token: "Diskontierungszins", label: "Diskontierungszins", help: "Abzinsungssatz, z. B. 0,05", type: "number", defaultValue: 0.05, unit: "%" },
      { key: "holdingPeriod", token: "Haltedauer", label: "Haltedauer", help: "Betrachtungszeitraum in Jahren", type: "number", defaultValue: 10, unit: "Jahre" },
      { key: "investment", token: "Investition", label: "Investition", help: "Anfangsinvestition beziehungsweise Einstiegskapital", type: "number", format: "money", defaultValue: 0, unit: "EUR" }
    ]
  },
  {
    id: "roi",
    name: "ROI-Modell",
    outputLabel: "ROI",
    description: "Setzt Gewinn und Investition ins Verhältnis und zeigt die Rendite in Prozent.",
    formula: "(Gewinn / Investition) * 100",
    fields: [
      { key: "profit", token: "Gewinn", label: "Gewinn", help: "Erwarteter Gewinn oder Überschuss", type: "number", format: "money", defaultValue: 0 },
      { key: "investment", token: "Investition", label: "Investition", help: "Eingesetztes Kapital", type: "number", format: "money", defaultValue: 0 }
    ]
  },
  {
    id: "risk-costs",
    name: "Risikokostenmodell",
    outputLabel: "Gesamtrisiko",
    description: "Simuliert fünf getrennte Risiken und zeigt die Summe der Einzelrisiken an.",
    formula: "Gesamtrisiko = Risiko_1 + Risiko_2 + Risiko_3 + Risiko_4 + Risiko_5",
    fields: [
      { key: "risk1", token: "Risiko_1", label: "Risiko(1)", help: "Erstes Einzelrisiko", type: "number", format: "money", defaultValue: 0 },
      { key: "risk2", token: "Risiko_2", label: "Risiko(2)", help: "Zweites Einzelrisiko", type: "number", format: "money", defaultValue: 0 },
      { key: "risk3", token: "Risiko_3", label: "Risiko(3)", help: "Drittes Einzelrisiko", type: "number", format: "money", defaultValue: 0 },
      { key: "risk4", token: "Risiko_4", label: "Risiko(4)", help: "Viertes Einzelrisiko", type: "number", format: "money", defaultValue: 0 },
      { key: "risk5", token: "Risiko_5", label: "Risiko(5)", help: "Fünftes Einzelrisiko", type: "number", format: "money", defaultValue: 0 }
    ]
  },
  {
    id: "risk-value",
    name: "Risikowert",
    outputLabel: "Risikowert",
    description: "Gewichtet Risiken über Eintrittswahrscheinlichkeit und Schadenshöhe.",
    formula: "Risikowert = Eintrittswahrscheinlichkeit * Schadenshoehe",
    fields: [
      { key: "probability", token: "Eintrittswahrscheinlichkeit", label: "Eintrittswahrscheinlichkeit", help: "In Prozent", type: "number", defaultValue: 0 },
      { key: "damage", token: "Schadenshoehe", label: "Schadenshöhe", help: "Kosten- oder Zeitwirkung", type: "number", format: "money", defaultValue: 0 }
    ]
  },
  {
    id: "lcc",
    name: "Lebenszykluskosten",
    outputLabel: "LCC",
    description: "Betrachtet Investition, Betrieb, Instandhaltung und Rückbau über den Lebenszyklus.",
    formula: "LCC = Investition + Betrieb + Instandhaltung + Rueckbau",
    fields: [
      { key: "investment", token: "Investition", label: "Investition", help: "Anfangsinvestition", type: "number", format: "money", defaultValue: 0 },
      { key: "operatingCosts", token: "Betrieb", label: "Betrieb", help: "Laufender Betrieb", type: "number", format: "money", defaultValue: 0 },
      { key: "maintenanceCosts", token: "Instandhaltung", label: "Instandhaltung", help: "Wartung und Instandsetzung", type: "number", format: "money", defaultValue: 0 },
      { key: "demolitionCosts", token: "Rueckbau", label: "Rückbau", help: "Rückbau- oder Entsorgungskosten", type: "number", format: "money", defaultValue: 0 }
    ]
  },
  {
    id: "schedule",
    name: "Terminmodell",
    outputLabel: "Gesamttermin",
    description: "Aggregiert die Projektphasen Planung, Vergabe, Bau und Inbetriebnahme.",
    formula: "Gesamttermin = Planung + Vergabe + Bau + Inbetriebnahme",
    resultUnit: "Tage",
    fields: [
      { key: "planning", token: "Planung", label: "Planung", help: "Dauer der Planungsphase", type: "number", defaultValue: 0 },
      { key: "procurement", token: "Vergabe", label: "Vergabe", help: "Dauer der Vergabe", type: "number", defaultValue: 0 },
      { key: "construction", token: "Bau", label: "Bau", help: "Dauer der Bauphase", type: "number", defaultValue: 0 },
      { key: "commissioning", token: "Inbetriebnahme", label: "Inbetriebnahme", help: "Dauer der Inbetriebnahme", type: "number", defaultValue: 0 }
    ]
  },
  {
    id: "rent",
    name: "Mieterlösmodell",
    outputLabel: "Mietertrag",
    description: "Leitet den Mietertrag aus Fläche, Mietpreis und Vermietungsquote ab.",
    formula: "Mietertrag = Flaeche * Mietpreis * Vermietungsquote",
    fields: [
      { key: "area", token: "Flaeche", label: "Fläche", help: "Vermietbare Fläche", type: "number", defaultValue: 0 },
      { key: "rentPrice", token: "Mietpreis", label: "Mietpreis", help: "Preis pro Einheit", type: "number", format: "money", defaultValue: 0 },
      { key: "vacancyRate", token: "Vermietungsquote", label: "Vermietungsquote", help: "Anteil vermietet", type: "number", defaultValue: 1 }
    ]
  },
  {
    id: "asset-value",
    name: "Immobilienwertmodell",
    outputLabel: "Immobilienwert",
    description: "Setzt die Jahresnettomiete mit einem Vervielfältiger ins Verhältnis.",
    formula: "Immobilienwert = Jahresnettomiete * Vervielfaeltiger",
    fields: [
      { key: "annualNetRent", token: "Jahresnettomiete", label: "Jahresnettomiete", help: "Jährliche Nettomiete", type: "number", format: "money", defaultValue: 0, unit: "EUR" },
      { key: "multiplier", token: "Vervielfaeltiger", label: "Vervielfältiger", help: "Ertragsfaktor", type: "number", defaultValue: 0 }
    ]
  },
  {
    id: "inflation",
    name: "Inflation / Preissteigerung",
    outputLabel: "Zukunftskosten",
    description: "Schreibt Ausgangskosten über eine Laufzeit mit einer Preissteigerungsrate fort.",
    formula: "Zukunftskosten = Kosten_0 * (1 + i) ^ n",
    fields: [
      { key: "initialCosts", token: "Kosten_0", label: "Ausgangskosten (K0)", help: "Ausgangskosten vor Preissteigerung", type: "number", format: "money", defaultValue: 0, unit: "EUR" },
      { key: "inflationRate", token: "i", label: "Preissteigerungsrate (i, %)", help: "Preissteigerungs- beziehungsweise Inflationsrate", type: "number", defaultValue: 0, unit: "%" },
      { key: "years", token: "n", label: "Laufzeit (n, Jahre)", help: "Betrachtungszeitraum in Jahren", type: "number", defaultValue: 0, unit: "Jahre" }
    ]
  },
  {
    id: "financing",
    name: "Finanzierungskosten",
    outputLabel: "Zinskosten",
    description: "Leitet Finanzierungskosten aus Kapital, Zinssatz und Laufzeit ab.",
    formula: "Zinskosten = Kapital * Zinssatz * Laufzeit",
    fields: [
      { key: "capital", token: "Kapital", label: "Kapital", help: "Eingesetztes Fremd- oder Eigenkapital", type: "number", format: "money", defaultValue: 0, unit: "EUR" },
      { key: "interestRate", token: "Zinssatz", label: "Zinssatz", help: "z. B. 0,05", type: "number", defaultValue: 0.05, unit: "%" },
      { key: "term", token: "Laufzeit", label: "Laufzeit", help: "Zeitraum in Jahren", type: "number", defaultValue: 0, unit: "Jahre" }
    ]
  }
];

export const FORMULA_LIBRARY = [
  {
    templateId: "cost-total",
    title: "Gesamtkostenmodell",
    formula: "Gesamtkosten = KG300 + KG400 + KG500 + Baunebenkosten + Risiken",
    note: "Fasst die wesentlichen Kostenblöcke zu einer Gesamtkostenperspektive zusammen."
  },
  {
    title: "Kosten- / Budgetmodell",
    formula: "Basiswert + SummeAktiverParameter + Risikokosten",
    note: "Klassische Budgetsicht aus Basiswert, Treibern und Risiken."
  },
  {
    templateId: "din276",
    title: "Gesamtkosten nach DIN 276",
    formula: "Gesamtkosten nach DIN 276 = KG100 + KG200 + KG300 + KG400 + KG500 + KG600 + KG700 + KG800",
    note: "Erfasst die Gesamtkosten nach DIN 276 ohne gesonderten Risikoaufschlag."
  },
  {
    title: "Risikokostenmodell",
    formula: "Gesamtrisiko = Risiko_1 + Risiko_2 + Risiko_3 + Risiko_4 + Risiko_5",
    note: "Fünf getrennte Risiken werden separat bewertet und anschließend zusammengefasst."
  },
  {
    title: "Gesamtbudget",
    formula: "Projektbudget = Basiskosten + Gesamtrisiko",
    note: "Kombiniert die Basiskosten mit den separat simulierten Risiken zum Projektbudget."
  },
  {
    title: "Risikowert",
    formula: "Risikowert = Eintrittswahrscheinlichkeit · Schadenshoehe",
    note: "Grundlogik zur Gewichtung einzelner Risiken."
  },
  {
    title: "Cashflow-Modell",
    formula: "Cashflow = Einnahmen − Betriebskosten − Finanzierungskosten",
    note: "Darstellung des laufenden Netto-Cashflows."
  },
  {
    title: "Ertragswertverfahren",
    formula: "Ertragswert = (Reinertrag - Bodenwertverzinsung) × Kapitalisierungsfaktor + Bodenwert ± sonstige wertbeeinflussende Umstände",
    note: "Leitet den Ertragswert aus Reinertrag, Bodenwertverzinsung, Kapitalisierungsfaktor, Bodenwert und wertbeeinflussenden Umständen ab."
  },
  {
    title: "DCF- / Barwertmodell",
    formula: "Basiswert + (JahresCashflow * (1 - (1 + Diskontierungszins) ^ (-Haltedauer)) / Diskontierungszins) + Restwert - Risikokosten",
    note: "Diskontiert wiederkehrende Cashflows über eine definierte Haltedauer."
  },
  {
    title: "Kapitalwert / NPV",
    formula: "NPV = Σ (CF_t / (1 + r)^t) − I_0",
    note: "Barwert der zukünftigen Cashflows abzüglich Anfangsinvestition."
  },
  {
    title: "ROI",
    formula: "ROI = (Gewinn / Investition) · 100",
    note: "Rendite auf die eingesetzte Investition."
  },
  {
    title: "Lebenszykluskosten",
    formula: "LCC = Investition + Betrieb + Instandhaltung + Rueckbau",
    note: "Vollkostenbetrachtung über den Lebenszyklus."
  },
  {
    title: "Terminmodell",
    formula: "Gesamttermin = Planung + Vergabe + Bau + Inbetriebnahme",
    note: "Aggregierte Terminlogik für Projektphasen."
  },
  {
    title: "Mieterlösmodell",
    formula: "Mietertrag = Flaeche · Mietpreis · Vermietungsquote",
    note: "Ertrag aus Fläche, Preis und Vermietungsgrad."
  },
  {
    title: "Immobilienwertmodell",
    formula: "Immobilienwert = Jahresnettomiete · Vervielfaeltiger",
    note: "Klassische Ertragswertlogik mit Multiplikator."
  },
  {
    title: "Inflation / Preissteigerung",
    formula: "Zukunftskosten = Kosten_0 · (1 + i)^n",
    note: "Preisfortschreibung über eine Laufzeit."
  },
  {
    title: "Finanzierungskosten",
    formula: "Zinskosten = Kapital · Zinssatz · Laufzeit",
    note: "Lineare Annäherung an die Finanzierungskosten."
  }
];

export const FORMULA_LIBRARY_GROUPS = [
  {
    title: "Kosten und Budget",
    items: [
  {
    templateId: "cost-total",
    title: "Gesamtkostenmodell",
    formula: "Gesamtkosten = KG300 + KG400 + KG500 + Baunebenkosten + Risiken",
    note: "Fasst die wesentlichen Kostenblöcke zu einer Gesamtkostenperspektive zusammen."
  },
  {
    templateId: "cost",
    title: "Kosten- / Budgetmodell",
    formula: "Basiswert + SummeAktiverParameter + Risikokosten",
    note: "Klassische Budgetsicht aus Basiswert, Treibern und Risiken."
  },
  {
    templateId: "din276",
    title: "Gesamtkosten nach DIN 276",
    formula: "Gesamtkosten nach DIN 276 = KG100 + KG200 + KG300 + KG400 + KG500 + KG600 + KG700 + KG800",
    note: "Erfasst die Gesamtkosten nach DIN 276 ohne gesonderten Risikoaufschlag."
  },
  {
    templateId: "budget",
    title: "Gesamtbudget",
    formula: "Projektbudget = Basiskosten + Gesamtrisiko",
    note: "Kombiniert die Basiskosten mit den separat simulierten Risiken zum Projektbudget."
  },
  {
    templateId: "lcc",
    title: "Lebenszykluskosten",
    formula: "LCC = Investition + Betrieb + Instandhaltung + Rueckbau",
    note: "Vollkostenbetrachtung über den Lebenszyklus."
      }
    ]
  },
  {
    title: "Risiko",
    items: [
  {
    templateId: "risk-costs",
    title: "Risikokostenmodell",
    formula: "Gesamtrisiko = Risiko_1 + Risiko_2 + Risiko_3 + Risiko_4 + Risiko_5",
    note: "Fünf getrennte Risiken werden separat bewertet und anschließend zusammengefasst."
  },
  {
    templateId: "risk-value",
    title: "Risikowert",
    formula: "Risikowert = Eintrittswahrscheinlichkeit · Schadenshoehe",
    note: "Grundlogik zur Gewichtung einzelner Risiken."
  },
  {
    templateId: "inflation",
    title: "Inflation / Preissteigerung",
    formula: "Zukunftskosten = Kosten_0 · (1 + i)^n",
    note: "Preisfortschreibung von Ausgangskosten mit Preissteigerungsrate über eine Laufzeit."
      }
    ]
  },
  {
    title: "Ertrag und Wert",
    items: [
  {
    templateId: "cashflow",
    title: "Cashflow-Modell",
    formula: "Cashflow = Einnahmen − Betriebskosten − Finanzierungskosten",
    note: "Darstellung des laufenden Netto-Cashflows."
  },
  {
    templateId: "yield",
    title: "Ertragswertverfahren",
    formula: "Ertragswert = (Reinertrag - Bodenwertverzinsung) × Kapitalisierungsfaktor + Bodenwert ± sonstige wertbeeinflussende Umstände",
    note: "Leitet den Ertragswert aus Reinertrag, Bodenwertverzinsung, Kapitalisierungsfaktor, Bodenwert und wertbeeinflussenden Umständen ab."
  },
  {
    templateId: "dcf",
    title: "DCF- / Barwertmodell",
    formula: "Basiswert + (JahresCashflow * (1 - (1 + Diskontierungszins) ^ (-Haltedauer)) / Diskontierungszins) + Restwert - Risikokosten",
    note: "Diskontiert wiederkehrende Cashflows über eine definierte Haltedauer."
  },
  {
    templateId: "npv",
    title: "Kapitalwert / NPV",
    formula: "NPV = Σ (CF_t / (1 + r)^t) − I_0",
    note: "Barwert der zukünftigen Cashflows abzüglich Anfangsinvestition."
  },
  {
    templateId: "roi",
    title: "ROI",
    formula: "ROI = (Gewinn / Investition) · 100",
    note: "Rendite auf die eingesetzte Investition."
  },
  {
    templateId: "asset-value",
    title: "Immobilienwertmodell",
    formula: "Immobilienwert = Jahresnettomiete · Vervielfaeltiger",
    note: "Klassische Ertragswertlogik mit Multiplikator."
  },
  {
    templateId: "rent",
    title: "Mieterlösmodell",
    formula: "Mietertrag = Flaeche · Mietpreis · Vermietungsquote",
    note: "Ertrag aus Fläche, Preis und Vermietungsgrad."
      }
    ]
  },
  {
    title: "Termin und Finanzierung",
    items: [
  {
    templateId: "schedule",
    title: "Terminmodell",
    formula: "Gesamttermin = Planung + Vergabe + Bau + Inbetriebnahme",
    note: "Aggregierte Terminlogik für Projektphasen."
  },
  {
    templateId: "financing",
    title: "Finanzierungskosten",
    formula: "Zinskosten = Kapital · Zinssatz · Laufzeit",
    note: "Lineare Annäherung an die Finanzierungskosten."
  }
    ]
  }
];

export function getModelTemplate(id) {
  return MODEL_TEMPLATES.find((template) => template.id === id) || MODEL_TEMPLATES[0];
}
