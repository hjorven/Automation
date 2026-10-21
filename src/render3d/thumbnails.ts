import {
  AmbientLight,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
  type Object3D,
} from "three";
import type { EntityType } from "../sim/entities";
import {
  assemblerModel,
  createBeltTexture,
  extractorMk2Model,
  extractorModel,
  foundryModel,
  hubModel,
  iconModel,
  mat,
  mergerModel,
  smelterModel,
  splitterModel,
  tunnelModel,
  straightBedGeometry,
  straightFrameGeometry,
} from "./models";
import { PALETTE } from "./palette";

const SIZE = 128;

export type ThumbnailId = EntityType | "hand" | "delete" | "menu" | "rotate0" | "rotate1" | "rotate2" | "rotate3";

/**
 * Rendert jedes Gebaeude-Modell einmal als kleines Bild (Data-URL) fuer die
 * Werkzeugleiste. Nutzt einen kurzlebigen eigenen Renderer, der danach wieder
 * freigegeben wird. Gibt ein leeres Objekt zurueck, wenn WebGL fehlt.
 */
export function renderThumbnails(): Partial<Record<ThumbnailId, string>> {
  const out: Partial<Record<ThumbnailId, string>> = {};
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = NeutralToneMapping;

  const scene = new Scene();
  scene.add(new HemisphereLight(PALETTE.sky, PALETTE.hemiGround, 1.3));
  scene.add(new AmbientLight(0xffffff, 0.35));
  const sun = new DirectionalLight(0xfff4e0, 2.6);
  sun.position.set(-2, 4, 3);
  scene.add(sun);

  // Leicht von oben und schraeg vorne, Ausgang (+x) zeigt nach rechts unten.
  const cam = new OrthographicCamera(-0.75, 0.75, 0.75, -0.75, 0.1, 20);
  cam.position.set(2.2, 2.1, 3.2);
  cam.lookAt(0, 0.38, 0);

  const beltTex = createBeltTexture();
  const builders: [ThumbnailId, () => Object3D][] = [
    ["hand", () => iconModel("hand")],
    ["delete", () => iconModel("delete")],
    ["menu", () => iconModel("menu")],
    ...[0, 1, 2, 3].map((d): [ThumbnailId, () => Object3D] => [`rotate${d}` as ThumbnailId, () => iconModel("rotate", d)]),
    ["belt", () => beltModel(beltTex)],
    ["extractor", extractorModel],
    ["smelter", smelterModel],
    ["assembler", assemblerModel],
    ["hub", hubModel],
    ["splitter", splitterModel],
    ["merger", mergerModel],
    ["tunnel", () => tunnelModel(false)],
    ["foundry", foundryModel],
    ["extractor_mk2", extractorMk2Model],
  ];
  for (const [type, build] of builders) {
    const model = build();
    // Hub ist hoeher als die anderen Gebaeude: etwas weiter herauszoomen.
    cam.zoom = type === "hub" ? 0.82 : type === "belt" ? 1.15 : 1;
    cam.updateProjectionMatrix();
    model.traverse((o) => {
      // Glut und Leuchtfeuer sichtbar machen, Rauch ausblenden.
      if (o instanceof Mesh && (o.name === "glow" || o.name === "beacon")) {
        const m = (o.material as MeshStandardMaterial).clone();
        m.emissiveIntensity = 1.2;
        o.material = m;
      }
      if (o.name === "puff") o.visible = false;
    });
    scene.add(model);
    renderer.render(scene, cam);
    out[type] = renderer.domElement.toDataURL("image/png");
    scene.remove(model);
  }

  beltTex.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

function beltModel(tex: ReturnType<typeof createBeltTexture>): Group {
  const g = new Group();
  g.add(new Mesh(straightBedGeometry(), new MeshStandardMaterial({ map: tex, roughness: 0.9 })));
  g.add(new Mesh(straightFrameGeometry(), mat(PALETTE.beltRail, { rough: 0.6 })));
  return g;
}
