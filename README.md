# SMART RISK Monte-Carlo-Simulation

Eine browserbasierte, lokal lauffähige Web-App für probabilistische Risiko- und Szenarioanalysen in der Bau- und Immobilienwirtschaft.

## Kurzbeschreibung

Die Anwendung unterstützt Projektverantwortliche, Bauherren, Investoren und Projektsteuerer bei der Einschätzung von Kosten-, Termin-, CAPEX- und Projektrisiken. Sie simuliert Unsicherheiten als Bandbreitenparameter und Ereignisbausteine per Monte-Carlo-Verfahren und bereitet die Ergebnisse in einer professionellen Management-Oberfläche auf.

## Funktionsumfang

- Dashboard mit Projektübersicht und zentralen Kennzahlen
- Projektstammdaten
- Bewertungsmodell mit fachlichen Formelbausteinen
- Unsicherheiten mit Bandbreitenparametern und Ereignisbausteinen
- Monte-Carlo-Simulation mit 1.000 bis 50.000 Läufen
- Kennzahlen wie Minimum, Maximum, Mittelwert, Median, P10, P50, P80, P90 und P95
- Budgetüberschreitungswahrscheinlichkeit und Risikopuffer-Empfehlung
- Ergebnisanalyse mit Histogramm und kumulativer Verteilung
- Sensitivitätsanalyse mit Rangliste und Tornado-Diagramm
- Szenarienvergleich für Basisszenario, optimistisches und kritisches Szenario
- Automatisch generierter Bericht
- Fachliche Bewertungsmodule mit kontrolliertem Formelgenerator
- Fachliche Formelbibliothek mit Kosten-, Risiko-, Cashflow-, NPV-, ROI- und Immobilienwertmodellen
- Autosave im Browser über `localStorage`
- JSON-Import und JSON-Export
- CSV-Export der Simulationsergebnisse
- Demo-Daten für ein Bauprojekt
- Vollständiges Zurücksetzen aller Daten

## Lokale Nutzung

1. Die Dateien im selben Ordner belassen.
2. `index.html` in einem lokalen Webserver öffnen.
3. Falls du keinen Webserver hast, kannst du zum Beispiel im Projektordner einen einfachen Server starten:

```bash
python3 -m http.server 8000
```

4. Danach die App im Browser unter `http://localhost:8000` öffnen.

## Methodische Hinweise

- Die App nutzt eine Monte-Carlo-Simulation mit zufälligen Ziehungen aus den aktiven Verteilungen.
- Dreiecksverteilung, Gleichverteilung, Normalverteilung und Beta-PERT werden unterstützt.
- Das Ergebnismodell kann zwischen vorgefertigten fachlichen Vorlagen umgeschaltet und innerhalb sicherer Grenzen angepasst werden.
- Zulässige Formeln nutzen freigegebene Formelbausteine, Standardoperatoren und kontrollierte Funktionen.
- Die Oberfläche akzeptiert deutsche Bezeichner wie `Basiswert`, `SummeAktiverParameter`, `Risikokosten`, `wenn`, `mittelwert`, `begrenze` und `potenz`.
- In der UI sprechen wir bewusst von `Formelbausteinen`.
- Beispielhafte Formeln:
  - `Basiswert + SummeAktiverParameter + Risikokosten`
  - `((Jahresertrag - Jahreskosten) / Kapitalisierungszinssatz) + Restwert - Risikokosten`
  - `wenn(Risikokosten > 0, Risikokosten, 0)`
- Ereignisbausteine werden nur bei Eintritt entsprechend ihrer Wahrscheinlichkeit berücksichtigt.
- P80 bedeutet: 80 Prozent der simulierten Werte liegen unterhalb dieses Werts.
- Die Sensitivitätsanalyse basiert auf einer einfachen Korrelationsauswertung der Simulationsergebnisse.

## Grenzen der Simulation

- Das Modell ist nur so gut wie die gepflegten Eingangsdaten.
- Fachliche, vertragliche und technische Plausibilisierung bleibt zwingend erforderlich.
- Die Darstellung aggregiert Wirkungen in einem Managementblick und ersetzt keine detaillierte Fachkalkulation.
- Externe Markt-, Bau- und Vertragsannahmen können sich verändern und müssen projektspezifisch geprüft werden.

## Mögliche Weiterentwicklungen

- Separate Kosten-, Termin- und CAPEX-Modelle mit Korrelationen
- Erweiterte Verteilungsmodelle
- Szenarien mit benutzerdefinierten Annahmen je Parameter
- PDF-Berichtsexport
- Rollen- und Rechtekonzept
- Historisierung von Projektständen
- Vergleich mehrerer Projekte
- Import aus Kalkulationssystemen oder Excel-Dateien

## Dateien

- `index.html`
- `styles.css`
- `app.js`
- `simulation.js`
- `storage.js`
- `export.js`
- `README.md`
