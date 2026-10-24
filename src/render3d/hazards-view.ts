import {
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RGBAFormat,
  type Object3D,
} from "three";
import { CHUNK } from "../sim/hazards";
import type { World } from "../sim/world";
import { creatureModel, nestModel } from "./models";

/** Smog-Schleier deckt so viele Smog-Felder je Seite ab (um den Ursprung). */
const SMOG_CHUNKS = 48;

interface CreatureNode {
  root: Group;
  yaw: number;
}

/**
 * Smog als halbdurchsichtiger Schleier ueber dem Boden, Nester und Kreaturen.
 * Liest die Simulation nur.
 */
export class HazardsView {
  readonly group = new Group();
  private readonly smogData = new Uint8Array(SMOG_CHUNKS * SMOG_CHUNKS * 4);
  private readonly smogTex: DataTexture;
  private smogVersion = -1;
  private readonly nestTpl = nestModel();
  private readonly creatureTpl = creatureModel();
  private readonly nests = new Map<string, Object3D>();
  private readonly creatures = new Map<number, CreatureNode>();
  private readonly eggMats: MeshStandardMaterial[] = [];

  constructor() {
    this.smogTex = new DataTexture(this.smogData, SMOG_CHUNKS, SMOG_CHUNKS, RGBAFormat);
    this.smogTex.magFilter = LinearFilter;
    this.smogTex.minFilter = LinearFilter;
    const size = SMOG_CHUNKS * CHUNK;
    const geo = new PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    const smog = new Mesh(
      geo,
      new MeshBasicMaterial({ map: this.smogTex, transparent: true, depthWrite: false, side: DoubleSide }),
    );
    smog.position.y = 0.06;
    smog.renderOrder = 2;
    this.group.add(smog);

    this.nestTpl.traverse((o) => {
      if (o instanceof Mesh && o.name === "glow" && !this.eggMats.includes(o.material)) this.eggMats.push(o.material);
    });
  }

  update(world: World, alpha: number, t: number, dt: number) {
    const h = world.hazards;
    if (h.version !== this.smogVersion) {
      this.smogVersion = h.version;
      this.drawSmog(world);
    }

    // Nester: zerstoerte verschwinden.
    for (const [id, node] of this.nests) {
      if (!h.nests.has(id)) {
        this.group.remove(node);
        this.nests.delete(id);
      }
    }
    for (const n of h.nests.values()) {
      const known = this.nests.get(n.id);
      if (known) {
        // Im Nebel des Krieges bleiben Nester verborgen, bis man hinkommt.
        known.visible = world.isExplored(n.x, n.y);
        continue;
      }
      const node = this.nestTpl.clone();
      node.position.set(n.x + 0.5, 0, n.y + 0.5);
      node.rotation.y = (n.x * 7 + n.y * 13) % 6;
      node.visible = world.isExplored(n.x, n.y);
      this.group.add(node);
      this.nests.set(n.id, node);
    }
    // Eier glimmen; schneller, solange Kreaturen unterwegs sind.
    const busy = h.creatures.length > 0;
    for (const m of this.eggMats) m.emissiveIntensity = 0.5 + 0.35 * Math.sin(t * (busy ? 6 : 1.5));

    // Kreaturen
    const alive = new Set<number>();
    for (const c of h.creatures) {
      alive.add(c.id);
      let node = this.creatures.get(c.id);
      if (!node) {
        node = { root: this.creatureTpl.clone(), yaw: 0 };
        node.root.scale.setScalar(1.3);
        this.group.add(node.root);
        this.creatures.set(c.id, node);
      }
      const x = c.px + (c.x - c.px) * alpha;
      const z = c.py + (c.y - c.py) * alpha;
      const dx = c.x - c.px;
      const dz = c.y - c.py;
      const moving = Math.abs(dx) + Math.abs(dz) > 1e-4;
      if (moving) {
        const target = -Math.atan2(dz, dx);
        let diff = target - node.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        node.yaw += diff * Math.min(1, dt * 8);
      }
      const r = node.root;
      r.position.set(x, 0, z);
      r.rotation.y = node.yaw;
      const phase = t * (moving ? 18 : 6) + c.id;
      r.getObjectByName("body")!.position.y = 0.16 + Math.abs(Math.sin(phase)) * (moving ? 0.025 : 0.01);
      let i = 0;
      for (const leg of r.children) {
        if (leg.name !== "leg") continue;
        leg.rotation.y = Math.sin(phase + (i % 2) * Math.PI) * (moving ? 0.5 : 0.15);
        i++;
      }
    }
    for (const [id, node] of this.creatures) {
      if (alive.has(id)) continue;
      this.group.remove(node.root);
      this.creatures.delete(id);
    }
  }

  private drawSmog(world: World) {
    const d = this.smogData;
    d.fill(0);
    const half = SMOG_CHUNKS / 2;
    for (const [k, v] of world.hazards.pollution) {
      const [cx, cy] = k.split(",").map(Number);
      const col = cx + half;
      const row = half - cy - 1;
      if (col < 0 || col >= SMOG_CHUNKS || row < 0 || row >= SMOG_CHUNKS) continue;
      const i = (row * SMOG_CHUNKS + col) * 4;
      // Wenig Smog: leichter Grauschleier, viel Smog: dichter braungrauer Dunst.
      const k2 = 1 - Math.exp(-v / 120);
      d[i] = 96 - 30 * k2;
      d[i + 1] = 86 - 32 * k2;
      d[i + 2] = 64 - 30 * k2;
      d[i + 3] = Math.round(190 * k2);
    }
    this.smogTex.needsUpdate = true;
  }
}
