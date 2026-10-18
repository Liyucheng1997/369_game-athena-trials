// Enemies and combat resolution.
//   Spartos  — skeleton hoplite sown from the dragon's teeth: approaches, telegraphed overhead chop
//              (captain: bigger, also a wide sweep). Attack tokens keep at most two swinging at once.
//   Boar     — Calydonian boar: paws the ground, then charges in a straight line; dizzy afterwards.
//   Harpy    — circles overhead, dives at the hero; only hittable when low.
//   Minotaur — the boss: axe sweep, overhead chop, shockwave slam (jump it), bull charge (stuns itself
//              against walls). Enraged below half health.
import * as THREE from 'three';
import { buildSkeleton, buildBoar, buildHarpy, buildMinotaur } from './models.js';
import { Poser, locomotion, blend, sampleKeys, CHOP, SWEEP, SLAM, STAGGER } from './anim.js';
import { angTo } from './player.js';
import { WATER_LEVEL } from './collision.js';

const rnd = (a, b) => a + Math.random() * (b - a);

class Enemy {
  constructor(game, rig, o) {
    this.game = game; this.rig = rig; this.root = rig.root;
    this.pos = new THREE.Vector3(...o.pos); this.home = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = o.yaw ?? Math.random() * Math.PI * 2;
    this.hp = this.maxHp = o.hp ?? 3;
    this.state = 'idle'; this.st = 0; this.t = Math.random() * 10;
    this.radius = o.radius ?? 0.45; this.height = o.height ?? 1.8;
    this.aggroR = o.aggroR ?? 16; this.leash = o.leash ?? 45;
    this.flash = 0; this.alive = true; this.deadT = 0;
    this.loot = o.loot ?? { coins: [1, 3], heart: 0.3 };
    this.camp = o.camp || null;
    this.wander = this.pos.clone(); this.wanderT = 0;
    this.poser = rig.j.hips ? new Poser(rig) : null;
    this.phase = 0;
    this.hitThisSwing = false;
    // per-instance emissive flash on the cloned materials
    this.flashMats = rig.mats;
    this.root.position.copy(this.pos);
  }

  get player() { return this.game.player; }
  dist() { const p = this.player.pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  angleToPlayer() { const p = this.player.pos; return Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }
  set(s) { this.state = s; this.st = 0; this.hitThisSwing = false; }
  turnTo(a, dt, rate = 8) { this.yaw += angTo(this.yaw, a) * Math.min(1, rate * dt); }

  /** move with collision; enemies never step off ledges higher than `drop` or into deep water */
  walk(vx, vz, dt, drop = 2.5, strict = false) {
    const W = this.game.world;
    const r = W.move(this.pos.x, this.pos.z, this.pos.y, vx * dt, vz * dt, this.radius, 0.7);
    if (strict && r.blocked) return false;
    const g = W.ground(r.x, r.z);
    if (g < this.pos.y - drop || W.isWater(r.x, r.z, 0.8)) return false;
    this.pos.x = r.x; this.pos.z = r.z;
    this.pos.y += (g - this.pos.y) * Math.min(1, dt * 15);
    return !r.blocked;
  }

  /** walk toward a heading, fanning out around obstacles (keeps turning the same way while blocked) */
  steer(angle, speed, dt) {
    const side = this.steerSide || 1;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
      const a = angle + off * side;
      if (this.walk(Math.sin(a) * speed, Math.cos(a) * speed, dt, 2.5, true)) { if (off) this.steerSide = Math.sign(off) * side; return true; }
    }
    this.steerSide = -side;
    return false;
  }

  canSee() {
    const P = this.player;
    if (!P.alive || this.game.cutscene) return false;
    return this.dist() < this.aggroR && Math.abs(P.pos.y - this.pos.y) < 9 && P.state !== 'swim';
  }

  hurt(dmg, from, knock = 5) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.flash = 0.15;
    const a = Math.atan2(this.pos.x - from.x, this.pos.z - from.z);
    this.vel.x += Math.sin(a) * knock * (this.heavy ? 0.2 : 1); this.vel.z += Math.cos(a) * knock * (this.heavy ? 0.2 : 1);
    if (this.hp <= 0) { this.die(); return true; }
    // poise: a committed swing (last 0.3 s before it lands) is not interrupted; every 3rd hit in a row
    // always staggers so the hero can still break a long string of attacks
    this.hitStreak = (this.t - (this.lastHitT ?? -9) < 1.5 ? (this.hitStreak || 0) : 0) + 1; this.lastHitT = this.t;
    const committed = this.state === 'attack' && this.atk && this.st > this.atk.hit[0] - 0.3 && this.st < this.atk.hit[1];
    if (!this.heavy && (!committed || this.hitStreak % 3 === 0) && this.state !== 'stunned') this.set('stagger');
    if (this.state === 'idle') this.set('alert');
    this.game.combat.aggro(this);
    return true;
  }

  die() {
    this.alive = false; this.set('dead');
    const g = this.game;
    g.audio.play('die'); g.player.stats.kills++;
    g.combat.release(this);
    g.onEnemyKilled?.(this);
  }

  /** disappear in a puff without counting as a kill or dropping loot (end of the game) */
  vanish() { if (!this.alive) return; this.alive = false; this.set('dead'); this.loot = { coins: [0, 0], heart: 0 }; this.game.combat.release(this); }

  parried() { this.set('stunned'); this.stunDur = 1.6; }

  updateCommon(dt) {
    this.t += dt; this.st += dt;
    // knockback decay
    if (this.vel.lengthSq() > 0.01) { this.walk(this.vel.x, this.vel.z, dt, 6); const d = Math.exp(-8 * dt); this.vel.x *= d; this.vel.z *= d; }
    // flash
    if (this.flash > 0) this.flash -= dt;
    const f = Math.max(0, this.flash) / 0.15;
    for (const m of this.flashMats) { m.emissive.setRGB(f * 3, f * 3, f * 3); }
  }

  place() { this.root.position.copy(this.pos); this.rig.body.rotation.y = this.yaw; }

  deathUpdate(dt) {
    this.deadT += dt;
    if (this.deadT > 0.45 && !this.puffed) {
      this.puffed = true;
      const g = this.game;
      g.fx.smoke(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z, this.boss ? 80 : 26);
      g.items.dropLoot(this.pos, this.loot);
      this.root.visible = false;
    }
    if (this.deadT < 0.45) { this.root.scale.setScalar(1 - this.deadT * 0.3); this.rig.body.rotation.z = this.deadT * 1.2; }
  }

  /** shared melee check during an attack window */
  strike(range, halfArc, dmg, knock = 7, o = {}) {
    if (this.hitThisSwing) return;
    const P = this.player;
    const d = this.dist();
    if (d > range + 0.4 || Math.abs(P.pos.y - this.pos.y) > (o.vert ?? 2.5)) return;
    if (Math.abs(angTo(this.yaw, this.angleToPlayer())) > halfArc) return;
    this.hitThisSwing = true;
    P.damage(dmg, this.pos, { knock, source: this, unblockable: o.unblockable });
  }
}

// ------------------------------------------------------------------------------------------- Spartos
export class Spartos extends Enemy {
  constructor(game, o) {
    const captain = !!o.captain;
    super(game, buildSkeleton({ captain }), { hp: captain ? 9 : 4, radius: captain ? 0.55 : 0.45, height: captain ? 2.1 : 1.8, loot: captain ? { coins: [8, 14], heart: 1 } : { coins: [1, 4], heart: 0.3 }, ...o });
    this.captain = captain; this.kind = captain ? '骷髅队长' : '龙牙骷髅兵';
    this.speed = captain ? 3.6 : 3.2;
    this.attackCD = rnd(0.5, 1.5);
  }
  update(dt) {
    if (!this.alive) { this.deathUpdate(dt); this.poser.apply(STAGGER, dt, 10); return; }
    this.updateCommon(dt);
    const P = this.player, d = this.dist(), a = this.angleToPlayer();
    let pose = null, move = 0;
    this.attackCD -= dt;
    switch (this.state) {
      case 'idle': {
        this.wanderT -= dt;
        if (this.wanderT < 0) { this.wanderT = rnd(3, 7); this.wander.set(this.home.x + rnd(-5, 5), 0, this.home.z + rnd(-5, 5)); }
        const dx = this.wander.x - this.pos.x, dz = this.wander.z - this.pos.z, l = Math.hypot(dx, dz);
        if (l > 0.6) { this.turnTo(Math.atan2(dx, dz), dt, 3); if (!this.steer(this.yaw, 1.1, dt)) this.wanderT = 0; move = 0.35; }
        if (this.canSee()) { this.set('alert'); this.game.combat.aggro(this); }
        break;
      }
      case 'alert':
        this.turnTo(a, dt, 6);
        if (this.st > 0.55) this.set('chase');
        break;
      case 'chase': {
        if (!P.alive || this.home.distanceTo(this.pos) > this.leash || d > this.aggroR * 2) { this.set('return'); break; }
        this.turnTo(a, dt, 7);
        const want = this.game.combat.token(this) ? 1.9 : 4.2;
        if (d > want + 0.4) { this.steer(a, this.speed, dt); move = 0.9; }
        else if (d < want - 0.6) { this.walk(-Math.sin(this.yaw) * 1.5, -Math.cos(this.yaw) * 1.5, dt); move = 0.4; }
        else { // circle
          const s = Math.sin(this.t * 0.7 + this.home.x) > 0 ? 1 : -1;
          this.walk(Math.cos(this.yaw) * 1.2 * s, -Math.sin(this.yaw) * 1.2 * s, dt); move = 0.35;
        }
        if (d < 2.5 && this.attackCD < 0 && this.game.combat.token(this)) { this.atk = this.captain && Math.random() < 0.45 ? SWEEP : CHOP; this.set('attack'); }
        break;
      }
      case 'attack': {
        const A = this.atk;
        if (this.st < A.hit[0] - 0.15) this.turnTo(a, dt, 5);
        if (this.st > A.hit[0] - 0.05 && this.st < A.hit[0] + 0.1) this.walk(Math.sin(this.yaw) * 2.5, Math.cos(this.yaw) * 2.5, dt);
        if (this.st > A.hit[0] - 0.35 && this.st < A.hit[0]) this.flash = Math.max(this.flash, 0.0) ; // windup tell handled by eyes
        if (this.st >= A.hit[0] && this.st <= A.hit[1]) this.strike(A === SWEEP ? 2.8 : 2.4, A === SWEEP ? 1.4 : 0.7, this.captain ? 2 : 1, 7);
        pose = sampleKeys(A.keys, this.st);
        if (this.st === 0 || this.st < dt * 1.5) this.game.audio.play('swing');
        if (this.st >= A.dur) { this.set('chase'); this.attackCD = rnd(1.2, 2.4); this.game.combat.release(this); }
        break;
      }
      case 'stagger':
        pose = STAGGER;
        if (this.st > 0.4) { this.set('chase'); this.game.combat.release(this); }
        break;
      case 'stunned':
        pose = STAGGER;
        if (this.st > (this.stunDur || 1.4)) { this.set('chase'); this.game.combat.release(this); }
        if (Math.random() < dt * 10) this.game.fx.sparkle(this.pos.x, this.pos.y + this.height + 0.2, this.pos.z, [6, 6, 2]);
        break;
      case 'return': {
        const dx = this.home.x - this.pos.x, dz = this.home.z - this.pos.z, l = Math.hypot(dx, dz);
        this.turnTo(Math.atan2(dx, dz), dt, 5); this.steer(Math.atan2(dx, dz), this.speed, dt); move = 0.9;
        this.hp = Math.min(this.maxHp, this.hp + dt);
        if (l < 2 || this.st > 12) this.set('idle');
        if (this.canSee() && this.home.distanceTo(this.pos) < this.leash * 0.6) this.set('chase');
        break;
      }
    }
    this.phase += dt * move * 7;
    const loco = locomotion(this.phase, move, move > 0.6 ? 0.6 : 0, this.t, {});
    loco.shR = [-0.5, 0, -0.25]; loco.elR = [-0.7, 0, 0]; loco.handR = [-1.1, 0, 0];
    loco.shL = [-0.3, 0, 0.2]; loco.elL = [-1.2, 0, 0.1];
    loco.neck = [0.1, Math.sin(this.t * 0.9) * 0.2, 0];
    this.poser.apply(pose ? blend(loco, pose, 1) : loco, dt, pose ? 20 : 12);
    this.place();
  }
}

// ------------------------------------------------------------------------------------------- Boar
export class Boar extends Enemy {
  constructor(game, o) {
    super(game, buildBoar(), { hp: 4, radius: 0.6, height: 1.2, aggroR: 18, loot: { coins: [2, 5], heart: 0.5 }, ...o });
    this.kind = '卡吕冬野猪';
  }
  update(dt) {
    const j = this.rig.j;
    if (!this.alive) { this.deathUpdate(dt); return; }
    this.updateCommon(dt);
    const d = this.dist(), a = this.angleToPlayer();
    let gait = 0, headDip = 0;
    switch (this.state) {
      case 'idle': {
        this.wanderT -= dt;
        if (this.wanderT < 0) { this.wanderT = rnd(3, 8); this.wander.set(this.home.x + rnd(-7, 7), 0, this.home.z + rnd(-7, 7)); }
        const dx = this.wander.x - this.pos.x, dz = this.wander.z - this.pos.z, l = Math.hypot(dx, dz);
        if (l > 0.8) { this.turnTo(Math.atan2(dx, dz), dt, 2); if (!this.steer(this.yaw, 1.3, dt)) this.wanderT = 0; gait = 0.3; }
        else headDip = 0.5 + Math.sin(this.t * 3) * 0.1; // grazing
        if (this.canSee()) { this.set('alert'); this.game.combat.aggro(this); this.game.audio.play('alert'); }
        break;
      }
      case 'alert':
      case 'paw':
        this.turnTo(a, dt, 6);
        headDip = 0.35; gait = 0.15 * Math.sin(this.st * 20);
        if (this.st > 0.4 && Math.random() < dt * 8) this.game.fx.dust(this.pos.x - Math.sin(this.yaw) * 0.6, this.pos.y + 0.1, this.pos.z - Math.cos(this.yaw) * 0.6, 2);
        if (this.st > 1.1) { this.set('charge'); this.chargeDir = this.yaw; }
        break;
      case 'charge': {
        this.turnTo(a, dt, this.st < 0.4 ? 3 : 0.4);
        const sp = 11;
        const ok = this.walk(Math.sin(this.yaw) * sp, Math.cos(this.yaw) * sp, dt);
        gait = 1; headDip = 0.3;
        if (Math.random() < dt * 12) this.game.fx.dust(this.pos.x, this.pos.y + 0.1, this.pos.z, 1);
        if (d < 1.4) { this.strike(1.6, 1.2, 2, 13); }
        if (!ok || this.st > 2.4 || (this.st > 0.5 && Math.abs(angTo(this.yaw, a)) > 2.2 && d > 5)) {
          this.set(ok ? 'recover' : 'dizzy');
          if (!ok) { this.game.audio.play('hit'); this.game.shake(0.2); this.game.fx.dust(this.pos.x, this.pos.y + 0.6, this.pos.z, 10); }
        }
        break;
      }
      case 'recover':
        gait = 0.2;
        if (this.st > 1.0) { if (this.canSee() || this.dist() < this.aggroR * 1.5) this.set('paw'); else this.set('idle'); }
        break;
      case 'dizzy':
      case 'stunned':
        if (Math.random() < dt * 8) this.game.fx.sparkle(this.pos.x, this.pos.y + 1.4, this.pos.z, [6, 6, 2]);
        this.rig.body.rotation.z = Math.sin(this.st * 9) * 0.12;
        if (this.st > 2.2) { this.rig.body.rotation.z = 0; this.set('paw'); }
        break;
      case 'stagger':
        if (this.st > 0.35) this.set('paw');
        break;
    }
    if (this.home.distanceTo(this.pos) > this.leash && this.state !== 'charge') { this.set('idle'); this.wander.copy(this.home); }
    this.phase += dt * (3 + gait * 14);
    const s = Math.sin(this.phase);
    const A = 0.15 + gait * 0.6;
    j.legFL.rotation.x = s * A; j.legBR.rotation.x = s * A; j.legFR.rotation.x = -s * A; j.legBL.rotation.x = -s * A;
    j.head.rotation.x += (headDip - j.head.rotation.x) * Math.min(1, dt * 6);
    j.torso.position.y = 0.62 + Math.abs(Math.cos(this.phase)) * 0.06 * gait;
    this.place();
  }
}

// ------------------------------------------------------------------------------------------- Harpy
export class Harpy extends Enemy {
  constructor(game, o) {
    super(game, buildHarpy(), { hp: 2, radius: 0.5, height: 1.0, aggroR: 24, loot: { coins: [1, 3], heart: 0.35 }, ...o });
    this.kind = '鹰身女妖';
    this.alt = 7; this.pos.y += this.alt; this.orbit = Math.random() * 6.28;
    this.diveCD = rnd(2, 4);
  }
  canSee() {
    const P = this.player;
    if (!P.alive || this.game.cutscene) return false;
    const p = P.pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < this.aggroR && Math.abs(p.y - this.pos.y) < 20;
  }
  parried() { this.set('downed'); }
  hurt(dmg, from, knock) {
    const r = super.hurt(dmg, from, knock);
    if (r && this.alive) this.set('downed');
    return r;
  }
  update(dt) {
    const W = this.game.world, P = this.player, j = this.rig.j;
    if (!this.alive) {
      this.vel.y = (this.vel.y || 0) - 20 * dt; this.pos.y = Math.max(W.surface(this.pos.x, this.pos.z), this.pos.y + this.vel.y * dt);
      this.deathUpdate(dt); this.place(); return;
    }
    this.t += dt; this.st += dt;
    if (this.flash > 0) this.flash -= dt;
    const f = Math.max(0, this.flash) / 0.15; for (const m of this.flashMats) m.emissive.setRGB(f * 3, f * 3, f * 3);
    const ground = W.surface(this.pos.x, this.pos.z);
    let flap = 1;
    let tx = this.pos.x, tz = this.pos.z, ty = ground + this.alt;
    switch (this.state) {
      case 'idle':
        this.orbit += dt * 0.4;
        tx = this.home.x + Math.cos(this.orbit) * 6; tz = this.home.z + Math.sin(this.orbit) * 6; ty = W.surface(tx, tz) + this.alt;
        if (this.canSee()) { this.set('chase'); this.game.combat.aggro(this); this.game.audio.play('alert'); }
        break;
      case 'chase': case 'alert':
        this.orbit += dt * 0.9;
        tx = P.pos.x + Math.cos(this.orbit) * 7; tz = P.pos.z + Math.sin(this.orbit) * 7; ty = Math.max(W.surface(tx, tz), P.pos.y) + 5.5;
        this.diveCD -= dt;
        if (this.diveCD < 0 && this.game.combat.token(this)) { this.set('dive'); this.diveTo = P.pos.clone(); this.game.audio.play('alert'); }
        if (!P.alive || this.home.distanceTo(this.pos) > this.leash + 20) this.set('idle');
        break;
      case 'dive': {
        flap = 0.2;
        if (this.st < 0.5) { ty = this.pos.y + 1; tx = this.pos.x; tz = this.pos.z; this.diveTo.lerp(P.pos, 0.1); }
        else { tx = this.diveTo.x; tz = this.diveTo.z; ty = this.diveTo.y + 1.1; }
        const dd = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        if (dd < 1.4 && Math.abs(P.pos.y + 1 - this.pos.y) < 1.6) this.strike(1.6, Math.PI, 1, 6, { vert: 3 });
        if (this.st > 1.6 || (this.st > 0.6 && Math.hypot(tx - this.pos.x, tz - this.pos.z) < 0.8)) { this.set('hover'); this.hoverAt = this.pos.clone(); }
        break;
      }
      case 'hover': // after a dive: hangs low, catching her breath — the moment to strike
        flap = 0.7; tx = this.hoverAt.x; tz = this.hoverAt.z; ty = Math.max(W.surface(tx, tz), P.pos.y) + 1.4;
        if (this.st > 1.6) { this.set('rise'); this.game.combat.release(this); }
        break;
      case 'downed': // parried / struck from the air: flaps on the ground
        flap = 0.4; tx = this.pos.x; tz = this.pos.z; ty = ground + 0.9;
        if (this.st > 2.2) { this.set('rise'); this.game.combat.release(this); }
        break;
      case 'rise': case 'stagger': case 'stunned':
        ty = ground + this.alt; flap = 1.5;
        if (this.st > (this.state === 'stunned' ? 1.6 : 0.9)) { this.set('chase'); this.diveCD = rnd(2.5, 4.5); this.game.combat.release(this); }
        break;
    }
    const sp = this.state === 'dive' && this.st > 0.5 ? 15 : 7;
    const dx = tx - this.pos.x, dy = ty - this.pos.y, dz = tz - this.pos.z, l = Math.hypot(dx, dy, dz);
    if (l > 0.05) { const k = Math.min(l, sp * dt) / l; this.pos.x += dx * k + this.vel.x * dt; this.pos.y += dy * k; this.pos.z += dz * k + this.vel.z * dt; }
    this.vel.multiplyScalar(Math.exp(-5 * dt));
    this.pos.y = Math.max(this.pos.y, ground + 0.8);
    const face = this.state === 'dive' ? Math.atan2(tx - this.pos.x, tz - this.pos.z) : this.angleToPlayer();
    this.turnTo(this.state === 'idle' ? Math.atan2(dx, dz) : face, dt, 5);
    const w = Math.sin(this.t * 12 * flap) * 0.7 * flap;
    j.wingL.rotation.z = w + 0.2; j.wingR.rotation.z = -w - 0.2;
    j.torso.rotation.x = this.state === 'dive' ? 0.9 : 0.15;
    j.legL.rotation.x = j.legR.rotation.x = this.state === 'dive' ? -0.9 : 0.2;
    this.place();
  }
}

// ------------------------------------------------------------------------------------------- Minotaur
export class Minotaur extends Enemy {
  constructor(game, o) {
    super(game, buildMinotaur(), { hp: 64, radius: 1.1, height: 4.2, aggroR: 60, leash: 200, loot: { coins: [40, 60], heart: 1 }, ...o });
    this.kind = '米诺陶洛斯'; this.boss = true; this.heavy = true;
    this.speed = 3.4; this.cd = 1.5; this.rage = false;
    this.set('dormant');
  }
  hurt(dmg, from, knock) {
    if (this.state === 'dormant' || this.state === 'intro') return false;
    const stunned = this.state === 'stunned';
    const r = super.hurt(stunned ? dmg * 2 : dmg, from, knock);
    if (!this.rage && this.hp <= this.maxHp / 2 && this.alive) { this.rage = true; this.set('roar'); this.game.audio.play('roar'); this.game.shake(0.6); this.game.hud.flash('米诺陶洛斯暴怒了！', '#ff5a3a'); }
    return r;
  }
  parried() { if (this.state === 'attack' && this.atk !== SLAM) { this.set('stunned'); this.stunDur = 1.8; } }
  update(dt) {
    if (!this.alive) { this.deathUpdate(dt); this.poser.apply(STAGGER, dt, 6); return; }
    this.updateCommon(dt);
    const P = this.player, d = this.dist(), a = this.angleToPlayer();
    let pose = null, move = 0, run = 0;
    const sp = this.speed * (this.rage ? 1.3 : 1);
    this.cd -= dt;
    switch (this.state) {
      case 'dormant': pose = { spine: [0.3, 0, 0], neck: [0.5, 0, 0] }; break;
      case 'intro': case 'roar':
        pose = { spine: [-0.35, 0, 0], neck: [-0.6, 0, 0], shL: [-0.5, 0, 1.4], shR: [-0.5, 0, -1.4], elL: [-1.2, 0, 0], elR: [-1.2, 0, 0], hipsY: -0.05 };
        if (this.st > 0.3 && this.st < 1.5 && Math.random() < dt * 30) this.game.fx.dust(this.pos.x + rnd(-2, 2), this.pos.y + 0.1, this.pos.z + rnd(-2, 2), 2);
        if (this.state === 'roar' && this.st > 1.6) this.set('chase');
        break;
      case 'chase':
        if (!P.alive) break;
        this.turnTo(a, dt, 4);
        if (d > 3.4) { this.steer(a, sp, dt); move = 1; run = 0.4; }
        if (this.cd < 0) {
          const r = Math.random();
          if (d > 9 && r < 0.6) { this.set('windupCharge'); }
          else if (d < 4.5) { this.atk = r < 0.45 ? SWEEP : r < 0.75 ? CHOP : SLAM; this.set('attack'); }
          else if (d < 8 && r < (this.rage ? 0.5 : 0.3)) { this.atk = SLAM; this.set('attack'); }
        }
        break;
      case 'attack': {
        const A = this.atk;
        const tf = this.rage ? 1.25 : 1;
        const t = this.st * tf;
        if (t < A.hit[0] - 0.2) this.turnTo(a, dt, 3.5);
        if (A !== SLAM && t > A.hit[0] - 0.1 && t < A.hit[0] + 0.1) this.walk(Math.sin(this.yaw) * 4, Math.cos(this.yaw) * 4, dt);
        if (t >= A.hit[0] && t <= A.hit[1]) {
          if (A === SWEEP) this.strike(4.6, 1.5, 3, 12);
          else if (A === CHOP) { this.strike(4.2, 0.6, 4, 12); if (!this.slammed) { this.slammed = true; this._impact(2.2); } }
          else if (!this.slammed) { this.slammed = true; this._impact(0); this.ring = { r: 1, t: 0 }; this.game.fx.ring(this.pos.x, this.pos.y, this.pos.z, { maxR: 13, speed: 11, color: [14, 6, 2] }); }
        }
        if (this.ring) { // shockwave: hurts the hero while grounded at the ring radius
          this.ring.r += 11 * dt;
          if (Math.abs(d - this.ring.r) < 0.9 && P.state === 'ground' && Math.abs(P.pos.y - this.pos.y) < 1.5 && !this.ringHit) { this.ringHit = true; P.damage(3, this.pos, { knock: 10, unblockable: true }); }
          if (this.ring.r > 13) { this.ring = null; this.ringHit = false; }
        }
        pose = sampleKeys(A.keys, t);
        if (this.st < dt * 1.5) this.game.audio.play('swing');
        if (t >= A.dur) {
          this.slammed = false;
          // enraged: chain a second attack sometimes
          if (this.rage && A === SWEEP && Math.random() < 0.5) { this.atk = CHOP; this.set('attack'); }
          else { this.set('chase'); this.cd = rnd(0.8, 1.8) / tf; }
        }
        break;
      }
      case 'windupCharge':
        this.turnTo(a, dt, 6);
        pose = { spine: [0.5, 0, 0], neck: [0.5, 0, 0], shL: [0.4, 0, 0.3], shR: [0.4, 0, -0.3], hipL: [-0.6, 0, 0], kneeL: [0.8, 0, 0], hipsY: -0.15 };
        if (Math.random() < dt * 15) this.game.fx.dust(this.pos.x - Math.sin(this.yaw) * 1.2, this.pos.y + 0.1, this.pos.z - Math.cos(this.yaw) * 1.2, 2);
        if (this.st < dt * 1.5) this.game.audio.play('roar');
        if (this.st > 0.9) this.set('charge');
        break;
      case 'charge': {
        if (this.st < 0.3) this.turnTo(a, dt, 4);
        const ok = this.walk(Math.sin(this.yaw) * 15, Math.cos(this.yaw) * 15, dt, 1.2);
        move = 1; run = 1;
        pose = { spine: [0.6, 0, 0], neck: [0.7, 0, 0], shL: [0.6, 0, 0.3], shR: [0.6, 0, -0.3] };
        if (Math.random() < dt * 20) this.game.fx.dust(this.pos.x, this.pos.y + 0.1, this.pos.z, 2);
        if (d < 2.4) this.strike(2.6, 1.0, 4, 16);
        if (!ok) { this.set('stunned'); this.stunDur = 3; this._impact(1.5); this.game.hud.flash('它撞晕了！快攻击！', '#ffd76a'); }
        else if (this.st > 2.2) { this.set('chase'); this.cd = 1; }
        break;
      }
      case 'stunned':
        pose = { ...STAGGER, spine: [0.6, 0, 0.2], neck: [0.6, 0, 0], hipsY: -0.2 };
        if (Math.random() < dt * 12) this.game.fx.sparkle(this.pos.x, this.pos.y + this.height + 0.3, this.pos.z, [8, 8, 3]);
        if (this.st > (this.stunDur || 2)) { this.set('chase'); this.cd = 0.6; }
        break;
      case 'stagger':
        this.set('chase'); break;
    }
    this.phase += dt * move * (5 + run * 3);
    const loco = locomotion(this.phase, move, run, this.t, {});
    loco.shR = [-0.4, 0, -0.25]; loco.elR = [-0.6, 0, 0]; loco.handR = [-1.1, 0, 0];
    this.poser.apply(pose ? blend(loco, pose, 1) : loco, dt, pose ? 12 : 8);
    this.place();
  }
  _impact(r) {
    const g = this.game, [fx, fz] = [Math.sin(this.yaw), Math.cos(this.yaw)];
    const x = this.pos.x + fx * r, z = this.pos.z + fz * r;
    g.audio.play('slam'); g.shake(0.55); g.fx.dust(x, this.pos.y + 0.1, z, 24); g.fx.sparks(x, this.pos.y + 0.2, z, [14, 7, 2]);
  }
}

// ------------------------------------------------------------------------------------------- combat
export class Combat {
  constructor(game) { this.game = game; this.tokens = new Set(); this.engaged = new Set(); }

  aggro(e) { this.engaged.add(e); }
  token(e) {
    if (this.tokens.has(e)) return true;
    if (e.boss) return true;
    if (this.tokens.size < 2) { this.tokens.add(e); return true; }
    return false;
  }
  release(e) { this.tokens.delete(e); }

  get inBattle() {
    const P = this.game.player;
    for (const e of this.engaged) {
      if (!e.alive || e.state === 'idle' || e.state === 'return' || e.state === 'dormant' || e.pos.distanceTo(P.pos) > 40) this.engaged.delete(e);
    }
    return this.engaged.size > 0;
  }

  /** hero sword swing: damage everything inside the arc once per swing */
  playerSwing(P, dmg, range, halfArc, knock) {
    const g = this.game;
    const [fx, fz] = P.facing();
    const yaw = P.yaw + (P.spinYaw || 0);
    const test = (x, y, z, rad, hgt) => {
      const dx = x - P.pos.x, dz = z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > range + rad) return false;
      if (y > P.pos.y + 2.4 || y + hgt < P.pos.y - 0.6) return false;
      return halfArc >= Math.PI || Math.abs(angTo(P.action?.type === 'spin' ? yaw : P.yaw, Math.atan2(dx, dz))) < halfArc;
    };
    for (const e of g.enemies) {
      if (!e.alive || P.hitSet.has(e)) continue;
      const ey = e instanceof Harpy ? e.pos.y - 0.6 : e.pos.y;
      if (!test(e.pos.x, ey, e.pos.z, e.radius, e.height)) continue;
      P.hitSet.add(e);
      if (e.hurt(dmg, P.pos, knock)) {
        const hx = e.pos.x - fx * e.radius * 0.5, hz = e.pos.z - fz * e.radius * 0.5;
        g.fx.hit(hx, ey + e.height * 0.55, hz);
        g.audio.play(e instanceof Spartos ? 'bone' : 'hit');
        g.hitstop(e.alive ? 0.06 : 0.1); g.shake(0.12);
        if (!P.lock && e.alive) P.lockSoft = e;
      }
    }
    g.items.swingAt(P, test);
  }
}
