import {
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import { oreAt, type OreId } from "../sim/terrain";
import { PALETTE } from "./palette";

const CHUNK = 16;
/** Zusaetzliche Chunks, die erst bei groesserem Abstand verworfen werden. */
const KEEP_MARGIN = 2;

const groundMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
const rockMat = new MeshStandardMaterial({ flatShading: true, roughness: 0.8, metalness: 0.15 });
const rockGeo = new DodecahedronGeometry(0.16, 0);

/** Boden und Erz-Felsen, in Chunks rund um das Kameraziel erzeugt. */
export class TerrainView {
  readonly group = new Group();
  private readonly chunks = new Map<string, Group>();

  update(cx: number, cz: number, viewRadius: number) {
    const r = Math.ceil(viewRadius / CHUNK) + 1;
    const ccx = Math.floor(cx / CHUNK);
    const ccz = Math.floor(cz / CHUNK);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const key = `${ccx + dx},${ccz + dz}`;
        if (!this.chunks.has(key)) {
          const c = buildChunk(ccx + dx, ccz + dz);
          this.chunks.set(key, c);
          this.group.add(c);
        }
      }
    }
    for (const [key, c] of this.chunks) {
      const [x, z] = key.split(",").map(Number);
      if (Math.abs(x - ccx) > r + KEEP_MARGIN || Math.abs(z - ccz) > r + KEEP_MARGIN) {
        this.group.remove(c);
        disposeChunk(c);
        this.chunks.delete(key);
      }
    }
  }
}

function buildChunk(chx: number, chz: number): Group {
  const g = new Group();
  const x0 = chx * CHUNK;
  const z0 = chz * CHUNK;

  const pos: number[] = [];
  const col: number[] = [];
  const c = new Color();
  const quad = (ax: number, az: number, bx: number, bz: number, y: number, color: Color) => {
    pos.push(ax, y, az, ax, y, bz, bx, y, bz, ax, y, az, bx, y, bz, bx, y, az);
    for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b);
  };

  // Fugen zwischen den Feldern ergeben das Raster.
  quad(x0, z0, x0 + CHUNK, z0 + CHUNK, -0.02, c.setHex(PALETTE.groundGap));
  const rocks: { x: number; z: number; ore: OreId; h: number }[] = [];
  const gap = 0.035;
  for (let tz = z0; tz < z0 + CHUNK; tz++) {
    for (let tx = x0; tx < x0 + CHUNK; tx++) {
      const ore = oreAt(tx, tz);
      const h = hash(tx, tz);
      if (ore) {
        c.setHex(PALETTE.oreGround[ore]);
        rocks.push({ x: tx, z: tz, ore, h });
      } else {
        c.setHex((tx + tz) & 1 ? PALETTE.ground : PALETTE.groundAlt);
      }
      c.offsetHSL(0, 0, (h - 0.5) * 0.04);
      quad(tx + gap, tz + gap, tx + 1 - gap, tz + 1 - gap, 0, c);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new Mesh(geo, groundMat);
  ground.receiveShadow = true;
  g.add(ground);

  if (rocks.length > 0) {
    const perTile = 2;
    const inst = new InstancedMesh(rockGeo, rockMat, rocks.length * perTile);
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const p = new Vector3();
    const axis = new Vector3(0, 1, 0);
    let i = 0;
    for (const r of rocks) {
      for (let k = 0; k < perTile; k++) {
        const h1 = hash(r.x * 3 + k, r.z * 7 - k);
        const h2 = hash(r.z * 5 - k, r.x * 11 + k);
        const size = 0.7 + h1 * 0.7;
        p.set(r.x + 0.25 + h1 * 0.5, 0.04 * size, r.z + 0.25 + h2 * 0.5);
        q.setFromAxisAngle(axis, h2 * Math.PI * 2);
        s.set(size, size * (0.6 + h2 * 0.5), size);
        inst.setMatrixAt(i, m.compose(p, q, s));
        inst.setColorAt(i, c.setHex(PALETTE.rock[r.ore]).offsetHSL(0, 0, (h1 - 0.5) * 0.12));
        i++;
      }
    }
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    g.add(inst);
  }
  return g;
}

function disposeChunk(g: Group) {
  for (const child of g.children) {
    if (child instanceof InstancedMesh) child.dispose();
    else if (child instanceof Mesh) child.geometry.dispose();
  }
}

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
