# Feature Specification: Multiplayer 3D Dice Room

## Ubersicht
Eine Web-Applikation bei der ein Host einen Raum erstellt und per Einladungscode (6-stellig, z.B. ABC123) andere Teilnehmer einladen kann. Im Raum sehen alle Teilnehmer eine gemeinsame 3D-Wurfelschale, in der jeder Spieler unabhangig Wurfel werfen kann. Die Wurfel rollen physikalisch realistisch und kollidieren miteinander.

## Tech-Stack
- **Frontend:** Next.js + React + Three.js (react-three-fiber)
- **3D-Physik:** cannon-es oder rapier3d (serverseitig)
- **Echtzeit:** Socket.io (WebSocket)
- **Server:** Custom Node.js Server (Next.js Custom Server mit WebSocket-Integration)
- **Deployment:** Plesk-Server (spater)
- **Styling:** Tailwind CSS / CSS Modules mit RPG/Fantasy-Asthetik

## Kernfeatures

### 1. Raum-Management
- **Raum erstellen:** Host erstellt einen Raum und erhalt einen 6-stelligen alphanumerischen Einladungscode
- **Beitreten:** Teilnehmer geben Code auf der Startseite ein oder nutzen direkten Link `/room/ABC123`
- **Max. Teilnehmer:** 8 Spieler pro Raum
- **Persistenz:** Nur im Speicher (kein Datenbank-Backend)
- **Host-Ubergabe:** Wenn Host disconnected, wird nachster Spieler automatisch Host
- **Raum-Kontrolle:** Host kann Raum sperren, Spieler kicken, Wurfel-History loschen/zurucksetzen

### 2. Spieler-Identitat
- **Beitrittsdialog:** Name eingeben + Farbe aus Palette wahlen
- **Farbpalette:** 8-12 vordefinierte Farben, bereits vergebene sind gesperrt
- **Wurfel-Farbe:** Wurfel jedes Spielers ubernehmen seine gewahlte Farbe
- **Auto-Reconnect:** Bei Verbindungsverlust automatischer Reconnect mit Zustandswiederherstellung (Name, Farbe, Position)

### 3. Wurfel-System
- **Wurfeltypen:** RPG-Set — D4, D6, D8, D10, D12, D20
- **Wurfel-Sets:** Host definiert benannte Sets (z.B. "Angriff: 2W6+1W8", "Initiative: 1W20")
- **Live-Konfiguration:** Host kann Sets jederzeit andern, hinzufugen, loschen — Anderungen sofort fur alle sichtbar
- **Spieler wahlen** aus den vom Host definierten Sets zum Wurfeln

### 4. Wurf-Mechanik
- **Ausloser:** Drag & Release Geste
  - Richtung und Geschwindigkeit der Drag-Geste beeinflussen Wurfrichtung und -starke
  - Touch-Support fur Mobile (responsive von Anfang an)
- **Gleichzeitiges Wurfeln:** Mehrere Spieler konnen gleichzeitig wurfeln
- **Kollision:** Wurfel verschiedener Spieler kollidieren in der gemeinsamen Schale
- **Physik:** Serverseitig berechnet — Server bestimmt Physik-Simulation, Ergebnis und Animation-Daten werden an alle Clients gesendet

### 5. 3D-Darstellung
- **Wurfelschale:** Runde oder eckige Wurfelschale/Tray als zentrales 3D-Element
- **Wurfel-Geometrien:** Korrekte polyedrische Geometrien fur D4 (Tetraeder), D6 (Kubus), D8 (Oktaeder), D10, D12 (Dodekaeder), D20 (Ikosaeder)
- **Spielerfarben:** Wurfel tragen die individuelle Farbe des werfenden Spielers
- **Sound-Effekte:** Realistische Wurfel-Sounds (Klackern, Rollen), individuell stummschaltbar per Toggle

### 6. Ergebnis-Anzeige
- **3D:** Ergebnis auf dem Wurfel direkt ablesbar
- **Teilnehmerliste:** Neben jedem Spielernamen wird das letzte Wurfel-Ergebnis mit Wurfeltyp angezeigt
- **History-Log:** Chronologisches Log aller Wurfe (Spieler, Wurfeltyp, Ergebnis) + einfache Statistiken (Summen, Durchschnitte, Haufigkeiten)

### 7. UI-Layout
- **Desktop:** 3D-Wurfelschale zentral, rechts Sidebar mit Teilnehmerliste, Wurfel-Set-Auswahl und History-Log
- **Mobile:** Responsive Anpassung (Split View oder angepasstes Layout)
- **Design:** RPG/Fantasy-Stil mit Dark/Light Mode Toggle

### 8. Landing Page
- Erklarung der App
- "Raum erstellen" Button (CTA)
- "Raum beitreten" mit Code-Eingabe
- RPG/Fantasy-Asthetik passend zum Rest der App

## Technische Architektur

### Server (Node.js Custom Server)
```
- Next.js SSR/SSG fur statische Seiten
- Socket.io Server fur Echtzeit-Kommunikation
- Physik-Engine (cannon-es/rapier) fur serverseitige Wurfel-Simulation
- Room-Manager (In-Memory Map)
  - Raum erstellen/loschen
  - Spieler verwalten (join/leave/kick)
  - Host-Ubergabe-Logik
  - Wurfel-Set Konfiguration
- Reconnect-Handler (Session-Token basiert)
```

### Client (Next.js + Three.js)
```
- Landing Page (/)
- Raum-Ansicht (/room/[code])
  - Three.js Canvas mit Wurfelschale
  - Drag & Release Handler (Mouse + Touch)
  - Socket.io Client fur Echtzeit-Updates
  - Sidebar: Teilnehmer, Sets, History
- Beitritts-Dialog (Name + Farbe)
- Host-Panel (Set-Konfiguration, Raum-Kontrolle)
```

### Echtzeit-Events (Socket.io)
```
Client -> Server:
  - room:create
  - room:join { code, name, color }
  - room:lock / room:kick
  - dice:throw { setId, gesture: { direction, force } }
  - sets:update { sets }

Server -> Client:
  - room:state { players, sets, history }
  - player:joined / player:left
  - dice:physics { frames[] } // Physik-Simulationsdaten
  - dice:result { playerId, setId, results[] }
  - sets:changed { sets }
  - host:changed { newHostId }
```

## Scope

### Inkludiert (MVP)
- Landing Page mit RPG-Stil
- Raum erstellen/beitreten per Code
- Spieler mit Name + Farbe
- Host definiert Wurfel-Sets (D4-D20)
- Drag & Release Wurfeln mit Physik
- 3D-Wurfelschale mit kollidierenden Wurfeln
- Teilnehmerliste mit Ergebnissen
- History-Log mit Statistiken
- Sound-Effekte mit Toggle
- Dark/Light Mode
- Responsive Design (Desktop + Mobile)
- Auto-Reconnect
- Host-Kontrolle (Sperren, Kicken, Reset)
- Host-Ubergabe

### Exkludiert (Spater)
- Datenbank-Persistenz / Raum-History uber Sessions hinweg
- Benutzerkonten / Login
- Custom Wurfel (uber D4-D20 hinaus)
- Chat-Funktion
- Wurfel-Animationen anpassen (Skins, Materialien)
- QR-Code fur Einladungen
- Spectator-Modus

## Edge Cases & Error Handling
- **Alle Spieler disconnecten:** Raum wird nach Timeout (z.B. 5 Min) geloscht
- **Host disconnected:** Automatische Ubergabe an nachsten Spieler (nach Join-Reihenfolge)
- **Gleichzeitige Wurfe:** Server queued Physik-Simulationen oder berechnet parallel mit Kollisionen
- **Farbe bereits vergeben:** UI zeigt Farbe als deaktiviert, Spieler muss andere wahlen
- **Raum voll (8 Spieler):** Fehlermeldung beim Beitrittsversuch
- **Ungultiger Raum-Code:** Fehlermeldung mit Hinweis
- **Reconnect fehlgeschlagen:** Fallback auf erneuten Beitritt mit gespeichertem Namen/Farbe (falls Slot noch frei)

## Offene Fragen
- Exakte Physik-Engine Wahl: cannon-es vs rapier3d (Performance-Vergleich nötig)
- Wie detailliert sollen Physik-Daten an Clients gestreamt werden (jeden Frame vs. Keyframes)?
- Soll die Wurfelschale eine feste Größe haben oder sich an die Anzahl der Wurfel anpassen?

## Nächste Schritte
1. Projekt-Setup (Next.js + Three.js + Socket.io)
2. Server: Room-Manager + Socket.io Events
3. 3D: Wurfelschale + Wurfel-Geometrien
4. Physik: Serverseitige Simulation
5. Client: Drag & Release + Physik-Rendering
6. UI: Sidebar, History, Host-Panel
7. Landing Page
8. Sound-Effekte
9. Responsive Design + Touch-Support
10. Polish: Dark/Light Mode, RPG-Styling
