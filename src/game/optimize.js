// Real-time optimisation of the offline-built world (game only; the render tools never load this).
// The Athenaion modules were tuned for 9 fixed cameras: many details are merged into world-spanning meshes
// (never frustum-culled) and statue LODs were picked from the shot cameras. For a free-roaming camera:
//   1. split big merged meshes and widely scattered InstancedMeshes into spatial chunks (frustum culling works)
//   2. distance-cull small detail chunks (ivy, leaves, urns, braziers…) by their item size
//   3. re-bucket the generic statues into LOD 0/1/2 by distance to the camera every few frames
import * as THREE from 'three';
import { statueLibrary } from '../sculpt/statuary-lib.js';

const CELL = 48;
export const DETAIL_LAYER = 1;
const DETAIL_RE = /ivy|leaves|leaf|vine|weed|grass|flower|moss|tuft|petal|fern|clump|rubble|pebble|card/i;
const OPT_MODULES = ['temple', 'acropolis', 'aqueducts', 'sets', 'statues', 'city', 'ruins', 'banners', 'flora', 'waterfalls'];
const defaultOBR = THREE.Object3D.prototype.onBeforeRender;

function copyProps(src, dst) {
  dst.name = src.name; dst.castShadow = src.castShadow; dst.receiveShadow = src.receiveShadow;
  dst.userData = { ...src.userData }; dst.renderOrder = src.renderOrder;
  dst.customDepthMaterial = src.customDepthMaterial; dst.customDistanceMaterial = src.customDistanceMaterial;
  dst.layers.mask = src.layers.mask;
  dst.matrixAutoUpdate = false; dst.matrix.copy(src.matrix); dst.matrixWorld.copy(src.matrixWorld);
  dst.position.copy(src.position); dst.quaternion.copy(src.quaternion); dst.scale.copy(src.scale);
}

/** split a merged mesh by triangle centroid (shares the vertex buffers, new index per chunk) */
function chunkMesh(mesh) {
  const g = mesh.geometry, pos = g.attributes.position;
  if (Array.isArray(mesh.material) || g.groups.length > 1 || g.morphAttributes.position) return null;
  const idx = g.index ? g.index.array : null;
  const nt = (idx ? idx.length : pos.count) / 3;
  const P = pos.array, st = pos.itemSize ?? 3;
  const isInter = pos.isInterleavedBufferAttribute;
  const getX = (i) => (isInter ? pos.getX(i) : P[i * st]), getY = (i) => (isInter ? pos.getY(i) : P[i * st + 1]), getZ = (i) => (isInter ? pos.getZ(i) : P[i * st + 2]);
  const buckets = new Map();
  for (let t = 0; t < nt; t++) {
    const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const cx = (getX(a) + getX(b) + getX(c)) / 3, cz = (getZ(a) + getZ(b) + getZ(c)) / 3;
    const k = `${Math.floor(cx / CELL)},${Math.floor(cz / CELL)}`;
    let arr = buckets.get(k); if (!arr) buckets.set(k, (arr = []));
    arr.push(a, b, c);
  }
  if (buckets.size < 2) return null;
  const out = [];
  const big = pos.count > 65535;
  for (const arr of buckets.values()) {
    const ng = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) ng.setAttribute(name, attr);
    ng.setIndex(new THREE.BufferAttribute(big ? new Uint32Array(arr) : new Uint16Array(arr), 1));
    // bounding sphere of the referenced vertices only
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const i of arr) { const x = getX(i), y = getY(i), z = getZ(i); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    ng.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
    ng.boundingSphere = new THREE.Sphere(ng.boundingBox.getCenter(new THREE.Vector3()), ng.boundingBox.getSize(new THREE.Vector3()).length() / 2);
    const m = new THREE.Mesh(ng, mesh.material);
    copyProps(mesh, m);
    out.push(m);
  }
  return out;
}

/** split an InstancedMesh into one InstancedMesh per spatial cell */
function chunkInstanced(im) {
  const g = im.geometry;
  for (const a of Object.values(g.attributes)) if (a.isInstancedBufferAttribute || a.isInstancedInterleavedBuffer || a.data?.isInstancedInterleavedBuffer) return null;
  if (im.count < 12 || Array.isArray(im.material)) return null;
  const buckets = new Map(), m4 = new THREE.Matrix4(), wm = new THREE.Matrix4(), p = new THREE.Vector3();
  for (let i = 0; i < im.count; i++) {
    im.getMatrixAt(i, m4);
    wm.multiplyMatrices(im.matrixWorld, m4);
    p.setFromMatrixPosition(wm);
    const k = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
    let arr = buckets.get(k); if (!arr) buckets.set(k, (arr = []));
    arr.push(i);
  }
  if (buckets.size < 2) return null;
  const out = [], col = new THREE.Color();
  for (const arr of buckets.values()) {
    const m = new THREE.InstancedMesh(g, im.material, arr.length);
    arr.forEach((i, j) => { im.getMatrixAt(i, m4); m.setMatrixAt(j, m4); if (im.instanceColor) { im.getColorAt(i, col); m.setColorAt(j, col); } });
    copyProps(im, m);
    m.frustumCulled = true;
    m.computeBoundingSphere();
    out.push(m);
  }
  return out;
}

export class GameOptimizer {
  constructor(engine) {
    this.engine = engine;
    this.cullables = [];
    this.statueSets = [];
    this.frame = 0;
  }

  async run() {
    const e = this.engine;
    e.scene.updateMatrixWorld(true);
    const t0 = performance.now();
    let split = 0, made = 0;
    const statueMeshes = [];
    for (const mod of OPT_MODULES) {
      for (const root of e.moduleRoots?.[mod] || []) {
        const list = [];
        root.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && !o.isBatchedMesh && o.geometry) list.push(o); });
        for (const o of list) {
          if (o.onBeforeRender !== defaultOBR || o.userData.isWater || !o.parent || !o.visible) continue;
          if (o.isInstancedMesh && /^statue-.+-l\d$/.test(o.name)) { statueMeshes.push(o); continue; }
          let chunks = null;
          if (o.isInstancedMesh) {
            if (!o.boundingSphere) o.computeBoundingSphere();
            if (o.boundingSphere.radius > CELL) chunks = chunkInstanced(o);
          } else {
            if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
            const r = o.geometry.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
            const tris = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
            if (r > CELL * 1.2 && tris > 20000) chunks = chunkMesh(o);
          }
          const targets = chunks || [o];
          if (chunks) { const parent = o.parent; parent.remove(o); for (const c of chunks) parent.add(c); split++; made += chunks.length; }
          for (const c of targets) this._register(c, mod);
        }
      }
    }
    await this._statues(statueMeshes);
    // water mirror: re-render every 3rd frame. Its texture matrix is stored with the image, so a stale
    // reflection still maps world → texture correctly (only the frame edges lag a little)
    const refl = e.registry.water?.reflection;
    if (refl) {
      const orig = refl.update.bind(refl);
      refl.update = (r, s, c) => { if (this.frame % 3 === 0 || !this._reflOnce) { this._reflOnce = true; orig(r, s, c); } };
    }
    // vegetation LOD re-bucketing (≈ 6 ms for ~77k trees): only after 2.5 m of travel or ~10° of turn, culled
    // against a wider frustum so turning does not reveal holes before the next update
    const veg = e.registry.vegetation;
    if (veg) {
      const proxy = new THREE.PerspectiveCamera(), dir = new THREE.Vector3();
      let last = null;
      veg.maybeUpdate = (cam) => {
        cam.getWorldDirection(dir);
        if (last && cam.position.distanceTo(last.p) < 2.5 && dir.dot(last.f) > 0.985 && Math.abs(cam.fov - last.fov) < 2) return false;
        proxy.copy(cam); proxy.fov = Math.min(120, cam.fov * 1.4); proxy.updateProjectionMatrix(); proxy.updateMatrixWorld(true);
        veg.update(proxy);
        last = { p: cam.position.clone(), f: dir.clone(), fov: cam.fov };
        return true;
      };
    }
    // the main camera and the shadow cameras see the detail layer, the water reflection camera does not
    e.camera.layers.enable(DETAIL_LAYER);
    for (const l of e.lighting.csm.lights) l.shadow.camera.layers.enable(DETAIL_LAYER);
    e.scene.updateMatrixWorld(true);
    console.log(`[game] optimizer: split ${split} meshes into ${made} chunks, ${this.cullables.length} cullables, ${this.statueSets.length} statue types in ${Math.round(performance.now() - t0)} ms`);
  }

  _register(o, mod) {
    // item size: one instance (instanced) or the whole mesh
    const g = o.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    let item = g.boundingSphere.radius;
    if (o.isInstancedMesh) { const m4 = new THREE.Matrix4(); o.getMatrixAt(0, m4); item *= new THREE.Vector3().setFromMatrixScale(m4).x || 1; if (!o.boundingSphere) o.computeBoundingSphere(); }
    else item *= o.matrixWorld.getMaxScaleOnAxis();
    const sphere = o.isInstancedMesh ? o.boundingSphere.clone().applyMatrix4(o.matrixWorld) : g.boundingSphere.clone().applyMatrix4(o.matrixWorld);
    const detail = DETAIL_RE.test(o.name) || mod === 'flora';
    // max visible distance: ~2 px for detail, ~1 px for the rest (at ~900 px per radian)
    const maxD = detail ? Math.min(160, item * 420 + 25) : item * 900 + 40;
    if (maxD > 3000) return;
    // small things: not in the water reflection (layer 1 only), detail casts no shadow
    o.layers.set(DETAIL_LAYER);
    if (detail) { o.castShadow = false; o.userData.castShadow = false; }
    this.cullables.push({ o, c: sphere.center, r: sphere.radius, maxD });
  }

  async _statues(meshes) {
    if (!meshes.length) return;
    const lib = await statueLibrary(this.engine.quality.detail ?? 1);
    const byType = new Map();
    const m4 = new THREE.Matrix4();
    for (const im of meshes) {
      const [, id] = im.name.match(/^statue-(.+)-l\d$/);
      let T = byType.get(id); if (!T) byType.set(id, (T = { id, mats: [], material: im.material, src: im }));
      for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m4); T.mats.push(new THREE.Matrix4().multiplyMatrices(im.matrixWorld, m4)); }
      im.parent.remove(im);
    }
    for (const T of byType.values()) {
      const e = lib.byId.get(T.id);
      if (!e) continue;
      const set = { pos: T.mats.map((m) => new THREE.Vector3().setFromMatrixPosition(m)), mats: T.mats, meshes: [] };
      for (let l = 0; l < 3; l++) {
        const im = new THREE.InstancedMesh(e.lod[l], T.material, T.mats.length);
        copyProps(T.src, im);
        im.matrix.identity(); im.matrixWorld.identity(); im.position.set(0, 0, 0); im.quaternion.identity(); im.scale.set(1, 1, 1);
        im.name = `game-statue-${T.id}-l${l}`; im.count = 0; im.frustumCulled = false; im.layers.set(DETAIL_LAYER);
        this.engine.scene.add(im);
        set.meshes.push(im);
      }
      this.statueSets.push(set);
    }
  }

  /** per frame: distance culling + statue LOD (amortised) */
  update(camera) {
    this.frame++;
    const cp = camera.position;
    if (this.frame % 3 === 0) {
      for (const c of this.cullables) {
        const d = Math.max(0, cp.distanceTo(c.c) - c.r);
        c.o.visible = d < c.maxD;
      }
    }
    if (this.frame % 6 === 0) {
      for (const s of this.statueSets) {
        const n = [0, 0, 0];
        for (let i = 0; i < s.pos.length; i++) {
          const d = cp.distanceTo(s.pos[i]);
          if (d > 450) continue;
          const l = d < 14 ? 0 : d < 50 ? 1 : 2;
          s.meshes[l].setMatrixAt(n[l]++, s.mats[i]);
        }
        for (let l = 0; l < 3; l++) { const m = s.meshes[l]; m.count = n[l]; m.instanceMatrix.needsUpdate = true; m.visible = n[l] > 0; }
      }
    }
  }
}
