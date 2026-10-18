// Third-person orbit camera: mouse yaw/pitch, wheel zoom, terrain/architecture collision (pulls in when a
// wall or the ground is between the hero and the lens), lock-on framing and trauma-based shake.
import * as THREE from 'three';

const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _look = new THREE.Vector3();

export class CameraRig {
  constructor(game) {
    this.game = game;
    this.cam = game.engine.camera;
    this.yaw = 0; this.pitch = 0.22; this.dist = 6.5; this.distCur = 6.5;
    this.target = new THREE.Vector3();
    this.sens = 0.0022;
    this.trauma = 0;
    this.fov = 55;
    this.override = null; // cutscene: { pos, look } (Vector3s)
  }

  snap() {
    const p = this.game.player.pos;
    this.target.set(p.x, p.y + 1.55, p.z);
    this.distCur = this.dist;
  }

  update(dt) {
    const g = this.game, inp = g.input, P = g.player, cam = this.cam;
    if (!g.cutscene && inp.locked) {
      this.yaw -= inp.mouse.dx * this.sens;
      this.pitch = THREE.MathUtils.clamp(this.pitch + inp.mouse.dy * this.sens, -0.75, 1.25);
      if (inp.mouse.wheel) this.dist = THREE.MathUtils.clamp(this.dist + inp.mouse.wheel * 0.8, 2.5, 16);
    }
    // follow target (feet + head height), quicker vertically when falling
    const h = P.state === 'swim' ? 1.0 : P.state === 'glide' ? 1.8 : 1.55;
    _t.set(P.pos.x, P.pos.y + h, P.pos.z);
    const k = 1 - Math.exp(-(P.state === 'air' ? 14 : 10) * dt);
    this.target.lerp(_t, k);

    if (this.override) {
      const o = this.override;
      cam.position.lerp(o.pos, 1 - Math.exp(-(o.rate ?? 3) * dt));
      _look.copy(o.look);
      cam.lookAt(_look);
      this._fov(dt, o.fov ?? 45);
      return;
    }

    // lock-on: swing behind the hero, frame both
    const L = P.lock;
    if (L) {
      const want = Math.atan2(L.pos.x - P.pos.x, L.pos.z - P.pos.z);
      let d = want - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-5 * dt));
      this.pitch += (0.2 + (L.boss ? 0.12 : 0) - this.pitch) * (1 - Math.exp(-3 * dt));
    }
    const dist = this.dist * (L?.boss ? 1.5 : 1) * (P.state === 'glide' ? 1.3 : 1);
    _d.set(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // collision: shorten toward the target
    const W = g.world;
    const ex = this.target.x - _d.x * dist, ey = this.target.y - _d.y * dist, ez = this.target.z - _d.z * dist;
    const tHit = W.rayGround(this.target.x, this.target.y, this.target.z, ex, ey, ez, 0.3);
    const want = Math.max(0.9, dist * tHit);
    this.distCur += (want - this.distCur) * (want < this.distCur ? 1 - Math.exp(-25 * dt) : 1 - Math.exp(-3 * dt));
    cam.position.set(this.target.x - _d.x * this.distCur, this.target.y - _d.y * this.distCur, this.target.z - _d.z * this.distCur);
    const gy = W.ground(cam.position.x, cam.position.z);
    if (cam.position.y < gy + 0.3) cam.position.y = gy + 0.3;
    if (cam.position.y < 0.25 && P.state !== 'swim') cam.position.y = Math.max(cam.position.y, 0.25);
    _look.copy(this.target);
    if (L) _look.lerp(_t.set(L.pos.x, L.pos.y + (L.height || 1.6) * 0.6, L.pos.z), 0.35);
    cam.lookAt(_look);
    // shake
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma, t = g.time * 40;
      cam.rotation.x += Math.sin(t * 1.3) * 0.03 * s; cam.rotation.y += Math.sin(t * 1.7 + 1) * 0.03 * s; cam.rotation.z += Math.sin(t * 2.1 + 2) * 0.02 * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
    const sprint = P.state === 'ground' && P.moveAmt > 8;
    this._fov(dt, sprint ? 62 : P.state === 'glide' ? 64 : 55);
  }

  _fov(dt, f) {
    const cam = this.cam;
    const nf = cam.fov + (f - cam.fov) * (1 - Math.exp(-4 * dt));
    if (Math.abs(nf - cam.fov) > 0.01) { cam.fov = nf; cam.updateProjectionMatrix(); this.game.engine.lighting.refreshCSM(); }
  }
}
