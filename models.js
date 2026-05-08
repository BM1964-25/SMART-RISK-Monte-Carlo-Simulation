export const FORMULA_TOKENS = [
  { token: "Basiswert", label: "Startwert des Modells" },
  { token: "SummeAktiverParameter", label: "Summe der aktiven Parameter" },
  { token: "Risikokosten", label: "Kostenwirkung der Risiken" },
  { token: "Terminwirkung", label: "Terminwirkung der Risiken" },
  { token: "Jahresertrag", label: "Jährlicher Ertrag" },
  { token: "Jahreskosten", label: "Jährliche Kosten" },
  { token: "JahresCashflow", label: "Jährlicher Cashflow" },
  { token: "Kapitalisierungszinssatz", label: "Kapitalisierungszinssatz" },
  { token: "Restwert", label: "Restwert" },
  { token: "Diskontierungszins", label: "Diskontierungszins" },
  { token: "Haltedauer", label: "Haltedauer in Jahren" },
  { token: "KG100", label: "DIN 276 - Kostengruppe 100" },
  { token: "KG200", label: "DIN 276 - Kostengruppe 200" },
  { token: "KG300", label: "DIN 276 - Kostengruppe 300" },
  { token: "KG400", label: "DIN 276 - Kostengruppe 400" },
  { token: "KG500", label: "DIN 276 - Kostengruppe 500" },
  { token: "KG600", label: "DIN 276 - Kostengruppe 600" },
  { token: "KG700", label: "DIN 276 - Kostengruppe 700" },
  { token: "KG800", label: "DIN 276 - Kostengruppe 800" },
  { token: "Basiskosten", label: "Basiskosten nach DIN 276" },
  { token: "Gesamtrisiko", label: "Gesamtrisiko" },
  { token: "Projektbudget", label: "Gesamtbudget des Projekts" },
  { token: "Risikoaufschlag", label: "Risikoaufschlag" },
  { token: "Eintrittswahrscheinlichkeit", label: "Eintrittswahrscheinlichkeit" },
  { token: "Schadenshoehe", label: "Schadenshöhe" },
  { token: "Risiko_i", label: "Einzelrisiko i" },
  { token: "Einnahmen", label: "Einnahmen" },
  { token: "Betriebskosten", label: "Betriebskosten" },
  { token: "Finanzierungskosten", label: "Finanzierungskosten" },
  { token: "Cashflow", label: "Cashflow" },
  { token: "Gewinn", label: "Gewinn" },
  { token: "Investition", label: "Investition" },
  { token: "Planung", label: "Planung" },
  { token: "Vergabe", label: "Vergabe" },
  { token: "Bau", label: "Bau" },
  { token: "Inbetriebnahme", label: "Inbetriebnahme" },
  { token: "Flaeche", label: "Fläche" },
  { token: "Mietpreis", label: "Mietpreis" },
  { token: "Vermietungsquote", label: "Vermietungsquote" },
  { token: "Jahresnettomiete", label: "Jahresnettomiete" },
  { token: "Vervielfaeltiger", label: "Vervielfältiger" },
  { token: "Kosten_0", label: "Ausgangskosten" },
  { token: "i", label: "Inflationsrate" },
  { token: "n", label: "Jahre / Laufzeit" },
  { token: "Kapital", label: "Kapital" },
  { token: "Zinssatz", label: "Zinssatz" },
  { token: "Laufzeit", label: "Laufzeit" }
];

export const MODEL_TEMPLATES = [
  {
    id: "custom",
    name: "Eigene Formel erstellen",
    outputLabel: "Ergebnis",
    description: "Freie Modellvorlage für eigene fachliche Formeln und Spezialfälle.",
    formula: ""
  },
  {
    id: "cost",
    name: "Kosten- / Budgetmodell",
    outputLabel: "Gesamtwert",
    description: "Summiert Budget, aktive Parameter und Risiken zu einer Kostenverteilung.",
    formula: "Basiswert + SummeAktiverParameter + Risikokosten"
  },
  {
    id: "din276",
    name: "Basiskosten nach DIN 276",
    outputLabel: "Basiskosten",
    description: "Aggregiert die Kostengruppen 100 bis 800 zu einer DIN-276-Basiskostenbasis.",
    formula: "KG100 + KG200 + KG300 + KG400 + KG500 + KG600 + KG700 + KG800"
  },
  {
    id: "budget",
    name: "Gesamtbudget",
    outputLabel: "Projektbudget",
    description: "Verbindet Basiskosten und separat simulierte Risiken zum Projektbudget.",
    formula: "Basiskosten + Gesamtrisiko"
  },
  {
    id: "yield",
    name: "Ertragswertverfahren",
    outputLabel: "Ertragswert",
    description: "Leitet einen Ertragswert aus Nettoertrag, Kapitalisierungszins und Restwert ab.",
    formula: "((Jahresertrag - Jahreskosten) / Kapitalisierungszinssatz) + Restwert - Risikokosten"
  },
  {
    id: "cashflow",
    name: "Cashflow-Modell",
    outputLabel: "Cashflow",
    description: "Bilden den laufenden Netto-Cashflow aus Einnahmen und Kosten ab.",
    formula: "Einnahmen - Betriebskosten - Finanzierungskosten"
  },
  {
    id: "dcf",
    name: "DCF- / Barwertmodell",
    outputLabel: "Barwert",
    description: "Diskontiert wiederkehrende Cashflows über eine definierte Haltedauer.",
    formula: "Basiswert + (JahresCashflow * (1 - (1 + Diskontierungszins) ^ (-Haltedauer)) / Diskontierungszins) + Restwert - Risikokosten"
  },
  {
    id: "npv",
    name: "Kapitalwert / NPV",
    outputLabel: "Barwert",
    description: "Ermittelt den Barwert der abgezinsten Zahlungsströme abzüglich Anfangsinvestition.",
    formula: "SummeAktiverParameter + (JahresCashflow / (1 + Diskontierungszins) ^ Haltedauer) - Investition"
  },
  {
    id: "roi",
    name: "ROI-Modell",
    outputLabel: "ROI",
    description: "Setzt Gewinn und Investition ins Verhältnis und zeigt die Rendite in Prozent.",
    formula: "(Gewinn / Investition) * 100"
  },
  {
    id: "hybrid",
    name: "Hybridmodell",
    outputLabel: "Gesamtwert",
    description: "Kombiniert Kosten-, Ertrags- und Risikotreiber in einer kompakten Logik.",
    formula: "Basiswert + SummeAktiverParameter + (JahresCashflow / Kapitalisierungszinssatz) + Restwert - Risikokosten"
  },
  {
    id: "total-costs",
    name: "Gesamtkostenmodell",
    outputLabel: "Gesamtkosten",
    description: "Fasst die wesentlichen Kostenblöcke zu einer Gesamtkostenperspektive zusammen.",
    formula: "Gesamtkosten = KG300 + KG400 + KG500 + Baunebenkosten + Risiken"
  },
  {
    id: "risk-costs",
    name: "Risikokostenmodell",
    outputLabel: "Gesamtrisiko",
    description: "Simuliert Risiken separat und zeigt die Summe der Einzelrisiken an.",
    formula: "Gesamtrisiko = Risiko_i"
  },
  {
    id: "risk-value",
    name: "Risikowert",
    outputLabel: "Risikowert",
    description: "Gewichtet Risiken über Eintrittswahrscheinlichkeit und Schadenshöhe.",
    formula: "Risikowert = Eintrittswahrscheinlichkeit * Schadenshoehe"
  },
  {
    id: "lcc",
    name: "Lebenszykluskosten",
    outputLabel: "LCC",
    description: "Betrachtet Investition, Betrieb, Instandhaltung und Rückbau über den Lebenszyklus.",
    formula: "LCC = Investition + Betrieb + Instandhaltung + Rueckbau"
  },
  {
    id: "schedule",
    name: "Terminmodell",
    outputLabel: "Gesamttermin",
    description: "Aggregiert die Projektphasen Planung, Vergabe, Bau und Inbetriebnahme.",
    formula: "Gesamttermin = Planung + Vergabe + Bau + Inbetriebnahme"
  },
  {
    id: "rent",
    name: "Mieterlösmodell",
    outputLabel: "Mietertrag",
    description: "Leitet den Mietertrag aus Fläche, Mietpreis und Vermietungsquote ab.",
    formula: "Mietertrag = Flaeche * Mietpreis * Vermietungsquote"
  },
  {
    id: "asset-value",
    name: "Immobilienwertmodell",
    outputLabel: "Immobilienwert",
    description: "Setzt die Jahresnettomiete mit einem Vervielfältiger ins Verhältnis.",
    formula: "Immobilienwert = Jahresnettomiete * Vervielfaeltiger"
  },
  {
    id: "inflation",
    name: "Inflation / Preissteigerung",
    outputLabel: "Zukunftskosten",
    description: "Schreibt Kosten über einen Zeitraum mit einer Wachstumsrate fort.",
    formula: "Zukunftskosten = Kosten_0 * (1 + i) ^ n"
  },
  {
    id: "financing",
    name: "Finanzierungskosten",
    outputLabel: "Zinskosten",
    description: "Leitet Finanzierungskosten aus Kapital, Zinssatz und Laufzeit ab.",
    formula: "Zinskosten = Kapital * Zinssatz * Laufzeit"
  }
];

export const FORMULA_LIBRARY = [
  {
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
    title: "Basiskosten nach DIN 276",
    formula: "Gesamtkosten nach DIN 276 = KG100 + KG200 + KG300 + KG400 + KG500 + KG600 + KG700 + KG800",
    note: "Erfasst die reinen DIN-276-Basiskosten ohne gesonderten Risikoaufschlag."
  },
  {
    title: "Risikokostenmodell",
    formula: "Gesamtrisiko = Σ Risiko_i",
    note: "Risiken werden separat simuliert und als Summe der Einzelrisiken ausgewiesen."
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
    formula: "((Jahresertrag - Jahreskosten) / Kapitalisierungszinssatz) + Restwert - Risikokosten",
    note: "Leitet den Ertragswert aus Nettoertrag, Kapitalisierungszins und Restwert ab."
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
    title: "Hybridmodell",
    formula: "Basiswert + SummeAktiverParameter + (JahresCashflow / Kapitalisierungszinssatz) + Restwert - Risikokosten",
    note: "Kombiniert Kosten-, Ertrags- und Risikotreiber in einer kompakten Logik."
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
        title: "Basiskosten nach DIN 276",
        formula: "Gesamtkosten nach DIN 276 = KG100 + KG200 + KG300 + KG400 + KG500 + KG600 + KG700 + KG800",
        note: "Erfasst die reinen DIN-276-Basiskosten ohne gesonderten Risikoaufschlag."
      },
      {
        title: "Gesamtbudget",
        formula: "Projektbudget = Basiskosten + Gesamtrisiko",
        note: "Kombiniert die Basiskosten mit den separat simulierten Risiken zum Projektbudget."
      },
      {
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
        title: "Risikokostenmodell",
        formula: "Gesamtrisiko = Σ Risiko_i",
        note: "Risiken werden separat simuliert und als Summe der Einzelrisiken ausgewiesen."
      },
      {
        title: "Risikowert",
        formula: "Risikowert = Eintrittswahrscheinlichkeit · Schadenshoehe",
        note: "Grundlogik zur Gewichtung einzelner Risiken."
      },
      {
        title: "Inflation / Preissteigerung",
        formula: "Zukunftskosten = Kosten_0 · (1 + i)^n",
        note: "Preisfortschreibung über eine Laufzeit."
      }
    ]
  },
  {
    title: "Ertrag und Wert",
    items: [
      {
        title: "Cashflow-Modell",
        formula: "Cashflow = Einnahmen − Betriebskosten − Finanzierungskosten",
        note: "Darstellung des laufenden Netto-Cashflows."
      },
      {
        title: "Ertragswertverfahren",
        formula: "((Jahresertrag - Jahreskosten) / Kapitalisierungszinssatz) + Restwert - Risikokosten",
        note: "Leitet den Ertragswert aus Nettoertrag, Kapitalisierungszins und Restwert ab."
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
        title: "Immobilienwertmodell",
        formula: "Immobilienwert = Jahresnettomiete · Vervielfaeltiger",
        note: "Klassische Ertragswertlogik mit Multiplikator."
      },
      {
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
        title: "Terminmodell",
        formula: "Gesamttermin = Planung + Vergabe + Bau + Inbetriebnahme",
        note: "Aggregierte Terminlogik für Projektphasen."
      },
      {
        title: "Hybridmodell",
        formula: "Basiswert + SummeAktiverParameter + (JahresCashflow / Kapitalisierungszinssatz) + Restwert - Risikokosten",
        note: "Kombiniert Kosten-, Ertrags- und Risikotreiber in einer kompakten Logik."
      },
      {
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
