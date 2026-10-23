# Automation Game – Projektplan

Ein 2D-Automatisierungsspiel im Stil von Shapez 1, SandustryShapez und Factorio.
Läuft komplett im Browser (Fokus iPad/Safari), gehostet über **GitHub Pages**,
optionales Backend über **Supabase (Free Tier)**.

---

## 1. Vision und Abgrenzung

**Kernidee:** Rohstoffe abbauen, über Förderbänder transportieren, in Maschinen
verarbeiten/kombinieren und immer komplexere Produkte herstellen. Der Reiz liegt
im Aufbau effizienter, sich selbst versorgender Fabriken.

**Bewusste Entscheidungen:**

- **2D, kein 3D.** Gitterbasiert (Tile-Grid) wie Shapez/Factorio. Das ist auf dem
  iPad im Browser performant und touch-tauglich.
- **Single-Player, lokal-first.** Spielstand lebt zuerst im Browser; Cloud (Supabase)
  ist optional und nur für Sync/Backup/Bestenliste.
- **Offline spielbar.** Die Simulation braucht kein Backend. GitHub Pages liefert nur
  statische Dateien aus.

**Vorbilder und was wir übernehmen:**

| Spiel | Übernommen |
|-------|------------|
| Shapez 1 | Formen schneiden/drehen/stapeln/einfärben, sauberes Gitter, Minimalismus |
| Factorio | Förderbänder, Fließrichtung, Fabrik-Blueprints, Durchsatz-Denken |
| Sandustry | Materialfluss/Physik-Gefühl (optional später, zunächst nicht im MVP) |

---

## 2. Gameplay-Loop (MVP)

1. **Abbauen:** Extraktor auf einer Rohstoff-Ader platzieren -> erzeugt Items.
2. **Transportieren:** Förderbänder legen (platzieren, drehen, Kurven).
3. **Verarbeiten:** Maschinen (Cutter, Rotator, Painter, Combiner) verändern Items.
4. **Abliefern:** Items an ein Ziel ("Hub") liefern -> schaltet nächste Stufe frei.
5. **Skalieren:** Größere Nachfrage -> Spieler muss Durchsatz erhöhen -> mehr Platz,
   mehr Bänder, bessere Layouts.

**Siegbedingung / Progression (MVP):** Eine Reihe von Aufträgen ("liefere X Stück
Form Y"), die nach und nach neue Gebäude und Mechaniken freischalten.

---

## 3. Scope: MVP vs. später

### MVP (erste spielbare Version)

- Endloses Gitter mit Kamera (Pan/Zoom per Touch).
- Gebäude: **Extraktor, Förderband (gerade + Kurve), Hub/Abgabe, Löscher (Trash).**
- 1 Maschinentyp als Proof of Concept: **Cutter** (Form halbieren).
- Items: einfache Formen (Kreis/Quadrat) in einer Farbe.
- Tick-basierte Simulation mit fester Rate.
- Platzieren/Löschen/Drehen per Touch; Bau-Menü unten.
- Spielstand speichern/laden (lokal, IndexedDB).

### Ausbau nach MVP

- Weitere Maschinen: Rotator, Painter (mit Farben), Combiner/Stacker, Mixer (Farben mischen).
- Verteiler/Zusammenführer (Splitter/Merger), Untergrund-Bänder, Tunnel.
- Mehrere Band-Geschwindigkeiten/Tiers.
- Auftrags-/Freischalt-System mit Fortschrittsbaum.
- Blueprints (Bereich kopieren/einfügen).
- Statistiken (Durchsatz pro Minute).

### Optional / langfristig

- Supabase: Cloud-Save-Sync, Account-Login, Bestenliste.
- Soft-Body/Sand-Physik-Elemente (Sandustry-Gefühl) – technisch anspruchsvoll, separat prüfen.
- Sound, Partikel, Themes.

---

## 4. Technische Architektur

### Frontend-Stack (Empfehlung)

- **Sprache:** TypeScript
- **Build:** `Vite` (erzeugt rein statische Dateien -> ideal für GitHub Pages)
- **Rendering:** `Three.js` (WebGL, 3D) seit dem 3D-Umbau, vorher `PixiJS v8` (2D).
  Prozedurale Low-Poly-Modelle, Bänder und Items als `InstancedMesh`, damit auch
  tausende bewegte Items auf dem iPad flüssig bleiben.
- **State:** eigener, schlanker Simulations-Kern (kein schweres Framework nötig).
  Optional `zustand` nur für UI-State.
- **UI-Overlay:** schlichtes HTML/CSS über dem Canvas (Bau-Menü, Dialoge).

### Wichtiges Architekturprinzip: Simulation vom Rendering trennen

- **Simulation:** reine Datenlogik, läuft auf festem Tick (z. B. 20 Ticks/Sekunde),
  unabhängig von der Bildwiederholrate. Deterministisch, damit Spielstände reproduzierbar
  und später Netzwerk/Replay möglich sind.
- **Rendering:** zeichnet den aktuellen Zustand bei 60 FPS, interpoliert Item-Positionen
  zwischen Ticks für flüssige Bewegung.

```
[ Input (Touch) ] -> [ Command Queue ] -> [ Simulation (fixed tick) ] -> [ World State ]
                                                                              |
                                                                              v
                                                     [ Renderer (Three.js, 60 FPS) ]
```

### Datenmodell (Kern, vereinfacht)

```ts
type Vec2 = { x: number; y: number };

type BuildingType = "extractor" | "belt" | "cutter" | "hub" | "trash";

interface Building {
  id: number;
  type: BuildingType;
  pos: Vec2;          // Gitterkoordinate
  rotation: 0 | 90 | 180 | 270;
}

interface Item {
  shape: "circle" | "square";
  color: "uncolored" | "red" | "green" | "blue";
}

interface WorldState {
  tick: number;
  buildings: Map<number, Building>;
  grid: Map<string, number>;   // "x,y" -> buildingId (Belegung)
  itemsOnBelts: BeltItem[];     // Items mit Fortschritt entlang eines Bandes
}
```

### Speichern/Laden

- **Primär lokal:** Welt-Zustand als JSON serialisieren, in **IndexedDB** ablegen
  (localStorage ist für große Fabriken zu klein/langsam). Auto-Save alle paar Sekunden.
- **Export/Import:** Spielstand als Datei oder Code-String, damit man ihn teilen kann –
  funktioniert ganz ohne Backend.
- **Versionierung:** Save-Format bekommt eine `version`-Nummer plus Migrationsfunktionen,
  damit alte Stände nach Updates nicht brechen.

---

## 5. Supabase – wann und wofür

Supabase ist **nicht** für die Simulation nötig und wird erst nach dem MVP relevant.
Free Tier reicht für ein Hobby-Projekt locker.

**Sinnvolle Backend-Features:**

| Feature | Supabase-Baustein |
|---------|-------------------|
| Login (optional) | Supabase Auth (E-Mail/Magic Link oder OAuth) |
| Cloud-Save-Sync über Geräte | Postgres-Tabelle `saves` + Row Level Security |
| Bestenliste / geteilte Fabriken | Tabelle `leaderboard` / `shared_blueprints` |

**Grober Tabellenentwurf:**

```sql
-- Jeder Nutzer sieht/ändert nur eigene Saves (RLS!)
create table saves (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) not null,
  slot        int not null,
  data        jsonb not null,        -- serialisierter Welt-Zustand
  updated_at  timestamptz default now(),
  unique (user_id, slot)
);

alter table saves enable row level security;
create policy "own saves" on saves
  for all using (auth.uid() = user_id);
```

**Wichtig für GitHub Pages:** Im Client nur den **anon/publishable Key** verwenden
(ist für Browser gedacht). Echte Absicherung passiert über **Row Level Security**,
nicht über Geheimhaltung des Keys. Keine Service-Keys ins Frontend.

**Free-Tier-Grenzen im Blick behalten:** begrenzte DB-Größe und Pausierung bei
Inaktivität. Deshalb: Saves komprimieren, nicht bei jedem Tick hochladen, sondern
debounced (z. B. alle 30–60 s oder bei App-Schließen).

---

## 6. Hosting: GitHub Pages

- `Vite`-Build erzeugt statische Dateien nach `dist/`.
- Deployment automatisiert über **GitHub Actions** (`actions/deploy-pages`).
- Da GitHub Pages im Unterpfad `/<repo>/` liegt, muss in `vite.config.ts` die `base`
  gesetzt werden:

```ts
// vite.config.ts
export default defineConfig({
  base: "/automation/",   // = Repo-Name
});
```

- Supabase-URL und anon-Key kommen über Build-Umgebungsvariablen (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`) bzw. als GitHub-Repository-Secrets in die Action.

---

## 7. iPad-/Touch-Besonderheiten

- **Eingabe:** Pan (ein Finger ziehen), Zoom (Pinch), Platzieren (Tippen), "Malen"
  von Bändern (Finger gedrückt ziehen). Klare Trennung zwischen Kamera-Bewegung und
  Bauen (Bau-Modus-Umschalter).
- **Touch-Ziele groß genug** (mind. ~44px), weil Finger ungenauer als Maus.
- **Performance:** WebGL-Batching, Objekt-Pooling für Items, nur sichtbaren Bereich
  zeichnen (Culling). Ziel: flüssig auch bei großen Fabriken.
- **Safari-Eigenheiten:** Doppel-Tipp-Zoom und Pull-to-Refresh unterbinden
  (`touch-action: none`, `user-scalable=no`), Viewport-Meta korrekt setzen.
- **PWA (später):** Manifest + Service Worker, damit das Spiel offline läuft und
  sich zum Homescreen hinzufügen lässt.

---

## 8. Vorgeschlagene Projektstruktur

```
automation/
  index.html
  vite.config.ts
  src/
    main.ts                # Einstiegspunkt
    sim/                   # Simulation (frameworkfrei, testbar)
      world.ts
      tick.ts
      buildings/
      items.ts
    render3d/              # Three.js-Rendering
      scene-view.ts        # Szene, Licht, Gebaeude, Items
      models.ts            # prozedurale Low-Poly-Modelle
      camera-rig.ts        # Orbit-Kamera, Bildschirm -> Gitterfeld
      terrain.ts           # Boden und Erz in Chunks
    input/                 # Touch-/Maus-Eingabe
      controls.ts
    ui/                    # HTML/CSS-Overlay (Bau-Menü etc.)
    save/                  # Serialisierung, IndexedDB, Migration
    net/                   # Supabase-Anbindung (optional, spät)
  docs/
    PLAN.md                # dieses Dokument
  .github/workflows/
    deploy.yml             # Build + Deploy auf GitHub Pages
```

---

## 9. Roadmap / Meilensteine

| Phase | Ziel | Ergebnis |
|-------|------|----------|
| **M0 – Setup** | Vite + TS + PixiJS, leeres Canvas, GitHub-Pages-Deploy | Live-URL zeigt gerendertes Gitter |
| **M1 – Gitter & Kamera** | Tile-Grid, Pan/Zoom per Touch | Man kann sich auf dem iPad bewegen |
| **M2 – Bauen** | Gebäude platzieren/löschen/drehen, Bau-Menü | Extraktor + Band + Hub platzierbar |
| **M3 – Simulation** | Fixed-Tick, Items laufen über Bänder zum Hub | Erster funktionierender Materialfluss |
| **M4 – Verarbeitung** | Cutter + Items mit Formen; erster Auftrag | Erster echter Gameplay-Loop |
| **M5 – Speichern** | IndexedDB Auto-Save, Export/Import | Fortschritt bleibt erhalten |
| **M6 – Ausbau** | Weitere Maschinen, Splitter/Merger, Freischaltbaum | Spielt sich wie ein richtiges Spiel |
| **M7 – Supabase (opt.)** | Login + Cloud-Save-Sync + Bestenliste | Geräteübergreifend, teilbar |

Empfehlung: **M0–M5 zuerst komplett lokal** (kein Backend), erst danach Supabase.

---

## 10. Hauptrisiken

- **Performance auf dem iPad** bei großen Fabriken -> früh mit vielen Items testen,
  Rendering von Simulation trennen, Culling + Pooling von Anfang an.
- **Scope-Creep** -> striktes MVP, Features erst nach spielbarem Kern.
- **Save-Format-Brüche** -> von Beginn an Versionierung + Migrationen.
- **Touch-Bedienung** ist schwerer als Maus -> früh auf echtem iPad testen.

---

## 11. Getroffene Entscheidungen

1. **Spielkern:** Factorio-Linie – Rohstoffe über Maschinen-**Rezepte** zu
   Zwischen- und Endprodukten verarbeiten.
2. **Grafikstil:** minimalistisch-geometrisch (schlichte Formen/Farben).
3. **Supabase:** erst nach dem komplett lokal spielbaren MVP (M0–M5).
4. **M0 gestartet:** Vite + TypeScript + PixiJS, gerendertes Gitter mit Touch-Pan/Zoom,
   GitHub-Pages-Deploy-Workflow.

### Status M0

- [x] Projektgerüst (`Vite`, `TypeScript`, `PixiJS v8`)
- [x] Unendliches Gitter mit Culling, Ursprungs-Zelle markiert
- [x] Kamera + Touch-Steuerung (Pan, Pinch-Zoom, Mausrad)
- [x] Build grün (`npm run build`)
- [x] Deploy-Workflow (`.github/workflows/deploy.yml`)
- [x] GitHub Pages aktiviert (Repo öffentlich) + nach `main` gemergt

### Status M1–M3 (+ Teile von M4)

- [x] Simulation mit festem Takt (`20 Ticks/s`), frei von Render-Code, mit `vitest`-Tests
- [x] Unendliche Welt mit Erzvorkommen (Eisen, Kupfer), Start-Vorkommen neben dem Hub
- [x] Gebäude: Förderband, Bohrer, Schmelze (Rezept automatisch), Montierer (Rezept wählbar), Hub
- [x] Rezepte: Eisen-/Kupferplatte, Zahnrad, Kupferdraht, Schaltkreis
- [x] Bänder: Mindestabstand, Stau, automatische Kurven, flüssige Interpolation zwischen Ticks
- [x] Bauen per Touch: Werkzeug wählen, tippen = bauen/drehen, ziehen = Bänder malen,
      zwei Finger = verschieben/zoomen; Maus + Tastatur (`1`–`7`, `R`, `Esc`)
- [x] Info-Panel (Hand-Werkzeug antippen): Rezept wählen, drehen, abreißen
- [x] Auftrags-Kette im HUD (5 Aufträge)
- [x] CI-Workflow für Pull Requests (`npm test` + `npm run build`)

**Steuerung (Kurzfassung):**

| Aktion | Touch | Maus/Tastatur |
|--------|-------|---------------|
| Bauen | Werkzeug wählen, Feld antippen | Linksklick |
| Bänder legen | Mit dem Finger ziehen | Linke Taste ziehen |
| Gebäude drehen | Gleiches Werkzeug, Gebäude antippen | `R` vor dem Bauen |
| Verschieben | Zwei Finger (oder Hand-Werkzeug) | Rechte Taste ziehen |
| Zoomen | Pinch | Mausrad |
| Kamera drehen | Zwei Finger verdrehen | `Q` / `E` |
| Rezept wählen | Hand, Montierer antippen | dito |

### Status M5 – Speichern

- [x] Versioniertes Save-Format (`src/sim/save.ts`, `SAVE_VERSION`, Migrations-Hook),
      speichert auch Items auf Bändern und Maschinen-Zustand; Tests prüfen, dass ein
      geladener Stand exakt gleich weitersimuliert
- [x] Auto-Save in IndexedDB alle 15 s und beim Verlassen/Ausblenden der Seite,
      plus synchrone Notfall-Kopie in `localStorage` (beim Neuladen bleibt für IndexedDB keine Zeit)
- [x] Laden beim Start; kaputte Stände werden übersprungen statt abzustürzen
- [x] Menü: Export als Code (`AUTO1:` + komprimiertes JSON in Base64) oder als Datei,
      Import per Code oder Datei, neues Spiel

### Status 3D-Umbau

- [x] Darstellung von PixiJS (2D) auf Three.js (3D) umgestellt; Simulation, Editor,
      UI und Spielstände bleiben unverändert und kompatibel
- [x] Low-Poly-Modelle aus Code (keine Asset-Dateien): Bänder mit Kurven und
      laufender Textur, Bohrer mit drehendem Kopf, Schmelze mit Glut und Rauch,
      Montierer mit Greifarm und schwebendem Rezept-Symbol, Hub mit Ring und Leuchtfeuer
- [x] Orbit-Kamera mit Schatten und Nebel; Pinch zoomt, Verdrehen dreht, Neigung
      passt sich dem Zoom an
- [ ] Offen: Bau-Vorschau (Geist-Modell), Fortschrittsanzeigen über Maschinen,
      Performance-Test auf dem iPad mit großer Fabrik

### Status M6 – Hub-Stufen, Strom und 8-Stunden-Progression

Der Hub hat ein Lager. Abgelieferte Items landen dort und werden für Hub-Upgrades
und neue Gebäude ausgegeben (Abreißen erstattet). Logik in `src/sim/progression.ts`,
Spielstand `SAVE_VERSION = 3` (v1 und v2 werden migriert). Ausführlicher Plan:
Projektordner `plaene/progression-8h.md`.

| Stufe | Name | Kosten | Schaltet frei |
|-------|------|--------|---------------|
| 0 | Start | - | Band, Bohrer, Schmelze, Hub |
| 1 | Fertigung | 20 Eisenplatte, 10 Kupferplatte | Montierer, Zahnrad, Kupferdraht |
| 2 | Logistik | 50 Zahnrad, 100 Draht, 50 Eisenplatte | Verteiler, Zusammenführer, Tunnel, Lagerkiste, Schaltkreis |
| 3 | Energie | 100 Schaltkreis, 200 Eisenplatte, 100 Kupferplatte | Kohlekraftwerk, Sortierer, Strom |
| 4 | Stahl | 200 Schaltkreis, 300 Zahnrad | Gießerei, Stahl, Band Mk2 |
| 5 | Bauwesen | 400 Stahl, 400 Schaltkreis | Bohrer Mk2, Beton, Verstärkte Platte, Rotor |
| 6 | Maschinenbau | 200 Beton, 200 Verst. Platte, 150 Rotor | Fertigungsanlage, Motor, Steuereinheit, Schwerer Rahmen |
| 7 | Öl | 100 Motor, 100 Steuereinheit, 50 Schwerer Rahmen | Ölpumpe, Raffinerie, Treibstoffkraftwerk, Kunststoff, Gummi, Treibstoff |
| 8 | Elektronik | 400 Kunststoff, 400 Gummi, 300 Steuereinheit | Band Mk3, Silizium, Computer |
| 9 | Chemie | 100 Computer, 150 Schwerer Rahmen | Bohrer Mk3, Batterie |
| 10 | Leichtbau | 500 Batterie, 400 Computer | Aluminium, Alu-Gehäuse, Turbomotor, Supercomputer |
| 11 | Raumfrachter | 50 Turbomotor, 50 Supercomputer, 300 Schwerer Rahmen | Abschluss |

- [x] Rohstoffe: Eisen, Kupfer, Kohle nahe am Start; Stein ab 20, Quarz ab 35,
      Rohöl ab 40 (nur Ölpumpe), Schwefel ab 45, Bauxit ab 60 Feldern Abstand
- [x] Strom ab Stufe 3: global, Hub liefert 60 MW, Kohle- (75 MW) und
      Treibstoffkraftwerk (150 MW); bei Mangel laufen Maschinen anteilig langsamer
- [x] Band Mk2/Mk3 (2x/4x so schnell, als Band mit `level`), Bohrer Mk2/Mk3 (2x/4x)
- [x] Lagerkiste (200 Items), Sortierer (Filter nach vorne, Rest zur Seite)
- [x] Tests prüfen, dass jede Stufe mit den vorigen bezahlbar ist und teurer wird
- [ ] Offen: eigene Modelle für die späten Gebäude und Items (Modell-Thread),
      Stromanzeige und Sortierer-Auswahl in der UI (UI-Thread)

### Status Landschaft und Welt

- `src/render3d/terrain.ts`: Boden mit weichen Biomen (Wiese, Steppe, Gestein), Raster im
  Shader, Wolkenschatten. Erz-Vorkommen mit eigener Form je Erz (Kristalle, Brocken,
  Platten, Oelquelle), auch fuer die kommenden Erze. Deko (Gras, Bueschel, Steine, Baeume,
  Schilf, Leuchtpflanzen) wird pro Chunk zu einem Mesh verschmolzen und unter Gebaeuden
  ausgeblendet; weit entfernte Chunks lassen Kleinteile weg.
- Seen: `waterAt` in `src/sim/terrain.ts`, erst ab 20 Feldern vom Start, nie auf Erz.
  Der Spieler kann dort nicht bauen (Tunnel fuehren darunter durch); alte Spielstaende laden weiter.
- `src/render3d/environment.ts`: Licht, Dunst, Tag/Nacht (12 min Tag, 4 min Nacht Spielzeit,
  folgt `world.tick`), nachts leuchtendes Raster im bebauten Bereich und Gluehwuermchen.
  `?zeit=tag`, `?zeit=nacht` oder `?zeit=0..1` setzt die Tageszeit fest.

### Nächster Schritt

Band-Geschwindigkeitsstufen, Blueprints, Statistiken.
