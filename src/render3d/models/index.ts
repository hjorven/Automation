// Prozedurale Low-Poly-Modelle. Konvention: eine Gitterzelle = 1 Einheit,
// Modell zentriert auf (0, 0, 0), Boden bei y = 0, Ausgang zeigt nach +x.

export { mat } from "./kit";
export {
  BELT_TOP,
  createBeltTexture,
  curveBedGeometry,
  curveFrameGeometry,
  straightBedGeometry,
  straightFrameGeometry,
} from "./belts";
export { assemblerModel, extractorModel, hubModel, smelterModel } from "./buildings";
export { itemGeometry, itemMaterial } from "./items";
export { deleteIconModel, handIconModel, menuIconModel, rotateIconModel } from "./icons";
