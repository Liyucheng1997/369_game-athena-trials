// Game collision: the world is treated as a 2.5D height field.
//   * ground: every walkable / solid module (terrain, temple, acropolis, aqueducts, sets, statues, city, ruins)
//     is rendered from straight above into a float target (water/heightmap.js captureHeightMap), so stairs,
//     terraces, podiums, columns, ships and the fallen head all become heights. Walls are steep height steps:
//     the hero climbs them (BotW style), enemies and the camera are blocked by them.
//   * tree trunks: circles from the vegetation instances (crowns are ignored).
//   * water: the lagoon, river, channel and sea surfaces are all at sea level (y = 0).
import * as THREE from 'three';
import { captureHeightMap } from '../water/heightmap.js';
import { heightAt } from '../world/heightfield.js';

export const WATER_LEVEL = 0;
export const BOUNDS = [-720, -520, 400, 460]; // playable area [x0, z0, x1, z1]
const SOLID_MODULES = ['terrain', 'temple', 'acropolis', 'aqueducts', 'sets', 'statues', 'city', 'ruins'];

export class World {
  constructor(engine) {
    this.engine = engine;
    this.bounds = BOUNDS;
    this.trees = new Map(); // spatial hash "i,j" -> [{x,z,r}]
    this.cell = 8;
  }

  build() {
    const e = this.engine;
    const solids = new Set();
    for (const m of SOLID_MODULES) for (const r of e.moduleRoots?.[m] || []) r.traverse((o) => solids.add(o));
    const t0 = performance.now();
    const cap = captureHeightMap(e, {
      bounds: this.bounds, res: 2240,
      filter: (o) => solids.has(o) && !o.userData.isWater && !(o.material && (o.material.transparent || o.material.visible === false)),
    });
    this.cap = cap;
    this.data = cap.data; this.W = cap.W; this.H = cap.H;
    this.dx = (this.bounds[2] - this.bounds[0]) / cap.W;
    this.dz = (this.bounds[3] - this.bounds[1]) / cap.H;
    cap.tex.dispose();
    // terrain alone (no buildings): tells natural ground from roofs / terraces when placing creatures
    const terr = new Set(); for (const r of e.moduleRoots?.terrain || []) r.traverse((o) => terr.add(o));
    const tc = captureHeightMap(e, { bounds: this.bounds, res: 1120, filter: (o) => terr.has(o) });
    tc.tex.dispose();
    this.tcap = tc;
    this._trees();
    console.log(`[game] collision ${cap.W}x${cap.H} from ${cap.meshes} meshes, ${this.treeCount} trunks in ${Math.round(performance.now() - t0)} ms`);
  }

  _trees() {
    let n = 0;
    const veg = this.engine.registry.vegetation;
    for (const v of veg?.variants || []) {
      for (const it of v.inst) {
        if (it.h < 3.5) continue; // shrubs: walk through
        const r = THREE.MathUtils.clamp(it.h * 0.03, 0.25, 0.65);
        this._addTree(it.x, it.z, r);
        n++;
      }
    }
    this.treeCount = n;
  }
  _addTree(x, z, r) {
    const k = `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
    let a = this.trees.get(k);
    if (!a) this.trees.set(k, (a = []));
    a.push({ x, z, r });
  }

  /** bilinear ground height (captured meshes; analytic terrain outside the capture) */
  ground(x, z) {
    const b = this.bounds;
    const fx = (x - b[0]) / this.dx - 0.5, fz = (z - b[1]) / this.dz - 0.5;
    if (fx < 0 || fz < 0 || fx > this.W - 1 || fz > this.H - 1) return heightAt(x, z);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const W = this.W, d = this.data;
    const i1 = Math.min(W - 1, i + 1), j1 = Math.min(this.H - 1, j + 1);
    const a = d[j * W + i], bb = d[j * W + i1], c = d[j1 * W + i], dd = d[j1 * W + i1];
    return (a * (1 - tx) + bb * tx) * (1 - tz) + (c * (1 - tx) + dd * tx) * tz;
  }

  /** natural terrain height (ignores architecture) */
  terrain(x, z) { const v = this.tcap?.sample(x, z); return v ?? heightAt(x, z); }
  /** standing on built structure (roof, terrace, podium…) rather than natural ground */
  onStructure(x, z) { return this.ground(x, z) - this.terrain(x, z) > 0.8; }

  /** highest ground under a disc (centre + 4 rim points) */
  groundMax(x, z, r) {
    let g = this.ground(x, z);
    g = Math.max(g, this.ground(x + r, z), this.ground(x - r, z), this.ground(x, z + r), this.ground(x, z - r));
    return g;
  }

  /** walking surface: ground or the water surface for floating things */
  surface(x, z) { return Math.max(this.ground(x, z), WATER_LEVEL); }

  isWater(x, z, depth = 1.2) { return this.ground(x, z) < WATER_LEVEL - depth; }

  inBounds(x, z, m = 4) { const b = this.bounds; return x > b[0] + m && x < b[2] - m && z > b[1] + m && z < b[3] - m; }

  /** horizontal ground gradient → outward wall normal (pointing from high toward low ground) */
  wallNormal(x, z) {
    const e = 0.6;
    const gx = this.ground(x + e, z) - this.ground(x - e, z);
    const gz = this.ground(x, z + e) - this.ground(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    return [-gx / l, -gz / l];
  }

  /** push a circle out of tree trunks; returns [x, z] */
  pushTrees(x, z, r) {
    const ci = Math.floor(x / this.cell), cj = Math.floor(z / this.cell);
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const a = this.trees.get(`${i},${j}`);
      if (!a) continue;
      for (const t of a) {
        const dx = x - t.x, dz = z - t.z, rr = r + t.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); x = t.x + (dx / d) * rr; z = t.z + (dz / d) * rr; }
      }
    }
    return [x, z];
  }

  /** can a body standing at height y move onto (x, z)? (step height, radius) */
  passable(x, z, y, r = 0.4, step = 0.6) {
    if (!this.inBounds(x, z)) return false;
    return this.groundMax(x, z, r) - y <= step;
  }

  /**
   * move a body by (dx, dz) with wall sliding. Returns { x, z, blocked, wallH } where wallH is the
   * height of the blocking wall above y (for climbing) when the full move was blocked.
   */
  move(x, z, y, dx, dz, r = 0.4, step = 0.6, trees = true) {
    let nx = x + dx, nz = z + dz;
    let blocked = false, wallH = 0;
    if (!this.passable(nx, nz, y, r, step)) {
      blocked = true;
      wallH = this.groundMax(nx, nz, r) - y;
      if (this.passable(x + dx, z, y, r, step)) { nx = x + dx; nz = z; }
      else if (this.passable(x, z + dz, y, r, step)) { nx = x; nz = z + dz; }
      else { nx = x; nz = z; }
    }
    if (trees) {
      const [px, pz] = this.pushTrees(nx, nz, r);
      if (this.passable(px, pz, y, r, step)) { nx = px; nz = pz; }
    }
    return { x: nx, z: nz, blocked, wallH };
  }

  /** first point along a segment that is under the ground (for camera collision); returns t in [0,1] */
  rayGround(ax, ay, az, bx, by, bz, pad = 0.35) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.max(2, Math.ceil(len / 0.35));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (this.ground(x, z) + pad > y) return (i - 1) / n;
    }
    return 1;
  }

  /** nearest walkable dry spot to (x, z) on a spiral (for spawning things) */
  findSpot(x, z, { maxR = 30, dry = true, flat = 0.6, natural = false, y = null, dy = 1.5 } = {}) {
    for (let r = 0; r <= maxR; r += 1) {
      const steps = Math.max(1, Math.round(r * 2));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        const g = this.ground(px, pz);
        if (dry && g < WATER_LEVEL + 0.3) continue;
        if (this.groundMax(px, pz, 0.8) - g > flat) continue;
        if (natural && this.onStructure(px, pz)) continue;
        if (y !== null && Math.abs(g - y) > dy) continue;
        return [px, g, pz];
      }
    }
    return [x, this.ground(x, z), z];
  }
}
