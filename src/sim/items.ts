export type ItemId =
  | "iron_ore"
  | "copper_ore"
  | "coal"
  | "iron_plate"
  | "copper_plate"
  | "gear"
  | "wire"
  | "circuit"
  | "steel"
  | "motor"
  | "control_unit";

export const ITEM_ORDER: readonly ItemId[] = [
  "iron_ore",
  "copper_ore",
  "coal",
  "iron_plate",
  "copper_plate",
  "gear",
  "wire",
  "circuit",
  "steel",
  "motor",
  "control_unit",
];

export const ITEM_NAMES: Record<ItemId, string> = {
  iron_ore: "Eisenerz",
  copper_ore: "Kupfererz",
  coal: "Kohle",
  iron_plate: "Eisenplatte",
  copper_plate: "Kupferplatte",
  gear: "Zahnrad",
  wire: "Kupferdraht",
  circuit: "Schaltkreis",
  steel: "Stahl",
  motor: "Motor",
  control_unit: "Steuereinheit",
};
