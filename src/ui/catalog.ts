import type { Tool } from "../game/editor";
import { TIERS, buildingTier } from "../sim/progression";

// Namen, Beschreibungen und Gruppen der Werkzeuge. Bewusst Partial mit
// Fallback auf die id: neue Gebaeude aus der Simulation erscheinen auch
// ohne Eintrag hier (dann eben mit technischem Namen).

export const TOOL_NAMES: Partial<Record<string, string>> = {
  hand: "Hand",
  delete: "Abriss",
  belt: "Förderband",
  extractor: "Bohrer",
  smelter: "Schmelze",
  assembler: "Montierer",
  hub: "Hub",
  splitter: "Verteiler",
  merger: "Zusammenführer",
  tunnel: "Tunnel",
  foundry: "Gießerei",
  extractor_mk2: "Bohrer Mk2",
  extractor_mk3: "Bohrer Mk3",
  belt_mk2: "Band Mk2",
  belt_mk3: "Band Mk3",
  storage: "Lagerkiste",
  sorter: "Sortierer",
  generator_coal: "Kohlekraftwerk",
  generator_fuel: "Treibstoffkraftwerk",
  pump: "Ölpumpe",
  refinery: "Raffinerie",
  manufacturer: "Fertigungsanlage",
};

/** Kurzname fuer die Werkzeugleiste (sonst der volle Name). */
const SHORT_NAMES: Partial<Record<string, string>> = {
  belt: "Band",
  assembler: "Montage",
  merger: "Zusammenf.",
  generator_coal: "Kohle-KW",
  generator_fuel: "Treibst.-KW",
  manufacturer: "Fert.-Anlage",
};

export const TOOL_INFO: Partial<Record<string, string>> = {
  hand: "Gebäude antippen für Details, ziehen verschiebt die Ansicht.",
  delete: "Gebäude abreißen. Baukosten gehen zurück ins Hub-Lager.",
  belt: "Transportiert Items. Mit dem Finger ziehen, Kurven entstehen von selbst.",
  extractor: "Fördert Erz oder Kohle. Nur auf Rohstofffeldern.",
  smelter: "Schmilzt Erz zu Platten und stellt sich selbst auf das Erz ein.",
  assembler: "Baut Bauteile nach gewähltem Rezept.",
  hub: "Nimmt Lieferungen an. Das Lager bezahlt Gebäude und Stufen.",
  splitter: "Verteilt Items von hinten abwechselnd nach vorne, links und rechts.",
  merger: "Führt Items von hinten, links und rechts nach vorne zusammen.",
  tunnel: "Führt ein Band unter bis zu 4 Feldern hindurch. Eingang und Ausgang setzen.",
  foundry: "Gießt Stahl aus Eisenerz und Kohle.",
  extractor_mk2: "Fördert doppelt so schnell. Auf einen alten Bohrer setzen tauscht ihn aus.",
  extractor_mk3: "Fördert viermal so schnell wie der einfache Bohrer.",
  belt_mk2: "Doppelt so schnell. Über alte Bänder ziehen rüstet sie auf.",
  belt_mk3: "Viermal so schnell wie das einfache Band. Über alte Bänder ziehen rüstet sie auf.",
  storage: "Puffert bis zu 200 Items und gibt sie nach vorne wieder aus.",
  sorter: "Das gewählte Item geht nach vorne, alles andere nach links und rechts.",
  generator_coal: "Verbrennt Kohle und liefert 75 MW Strom.",
  generator_fuel: "Verbrennt Treibstoff und liefert 150 MW Strom.",
  pump: "Fördert Rohöl. Nur auf Ölquellen.",
  refinery: "Verarbeitet Rohöl zu Kunststoff, Gummi und Treibstoff.",
  manufacturer: "Große Fertigung für Rezepte mit bis zu vier Zutaten.",
};

export const TOOL_KEYS: Partial<Record<string, string>> = {
  hand: "1",
  belt: "2",
  extractor: "3",
  smelter: "4",
  assembler: "5",
  hub: "6",
  splitter: "7",
  merger: "8",
  tunnel: "9",
  foundry: "0",
  extractor_mk2: "b",
  delete: "x",
};

export type ToolGroup = "transport" | "mining" | "production" | "power" | "base";

export const GROUP_LABELS: Record<ToolGroup, string> = {
  transport: "Transport",
  mining: "Abbau",
  production: "Fertigung",
  power: "Energie",
  base: "Basis",
};

const GROUP_OF: Partial<Record<string, ToolGroup>> = {
  belt: "transport",
  splitter: "transport",
  merger: "transport",
  tunnel: "transport",
  extractor: "mining",
  extractor_mk2: "mining",
  extractor_mk3: "mining",
  pump: "mining",
  storage: "transport",
  sorter: "transport",
  generator_coal: "power",
  generator_fuel: "power",
  hub: "base",
};

export function toolName(t: string): string {
  return TOOL_NAMES[t] ?? t;
}

export function toolShortName(t: string): string {
  return SHORT_NAMES[t] ?? toolName(t);
}

export function toolGroup(t: string): ToolGroup {
  return GROUP_OF[t] ?? (t.includes("belt") ? "transport" : t.includes("extractor") ? "mining" : t.includes("generator") ? "power" : "production");
}

/** Alle baubaren Werkzeuge in der Reihenfolge der Stufen. */
export function buildTools(): Tool[] {
  const seen = new Set<Tool>();
  for (const t of TIERS) for (const b of t.buildings) seen.add(b as Tool);
  return [...seen];
}

export function toolTier(t: Tool): number {
  return t === "hand" || t === "delete" ? 0 : buildingTier(t);
}

/** Bild fuer ein Werkzeug; Bandstufen teilen sich das Bild des Bandes. */
export function thumbId(t: string): string {
  return t.startsWith("belt") ? "belt" : t;
}
