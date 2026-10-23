import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { oreAt, waterAt } from "../sim/terrain";

// Landschaft: Boden mit Biomen und Raster, Erz-Vorkommen, Deko und Seen.
// Alles wird in Chunks rund um das Kameraziel erzeugt; pro Chunk entstehen nur
// wenige Meshes (Boden, Deko, Leuchtteile, Wasser), damit es auf dem iPad flott bleibt.

const CHUNK = 16;
/** Zusaetzliche Chunks, die erst bei groesserem Abstand verworfen werden. */
const KEEP_MARGIN = 2;
/** Unterteilung je Feld: Feldmitte bekommt die reine Farbe, Raender mischen weich. */
const SUB = 2;
/** Rand um einen Chunk, der fuer Nachbar-Abfragen (Ufer, Seetiefe) mit erfasst wird. */
const MARGIN = 3;
const WATER_Y = -0.06;

/** Gemeinsame Shader-Werte fuer Boden und Wasser, gesetzt von `Environment`. */
export const terrainUniforms = {
  uTime: { value: 0 },
  /** 0 = Tag, 1 = Nacht. */
  uNight: { value: 0 },
  /** Staerke der Wolkenschatten. */
  uCloud: { value: 1 },
  /** Radius des bebauten Bereichs, in dem das Raster nachts leuchtet. */
  uBaseRadius: { value: 24 },
  uSkyColor: { value: new Color(0xa9c7d8) },
};

// ------------------------------------------------------------ Farben

const BIOME = {
  dry: new Color(0x8c9160),
  grass: new Color(0x76955a),
  lush: new Color(0x5a8c5e),
  rock: new Color(0x5d6569),
  sand: new Color(0xbdb088),
  lakeBed: new Color(0x3f5c5a),
};

interface OreStyle {
  ground: number;
  shape: "crystal" | "nugget" | "slab" | "oil";
  color: number;
  accent: number;
  glow: number | null;
}

/** Aussehen je Erz. Unbekannte Erze bekommen `FALLBACK_ORE`. */
const ORE_STYLES: Record<string, OreStyle> = {
  iron_ore: { ground: 0x66727e, shape: "crystal", color: 0x8ea4bd, accent: 0x5f6f80, glow: 0x9fe0ff },
  copper_ore: { ground: 0x86644a, shape: "nugget", color: 0xc8743c, accent: 0x4fa889, glow: 0xffa050 },
  coal: { ground: 0x3d3e43, shape: "slab", color: 0x2a2b30, accent: 0x3a3f4a, glow: null },
  stone: { ground: 0x8a877c, shape: "slab", color: 0xa29e93, accent: 0x7f7b71, glow: null },
  quartz: { ground: 0x9aa4ad, shape: "crystal", color: 0xe6eef5, accent: 0xb9c6d2, glow: 0xd8f4ff },
  sulfur: { ground: 0x9c9455, shape: "nugget", color: 0xe6d24a, accent: 0xf5ea8a, glow: 0xfff27a },
  crude_oil: { ground: 0x34322e, shape: "oil", color: 0x14161b, accent: 0x2b2a26, glow: null },
  bauxite: { ground: 0x9a5a3e, shape: "nugget", color: 0xb5603a, accent: 0xd9a07a, glow: null },
};
const FALLBACK_ORE: OreStyle = { ground: 0x777777, shape: "nugget", color: 0x999999, accent: 0x777777, glow: null };
const oreStyle = (ore: string) => ORE_STYLES[ore] ?? FALLBACK_ORE;

const DECO = {
  pebble: 0x7c7f80,
  rock: 0x6b7073,
  tuft: 0x6e9a4c,
  tuftDry: 0xb3a862,
  bush: 0x4f7d48,
  trunk: 0x6b4e38,
  crown: 0x3f6f55,
  crownLush: 0x467f50,
  reed: 0x7f9a52,
  stem: 0x4f7a50,
  bulb: 0x7fe8ff,
  bulbWarm: 0xffd27a,
  rockGlow: 0x6fd8ff,
};

// ------------------------------------------------------------ Vorlagen

/** Nicht-indizierte Geometrie als rohe Arrays, wird pro Platzierung transformiert. */
interface Template {
  pos: Float32Array;
  nrm: Float32Array;
}

function template(geo: BufferGeometry): Template {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return {
    pos: g.getAttribute("position").array as Float32Array,
    nrm: g.getAttribute("normal").array as Float32Array,
  };
}

const T = {
  pebble: template(new OctahedronGeometry(0.075, 0).scale(1, 0.6, 1.2)),
  boulder: template(new DodecahedronGeometry(0.22, 0).translate(0, 0.08, 0)),
  tuft: template(tuftGeometry()),
  bush: template(new IcosahedronGeometry(0.16, 0).translate(0, 0.1, 0)),
  trunk: template(new CylinderGeometry(0.04, 0.06, 0.32, 5, 1, true).translate(0, 0.16, 0)),
  crown: template(crownGeometry()),
  reed: template(new ConeGeometry(0.018, 0.5, 3, 1, true).translate(0, 0.25, 0)),
  stem: template(new CylinderGeometry(0.012, 0.016, 0.24, 3, 1, true).translate(0, 0.12, 0)),
  bulb: template(new OctahedronGeometry(0.05, 0)),
  crystal: template(new CylinderGeometry(0, 0.075, 1, 5, 1, true).translate(0, 0.5, 0)),
  nugget: template(new IcosahedronGeometry(0.09, 0)),
  slab: template(new BoxGeometry(0.3, 0.06, 0.22)),
  pool: template(new CylinderGeometry(0.34, 0.36, 0.02, 9)),
  shard: template(new OctahedronGeometry(0.035, 0)),
};

/** Kleinteile, die aus der Ferne wegfallen. */
const DETAIL = new Set<Template>([T.pebble, T.tuft, T.reed, T.stem, T.bulb]);
/** Ab diesem Abstand (Chunk-Mitte zum Kameraziel) zeigt ein Chunk keine Kleinteile mehr. */
const DETAIL_RADIUS = 30;

/** Nicht-indizierte Teile ohne UVs zu einer Geometrie verbinden. */
function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const arrays = parts.map((p) => p.toNonIndexed().getAttribute("position").array as Float32Array);
  const pos = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrays) {
    pos.set(a, o);
    o += a.length;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  return g;
}

function tuftGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const c = new ConeGeometry(0.024, 0.2 + i * 0.04, 3, 1, true);
    c.translate(0, 0.1 + i * 0.015, 0);
    c.rotateZ((i - 1) * 0.3);
    c.rotateY(i * 1.7);
    c.translate(Math.cos(i * 2.1) * 0.04, 0, Math.sin(i * 2.1) * 0.04);
    parts.push(c);
  }
  return mergeParts(parts);
}

function crownGeometry(): BufferGeometry {
  const a = new ConeGeometry(0.28, 0.5, 6, 1, true).translate(0, 0.5, 0);
  const b = new ConeGeometry(0.2, 0.4, 6, 1, true).translate(0, 0.78, 0);
  return mergeParts([a, b]);
}

// ------------------------------------------------------------ Materialien

const groundMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
groundMat.onBeforeCompile = (s) => patchGround(s);
groundMat.customProgramCacheKey = () => "terrain-ground";

const decoMat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0.08 });
/** Unbeleuchtete Leuchtteile; `Environment` dreht sie nachts hoch. */
export const glowMat = new MeshBasicMaterial({ vertexColors: true });

const waterMat = new MeshStandardMaterial({
  vertexColors: true,
  transparent: true,
  roughness: 0.12,
  metalness: 0.05,
  depthWrite: false,
});
waterMat.onBeforeCompile = (s) => patchWater(s);
waterMat.customProgramCacheKey = () => "terrain-water";

const SHADER_COMMON = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uCloud;
uniform float uBaseRadius;
uniform vec3 uSkyColor;
varying vec3 vWPos;
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

function addUniformsAndWorldPos(s: WebGLProgramParametersWithUniforms) {
  Object.assign(s.uniforms, terrainUniforms);
  s.vertexShader = s.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
  s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>\n${SHADER_COMMON}`);
}

/** Raster aus Feldfugen, Wolkenschatten und nachts leuchtende Fugen im bebauten Bereich. */
function patchGround(s: WebGLProgramParametersWithUniforms) {
  addUniformsAndWorldPos(s);
  s.fragmentShader = s.fragmentShader
    .replace(
      "#include <color_fragment>",
      /* glsl */ `#include <color_fragment>
      vec2 fw = fwidth(vWPos.xz);
      vec2 toLine = 0.5 - abs(fract(vWPos.xz) - 0.5);
      vec2 lines = 1.0 - smoothstep(vec2(0.012), vec2(0.012) + fw * 1.2, toLine);
      float gridFade = 1.0 - smoothstep(0.05, 0.18, max(fw.x, fw.y));
      float land = smoothstep(-0.04, -0.004, vWPos.y);
      float grid = max(lines.x, lines.y) * gridFade * land;
      diffuseColor.rgb *= 1.0 - 0.15 * grid;
      vec2 cp = vWPos.xz * 0.03 + vec2(uTime * 0.011, uTime * 0.006);
      float cloud = tNoise(cp) * 0.65 + tNoise(cp * 2.3 + 7.0) * 0.35;
      diffuseColor.rgb *= 1.0 - 0.24 * smoothstep(0.52, 0.72, cloud) * uCloud;
      // Nachts wirken Farben blasser.
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), uNight * 0.45);`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      /* glsl */ `#include <emissivemap_fragment>
      float base = 1.0 - smoothstep(uBaseRadius * 0.6, uBaseRadius, length(vWPos.xz));
      float pulse = 0.8 + 0.2 * sin(uTime * 1.5 - length(vWPos.xz) * 0.4);
      totalEmissiveRadiance += vec3(0.2, 0.7, 1.0) * grid * base * uNight * 0.05 * pulse;`,
    );
}

/** Wellen ueber die Normale, Himmel spiegelt sich am flachen Blickwinkel. */
function patchWater(s: WebGLProgramParametersWithUniforms) {
  addUniformsAndWorldPos(s);
  s.fragmentShader = s.fragmentShader
    .replace(
      "#include <normal_fragment_maps>",
      /* glsl */ `#include <normal_fragment_maps>
      vec2 wp = vWPos.xz;
      float wx = cos(wp.x * 3.1 + uTime * 1.3) * 0.6 + cos((wp.x + wp.y) * 5.3 - uTime * 1.9) * 0.4;
      float wz = cos(wp.y * 2.7 - uTime * 1.1) * 0.6 + cos((wp.x - wp.y) * 4.7 + uTime * 1.6) * 0.4;
      normal = normalize(normal + (viewMatrix * vec4(wx * 0.12, 0.0, wz * 0.12, 0.0)).xyz);`,
    )
    .replace(
      "#include <opaque_fragment>",
      /* glsl */ `#include <opaque_fragment>
      float fres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uSkyColor, fres * 0.55);
      gl_FragColor.a = mix(gl_FragColor.a, 0.95, fres * 0.6);`,
    );
}

// ------------------------------------------------------------ Gelaende

interface Placement {
  tx: number;
  tz: number;
  tpl: Template;
  m: Matrix4;
  color: number;
  glow: boolean;
}

interface Chunk {
  group: Group;
  deco: Mesh | null;
  glow: Mesh | null;
  placements: Placement[];
  /** Belegte Felder mit Deko beim letzten Aufbau der Deko-Meshes. */
  hiddenKey: string;
  /** Weit weg: ohne Kleinteile. */
  far: boolean;
}

type Occupied = (x: number, y: number) => boolean;

/** Boden, Erz, Deko und Seen, in Chunks rund um das Kameraziel erzeugt. */
export class TerrainView {
  readonly group = new Group();
  private readonly chunks = new Map<string, Chunk>();
  private occupied: Occupied = () => false;

  /** Erzeugt alle Chunks, die den Kreis `viewRadius` um (cx, cz) beruehren, und verwirft entfernte. */
  update(cx: number, cz: number, viewRadius: number) {
    const keep = viewRadius + KEEP_MARGIN * CHUNK;
    const r = Math.ceil(viewRadius / CHUNK) + 1;
    const ccx = Math.floor(cx / CHUNK);
    const ccz = Math.floor(cz / CHUNK);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const chx = ccx + dx;
        const chz = ccz + dz;
        if (chunkDistance(chx, chz, cx, cz) > viewRadius) continue;
        const key = `${chx},${chz}`;
        if (!this.chunks.has(key)) {
          const c = buildChunk(chx, chz);
          c.far = chunkCenterDistance(chx, chz, cx, cz) > DETAIL_RADIUS;
          this.rebuildDeco(c);
          this.chunks.set(key, c);
          this.group.add(c.group);
        }
      }
    }
    for (const [key, c] of this.chunks) {
      const [x, z] = key.split(",").map(Number);
      if (chunkDistance(x, z, cx, cz) > keep) {
        this.group.remove(c.group);
        disposeChunk(c);
        this.chunks.delete(key);
        continue;
      }
      const far = chunkCenterDistance(x, z, cx, cz) > DETAIL_RADIUS;
      if (far !== c.far) {
        c.far = far;
        this.rebuildDeco(c);
      }
    }
  }

  /** Deko unter Gebaeuden ausblenden; nach jeder Bauaenderung aufrufen. */
  setOccupied(occupied: Occupied) {
    this.occupied = occupied;
    for (const c of this.chunks.values()) {
      if (hiddenKey(c, occupied) !== c.hiddenKey) this.rebuildDeco(c);
    }
  }

  private rebuildDeco(c: Chunk) {
    c.hiddenKey = hiddenKey(c, this.occupied);
    for (const m of [c.deco, c.glow]) {
      if (!m) continue;
      c.group.remove(m);
      m.geometry.dispose();
    }
    const visible = c.placements.filter((p) => !(c.far && DETAIL.has(p.tpl)) && !this.occupied(p.tx, p.tz));
    c.deco = mergePlacements(visible.filter((p) => !p.glow), decoMat, true);
    c.glow = mergePlacements(visible.filter((p) => p.glow), glowMat, false);
    if (c.deco) c.group.add(c.deco);
    if (c.glow) c.group.add(c.glow);
  }
}

/** Abstand vom Punkt zum naechsten Punkt des Chunks. */
function chunkDistance(chx: number, chz: number, x: number, z: number): number {
  const dx = Math.max(chx * CHUNK - x, 0, x - (chx + 1) * CHUNK);
  const dz = Math.max(chz * CHUNK - z, 0, z - (chz + 1) * CHUNK);
  return Math.hypot(dx, dz);
}

const chunkCenterDistance = (chx: number, chz: number, x: number, z: number) =>
  Math.hypot((chx + 0.5) * CHUNK - x, (chz + 0.5) * CHUNK - z);

function hiddenKey(c: Chunk, occupied: Occupied): string {
  let key = "";
  let last = "";
  for (const p of c.placements) {
    if (!occupied(p.tx, p.tz)) continue;
    const k = `${p.tx},${p.tz};`;
    if (k !== last) key += k;
    last = k;
  }
  return key;
}

interface TileInfo {
  ore: string | null;
  water: boolean;
  color: Color;
  /** Seetiefe 0..1 (nur Wasserfelder). */
  depth: number;
}

function buildChunk(chx: number, chz: number): Chunk {
  const group = new Group();
  const x0 = chx * CHUNK;
  const z0 = chz * CHUNK;
  const W = CHUNK + 2 * MARGIN;

  // Felder samt Rand vorberechnen.
  const water = new Uint8Array(W * W);
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) water[j * W + i] = waterAt(x0 - MARGIN + i, z0 - MARGIN + j) ? 1 : 0;
  }
  const isWater = (tx: number, tz: number) => water[(tz - z0 + MARGIN) * W + (tx - x0 + MARGIN)] === 1;
  const tiles: TileInfo[] = [];
  const tileAt = (tx: number, tz: number) => tiles[(tz - z0 + 1) * (CHUNK + 2) + (tx - x0 + 1)];
  for (let tz = z0 - 1; tz <= z0 + CHUNK; tz++) {
    for (let tx = x0 - 1; tx <= x0 + CHUNK; tx++) {
      const w = isWater(tx, tz);
      const ore = w ? null : oreAt(tx, tz);
      let depth = 0;
      if (w) {
        let n = 0;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) n += isWater(tx + dx, tz + dz) ? 1 : 0;
        depth = Math.max(0, (n - 9) / 16);
      }
      const color = new Color();
      if (w) color.copy(BIOME.sand);
      else if (ore) color.setHex(oreStyle(ore).ground).offsetHSL(0, 0, (hash(tx, tz, 5) - 0.5) * 0.05);
      else biomeColor(tx, tz, color);
      tiles.push({ ore, water: w, color, depth });
    }
  }

  group.add(buildGround(x0, z0, tileAt));
  const waterMesh = buildWater(x0, z0, tileAt);
  if (waterMesh) group.add(waterMesh);

  const placements: Placement[] = [];
  for (let tz = z0; tz < z0 + CHUNK; tz++) {
    for (let tx = x0; tx < x0 + CHUNK; tx++) {
      const t = tileAt(tx, tz);
      if (t.water) continue;
      if (t.ore) placeOre(placements, tx, tz, oreStyle(t.ore));
      else {
        const shore = tileAt(tx + 1, tz).water || tileAt(tx - 1, tz).water || tileAt(tx, tz + 1).water || tileAt(tx, tz - 1).water;
        placeDeco(placements, tx, tz, shore);
      }
    }
  }
  return { group, deco: null, glow: null, placements, hiddenKey: "-", far: false };
}

/** Feld-Ecken und -Mitten als Gitter; Wasserfelder senken sich zur Seemitte ab. */
function buildGround(x0: number, z0: number, tileAt: (x: number, z: number) => TileInfo): Mesh {
  const N = CHUNK * SUB;
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  const col = new Float32Array((N + 1) * (N + 1) * 3);
  const c = new Color();
  const deep = new Color();
  let v = 0;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const wx = x0 + i / SUB;
      const wz = z0 + j / SUB;
      const { tiles, allWater, depth } = adjacentTiles(wx, wz, tileAt);
      c.setRGB(0, 0, 0);
      for (const t of tiles) c.add(t.color);
      c.multiplyScalar(1 / tiles.length);
      let y = 0;
      if (allWater) {
        y = -(0.1 + 0.32 * depth);
        c.lerp(deep.copy(BIOME.lakeBed), Math.min(1, 0.4 + depth));
      }
      pos[v * 3] = wx;
      pos[v * 3 + 1] = y;
      pos[v * 3 + 2] = wz;
      col[v * 3] = c.r;
      col[v * 3 + 1] = c.g;
      col[v * 3 + 2] = c.b;
      v++;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      const b = a + 1;
      const d = a + N + 1;
      const e = d + 1;
      idx.push(a, d, e, a, e, b);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("color", new BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new Mesh(geo, groundMat);
  mesh.receiveShadow = true;
  return mesh;
}

/** Felder, die einen Gitterpunkt beruehren (1 an der Feldmitte, 2 an Kanten, 4 an Ecken). */
function adjacentTiles(wx: number, wz: number, tileAt: (x: number, z: number) => TileInfo) {
  const onX = Number.isInteger(wx);
  const onZ = Number.isInteger(wz);
  const xs = onX ? [wx - 1, wx] : [Math.floor(wx)];
  const zs = onZ ? [wz - 1, wz] : [Math.floor(wz)];
  const tiles: TileInfo[] = [];
  let allWater = true;
  let depth = 0;
  for (const z of zs) {
    for (const x of xs) {
      const t = tileAt(x, z);
      tiles.push(t);
      allWater &&= t.water;
      depth += t.depth;
    }
  }
  return { tiles, allWater, depth: depth / tiles.length };
}

function buildWater(x0: number, z0: number, tileAt: (x: number, z: number) => TileInfo): Mesh | null {
  const pos: number[] = [];
  const col: number[] = [];
  const shallow = new Color(0x5fb8b0);
  const deepCol = new Color(0x1d5a7a);
  const c = new Color();
  const vert = (wx: number, wz: number) => {
    const { allWater, depth } = adjacentTiles(wx, wz, tileAt);
    const d = allWater ? depth : 0;
    c.copy(shallow).lerp(deepCol, Math.min(1, d * 1.6));
    pos.push(wx, WATER_Y, wz);
    col.push(c.r, c.g, c.b, 0.45 + 0.45 * Math.min(1, d * 2));
  };
  const step = 1 / SUB;
  for (let tz = z0; tz < z0 + CHUNK; tz++) {
    for (let tx = x0; tx < x0 + CHUNK; tx++) {
      if (!tileAt(tx, tz).water) continue;
      for (let j = 0; j < SUB; j++) {
        for (let i = 0; i < SUB; i++) {
          const ax = tx + i * step;
          const az = tz + j * step;
          const bx = ax + step;
          const bz = az + step;
          vert(ax, az);
          vert(ax, bz);
          vert(bx, bz);
          vert(ax, az);
          vert(bx, bz);
          vert(bx, az);
        }
      }
    }
  }
  if (pos.length === 0) return null;
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("color", new BufferAttribute(new Float32Array(col), 4));
  geo.setAttribute("normal", new BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const mesh = new Mesh(geo, waterMat);
  mesh.renderOrder = 1;
  return mesh;
}

/** Weiche Biome aus zwei Rauschfeldern: Feuchte und Gestein. */
function biomeColor(tx: number, tz: number, out: Color): Color {
  const { wet, rock } = biomeAt(tx, tz);
  out.copy(BIOME.dry).lerp(BIOME.grass, smooth01((wet - 0.22) / 0.18));
  out.lerp(BIOME.lush, smooth01((wet - 0.6) / 0.18));
  out.lerp(BIOME.rock, smooth01((rock - 0.6) / 0.16));
  return out.offsetHSL(0, 0, (hash(tx, tz, 1) - 0.5) * 0.035);
}

function biomeAt(tx: number, tz: number) {
  // Rund um den Start eher gruene Wiese.
  const home = 0.25 * (1 - smooth01(Math.hypot(tx, tz) / 30));
  return {
    wet: noise(tx / 26, tz / 26, 11) * 0.7 + noise(tx / 9, tz / 9, 12) * 0.3 + home,
    rock: noise(tx / 34, tz / 34, 13) * 0.75 + noise(tx / 11, tz / 11, 14) * 0.25,
  };
}

// ------------------------------------------------------------ Platzierung

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

function put(
  out: Placement[],
  tx: number,
  tz: number,
  tpl: Template,
  color: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  sx: number,
  sy = sx,
  sz = sx,
  tiltX = 0,
  tiltZ = 0,
  glow = false,
) {
  _e.set(tiltX, yaw, tiltZ);
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  out.push({ tx, tz, tpl, m: _m.clone(), color, glow });
}

function placeOre(out: Placement[], tx: number, tz: number, st: OreStyle) {
  const r = (k: number) => hash(tx, tz, 100 + k);
  const cx = tx + 0.5;
  const cz = tz + 0.5;
  switch (st.shape) {
    case "crystal": {
      put(out, tx, tz, T.boulder, st.accent, cx + (r(0) - 0.5) * 0.2, -0.04, cz + (r(1) - 0.5) * 0.2, r(2) * 6, 0.8, 0.45);
      const n = 3 + Math.floor(r(3) * 2);
      for (let k = 0; k < n; k++) {
        const a = r(10 + k) * Math.PI * 2;
        const d = 0.08 + r(20 + k) * 0.2;
        const h = 0.24 + r(30 + k) * 0.3;
        const tilt = 0.15 + r(40 + k) * 0.35;
        put(out, tx, tz, T.crystal, k === 0 ? st.color : shade(st.color, r(50 + k)), cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d, a, 1, h, 1, Math.sin(a) * tilt, -Math.cos(a) * tilt);
      }
      if (st.glow !== null) put(out, tx, tz, T.shard, st.glow, cx + (r(4) - 0.5) * 0.4, 0.03, cz + (r(5) - 0.5) * 0.4, r(6) * 6, 1, 1.4, 1, 0, 0, true);
      break;
    }
    case "nugget": {
      const n = 3 + Math.floor(r(3) * 2);
      for (let k = 0; k < n; k++) {
        const s = 0.7 + r(10 + k) * 0.8;
        const color = k === n - 1 && r(9) < 0.35 ? st.accent : shade(st.color, r(20 + k));
        put(out, tx, tz, T.nugget, color, tx + 0.2 + r(30 + k) * 0.6, 0.03 * s, tz + 0.2 + r(40 + k) * 0.6, r(50 + k) * 6, s, s * 0.75, s, r(60 + k) * 0.6);
      }
      if (st.glow !== null && r(7) < 0.6) put(out, tx, tz, T.shard, st.glow, cx + (r(4) - 0.5) * 0.5, 0.02, cz + (r(5) - 0.5) * 0.5, r(6) * 6, 0.8, 0.8, 0.8, 0, 0, true);
      break;
    }
    case "slab": {
      const n = 2 + Math.floor(r(3) * 2);
      for (let k = 0; k < n; k++) {
        const s = 0.7 + r(10 + k) * 0.6;
        put(out, tx, tz, T.slab, shade(k === 0 ? st.accent : st.color, r(20 + k)), tx + 0.25 + r(30 + k) * 0.5, 0.02 + k * 0.035, tz + 0.25 + r(40 + k) * 0.5, r(50 + k) * 6, s, 1 + r(60 + k), s, (r(70 + k) - 0.5) * 0.5, (r(80 + k) - 0.5) * 0.5);
      }
      if (r(8) < 0.5) put(out, tx, tz, T.pebble, st.color, tx + 0.2 + r(9) * 0.6, 0.02, tz + 0.2 + r(11) * 0.6, r(12) * 6, 1.2);
      break;
    }
    case "oil": {
      put(out, tx, tz, T.pool, st.color, cx, 0.005, cz, r(2) * 6, 0.8 + r(3) * 0.3, 1, 0.8 + r(4) * 0.3);
      for (let k = 0; k < 3; k++) {
        const a = r(10 + k) * Math.PI * 2;
        put(out, tx, tz, T.pebble, st.accent, cx + Math.cos(a) * 0.36, 0.01, cz + Math.sin(a) * 0.36, a, 1.2, 0.7);
      }
      break;
    }
  }
}

function placeDeco(out: Placement[], tx: number, tz: number, shore: boolean) {
  const d0 = Math.hypot(tx + 0.5, tz + 0.5);
  if (d0 < 2.5) return;
  const r = (k: number) => hash(tx, tz, 200 + k);
  const { wet, rock } = biomeAt(tx, tz);
  const lush = smooth01((wet - 0.6) / 0.18);
  const dry = 1 - smooth01((wet - 0.22) / 0.18);
  const rocky = smooth01((rock - 0.6) / 0.16);
  const grass = Math.max(0, 1 - lush - dry - rocky);
  const at = (k: number) => [tx + 0.15 + r(k) * 0.7, tz + 0.15 + r(k + 1) * 0.7] as const;

  if (shore && r(0) < 0.4) {
    for (let k = 0; k < 4; k++) {
      const [x, z] = at(10 + k * 2);
      put(out, tx, tz, T.reed, shade(DECO.reed, r(30 + k)), x, 0, z, r(40 + k) * 6, 1, 0.6 + r(50 + k) * 0.7, 1, (r(60 + k) - 0.5) * 0.3);
    }
    return;
  }

  // Baeume nicht direkt am Hub, damit der Start uebersichtlich bleibt.
  if (d0 > 7 && r(1) < lush * 0.07 + grass * 0.018) {
    const [x, z] = at(2);
    const s = 0.8 + r(4) * 0.6;
    put(out, tx, tz, T.trunk, DECO.trunk, x, 0, z, 0, s);
    put(out, tx, tz, T.crown, shade(lush > 0.5 ? DECO.crownLush : DECO.crown, r(5)), x, 0, z, r(6) * 6, s, s * (0.9 + r(7) * 0.3));
    return;
  }
  if (r(8) < lush * 0.05 + grass * 0.025 + dry * 0.02) {
    const [x, z] = at(9);
    const s = 0.6 + r(11) * 0.7;
    put(out, tx, tz, T.bush, shade(DECO.bush, r(12)), x, 0, z, r(13) * 6, s, s * 0.8);
  }
  const tuftChance = lush * 0.35 + grass * 0.18 + dry * 0.1;
  for (let k = 0; k < 3; k++) {
    if (r(20 + k) >= tuftChance) continue;
    const [x, z] = at(23 + k * 2);
    put(out, tx, tz, T.tuft, shade(dry > 0.5 ? DECO.tuftDry : DECO.tuft, r(30 + k)), x, 0, z, r(33 + k) * 6, 0.8 + r(36 + k) * 0.6);
  }
  if (r(40) < lush * 0.05 + grass * 0.012) {
    // Leuchtpflanze: Stiel mit Knospe, die nachts strahlt.
    const [x, z] = at(41);
    const h = 0.8 + r(43) * 0.6;
    put(out, tx, tz, T.stem, DECO.stem, x, 0, z, 0, 1, h);
    put(out, tx, tz, T.bulb, r(44) < 0.7 ? DECO.bulb : DECO.bulbWarm, x, 0.24 * h, z, r(45) * 6, 1, 1.3, 1, 0, 0, true);
  }
  const pebbleChance = rocky * 0.3 + dry * 0.08 + grass * 0.02;
  for (let k = 0; k < 2; k++) {
    if (r(50 + k) >= pebbleChance) continue;
    const [x, z] = at(52 + k * 2);
    put(out, tx, tz, T.pebble, shade(DECO.pebble, r(56 + k)), x, 0.01, z, r(58 + k) * 6, 0.7 + r(60 + k) * 0.9, 0.6);
  }
  if (r(62) < rocky * 0.06 + 0.004) {
    const [x, z] = at(63);
    const s = 0.7 + r(65) * 0.8;
    put(out, tx, tz, T.boulder, shade(DECO.rock, r(66)), x, 0, z, r(67) * 6, s, s * (0.6 + r(68) * 0.5), s * (0.8 + r(69) * 0.4));
    if (r(70) < 0.35) put(out, tx, tz, T.shard, DECO.rockGlow, x + 0.15, 0.03, z - 0.1, r(71) * 6, 0.9, 1.6, 0.9, 0.3, 0, true);
  }
}

/** Leichte Helligkeits-Streuung einer Farbe. */
function shade(hex: number, h: number): number {
  return _c.setHex(hex).offsetHSL(0, 0, (h - 0.5) * 0.08).getHex();
}
const _c = new Color();

// ------------------------------------------------------------ Zusammenfuegen

const _nm = new Matrix3();
const _v = new Vector3();

function mergePlacements(list: Placement[], material: MeshStandardMaterial | MeshBasicMaterial, shadows: boolean): Mesh | null {
  if (list.length === 0) return null;
  let n = 0;
  for (const p of list) n += p.tpl.pos.length;
  const pos = new Float32Array(n);
  const nrm = new Float32Array(n);
  const col = new Float32Array(n);
  const c = new Color();
  let o = 0;
  for (const p of list) {
    _nm.getNormalMatrix(p.m);
    c.setHex(p.color);
    const { pos: tp, nrm: tn } = p.tpl;
    for (let i = 0; i < tp.length; i += 3) {
      _v.set(tp[i], tp[i + 1], tp[i + 2]).applyMatrix4(p.m);
      pos[o] = _v.x;
      pos[o + 1] = _v.y;
      pos[o + 2] = _v.z;
      _v.set(tn[i], tn[i + 1], tn[i + 2]).applyMatrix3(_nm).normalize();
      nrm[o] = _v.x;
      nrm[o + 1] = _v.y;
      nrm[o + 2] = _v.z;
      col[o] = c.r;
      col[o + 1] = c.g;
      col[o + 2] = c.b;
      o += 3;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("normal", new BufferAttribute(nrm, 3));
  geo.setAttribute("color", new BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mesh = new Mesh(geo, material);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
}

function disposeChunk(c: Chunk) {
  c.group.traverse((o) => {
    if (o instanceof Mesh) o.geometry.dispose();
  });
}

// ------------------------------------------------------------ Rauschen

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed + 0x5bd1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const smooth01 = (t: number) => smoothstep(Math.min(1, Math.max(0, t)));
