export type ItemId =
  | "iron_ore"
  | "copper_ore"
  | "iron_plate"
  | "copper_plate"
  | "gear"
  | "wire"
  | "circuit";

export const ITEM_ORDER: readonly ItemId[] = [
  "iron_ore",
  "copper_ore",
  "iron_plate",
  "copper_plate",
  "gear",
  "wire",
  "circuit",
];

export const ITEM_NAMES: Record<ItemId, string> = {
  iron_ore: "Eisenerz",
  copper_ore: "Kupfererz",
  iron_plate: "Eisenplatte",
  copper_plate: "Kupferplatte",
  gear: "Zahnrad",
  wire: "Kupferdraht",
  circuit: "Schaltkreis",
};
