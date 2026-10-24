import type { ItemId } from "./items";
import type { BuildId } from "./progression";
import type { ItemStack } from "./recipes";

/**
 * Freier Forschungsbaum neben den Hub-Stufen. Die Stufen bleiben das Rueckgrat
 * (sie schalten alles frei, was fuer die naechste Stufe noetig ist); die
 * Forschung bringt alles Optionale: Logistik-Extras, schnellere Bohrer und
 * Baender, Boni und alternative Rezepte. Was zuerst kommt, entscheidet der
 * Spieler. Ein Knoten wird ab Hub-Stufe `tier` sichtbar und braucht die
 * Knoten in `requires`.
 */
export interface ResearchNode {
  id: string;
  name: string;
  /** Kurz, was der Knoten bringt (fuer Boni ohne Gebaeude oder Rezept). */
  text?: string;
  /** Mindest-Hub-Stufe. */
  tier: number;
  requires: string[];
  cost: ItemStack[];
  buildings: BuildId[];
  recipes: string[];
  bonus?: Partial<Bonus>;
  /**
   * Hub-Stufe, die den Inhalt vor dem Forschungsbaum freigeschaltet hat.
   * Alte Spielstaende ab dieser Stufe bekommen den Knoten geschenkt.
   */
  legacyTier?: number;
}

/** Summierbare Boni aus der Forschung. */
export interface Bonus {
  /** Zusaetzliche Leistung des Hubs in MW. */
  hubPower: number;
  /** Zusaetzliches Bohrtempo (0.25 = 25 % schneller). */
  extractSpeed: number;
}

const s = (item: ItemId, count: number): ItemStack => ({ item, count });

export const RESEARCH: readonly ResearchNode[] = [
  // Stufe 1
  {
    id: "storage",
    name: "Lagertechnik",
    tier: 1,
    requires: [],
    cost: [s("iron_plate", 40), s("gear", 10)],
    buildings: ["storage"],
    recipes: [],
    legacyTier: 2,
  },
  {
    id: "fine_wire",
    name: "Feiner Draht",
    tier: 1,
    requires: [],
    cost: [s("wire", 40), s("copper_plate", 30)],
    buildings: [],
    recipes: ["alt_fine_wire"],
  },
  // Stufe 2
  {
    id: "tunnel",
    name: "Tunnelbau",
    tier: 2,
    requires: [],
    cost: [s("gear", 40), s("circuit", 10)],
    buildings: ["tunnel"],
    recipes: [],
    legacyTier: 2,
  },
  {
    id: "sorting",
    name: "Sortierung",
    tier: 2,
    requires: ["storage"],
    cost: [s("circuit", 30), s("gear", 30)],
    buildings: ["sorter"],
    recipes: [],
    legacyTier: 3,
  },
  {
    id: "drill_tuning",
    name: "Bohrer-Tuning",
    text: "Alle Bohrer und Pumpen 25 % schneller",
    tier: 2,
    requires: [],
    cost: [s("gear", 100), s("circuit", 50)],
    buildings: [],
    recipes: [],
    bonus: { extractSpeed: 0.25 },
  },
  // Stufe 3
  {
    id: "hub_generator",
    name: "Hub-Generator",
    text: "Hub liefert 40 MW mehr",
    tier: 3,
    requires: [],
    cost: [s("circuit", 100), s("copper_plate", 200)],
    buildings: [],
    recipes: [],
    bonus: { hubPower: 40 },
  },
  // Stufe 4
  {
    id: "belt_mk2",
    name: "Schnellband",
    tier: 4,
    requires: [],
    cost: [s("steel", 50), s("gear", 100)],
    buildings: ["belt_mk2"],
    recipes: [],
    legacyTier: 4,
  },
  {
    id: "bridges",
    name: "Brückenbau",
    text: "Hochbänder auf Stelzen und Rampen, auch über Wasser",
    tier: 4,
    requires: [],
    cost: [s("steel", 40), s("iron_plate", 150)],
    buildings: ["bridge", "ramp"],
    recipes: [],
  },
  {
    id: "cast_iron",
    name: "Gusseisen",
    tier: 4,
    requires: [],
    cost: [s("steel", 40), s("circuit", 40)],
    buildings: [],
    recipes: ["alt_cast_iron"],
  },
  {
    id: "steel_gear",
    name: "Stahlzahnrad",
    tier: 4,
    requires: [],
    cost: [s("steel", 60), s("gear", 60)],
    buildings: [],
    recipes: ["alt_steel_gear"],
  },
  // Stufe 5
  {
    id: "extractor_mk2",
    name: "Bohrer Mk2",
    tier: 5,
    requires: [],
    cost: [s("steel", 100), s("circuit", 100)],
    buildings: ["extractor_mk2"],
    recipes: [],
    legacyTier: 5,
  },
  {
    id: "bolted_plate",
    name: "Verschraubte Platte",
    tier: 5,
    requires: [],
    cost: [s("concrete", 50), s("gear", 100)],
    buildings: [],
    recipes: ["alt_bolted_plate"],
  },
  {
    id: "steel_rotor",
    name: "Stahlrotor",
    tier: 5,
    requires: ["steel_gear"],
    cost: [s("rotor", 30), s("steel", 50)],
    buildings: [],
    recipes: ["alt_steel_rotor"],
  },
  {
    id: "quick_concrete",
    name: "Schnellbeton",
    tier: 5,
    requires: [],
    cost: [s("concrete", 60), s("steel", 40)],
    buildings: [],
    recipes: ["alt_quick_concrete"],
  },
  {
    id: "pipes",
    name: "Rohrleitungen",
    text: "Rohre, Wasserpumpe und Tank für Wasser, Rohöl und Treibstoff",
    tier: 5,
    requires: [],
    cost: [s("steel", 80), s("concrete", 40)],
    buildings: ["pipe", "water_pump", "fluid_tank"],
    recipes: [],
  },
  {
    id: "steam_power",
    name: "Dampfkraft",
    tier: 5,
    requires: ["pipes"],
    cost: [s("steel", 60), s("circuit", 80)],
    buildings: ["generator_steam"],
    recipes: [],
  },
  // Stufe 6
  {
    id: "pipe_pump",
    name: "Rohrpumpen",
    text: "Voller Durchfluss auch in langen Leitungen",
    tier: 6,
    requires: ["pipes"],
    cost: [s("rotor", 40), s("circuit", 60)],
    buildings: ["pipe_pump"],
    recipes: [],
  },
  {
    id: "rotor_motor",
    name: "Rotormotor",
    tier: 6,
    requires: [],
    cost: [s("rotor", 50), s("control_unit", 20)],
    buildings: [],
    recipes: ["alt_rotor_motor"],
  },
  // Stufe 7
  {
    id: "generator_fuel",
    name: "Treibstoffkraftwerk",
    tier: 7,
    requires: [],
    cost: [s("motor", 40), s("heavy_frame", 10)],
    buildings: ["generator_fuel"],
    recipes: [],
    legacyTier: 7,
  },
  {
    id: "coal_fuel",
    name: "Kohleverflüssigung",
    tier: 7,
    requires: [],
    cost: [s("fuel", 100), s("control_unit", 30)],
    buildings: [],
    recipes: ["alt_coal_fuel"],
  },
  {
    id: "plastic_circuit",
    name: "Kunststoff-Schaltkreis",
    tier: 7,
    requires: [],
    cost: [s("plastic", 100), s("circuit", 100)],
    buildings: [],
    recipes: ["alt_plastic_circuit"],
  },
  {
    id: "hub_generator_2",
    name: "Hub-Generator II",
    text: "Hub liefert weitere 80 MW",
    tier: 7,
    requires: ["hub_generator"],
    cost: [s("heavy_frame", 20), s("motor", 40)],
    buildings: [],
    recipes: [],
    bonus: { hubPower: 80 },
  },
  // Stufe 8
  {
    id: "belt_mk3",
    name: "Turboband",
    tier: 8,
    requires: ["belt_mk2"],
    cost: [s("rubber", 100), s("steel", 200)],
    buildings: ["belt_mk3"],
    recipes: [],
    legacyTier: 8,
  },
  {
    id: "silicon_circuit",
    name: "Silizium-Schaltkreis",
    tier: 8,
    requires: [],
    cost: [s("silicon", 100), s("computer", 10)],
    buildings: [],
    recipes: ["alt_silicon_circuit"],
  },
  {
    id: "quartz_melt",
    name: "Quarzschmelze",
    tier: 8,
    requires: [],
    cost: [s("silicon", 100), s("steel", 100)],
    buildings: [],
    recipes: ["alt_quartz_melt"],
  },
  // Stufe 9
  {
    id: "extractor_mk3",
    name: "Bohrer Mk3",
    tier: 9,
    requires: ["extractor_mk2"],
    cost: [s("computer", 40), s("heavy_frame", 40)],
    buildings: ["extractor_mk3"],
    recipes: [],
    legacyTier: 9,
  },
  {
    id: "drill_tuning_2",
    name: "Bohrer-Tuning II",
    text: "Bohrer und Pumpen weitere 25 % schneller",
    tier: 9,
    requires: ["drill_tuning"],
    cost: [s("computer", 30), s("motor", 60)],
    buildings: [],
    recipes: [],
    bonus: { extractSpeed: 0.25 },
  },
  // Stufe 10
  {
    id: "pure_alu",
    name: "Reines Aluminium",
    tier: 10,
    requires: [],
    cost: [s("aluminium", 100), s("battery", 50)],
    buildings: [],
    recipes: ["alt_pure_alu"],
  },
];

export function researchById(id: string): ResearchNode | undefined {
  return RESEARCH.find((n) => n.id === id);
}

/** Forschungsknoten, der ein Gebaeude freischaltet (falls es eines gibt). */
export function researchForBuilding(id: BuildId): ResearchNode | undefined {
  return RESEARCH.find((n) => n.buildings.includes(id));
}

export function researchForRecipe(id: string): ResearchNode | undefined {
  return RESEARCH.find((n) => n.recipes.includes(id));
}

/** Summe der Boni aller erforschten Knoten. */
export function totalBonus(done: Iterable<string>): Bonus {
  const b: Bonus = { hubPower: 0, extractSpeed: 0 };
  for (const id of done) {
    const n = researchById(id);
    if (!n?.bonus) continue;
    b.hubPower += n.bonus.hubPower ?? 0;
    b.extractSpeed += n.bonus.extractSpeed ?? 0;
  }
  return b;
}
