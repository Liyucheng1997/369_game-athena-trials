// World objects: pickups (hearts, drachmae), breakable amphorae, treasure chests, NPCs, relic pedestals.
// Interactables expose { pos, radius, prompt(), interact() } and are shown by the HUD when the hero is near.
import * as THREE from 'three';
import { buildPot, buildChest, heartGeometry, PICKUP_MAT, buildRobed, buildRelic, MAT } from './models.js';
import { Poser, locomotion, TALK, blend } from './anim.js';

const COIN_GEO = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16).rotateX(Math.PI / 2);
const COIN_COL = { 1: 0xc0c8d0, 5: 0xffd060, 20: 0xff7aa0 };

export class Items {
  constructor(game) {
    this.game = game;
    this.pickups = [];
    this.pots = [];
    this.chests = [];
    this.npcs = [];
    this.interactables = [];
    this.relics = [];
    this.coinMats = {};
  }

  _patch(obj) {
    const e = this.game.engine;
    obj.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => e.patchMaterial(m)); });
    e.scene.add(obj);
  }

  // ----------------------------------------------------------------------------------------- pickups
  spawnPickup(kind, pos, value = 1, pop = true) {
    let mesh;
    if (kind === 'heart') { mesh = new THREE.Mesh(heartGeometry(), PICKUP_MAT.heart); mesh.scale.setScalar(0.9); }
    else {
      if (!this.coinMats[value]) this.coinMats[value] = new THREE.MeshStandardMaterial({ color: COIN_COL[value], metalness: 1, roughness: 0.25, emissive: COIN_COL[value], emissiveIntensity: 0.6 });
      mesh = new THREE.Mesh(COIN_GEO, this.coinMats[value]);
      mesh.scale.setScalar(value === 20 ? 1.5 : value === 5 ? 1.2 : 1);
    }
    mesh.castShadow = true;
    mesh.position.copy(pos);
    this._patch(mesh);
    const a = Math.random() * Math.PI * 2, s = pop ? 1.5 + Math.random() * 2 : 0;
    this.pickups.push({ kind, value, mesh, pos: mesh.position, vel: new THREE.Vector3(Math.cos(a) * s, pop ? 5 + Math.random() * 2 : 0, Math.sin(a) * s), life: 40, t: Math.random() * 6 });
  }

  dropLoot(pos, loot) {
    const p = pos.clone(); p.y += 0.8;
    let n = Math.round(loot.coins[0] + Math.random() * (loot.coins[1] - loot.coins[0]));
    while (n > 0) { const v = n >= 20 ? 20 : n >= 5 ? 5 : 1; this.spawnPickup('coin', p, v); n -= v; }
    if (Math.random() < loot.heart) this.spawnPickup('heart', p);
  }

  // ----------------------------------------------------------------------------------------- pots
  addPot(x, y, z, s = 1) {
    const g = buildPot(); g.position.set(x, y, z); g.scale.setScalar(s * (0.85 + Math.random() * 0.3)); g.rotation.y = Math.random() * 6;
    this._patch(g);
    this.pots.push({ g, pos: g.position, alive: true });
  }

  swingAt(P, test) {
    const g = this.game;
    for (const p of this.pots) {
      if (!p.alive || P.hitSet.has(p) || !test(p.pos.x, p.pos.y, p.pos.z, 0.35, 1)) continue;
      P.hitSet.add(p); p.alive = false; p.g.visible = false;
      g.audio.play('pot');
      g.fx.burst(p.pos.x, p.pos.y + 0.5, p.pos.z, 16, { soft: true, color: [0.55, 0.22, 0.09], alpha: 1, size: 0.18, life: 0.9, speed: 4, up: 3, grav: 14 });
      const r = Math.random(), q = p.pos.clone().add(new THREE.Vector3(0, 0.5, 0));
      if (r < 0.3) this.spawnPickup('heart', q); else if (r < 0.85) this.spawnPickup('coin', q, Math.random() < 0.2 ? 5 : 1);
    }
  }

  // ----------------------------------------------------------------------------------------- chests
  addChest(x, y, z, yaw, contents, { hidden = false } = {}) {
    const g = buildChest(); g.position.set(x, y, z); g.rotation.y = yaw;
    this._patch(g);
    const c = { g, pos: g.position, open: false, contents, openT: -1, hidden };
    if (hidden) g.visible = false;
    this.chests.push(c);
    this.interactables.push({
      pos: g.position, radius: 1.8,
      active: () => !c.open && g.visible,
      prompt: () => '打开宝箱',
      interact: () => this.openChest(c),
    });
    return c;
  }

  openChest(c) {
    const g = this.game, P = g.player;
    c.open = true; c.openT = 0;
    P.yaw = Math.atan2(c.pos.x - P.pos.x, c.pos.z - P.pos.z);
    P.action = { type: 'interact', t: 0, dur: 0.7 };
    g.audio.play('chest');
    g.after(0.65, () => g.itemGet(c.contents));
  }

  // ----------------------------------------------------------------------------------------- NPCs
  addNPC({ name, pos, yaw = 0, look = {}, talk }) {
    const rig = buildRobed(look);
    rig.root.position.set(...pos);
    rig.body.rotation.y = yaw;
    this._patch(rig.root);
    const n = { name, rig, poser: new Poser(rig), pos: rig.root.position, yaw, talking: false, t: Math.random() * 5, baseYaw: yaw };
    this.npcs.push(n);
    this.interactables.push({ pos: n.pos, radius: 2.6, active: () => true, prompt: () => `与${name}交谈`, interact: () => { n.talking = true; this.game.talkTarget = n; talk(n); } });
    return n;
  }

  // ----------------------------------------------------------------------------------------- relics
  addRelic(kind, name, x, y, z, onTake) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.1, 14), MAT.marble); ped.position.y = 0.55; g.add(ped);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.12, 14), MAT.marble); cap.position.y = 1.16; g.add(cap);
    const relic = buildRelic(kind); relic.position.y = 1.9; g.add(relic);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this._patch(g);
    const r = { kind, name, g, relic, pos: g.position, taken: false, guarded: () => false };
    this.relics.push(r);
    this.interactables.push({
      pos: g.position, radius: 2.2, active: () => !r.taken,
      prompt: () => (r.guarded() ? '守卫仍在附近……' : `取得${name}`),
      interact: () => { if (r.guarded()) { this.game.hud.flash('先击败守护者！', '#ff9a6a'); return; } r.taken = true; relic.visible = false; onTake(r); },
    });
    return r;
  }

  // ----------------------------------------------------------------------------------------- update
  update(dt) {
    const g = this.game, P = g.player, W = g.world;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt; p.life -= dt;
      const gy = W.surface(p.pos.x, p.pos.z) + 0.35;
      if (p.vel.lengthSq() > 0.001 || p.pos.y > gy + 0.01) {
        p.vel.y -= 18 * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.pos.y < gy) { p.pos.y = gy; p.vel.y *= -0.3; p.vel.x *= 0.5; p.vel.z *= 0.5; if (Math.abs(p.vel.y) < 0.8) p.vel.set(0, 0, 0); }
      }
      p.mesh.rotation.y = p.t * 3;
      const d = p.pos.distanceTo(P.pos) - 0.8;
      if (d < 3 && P.alive && p.t > 0.5) { p.vel.set(0, 0, 0); p.pos.lerp(new THREE.Vector3(P.pos.x, P.pos.y + 1, P.pos.z), Math.min(1, dt * 10)); }
      if (d < 0.6 && P.alive && p.t > 0.5) {
        if (p.kind === 'heart') { if (P.hp < P.maxHp) { P.heal(2); g.audio.play('heart'); g.fx.heal(P.pos.x, P.pos.y, P.pos.z); } else { P.coins += 1; g.audio.play('coin'); } }
        else { P.coins += p.value; g.audio.play('coin'); g.fx.sparkle(p.pos.x, p.pos.y, p.pos.z, [8, 6, 2], 4); }
        this._remove(i); continue;
      }
      if (p.life < 5) p.mesh.visible = Math.floor(p.life * 8) % 2 === 0;
      if (p.life <= 0) this._remove(i);
    }
    for (const c of this.chests) {
      if (c.openT >= 0 && c.openT < 1) { c.openT += dt * 2; c.g.userData.lid.rotation.x = -Math.min(1, c.openT) * 1.9; if (Math.random() < 0.6) g.fx.sparkle(c.pos.x, c.pos.y + 0.8, c.pos.z, [10, 8, 3], 2); }
      else if (!c.open && c.g.visible && Math.random() < dt * 2) g.fx.sparkle(c.pos.x, c.pos.y + 0.7, c.pos.z, [4, 3.4, 1.5]);
    }
    for (const n of this.npcs) {
      n.t += dt;
      const dx = P.pos.x - n.pos.x, dz = P.pos.z - n.pos.z, d = Math.hypot(dx, dz);
      const want = d < 6 ? Math.atan2(dx, dz) : n.baseYaw;
      let dy = want - n.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      n.yaw += dy * Math.min(1, dt * 3); n.rig.body.rotation.y = n.yaw;
      if (!g.dialog.open) n.talking = false;
      const base = locomotion(0, 0, 0, n.t, {});
      n.poser.apply(n.talking ? blend(base, TALK(n.t), 1) : base, dt, 6);
    }
    for (const r of this.relics) {
      if (r.taken) continue;
      r.relic.rotation.y += dt * 1.2; r.relic.position.y = 1.9 + Math.sin(g.time * 2) * 0.12;
      if (Math.random() < dt * 6) g.fx.sparkle(r.pos.x, r.pos.y + 1.9, r.pos.z, [10, 8, 3]);
    }
  }
  _remove(i) { const p = this.pickups[i]; this.game.engine.scene.remove(p.mesh); this.pickups.splice(i, 1); }

  /** nearest active interactable within reach of the hero */
  nearest() {
    const P = this.game.player;
    let best = null, bd = Infinity;
    for (const it of this.interactables) {
      if (!it.active()) continue;
      const d = Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z);
      if (d < it.radius && Math.abs(it.pos.y - P.pos.y) < 2.5 && d < bd) { bd = d; best = it; }
    }
    return best;
  }
}
