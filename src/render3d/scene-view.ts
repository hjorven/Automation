import {
  AmbientLight,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  Scene,
  Vector3,
  type BufferGeometry,
} from "three";
import { BELT_SPEED, TICKS_PER_SECOND } from "../sim/constants";
import { DX, DY, opposite, rotateCCW, rotateCW, type Dir } from "../sim/dir";
import type { Belt, BeltItem, Entity } from "../sim/entities";
import { ITEM_ORDER, type ItemId } from "../sim/items";
import type { World } from "../sim/world";
import type { CameraRig } from "./camera-rig";
import {
  BELT_TOP,
  HUB_PAD_Y,
  assemblerModel,
  createBeltTexture,
  curveBedGeometry,
  curveFrameGeometry,
  extractorMk2Model,
  extractorModel,
  foundryModel,
  hubModel,
  itemGeometry,
  itemMaterial,
  mat,
  mergerModel,
  placeholderModel,
  smelterModel,
  splitterModel,
  straightBedGeometry,
  straightFrameGeometry,
  tunnelModel,
} from "./models";
import { PALETTE } from "./palette";
import { TerrainView } from "./terrain";

/** Sonnenrichtung (von der Szene zur Sonne). */
const SUN = new Vector3(-0.55, 1, 0.35).normalize();

type BeltVariant = 0 | 1 | 2; // gerade, Kurve von links, Kurve von rechts

interface EntityNode {
  root: Group;
  key: string;
  /** Eigene (nicht geteilte) Materialien, die beim Entfernen freigegeben werden. */
  own: MeshStandardMaterial[];
  recipeId?: string | null;
  spin: number;
}

/** Waechst bei Bedarf; zeichnet nur die ersten `count` Instanzen. */
class GrowingInstances {
  mesh: InstancedMesh;

  constructor(
    private readonly parent: Object3D,
    private readonly geo: BufferGeometry,
    private readonly material: MeshStandardMaterial,
    capacity = 64,
  ) {
    this.mesh = this.create(capacity);
  }

  private create(capacity: number): InstancedMesh {
    const m = new InstancedMesh(this.geo, this.material, capacity);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    this.parent.add(m);
    return m;
  }

  ensure(n: number) {
    if (n <= this.mesh.instanceMatrix.count) return;
    let cap = this.mesh.instanceMatrix.count;
    while (cap < n) cap *= 2;
    this.parent.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = this.create(cap);
  }

  commit(n: number) {
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Die 3D-Szene: Gelaende, Gebaeude, Items, Licht. Liest die Simulation nur,
 * veraendert sie nie.
 */
export class SceneView {
  readonly scene = new Scene();
  private readonly sun = new DirectionalLight(0xfff4e0, 2.4);
  private readonly terrain = new TerrainView();
  private readonly entitiesGroup = new Group();
  private readonly nodes = new Map<number, EntityNode>();
  private readonly templates = new Map<string, Group>();
  private worldVersion = -1;
  /** Hub-Stufe beim letzten Bild; steigt sie, startet der Flieger. */
  private lastTier = -1;
  private flightStart = -Infinity;

  private readonly beltTexture = createBeltTexture();
  private readonly beltBeds: GrowingInstances[];
  private readonly beltFrames: GrowingInstances[];
  private readonly items = new Map<ItemId, GrowingInstances>();
  private readonly selection: Mesh;

  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3(1, 1, 1);
  private readonly itemScale = new Vector3(1.25, 1.25, 1.25);
  private readonly up = new Vector3(0, 1, 0);

  constructor() {
    const sc = this.scene;
    sc.background = new Color(PALETTE.sky);
    sc.fog = new Fog(PALETTE.sky, 30, 90);
    sc.add(new HemisphereLight(PALETTE.sky, PALETTE.hemiGround, 1.1));
    sc.add(new AmbientLight(0xffffff, 0.25));

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    sc.add(this.sun, this.sun.target);

    sc.add(this.terrain.group, this.entitiesGroup);

    const bedMat = new MeshStandardMaterial({ map: this.beltTexture, roughness: 0.9, side: DoubleSide });
    const frameMat = mat(PALETTE.beltRail, { rough: 0.6 });
    const beltRoot = new Group();
    sc.add(beltRoot);
    this.beltBeds = [straightBedGeometry(), curveBedGeometry(false), curveBedGeometry(true)].map(
      (g) => new GrowingInstances(beltRoot, g, bedMat),
    );
    this.beltFrames = [straightFrameGeometry(), curveFrameGeometry(false), curveFrameGeometry(true)].map(
      (g) => new GrowingInstances(beltRoot, g, frameMat),
    );
    for (const f of this.beltFrames) f.mesh.receiveShadow = true;

    const itemRoot = new Group();
    sc.add(itemRoot);
    for (const id of ITEM_ORDER) this.items.set(id, new GrowingInstances(itemRoot, itemGeometry(id), itemMaterial(id)));

    const ring = new RingGeometry(0.62, 0.72, 4, 1, Math.PI / 4);
    ring.rotateX(-Math.PI / 2);
    this.selection = new Mesh(ring, new MeshBasicMaterial({ color: PALETTE.selection, transparent: true }));
    this.selection.visible = false;
    sc.add(this.selection);
  }

  /** `alpha` (0..1) interpoliert zwischen zwei Simulations-Ticks, `dt` in Sekunden. */
  render(world: World, rig: CameraRig, alpha: number, dt: number, selectedId: number | null) {
    const t = performance.now() / 1000;
    this.followCamera(rig);

    if (world.tier !== this.lastTier) {
      if (this.lastTier !== -1 && world.tier > this.lastTier) this.flightStart = t;
      this.lastTier = world.tier;
    }

    if (world.version !== this.worldVersion) {
      this.worldVersion = world.version;
      this.syncEntities(world);
    }

    this.beltTexture.offset.x = -((t * BELT_SPEED * TICKS_PER_SECOND) % 1);
    this.animate(world, t, dt);
    this.drawItems(world, alpha);

    const sel = selectedId === null ? undefined : world.entities.get(selectedId);
    this.selection.visible = !!sel;
    if (sel) {
      this.selection.position.set(sel.x + 0.5, 0.03, sel.y + 0.5);
      (this.selection.material as MeshBasicMaterial).opacity = 0.65 + 0.35 * Math.sin(t * 5);
    }
  }

  private followCamera(rig: CameraRig) {
    const tg = rig.target;
    const d = rig.distance;
    this.terrain.update(tg.x, tg.z, Math.min(64, d * 2.2));

    // Schattenkamera wandert mit und deckt den sichtbaren Bereich ab.
    const r = Math.min(60, d * 1.3 + 6);
    const cam = this.sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 200;
    cam.updateProjectionMatrix();
    this.sun.target.position.set(tg.x, 0, tg.z);
    this.sun.position.copy(this.sun.target.position).addScaledVector(SUN, 80);

    const fog = this.scene.fog as Fog;
    // Nebel verdeckt den Rand des erzeugten Gelaendes.
    fog.far = Math.min(64, d * 4);
    fog.near = fog.far * 0.45;
  }

  // ------------------------------------------------------------ Gebaeude

  private syncEntities(world: World) {
    // Baender: alle Instanz-Matrizen neu (billig, passiert nur bei Bauaenderungen).
    const counts = [0, 0, 0];
    const belts: [Belt, BeltVariant][] = [];
    for (const e of world.entities.values()) {
      if (e.type !== "belt") continue;
      const v = beltVariant(e, world.beltInputSide(e));
      counts[v]++;
      belts.push([e, v]);
    }
    counts.forEach((n, v) => {
      this.beltBeds[v].ensure(n);
      this.beltFrames[v].ensure(n);
    });
    const used = [0, 0, 0];
    for (const [b, v] of belts) {
      this.compose(b.x + 0.5, 0, b.y + 0.5, yawOf(b.dir));
      this.beltBeds[v].mesh.setMatrixAt(used[v], this.m);
      this.beltFrames[v].mesh.setMatrixAt(used[v], this.m);
      used[v]++;
    }
    used.forEach((n, v) => {
      this.beltBeds[v].commit(n);
      this.beltFrames[v].commit(n);
    });

    // Uebrige Gebaeude als eigene Modelle.
    for (const [id, node] of this.nodes) {
      const e = world.entities.get(id);
      if (!e || e.type === "belt" || nodeKey(e) !== node.key) this.removeNode(id);
    }
    for (const e of world.entities.values()) {
      if (e.type === "belt") continue;
      let node = this.nodes.get(e.id);
      if (!node) {
        node = this.createNode(e);
        this.nodes.set(e.id, node);
      }
      if (e.type === "assembler") {
        const rid = e.recipe?.id ?? null;
        if (node.recipeId !== rid) {
          node.recipeId = rid;
          setIcon(node.root.getObjectByName("icon")!, e.recipe?.outputs[0]?.item ?? null);
        }
      }
    }
  }

  private createNode(e: Exclude<Entity, Belt>): EntityNode {
    const tplKey = templateKey(e);
    let tpl = this.templates.get(tplKey);
    if (!tpl) {
      tpl = buildTemplate(e);
      this.templates.set(tplKey, tpl);
    }
    const root = tpl.clone();
    const own: MeshStandardMaterial[] = [];
    const shocks: MeshBasicMaterial[] = [];
    root.traverse((o) => {
      if (o instanceof Mesh && (o.name === "glow" || o.name === "beacon")) {
        // Pro Gebaeude eigene Kopie; beide Glut-Flaechen teilen sie sich.
        let m = own[0];
        if (!m) {
          m = (o.material as MeshStandardMaterial).clone();
          own.push(m);
        }
        o.material = m;
      } else if (o instanceof Mesh && o.name === "shock") {
        // Druckwelle blendet je Hub einzeln aus; erst nach "glow"/"beacon" ablegen.
        const m = (o.material as MeshBasicMaterial).clone();
        o.material = m;
        shocks.push(m);
      }
    });
    own.push(...(shocks as unknown as MeshStandardMaterial[]));
    root.position.set(e.x + 0.5, 0, e.y + 0.5);
    root.rotation.y = yawOf(e.dir);
    this.entitiesGroup.add(root);
    return { root, key: nodeKey(e), own, spin: 0 };
  }

  private removeNode(id: number) {
    const node = this.nodes.get(id);
    if (!node) return;
    this.entitiesGroup.remove(node.root);
    for (const m of node.own) m.dispose();
    this.nodes.delete(id);
  }

  private animate(world: World, t: number, dt: number) {
    for (const [id, node] of this.nodes) {
      const e = world.entities.get(id);
      if (!e) continue;
      const root = node.root;
      switch (e.type) {
        case "extractor":
        case "extractor_mk2": {
          // Dreht beim Foerdern, bremst aus, wenn der Ausgang verstopft ist.
          const target = e.working ? (e.type === "extractor_mk2" ? 12 : 7) : 0;
          node.spin += (target - node.spin) * Math.min(1, dt * 3);
          const head = root.getObjectByName("head")!;
          head.rotation.y += node.spin * dt;
          head.position.y = 0.56 + (e.working ? Math.sin(t * 18 + id) * 0.012 : 0);
          break;
        }
        case "smelter": {
          const glow = node.own[0];
          const target = e.crafting ? 1.6 + 0.5 * Math.sin(t * 9 + id) : 0.05;
          glow.emissiveIntensity += (target - glow.emissiveIntensity) * Math.min(1, dt * 4);
          let i = 0;
          for (const puff of root.children) {
            if (puff.name !== "puff") continue;
            const phase = (t * 0.6 + i / 3 + id * 0.37) % 1;
            puff.visible = e.crafting;
            puff.position.set(-0.3 + phase * 0.1, 0.72 + phase * 0.7, -0.28 - phase * 0.05);
            puff.scale.setScalar(0.6 + phase * 1.4);
            i++;
          }
          break;
        }
        case "foundry": {
          const glow = node.own[0];
          const target = e.crafting ? 1.8 + 0.4 * Math.sin(t * 7 + id) : 0.05;
          glow.emissiveIntensity += (target - glow.emissiveIntensity) * Math.min(1, dt * 4);
          break;
        }
        case "assembler": {
          const target = e.crafting ? 5 : 0;
          node.spin += (target - node.spin) * Math.min(1, dt * 4);
          root.getObjectByName("arm")!.rotation.y += node.spin * dt;
          const icon = root.getObjectByName("icon")!;
          icon.rotation.y = t * 1.2;
          icon.position.y = 0.92 + Math.sin(t * 2 + id) * 0.04;
          break;
        }
        case "hub": {
          const thrust = flyDrone(root, t - this.flightStart, t);
          node.spin += (0.8 + thrust * 4 - node.spin) * Math.min(1, dt * 2);
          root.getObjectByName("ring")!.rotation.z += node.spin * dt;
          node.own[0].emissiveIntensity = 0.8 + 0.6 * Math.sin(t * 3) + thrust * 1.5;
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ Items

  private drawItems(world: World, alpha: number) {
    const n = new Map<ItemId, number>();
    for (const e of world.entities.values()) {
      if (e.type !== "belt") continue;
      for (const it of e.items) n.set(it.item, (n.get(it.item) ?? 0) + 1);
    }
    for (const [id, inst] of this.items) inst.ensure(n.get(id) ?? 0);

    const used = new Map<ItemId, number>();
    for (const e of world.entities.values()) {
      if (e.type !== "belt") continue;
      for (const it of e.items) {
        const pose = beltItemPose(e, it, alpha);
        this.compose(pose.x, BELT_TOP, pose.z, pose.yaw, this.itemScale);
        const k = used.get(it.item) ?? 0;
        this.items.get(it.item)!.mesh.setMatrixAt(k, this.m);
        used.set(it.item, k + 1);
      }
    }
    for (const [id, inst] of this.items) inst.commit(used.get(id) ?? 0);
  }

  private compose(x: number, y: number, z: number, yaw: number, scale = this.s) {
    this.p.set(x, y, z);
    this.q.setFromAxisAngle(this.up, yaw);
    this.m.compose(this.p, this.q, scale);
  }
}

// ------------------------------------------------------------ Hilfen

/** Dauer des Drohnenflugs in Sekunden: zuenden, starten, weg, zurueck, landen. */
const FLIGHT = 10;

/**
 * Liefer-Drohne auf dem Hub nach einem Upgrade: Triebwerke zuenden, Druckwelle,
 * senkrechter Raketenstart mit Drehung, spaeter Landung mit Gegenschub.
 * `s` = Sekunden seit dem Upgrade. Liefert den Schub (0 = aus) fuer Lichteffekte.
 */
function flyDrone(root: Object3D, s: number, t: number): number {
  const drone = root.getObjectByName("drone")!;
  const shock = root.getObjectByName("shock") as Mesh;
  drone.visible = true;
  drone.position.set(0, HUB_PAD_Y, 0);
  drone.rotation.set(0, 0, 0);
  shock.visible = false;

  let thrust = 0;
  if (s >= 0 && s < FLIGHT) {
    if (s < 1.2) {
      // Zuenden: Schub baut sich auf, die Drohne zittert und hebt leicht ab.
      const k = s / 1.2;
      thrust = 0.25 + 0.55 * k;
      drone.position.y += 0.05 * k * k + Math.sin(t * 70) * 0.004 * k;
      drone.position.x = Math.sin(t * 53) * 0.004 * k;
    } else if (s < 4) {
      const u = (s - 1.2) / 2.8;
      thrust = 2.2;
      drone.position.y += 0.05 + 2 * u + 30 * u * u * u;
      drone.rotation.y = u * u * 8;
      const k = (s - 1.2) / 0.9;
      if (k < 1) {
        shock.visible = true;
        shock.scale.setScalar(1 + k * 4);
        (shock.material as MeshBasicMaterial).opacity = 0.7 * (1 - k) * (1 - k);
      }
    } else if (s < 6) {
      drone.visible = false; // unterwegs
    } else {
      // Rueckkehr: faellt von oben, bremst mit Gegenschub und setzt weich auf.
      const w = 1 - (s - 6) / (FLIGHT - 6);
      thrust = w > 0.03 ? 0.7 + 0.9 * w : w * 20;
      drone.position.y += 1.5 * w + 30 * w * w * w;
      drone.rotation.y = -w * w * 8;
    }
  }

  let i = 0;
  for (const flame of drone.children) {
    if (flame.name !== "flame") continue;
    const len = thrust * (1 + 0.18 * Math.sin(t * 41 + i * 1.7));
    const width = thrust > 0 ? Math.min(1.2, 0.6 + 0.4 * thrust) : 0.001;
    flame.scale.set(width, Math.max(0.001, len), width);
    i++;
  }
  return thrust;
}

/** Modelle zeigen nach +x; Sim-Richtung `dir` als Drehung um die Hochachse. */
const yawOf = (d: Dir) => (-d * Math.PI) / 2;

function beltVariant(b: Belt, input: Dir): BeltVariant {
  if (input === rotateCCW(b.dir)) return 1;
  if (input === rotateCW(b.dir)) return 2;
  return 0;
}

function nodeKey(e: Entity): string {
  return `${templateKey(e)}:${e.dir}`;
}

function templateKey(e: Entity): string {
  return e.type === "tunnel" ? `tunnel:${e.exit ? "out" : "in"}` : e.type;
}

function buildTemplate(e: Exclude<Entity, Belt>): Group {
  switch (e.type) {
    case "extractor":
      return extractorModel();
    case "extractor_mk2":
      return extractorMk2Model();
    case "foundry":
      return foundryModel();
    case "splitter":
      return splitterModel();
    case "merger":
      return mergerModel();
    case "tunnel":
      return tunnelModel(e.exit);
    case "smelter":
      return smelterModel();
    case "assembler":
      return assemblerModel();
    case "hub":
      return hubModel();
    default:
      // Gebaeude der spaeten Stufen, bis es eigene Modelle gibt.
      return placeholderModel(PLACEHOLDER_COLORS[e.type]);
  }
}

const PLACEHOLDER_COLORS: Partial<Record<Entity["type"], number>> = {
  storage: 0x8a6f4a,
  sorter: 0x4f9a7a,
  generator_coal: 0x45464a,
  generator_fuel: 0xd9862a,
  extractor_mk3: 0x8a5fd9,
  pump: 0x1d1b22,
  refinery: 0x4fa3d9,
  manufacturer: 0x3f6fa8,
};

const iconGeos = new Map<ItemId, BufferGeometry>();

function setIcon(holder: Object3D, item: ItemId | null) {
  holder.clear();
  if (!item) return;
  let g = iconGeos.get(item);
  if (!g) {
    g = itemGeometry(item);
    iconGeos.set(item, g);
  }
  const m = new Mesh(g, itemMaterial(item));
  m.scale.setScalar(1.3);
  m.castShadow = true;
  holder.add(m);
}

/**
 * Position eines Items auf einem Band. Gerade: Eintrittskante -> Mitte ->
 * Austrittskante. Kurve: Viertelkreis um die Ecke zwischen beiden Kanten.
 */
function beltItemPose(b: Belt, it: BeltItem, alpha: number) {
  const p = it.prev + (it.progress - it.prev) * alpha;
  const cx = b.x + 0.5;
  const cz = b.y + 0.5;
  const din = it.entry;
  const dout = b.dir;

  if (din !== opposite(dout) && p >= 0 && p <= 1) {
    const a = (p * Math.PI) / 2;
    const ccx = cx + 0.5 * (DX[din] + DX[dout]);
    const ccz = cz + 0.5 * (DY[din] + DY[dout]);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tx = s * DX[dout] - c * DX[din];
    const tz = s * DY[dout] - c * DY[din];
    return {
      x: ccx - 0.5 * (c * DX[dout] + s * DX[din]),
      z: ccz - 0.5 * (c * DY[dout] + s * DY[din]),
      yaw: Math.atan2(-tz, tx),
    };
  }

  if (p < 0.5) {
    // Auch p < 0: Item ist gerade vom Vorgaenger gekommen, noch jenseits der Kante.
    const k = 0.5 - p;
    return { x: cx + DX[din] * k, z: cz + DY[din] * k, yaw: yawOf(opposite(din)) };
  }
  const k = p - 0.5;
  return { x: cx + DX[dout] * k, z: cz + DY[dout] * k, yaw: yawOf(dout) };
}
