# Feature Specification: Würfel-Set Presets

## Übersicht
Vorgefertigte Würfel-Set-Presets in der Host-Steuerung, die generische Sets und RPG-System-Pakete anbieten. Presets werden im "Würfel-Sets bearbeiten"-Bereich als "Preset laden" Button integriert.

## Ziele
- Host kann schnell vordefinierte Sets laden statt alles manuell zu konfigurieren
- Unterstützung für die gängigsten RPG-Systeme (D&D 5e, DSA, Savage Worlds)
- Generische Einzel-Sets für system-unabhängiges Spielen

## Scope
### Inkludiert
- Generische Einzel-Presets: 1W4, 1W6, 2W6, 1W8, 1W10, 1W12, 1W20, 1W100 (W10+W10)
- RPG-System-Pakete (fügen mehrere Sets auf einmal hinzu):
  - D&D 5e: Angriff (1W20), Schaden Nahkampf (1W8), Schaden Fernkampf (1W6), Initiative (1W20), Rettungswurf (1W20), Fähigkeitscheck (1W20), Sneak Attack (2W6)
  - DSA: Eigenschaftsprobe (3W20), Schadenswurf (1W6), Initiative (1W6), Bestätigungswurf (1W20)
  - Savage Worlds: Trait Check (1W6+1W8), Damage (1W6), Wild Die Check (1W6+1W4), Bennies (1W6)
- Ersetzen mit Bestätigungsdialog ("Bestehende Sets ersetzen?")
- UI: "Preset laden ▼" Button mit Dropdown im Set-Editor-Bereich

### Exkludiert
- Eigene Presets erstellen/speichern
- Presets bearbeiten
- Import/Export von Presets

## Technische Anforderungen
- Preset-Definitionen als TypeScript-Konstante in `src/lib/constants.ts` oder `src/lib/presets.ts`
- Integration in `HostPanel.tsx` — Dropdown unterhalb von "Neues Set erstellen"
- Bei Paket-Presets: Bestätigungsdialog vor dem Ersetzen bestehender Sets

## UI/UX Anforderungen
- "Preset laden ▼" Button neben "Neues Set erstellen"
- Dropdown mit zwei Kategorien: "Generisch" und "RPG-Systeme"
- Generische Sets: Direkt als einzelne Optionen
- RPG-Pakete: Mit Beschreibung der enthaltenen Sets
- Bestätigungsdialog bei Paketen wenn bereits Sets existieren
