// Game effects: GPU point particles (additive sparks/magic and soft dust/smoke/splash), sword trail
// ribbons, expanding shock rings and the lock-on marker. All unlit (userData.noPatch), HDR colours so the
// bright ones bloom in the Athenaion pipeline.
import * as THREE from 'three';

const PVERT = /* glsl */`
attribute vec4 aCol; attribute float aSize;
varying vec4 vCol;
uniform float uScale;
void main(){
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(96.0, aSize * uScale / max(0.1, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const PFRAG = /* glsl */`
varying vec4 vCol;
uniform float uSoft;
void main(){
  vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = uSoft > 0.5 ? smoothstep(1.0, 0.0, r) : smoothstep(1.0, 0.6, r) + 0.6 * smoothstep(0.4, 0.0, r);
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
}`;

class Particles {
  constructor(n, additive) {
    this.n = n; this.next = 0;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.base = new Float32Array(n * 5); // r g b a size0
    this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.grow = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sa = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pa); g.setAttribute('aCol', this.ca); g.setAttribute('aSize', this.sa);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 }, uSoft: { value: additive ? 0 : 1 } },
    });
    this.mat.userData.noPatch = true;
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.userData.noPatch = true; this.points.renderOrder = 10;
    this.points.castShadow = false; this.points.receiveShadow = false;
    this.points.userData.castShadow = false; this.points.userData.receiveShadow = false;
  }
  emit(x, y, z, vx, vy, vz, { color = [1, 1, 1], alpha = 1, size = 0.2, life = 0.6, grav = 0, drag = 1, grow = 0 } = {}) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3);
    this.base.set([color[0], color[1], color[2], alpha, size], i * 5);
    this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.col[i * 4 + 3] !== 0) { this.col[i * 4 + 3] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = i * 3, d = Math.exp(-this.drag[i] * dt);
      this.v[k + 1] -= this.grav[i] * dt;
      this.v[k] *= d; this.v[k + 1] *= d; this.v[k + 2] *= d;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      const t = Math.max(0, this.life[i] / this.max[i]);
      const b = i * 5;
      this.col[i * 4] = this.base[b]; this.col[i * 4 + 1] = this.base[b + 1]; this.col[i * 4 + 2] = this.base[b + 2];
      this.col[i * 4 + 3] = this.base[b + 3] * Math.min(1, t * 2.5);
      this.size[i] = this.base[b + 4] * (1 + this.grow[i] * (1 - t));
    }
    this.pa.needsUpdate = this.ca.needsUpdate = this.sa.needsUpdate = true;
  }
}

class Trail {
  constructor(color, n = 14) {
    this.n = n; this.tips = []; this.bases = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3); this.alpha = new Float32Array(n * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uC; varying float vA; void main(){ gl_FragColor = vec4(uC, vA); }',
      uniforms: { uC: { value: new THREE.Vector3(...color) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mat.userData.noPatch = true;
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.userData.noPatch = true;
    this.mesh.castShadow = this.mesh.receiveShadow = false; this.mesh.userData.castShadow = false; this.mesh.userData.receiveShadow = false;
    this.active = false; this.fade = 0;
  }
  push(tip, base) {
    this.tips.unshift(tip.clone()); this.bases.unshift(base.clone());
    if (this.tips.length > this.n) { this.tips.pop(); this.bases.pop(); }
  }
  update(dt) {
    this.fade = this.active ? 1 : Math.max(0, this.fade - dt * 6);
    if (!this.active && this.fade <= 0) { this.tips.length = 0; this.bases.length = 0; }
    const m = this.tips.length;
    for (let i = 0; i < this.n; i++) {
      const j = Math.min(i, m - 1);
      if (j < 0) { this.alpha[i * 2] = this.alpha[i * 2 + 1] = 0; continue; }
      const t = this.tips[j], b = this.bases[j];
      this.pos.set([t.x, t.y, t.z, b.x, b.y, b.z], i * 6);
      const a = (1 - i / this.n) * 0.9 * this.fade;
      this.alpha[i * 2] = a; this.alpha[i * 2 + 1] = a * 0.1;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aA.needsUpdate = true;
  }
}

export class FX {
  constructor(engine) {
    this.engine = engine;
    this.add = new Particles(1500, true);
    this.soft = new Particles(1500, false);
    engine.scene.add(this.add.points, this.soft.points);
    this.trails = [];
    this.rings = [];
    // lock-on marker
    const mg = new THREE.ConeGeometry(0.18, 0.35, 4); mg.rotateX(Math.PI);
    this.marker = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 5, 1) }));
    this.marker.userData.noPatch = true; this.marker.material.userData.noPatch = true; this.marker.visible = false;
    this.marker.castShadow = false; this.marker.userData.castShadow = false;
    engine.scene.add(this.marker);
  }
  trail(color) { const t = new Trail(color); this.engine.scene.add(t.mesh); this.trails.push(t); return t; }

  burst(x, y, z, n, o = {}) {
    const sp = o.speed ?? 4, sys = o.soft ? this.soft : this.add;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = sp * (0.4 + Math.random() * 0.6);
      const r = Math.sqrt(1 - u * u);
      const up = o.up ?? 0;
      sys.emit(x, y, z, Math.cos(a) * r * s, u * s * (o.flat ? 0.2 : 1) + up, Math.sin(a) * r * s, o);
    }
  }
  sparks(x, y, z, color = [12, 8, 3]) { this.burst(x, y, z, 18, { color, size: 0.09, life: 0.35, speed: 7, grav: 12, drag: 2 }); }
  hit(x, y, z) { this.sparks(x, y, z, [14, 10, 6]); this.burst(x, y, z, 8, { color: [6, 6, 6], size: 0.4, life: 0.15, speed: 1 }); }
  dust(x, y, z, n = 8) { this.burst(x, y, z, n, { soft: true, color: [0.55, 0.48, 0.38], alpha: 0.45, size: 0.6, life: 0.9, speed: 1.6, flat: true, up: 0.5, grow: 1.5, drag: 2 }); }
  smoke(x, y, z, n = 26) { this.burst(x, y, z, n, { soft: true, color: [0.12, 0.1, 0.12], alpha: 0.7, size: 1.2, life: 1.3, speed: 2.5, up: 1.2, grow: 1.8, drag: 2.5 }); this.burst(x, y, z, 14, { color: [6, 2, 6], size: 0.15, life: 0.8, speed: 4, grav: -2, drag: 1.5 }); }
  splash(x, y, z, n = 30) { this.burst(x, y, z, n, { soft: true, color: [0.85, 0.92, 0.95], alpha: 0.8, size: 0.35, life: 0.9, speed: 4, up: 4, grav: 14, drag: 0.5 }); }
  sparkle(x, y, z, color = [6, 5, 2], n = 1) { for (let i = 0; i < n; i++) this.add.emit(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6, 0, 0.6 + Math.random(), 0, { color, size: 0.05, life: 0.9, drag: 0.5 }); }
  flame(x, y, z) {
    this.add.emit(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, 1.8 + Math.random(), (Math.random() - 0.5) * 0.3, { color: [30, 12, 3], size: 0.5, life: 0.6, grow: -0.6, drag: 0.5 });
  }
  heal(x, y, z) { for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; this.add.emit(x + Math.cos(a) * 0.6, y + Math.random() * 0.4, z + Math.sin(a) * 0.6, 0, 2 + Math.random() * 1.5, 0, { color: [8, 1.5, 2], size: 0.12, life: 0.8, drag: 1 }); } }

  ring(x, y, z, { maxR = 8, speed = 14, color = [10, 6, 2], width = 0.6 } = {}) {
    const g = new THREE.RingGeometry(0.9, 1, 48, 1); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.userData.noPatch = true; m.material.userData.noPatch = true; m.castShadow = false; m.userData.castShadow = false;
    m.position.set(x, y + 0.15, z);
    this.engine.scene.add(m);
    const r = { m, r: 0.5, maxR, speed, width, x, z };
    this.rings.push(r);
    return r;
  }

  update(dt, t) {
    this.add.update(dt); this.soft.update(dt);
    for (const tr of this.trails) tr.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.r += r.speed * dt;
      const k = r.r / r.maxR;
      r.m.scale.set(r.r, 1, r.r);
      r.m.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { this.engine.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    if (this.marker.visible) this.marker.rotation.y = t * 3;
  }
}
