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
- **Rendering:** `PixiJS v8` (WebGL). Begründung: Bei einem Automatisierungsspiel
  sind schnell tausende bewegte Items auf dem Schirm. WebGL-Batching schafft das auf
  dem iPad flüssig; reines Canvas-2D wird dort zu langsam.
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
                                                     [ Renderer (PixiJS, 60 FPS) ]
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
    render/                # PixiJS-Rendering
      renderer.ts
      sprites.ts
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
- [ ] GitHub Pages aktivieren (Repo-Settings) + nach `main` mergen

### Nächster Schritt: M1/M3

Datenmodell für rezeptbasierte Gebäude (Extraktor, Band, Maschine mit Rezept, Hub),
Fixed-Tick-Simulation und Item-Fluss über Bänder.
