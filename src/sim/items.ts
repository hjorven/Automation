export type ItemId =
  // Rohstoffe
  | "iron_ore"
  | "copper_ore"
  | "coal"
  | "stone"
  | "quartz"
  | "sulfur"
  | "crude_oil"
  | "bauxite"
  // Fluessigkeit (nur in Rohren)
  | "water"
  // Zwischenprodukte
  | "iron_plate"
  | "copper_plate"
  | "gear"
  | "wire"
  | "circuit"
  | "steel"
  | "concrete"
  | "reinforced_plate"
  | "rotor"
  | "silicon"
  | "plastic"
  | "rubber"
  | "fuel"
  | "aluminium"
  // Endprodukte
  | "motor"
  | "control_unit"
  | "heavy_frame"
  | "computer"
  | "battery"
  | "alu_casing"
  | "turbo_motor"
  | "supercomputer";

export const ITEM_ORDER: readonly ItemId[] = [
  "iron_ore",
  "copper_ore",
  "coal",
  "stone",
  "quartz",
  "sulfur",
  "crude_oil",
  "bauxite",
  "water",
  "iron_plate",
  "copper_plate",
  "gear",
  "wire",
  "circuit",
  "steel",
  "concrete",
  "reinforced_plate",
  "rotor",
  "silicon",
  "plastic",
  "rubber",
  "fuel",
  "aluminium",
  "motor",
  "control_unit",
  "heavy_frame",
  "computer",
  "battery",
  "alu_casing",
  "turbo_motor",
  "supercomputer",
];

export const ITEM_NAMES: Record<ItemId, string> = {
  iron_ore: "Eisenerz",
  copper_ore: "Kupfererz",
  coal: "Kohle",
  stone: "Stein",
  quartz: "Quarz",
  sulfur: "Schwefel",
  crude_oil: "Rohöl",
  bauxite: "Bauxit",
  water: "Wasser",
  iron_plate: "Eisenplatte",
  copper_plate: "Kupferplatte",
  gear: "Zahnrad",
  wire: "Kupferdraht",
  circuit: "Schaltkreis",
  steel: "Stahl",
  concrete: "Beton",
  reinforced_plate: "Verstärkte Platte",
  rotor: "Rotor",
  silicon: "Silizium",
  plastic: "Kunststoff",
  rubber: "Gummi",
  fuel: "Treibstoff",
  aluminium: "Aluminium",
  motor: "Motor",
  control_unit: "Steuereinheit",
  heavy_frame: "Schwerer Rahmen",
  computer: "Computer",
  battery: "Batterie",
  alu_casing: "Alu-Gehäuse",
  turbo_motor: "Turbomotor",
  supercomputer: "Supercomputer",
};
