import {
  DoubleSide,
  Group,
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
import { Storage, type Belt, type BeltItem, type Entity } from "../sim/entities";
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
  extractorMk3Model,
  extractorModel,
  foundryModel,
  generatorCoalModel,
  generatorFuelModel,
  hubModel,
  itemGeometry,
  itemMaterial,
  manufacturerModel,
  mat,
  mergerModel,
  placeholderModel,
  pumpModel,
  refineryModel,
  smelterModel,
  sorterModel,
  splitterModel,
  storageModel,
  straightBedGeometry,
  straightFrameGeometry,
  tunnelModel,
} from "./models";
import { PALETTE } from "./palette";
import { Environment } from "./environment";
import { TerrainView } from "./terrain";

type BeltVariant = 0 | 1 | 2; // gerade, Kurve von links, Kurve von rechts

/** Schienenfarbe je Bandstufe (Mk1 bis Mk3). */
const BELT_RAILS = [PALETTE.beltRail, PALETTE.beltRailMk2, PALETTE.beltRailMk3];
/** Instanz-Gruppe je Bandstufe und Variante. */
const beltSlot = (level: 1 | 2 | 3, v: BeltVariant) => (level - 1) * 3 + v;

interface EntityNode {
  root: Group;
  key: string;
  /** Eigene (nicht geteilte) Materialien, die beim Entfernen freigegeben werden. */
  own: MeshStandardMaterial[];
  /** Item des schwebenden Symbols (Rezept oder Filter). */
  recipeId?: string | null;
  spin: number;
  /** Laufender Winkel fuer Pumpe und Kolben. */
  phase: number;
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
  private readonly terrain = new TerrainView();
  /** Licht, Nebel und Tag/Nacht. */
  readonly env: Environment;
  private readonly entitiesGroup = new Group();
  private readonly nodes = new Map<number, EntityNode>();
  private readonly templates = new Map<string, Group>();
  private worldVersion = -1;
  /** Hub-Stufe beim letzten Bild; steigt sie, startet der Flieger. */
  private lastTier = -1;
  private flightStart = -Infinity;

  /** Je Bandstufe eine Textur, damit jede in ihrem Tempo laeuft. */
  private readonly beltTextures = [createBeltTexture(), createBeltTexture(), createBeltTexture()];
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
    this.env = new Environment(sc);
    sc.add(this.terrain.group, this.entitiesGroup);

    const beltRoot = new Group();
    sc.add(beltRoot);
    this.beltBeds = [];
    this.beltFrames = [];
    for (let level = 0; level < 3; level++) {
      const bedMat = new MeshStandardMaterial({ map: this.beltTextures[level], roughness: 0.9, side: DoubleSide });
      const frameMat = mat(BELT_RAILS[level], { rough: 0.6 });
      for (const right of [null, false, true]) {
        const bed = right === null ? straightBedGeometry() : curveBedGeometry(right);
        const frame = right === null ? straightFrameGeometry() : curveFrameGeometry(right);
        this.beltBeds.push(new GrowingInstances(beltRoot, bed, bedMat));
        this.beltFrames.push(new GrowingInstances(beltRoot, frame, frameMat));
      }
    }
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
    this.followCamera(world, rig, t);

    if (world.tier !== this.lastTier) {
      if (this.lastTier !== -1 && world.tier > this.lastTier) this.flightStart = t;
      this.lastTier = world.tier;
    }

    if (world.version !== this.worldVersion) {
      this.worldVersion = world.version;
      this.syncEntities(world);
      this.terrain.setOccupied((x, y) => world.entityAt(x, y) !== undefined);
    }

    // Mk2 laeuft doppelt, Mk3 viermal so schnell (wie Belt.speed).
    [1, 2, 4].forEach((k, i) => {
      this.beltTextures[i].offset.x = -((t * k * BELT_SPEED * TICKS_PER_SECOND) % 1);
    });
    this.animate(world, t, dt);
    this.drawItems(world, alpha);

    const sel = selectedId === null ? undefined : world.entities.get(selectedId);
    this.selection.visible = !!sel;
    if (sel) {
      this.selection.position.set(sel.x + 0.5, 0.03, sel.y + 0.5);
      (this.selection.material as MeshBasicMaterial).opacity = 0.65 + 0.35 * Math.sin(t * 5);
    }
  }

  private followCamera(world: World, rig: CameraRig, t: number) {
    const tg = rig.target;
    const d = rig.distance;
    // Reicht bis knapp ueber den Bildrand, auch wenn die Kamera gedreht ist.
    this.terrain.update(tg.x, tg.z, Math.min(56, d * 0.85 + 8));
    this.env.update(tg, d, world.tick / TICKS_PER_SECOND, t, world.tier);
  }


  // ------------------------------------------------------------ Gebaeude

  private syncEntities(world: World) {
    // Baender: alle Instanz-Matrizen neu (billig, passiert nur bei Bauaenderungen).
    const counts = this.beltBeds.map(() => 0);
    const belts: [Belt, number][] = [];
    for (const e of world.entities.values()) {
      if (e.type !== "belt") continue;
      const slot = beltSlot(e.level, beltVariant(e, world.beltInputSide(e)));
      counts[slot]++;
      belts.push([e, slot]);
    }
    counts.forEach((n, i) => {
      this.beltBeds[i].ensure(n);
      this.beltFrames[i].ensure(n);
    });
    const used = counts.map(() => 0);
    for (const [b, i] of belts) {
      this.compose(b.x + 0.5, 0, b.y + 0.5, yawOf(b.dir));
      this.beltBeds[i].mesh.setMatrixAt(used[i], this.m);
      this.beltFrames[i].mesh.setMatrixAt(used[i], this.m);
      used[i]++;
    }
    used.forEach((n, i) => {
      this.beltBeds[i].commit(n);
      this.beltFrames[i].commit(n);
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
      // Schwebendes Symbol: Rezept-Ergebnis bzw. Filter des Sortierers.
      const shown =
        e.type === "assembler" || e.type === "refinery" || e.type === "manufacturer"
          ? (e.recipe?.outputs[0]?.item ?? null)
          : e.type === "sorter"
            ? e.filter
            : undefined;
      if (shown !== undefined && node.recipeId !== shown) {
        node.recipeId = shown;
        setIcon(node.root.getObjectByName("icon")!, shown);
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
    return { root, key: nodeKey(e), own, spin: 0, phase: 0 };
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
        case "extractor_mk2":
        case "extractor_mk3": {
          // Dreht beim Foerdern, bremst aus, wenn der Ausgang verstopft ist.
          const target = e.working ? EXTRACTOR_SPIN[e.type] : 0;
          node.spin += (target - node.spin) * Math.min(1, dt * 3);
          const head = root.getObjectByName("head")!;
          head.rotation.y += node.spin * dt;
          head.position.y = 0.56 + (e.working ? Math.sin(t * 18 + id) * 0.012 : 0);
          if (e.type === "extractor_mk3") {
            const coil = root.getObjectByName("coil")!;
            coil.rotation.y -= node.spin * 0.6 * dt;
            coil.position.y = 0.5 + Math.sin(t * 3 + id) * 0.03;
          }
          break;
        }
        case "pump": {
          // Pferdekopf nickt, solange Oel gefoerdert wird; laeuft weich aus.
          node.spin += ((e.working ? 2.4 : 0) - node.spin) * Math.min(1, dt * 2);
          node.phase += node.spin * dt;
          root.getObjectByName("beam")!.rotation.z = Math.sin(node.phase) * 0.26;
          root.getObjectByName("crank")!.rotation.z = -node.phase;
          break;
        }
        case "storage": {
          const fill = root.getObjectByName("fill")!;
          fill.scale.y = Math.max(0.02, e.queue.length / Storage.CAPACITY);
          break;
        }
        case "sorter": {
          // Weiche zeigt geradeaus fuer gefilterte Items, sonst zur Seite.
          const busy = e.buffer !== null;
          const target = !busy || e.buffer === e.filter ? 0 : e.next % 2 ? -0.7 : 0.7;
          const flap = root.getObjectByName("flap")!;
          flap.rotation.y += (target - flap.rotation.y) * Math.min(1, dt * 10);
          const laser = node.own[0];
          laser.emissiveIntensity = busy ? 1.6 : 0.5 + 0.2 * Math.sin(t * 6 + id);
          const icon = root.getObjectByName("icon")!;
          icon.rotation.y = t * 1.2;
          break;
        }
        case "generator_coal":
        case "generator_fuel": {
          const on = e.burning;
          node.spin += ((on ? 9 : 0) - node.spin) * Math.min(1, dt * 1.5);
          const glow = node.own[0];
          const target = on ? 1.4 + 0.5 * Math.sin(t * 11 + id) : 0.03;
          glow.emissiveIntensity += (target - glow.emissiveIntensity) * Math.min(1, dt * 4);
          smoke(root, on, t, id, root.userData.chimney, e.type === "generator_fuel" ? 1.4 : 0.8);
          if (e.type === "generator_coal") {
            root.getObjectByName("arm")!.rotation.z -= node.spin * dt;
          } else {
            node.phase += node.spin * 2.2 * dt;
            let i = 0;
            for (const c of root.children) {
              if (c.name !== "piston") continue;
              c.position.y = 0.43 + Math.sin(node.phase + (i % 2) * Math.PI) * 0.035 * Math.min(1, node.spin / 9);
              i++;
            }
          }
          break;
        }
        case "refinery": {
          // Fackel flackert beim Raffinieren, sonst nur Zuendflamme.
          const glow = node.own[0];
          const target = e.crafting ? 1.8 + 0.6 * Math.sin(t * 13 + id) + 0.3 * Math.sin(t * 29) : 0.25;
          glow.emissiveIntensity += (target - glow.emissiveIntensity) * Math.min(1, dt * 6);
          spinIcon(root, t, id, 0.76);
          break;
        }
        case "manufacturer": {
          const target = e.crafting ? 4 : 0;
          node.spin += (target - node.spin) * Math.min(1, dt * 4);
          root.getObjectByName("arm")!.rotation.y += node.spin * dt;
          root.getObjectByName("arm2")!.rotation.y -= node.spin * 1.3 * dt;
          node.own[0].emissiveIntensity = e.crafting ? 1.2 + 0.4 * Math.sin(t * 8 + id) : 0.15;
          spinIcon(root, t, id, 0.96);
          break;
        }
        case "smelter": {
          const glow = node.own[0];
          const target = e.crafting ? 1.6 + 0.5 * Math.sin(t * 9 + id) : 0.05;
          glow.emissiveIntensity += (target - glow.emissiveIntensity) * Math.min(1, dt * 4);
          smoke(root, e.crafting, t, id, SMELTER_CHIMNEY);
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
          spinIcon(root, t, id, 0.92);
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
    case "extractor_mk3":
      return extractorMk3Model();
    case "pump":
      return pumpModel();
    case "storage":
      return storageModel();
    case "sorter":
      return sorterModel();
    case "generator_coal":
      return generatorCoalModel();
    case "generator_fuel":
      return generatorFuelModel();
    case "refinery":
      return refineryModel();
    case "manufacturer":
      return manufacturerModel();
    default:
      // Neue Gebaeude, bis es eigene Modelle gibt.
      return placeholderModel();
  }
}

const EXTRACTOR_SPIN = { extractor: 7, extractor_mk2: 12, extractor_mk3: 18 };

/** Schornstein der Schmelze (siehe smelterModel). */
const SMELTER_CHIMNEY: [number, number, number] = [-0.3, 0.72, -0.28];

/** Rauchwolken ("puff") steigen ab `from` auf; `rate` = Tempo. */
function smoke(root: Object3D, active: boolean, t: number, id: number, from: [number, number, number], rate = 0.6) {
  let i = 0;
  for (const puff of root.children) {
    if (puff.name !== "puff") continue;
    const phase = (t * rate + i / 3 + id * 0.37) % 1;
    puff.visible = active;
    puff.position.set(from[0] + phase * 0.1, from[1] + phase * 0.7, from[2] - phase * 0.05);
    puff.scale.setScalar(0.6 + phase * 1.4);
    i++;
  }
}

/** Schwebendes Rezept-Symbol dreht sich und wippt. */
function spinIcon(root: Object3D, t: number, id: number, y: number) {
  const icon = root.getObjectByName("icon")!;
  icon.rotation.y = t * 1.2;
  icon.position.y = y + Math.sin(t * 2 + id) * 0.04;
}


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
