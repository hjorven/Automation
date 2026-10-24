import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";
import type { BlueprintState } from "../game/editor";
import { normRect, planPaste, type PlanStatus } from "../sim/blueprint";
import { BELT_LEVEL } from "../sim/progression";
import type { World } from "../sim/world";

const MAX = 64 * 64;

const COLORS: Record<string, Color> = {
  ok: new Color(0x5fe3ff),
  same: new Color(0x8a9bb0),
  cost: new Color(0xffc94a),
  bad: new Color(0xff6b6b),
};

const colorOf = (s: PlanStatus) => (s === "ok" ? COLORS.ok : s === "same" ? COLORS.same : s === "cost" ? COLORS.cost : COLORS.bad);

/**
 * Hologramm fuer das Blaupausen-Werkzeug: markierter Bereich als leuchtende
 * Flaeche und die Vorschau beim Einfuegen als halbdurchsichtige Bloecke
 * (cyan = wird gebaut, gelb = Lager reicht nicht, rot = geht hier nicht,
 * grau = steht schon so da).
 */
export class BlueprintView {
  readonly group = new Group();
  private readonly area: Mesh;
  private readonly areaEdge: LineSegments;
  private readonly blocks: InstancedMesh;
  private readonly arrows: InstancedMesh;
  private readonly footprint: Mesh;
  private key = "";
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);

  constructor() {
    const plane = new PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    plane.translate(0.5, 0, 0.5);
    this.area = new Mesh(plane, new MeshBasicMaterial({ color: 0x5fe3ff, transparent: true, opacity: 0.18, depthWrite: false }));
    const edge = new EdgesGeometry(plane);
    this.areaEdge = new LineSegments(edge, new LineBasicMaterial({ color: 0x5fe3ff, transparent: true }));
    this.footprint = new Mesh(plane, new MeshBasicMaterial({ color: 0x5fe3ff, transparent: true, opacity: 0.08, depthWrite: false }));

    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    this.blocks = new InstancedMesh(
      box,
      // Beleuchtet, damit die Bloecke als Koerper lesbar sind (Seiten dunkler als oben).
      new MeshLambertMaterial({ color: 0xffffff, emissive: 0x16323a, transparent: true, opacity: 0.6, depthWrite: false }),
      MAX,
    );
    this.blocks.instanceMatrix.setUsage(DynamicDrawUsage);
    const arrow = new BoxGeometry(0.34, 0.06, 0.14);
    arrow.translate(0.26, 0, 0);
    this.arrows = new InstancedMesh(arrow, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), MAX);
    this.arrows.instanceMatrix.setUsage(DynamicDrawUsage);
    for (const o of [this.blocks, this.arrows]) {
      o.frustumCulled = false;
      o.count = 0;
    }
    this.group.add(this.area, this.areaEdge, this.footprint, this.blocks, this.arrows);
    this.group.renderOrder = 10;
    this.group.visible = false;
  }

  /** Jeden Frame aufrufen; baut nur neu, wenn sich etwas geaendert hat. */
  update(world: World, active: boolean, bp: BlueprintState, t: number) {
    this.group.visible = active;
    if (!active) return;
    const pulse = 0.75 + 0.25 * Math.sin(t * 4);
    (this.areaEdge.material as LineBasicMaterial).opacity = pulse;

    const r = bp.mode === "select" ? bp.rect : null;
    const at = bp.mode === "paste" ? bp.at : null;
    const key = `${bp.mode}|${r ? `${r.x0},${r.y0},${r.x1},${r.y1}` : ""}|${at ? `${at.x},${at.y}` : ""}|${world.version}|${world.storageVersion}`;
    if (key === this.key && this.clipRef === bp.clip) return;
    this.key = key;
    this.clipRef = bp.clip;

    this.area.visible = this.areaEdge.visible = !!r;
    if (r) {
      const n = normRect(r);
      for (const o of [this.area, this.areaEdge]) {
        o.position.set(n.x0, 0.06, n.y0);
        o.scale.set(n.x1 - n.x0 + 1, 1, n.y1 - n.y0 + 1);
      }
    }

    const clip = bp.clip;
    this.footprint.visible = !!(at && clip);
    if (!at || !clip) {
      this.blocks.count = this.arrows.count = 0;
      return;
    }
    this.footprint.position.set(at.x, 0.04, at.y);
    this.footprint.scale.set(clip.w, 1, clip.h);
    const plan = planPaste(world, clip, at.x, at.y);
    const n = Math.min(MAX, clip.entries.length);
    for (let k = 0; k < n; k++) {
      const e = clip.entries[k];
      const belt = !!BELT_LEVEL[e.id];
      // Konflikte ragen ueber die Gebaeude, damit man sie sieht.
      const clash = plan[k] !== "ok" && plan[k] !== "same" && plan[k] !== "cost";
      const height = clash ? 1.1 : belt ? 0.1 : 0.62;
      const x = at.x + e.dx + 0.5;
      const z = at.y + e.dy + 0.5;
      this.q.setFromAxisAngle(this.up, (-e.dir * Math.PI) / 2);
      this.m.compose(new Vector3(x, 0.02, z), this.q, new Vector3(0.86, height, 0.86));
      this.blocks.setMatrixAt(k, this.m);
      this.blocks.setColorAt(k, colorOf(plan[k]));
      this.m.compose(new Vector3(x, height + 0.04, z), this.q, new Vector3(1, 1, 1));
      this.arrows.setMatrixAt(k, this.m);
      this.arrows.setColorAt(k, colorOf(plan[k]));
    }
    this.blocks.count = this.arrows.count = n;
    for (const o of [this.blocks, this.arrows]) {
      o.instanceMatrix.needsUpdate = true;
      if (o.instanceColor) o.instanceColor.needsUpdate = true;
    }
  }

  private clipRef: unknown = null;
}
