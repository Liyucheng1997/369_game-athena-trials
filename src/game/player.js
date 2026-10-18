// The hero: movement (run / sprint / jump / climb / glide / swim), sword combat (3-hit combo, charged spin,
// shield block + perfect parry, dodge roll) and health / stamina. Movement is resolved against the 2.5D
// collision field (collision.js); the hero climbs any wall it pushes into, BotW style.
import * as THREE from 'three';
import { buildHero } from './models.js';
import { Poser, locomotion, blend, sampleKeys, HERO, COMBO, SPIN, UPPER, ARM_L } from './anim.js';
import { WATER_LEVEL } from './collision.js';

const GRAV = 25;
const STAM = { sprint: 16, climb: 9, climbIdle: 1.5, glide: 5.5, swim: 1.6, swimDash: 18, roll: 14, spin: 25, climbJump: 20, regen: 34, regenTired: 22 };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const angTo = (from, to) => wrap(to - from);

export class Player {
  constructor(game) {
    this.game = game;
    this.rig = buildHero();
    this.poser = new Poser(this.rig);
    this.root = this.rig.root;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;               // facing (rad): direction (sin, cos)
    this.state = 'ground';
    this.action = null;         // { type, t, ... }
    this.maxHp = 10; this.hp = 10;   // half hearts
    this.maxStamina = 100; this.stamina = 100; this.tired = false; this.stamIdle = 0;
    this.hasSword = false; this.hasShield = false; this.hasGlider = false;
    this.invuln = 0; this.phase = 0; this.runAmt = 0; this.moveAmt = 0;
    this.blockT = -1; this.blocking = false;
    this.chargeT = 0; this.comboIdx = 0; this.comboQueued = false;
    this.lock = null;
    this.safe = new THREE.Vector3(); this.safeT = 0;
    this.airT = 0; this.wallPush = 0; this.stepT = 0;
    this.climbN = [0, 1];
    this.potions = 0; this.coins = 0;
    this.hitSet = new Set();
    this.trail = null;
    this.stats = { kills: 0, deaths: 0, time: 0 };
  }

  spawn(x, y, z, yaw = 0) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.yaw = yaw; this.state = 'ground'; this.action = null;
    this.safe.set(x, y, z);
    this.root.position.copy(this.pos);
  }

  get alive() { return this.state !== 'dead'; }
  get armed() { return this.hasSword; }
  get busy() { return this.action && ['attack', 'spin', 'roll', 'hurt', 'interact', 'raise'].includes(this.action.type); }
  get airborne() { return this.state === 'air' || this.state === 'glide'; }
  facing() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }

  useStamina(n) {
    if (this.tired || this.stamina <= 0) return false;
    this.stamina = Math.max(0, this.stamina - n); this.stamIdle = 0;
    if (this.stamina <= 0) { this.tired = true; this.game.audio.play('stamina'); }
    return true;
  }
  drain(rate, dt) { return this.useStamina(rate * dt) || this.stamina > 0; }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  // ------------------------------------------------------------------------------------------- damage
  /** returns 'hit' | 'block' | 'parry' | 'miss' */
  damage(amount, from, { knock = 6, unblockable = false, source = null } = {}) {
    if (!this.alive || this.invuln > 0 || this.game.cutscene) return 'miss';
    if (this.action?.type === 'roll' && this.action.t < 0.38) return 'miss';
    const g = this.game;
    const dx = from.x - this.pos.x, dz = from.z - this.pos.z;
    const toA = Math.atan2(dx, dz);
    const frontal = Math.abs(angTo(this.yaw, toA)) < 1.25;
    if (this.blocking && frontal && !unblockable && this.hasShield) {
      const [fx, fz] = this.facing();
      const px = this.pos.x + fx * 0.6, py = this.pos.y + 1.2, pz = this.pos.z + fz * 0.6;
      if (this.game.time - this.blockT < 0.22) { // perfect guard
        g.audio.play('parry'); g.fx.sparks(px, py, pz, [20, 16, 6]); g.fx.ring(px, py - 1.1, pz, { maxR: 2.5, speed: 10, color: [8, 6, 2] });
        g.hitstop(0.12); g.hud.flash('完美防御！', '#ffd76a');
        source?.parried?.();
        return 'parry';
      }
      if (this.stamina >= amount * 6 && !this.tired) {
        this.useStamina(amount * 6);
        g.audio.play('block'); g.fx.sparks(px, py, pz);
        this.vel.x -= Math.sin(toA) * knock * 0.4; this.vel.z -= Math.cos(toA) * knock * 0.4;
        g.shake(0.15);
        return 'block';
      }
      this.blocking = false; this.tired = true; this.stamina = 0; g.hud.flash('防御被破！', '#ff7a5a');
    }
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = 1.0;
    g.audio.play('hurt'); g.shake(0.35); g.hud.hurt();
    g.fx.hit(this.pos.x, this.pos.y + 1.2, this.pos.z);
    g.hitstop(0.07);
    this.vel.x = -Math.sin(toA) * knock; this.vel.z = -Math.cos(toA) * knock;
    if (this.state === 'climb' || this.state === 'glide') this.setState('air');
    if (this.state === 'ground') { this.action = { type: 'hurt', t: 0, dur: 0.35 }; this.yaw = toA; }
    this.trail && (this.trail.active = false);
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  die() {
    this.state = 'dead'; this.action = null; this.vel.set(0, 0, 0); this.lock = null;
    this.stats.deaths++;
    this.game.audio.play('gameover');
    this.game.onPlayerDeath();
  }

  setState(s) {
    const prev = this.state;
    this.state = s;
    if (s === 'glide') { this.rig.glider.visible = true; this.game.audio.play('glider'); this.game.audio.setGlide(true); }
    else if (prev === 'glide') { this.rig.glider.visible = false; this.game.audio.setGlide(false); }
    if (s === 'climb') { this.action = null; this.blocking = false; }
    if (s === 'swim') { this.action = null; this.blocking = false; this.lock = null; }
  }

  // ------------------------------------------------------------------------------------------- update
  update(dt) {
    const g = this.game, inp = g.input, W = g.world;
    this.stats.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.state === 'dead') { this.poser.apply(HERO.dead, dt, 6); this._place(); return; }

    // stamina regen
    this.stamIdle += dt;
    const busyStam = this.state === 'climb' || this.state === 'glide' || (this.state === 'swim' && this.moveAmt > 0.1);
    if (!busyStam && this.stamIdle > 0.5 && this.state !== 'air') {
      this.stamina = Math.min(this.maxStamina, this.stamina + (this.tired ? STAM.regenTired : STAM.regen) * dt);
      if (this.tired && this.stamina >= this.maxStamina) this.tired = false;
    }

    // camera-relative wish direction
    const ax = g.cutscene ? { x: 0, y: 0 } : inp.axes();
    const cy = g.cam.yaw;
    const fwdX = Math.sin(cy), fwdZ = Math.cos(cy);
    let wx = fwdX * ax.y - fwdZ * ax.x, wz = fwdZ * ax.y + fwdX * ax.x;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const wish = Math.min(1, wl);

    // lock-on maintenance
    if (this.lock && (!this.lock.alive || this.lock.pos.distanceTo(this.pos) > 30)) this.lock = null;

    if (this.action) this._updateAction(dt);
    switch (this.state) {
      case 'ground': this._ground(dt, wx, wz, wish); break;
      case 'air': this._air(dt, wx, wz, wish); break;
      case 'glide': this._glide(dt, wx, wz, wish); break;
      case 'climb': this._climb(dt, ax); break;
      case 'swim': this._swim(dt, wx, wz, wish); break;
    }
    // world bounds / lost: back to the last safe spot
    if (this.pos.y < W.ground(this.pos.x, this.pos.z) - 3 || this.pos.y < -30) this.respawnSafe(1);

    this._animate(dt);
    this._place();
  }

  respawnSafe(dmg) {
    const g = this.game;
    this.setState('ground'); this.action = null;
    this.pos.copy(this.safe); this.vel.set(0, 0, 0);
    if (dmg) { this.hp = Math.max(1, this.hp - dmg); g.hud.hurt(); }
    g.hud.flash('你被冲回了岸边', '#9fd0ff');
    g.cam.snap();
  }

  _place() {
    this.root.position.copy(this.pos);
    if (this.state === 'climb') { this.root.position.x -= this.climbN[0] * 0.28; this.root.position.z -= this.climbN[1] * 0.28; }
    this.rig.body.rotation.y = this.yaw + (this.spinYaw || 0);
    // blink while invulnerable
    this.rig.body.visible = !(this.invuln > 0 && this.state !== 'dead' && Math.floor(this.invuln * 16) % 2 === 0 && this.invuln < 0.95);
  }

  _turnTo(target, dt, rate = 14) { this.yaw += angTo(this.yaw, target) * Math.min(1, rate * dt); }

  // ------------------------------------------------------------------------------------------- ground
  _ground(dt, wx, wz, wish) {
    const g = this.game, inp = g.input, W = g.world, a = this.action;
    const canAct = !this.busy && !g.cutscene;
    // block (RMB)
    const wantBlock = this.hasShield && inp.down('MouseRight') && canAct && !this.tired;
    if (wantBlock && !this.blocking) this.blockT = g.time;
    this.blocking = wantBlock;
    // sprint
    const sprint = inp.down('ShiftLeft', 'ShiftRight') && wish > 0.1 && !this.blocking && !this.lock && !this.tired;
    let speed = this.blocking ? 2.2 : this.lock ? 4.2 : 6.0;
    if (this.tired) speed = 2.6;
    if (sprint && canAct && this.drain(STAM.sprint, dt)) speed = 9.2;
    let mx = wx * speed * wish, mz = wz * speed * wish;
    if (a) {
      if (a.type === 'attack') { const c = COMBO[a.idx]; const l = c.lunge && a.t > c.hit[0] - 0.05 && a.t < c.hit[1] ? c.lunge : (a.t < 0.15 ? 1.5 : 0); const [fx, fz] = this.facing(); mx = fx * l; mz = fz * l; }
      else if (a.type === 'spin') { mx *= 0.3; mz *= 0.3; }
      else if (a.type === 'roll') { const k = a.t < 0.4 ? 9.5 : 2; mx = a.dx * k; mz = a.dz * k; }
      else if (a.type === 'hurt' || a.type === 'interact' || a.type === 'raise') { mx = 0; mz = 0; }
    }
    if (this.chargeT > 0.25) { mx *= 0.35; mz *= 0.35; }
    // acceleration toward the wish velocity (+ external knockback decays)
    const acc = 1 - Math.exp(-14 * dt);
    this.vel.x += (mx - this.vel.x) * acc; this.vel.z += (mz - this.vel.z) * acc;
    this.moveAmt = Math.hypot(this.vel.x, this.vel.z);
    this.runAmt = THREE.MathUtils.clamp((this.moveAmt - 3.5) / 5, 0, 1);
    // facing
    if (canAct || a?.type === 'roll') {
      if (this.lock) this._turnTo(Math.atan2(this.lock.pos.x - this.pos.x, this.lock.pos.z - this.pos.z), dt, 12);
      else if (wish > 0.1 && !this.blocking && !(a?.type === 'roll')) this._turnTo(Math.atan2(wx, wz), dt, sprint ? 10 : 14);
      else if (this.blocking && wish > 0.1 && !this.lock) this._turnTo(g.cam.yaw, dt, 8);
    } else if (a?.type === 'attack' && a.t < 0.08 && wish > 0.1 && !this.lock) this._turnTo(Math.atan2(wx, wz), dt, 30);

    // move with collision
    const r = W.move(this.pos.x, this.pos.z, this.pos.y, this.vel.x * dt, this.vel.z * dt, 0.38, 0.6);
    this.pos.x = r.x; this.pos.z = r.z;
    // blocked by a wall: vault onto low ledges, climb anything taller (BotW style)
    if (r.blocked && r.wallH > 0.6 && wish > 0.3 && canAct && !this.blocking) {
      const top = W.groundMax(this.pos.x + wx * 0.9, this.pos.z + wz * 0.9, 0.3);
      if (top - this.pos.y < 1.3) {
        this.setState('air'); this.vel.y = Math.sqrt(2 * GRAV * (top - this.pos.y + 0.35)); this.vel.x = wx * 3; this.vel.z = wz * 3;
        this.airT = 0; this.fallFrom = this.pos.y; g.audio.play('jump');
        return;
      }
      let n = W.wallNormal(this.pos.x + wx * 0.6, this.pos.z + wz * 0.6);
      if (wx * -n[0] + wz * -n[1] < 0.3) n = [-wx / wish, -wz / wish]; // small / oblique obstacles: face the push
      this.wallPush += dt; if (this.wallPush > 0.12 && !this.tired) { this._startClimb(n); return; }
    } else this.wallPush = 0;

    const gy = W.ground(this.pos.x, this.pos.z);
    if (gy < this.pos.y - 0.65) { this.setState('air'); this.vel.y = 0; this.airT = 0; this.fallFrom = this.pos.y; return; }
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 20);
    if (Math.abs(gy - this.pos.y) < 0.02) this.pos.y = gy;
    if (W.isWater(this.pos.x, this.pos.z, 1.25) && this.pos.y < WATER_LEVEL - 0.6) { this._enterWater(); return; }

    // safe ground memory (dry, flat-ish, not in a fight)
    this.safeT += dt;
    if (this.safeT > 0.5 && gy > WATER_LEVEL + 0.2 && W.groundMax(this.pos.x, this.pos.z, 1.2) - gy < 0.5) { this.safe.copy(this.pos); this.safeT = 0; }

    // footsteps
    if (this.moveAmt > 1) { this.stepT -= dt * this.moveAmt * 0.32; if (this.stepT < 0) { this.stepT = 1; g.audio.play('step'); if (this.runAmt > 0.6) g.fx.dust(this.pos.x, this.pos.y + 0.05, this.pos.z, 2); } }

    if (!canAct) return;
    // jump / dodge
    if (inp.hit('Space')) {
      if (this.lock && wish > 0.2) this._roll(wx, wz);
      else { this.setState('air'); this.vel.y = 7.6; this.airT = 0; this.fallFrom = this.pos.y; g.audio.play('jump'); this.blocking = false; }
      return;
    }
    if (inp.hit('ControlLeft', 'KeyC', 'AltLeft')) { this._roll(wish > 0.1 ? wx : Math.sin(this.yaw), wish > 0.1 ? wz : Math.cos(this.yaw)); return; }
    this._combat(dt);
  }

  _roll(dx, dz) {
    if (!this.useStamina(STAM.roll)) return;
    const l = Math.hypot(dx, dz) || 1;
    this.action = { type: 'roll', t: 0, dur: 0.55, dx: dx / l, dz: dz / l };
    if (!this.lock) this.yaw = Math.atan2(dx, dz);
    this.blocking = false;
    this.game.audio.play('jump');
    this.game.fx.dust(this.pos.x, this.pos.y + 0.1, this.pos.z, 5);
  }

  _combat(dt) {
    const g = this.game, inp = g.input;
    if (!this.hasSword || this.blocking) { this.chargeT = 0; return; }
    if (inp.hit('MouseLeft')) { this._attack(0); this.chargeT = 0.0001; return; }
    if (this.chargeT > 0 && inp.down('MouseLeft')) {
      this.chargeT += dt;
      if (this.chargeT > 0.55) { if (!this.charging) { this.charging = true; g.audio.play('lock'); } g.fx.sparkle(this.pos.x, this.pos.y + 1.2, this.pos.z, [8, 6, 2]); }
    } else if (this.chargeT > 0) {
      if (this.charging && this.useStamina(STAM.spin)) this._spin();
      this.chargeT = 0; this.charging = false;
    }
  }

  _attack(idx) {
    this.action = { type: 'attack', idx, t: 0, dur: COMBO[idx].dur };
    this.comboQueued = false; this.hitSet.clear();
    this.game.audio.play('swing');
    if (this.trail) this.trail.active = true;
  }
  _spin() {
    this.action = { type: 'spin', t: 0, dur: SPIN.dur };
    this.hitSet.clear();
    this.game.audio.play('spin');
    if (this.trail) this.trail.active = true;
  }

  _updateAction(dt) {
    const a = this.action, g = this.game, inp = g.input;
    a.t += dt;
    if (a.type === 'attack') {
      const c = COMBO[a.idx];
      if (inp.hit('MouseLeft') && a.t > 0.08) this.comboQueued = true;
      if (a.t >= c.hit[0] && a.t <= c.hit[1]) g.combat.playerSwing(this, a.idx === 2 ? 2 : 1, a.idx === 2 ? 2.7 : 2.5, a.idx === 2 ? 0.7 : 1.3, a.idx === 2 ? 9 : 5);
      if (a.t > c.hit[1] + 0.02 && this.trail) this.trail.active = false;
      if (a.t >= c.hit[1] + 0.06 && this.comboQueued && a.idx < 2) { this._attack(a.idx + 1); this.chargeT = 0.0001; return; }
      if (a.t >= c.dur) { this.action = null; this.comboIdx = 0; }
    } else if (a.type === 'spin') {
      this.spinYaw = -(a.t / SPIN.dur) * Math.PI * 2;
      if (a.t >= SPIN.hit[0] && a.t <= SPIN.hit[1]) g.combat.playerSwing(this, 2, 3.2, Math.PI, 10);
      if (a.t >= SPIN.dur) { this.action = null; this.spinYaw = 0; if (this.trail) this.trail.active = false; }
    } else if (a.t >= (a.dur ?? 0.4)) { this.action = null; }
  }

  // ------------------------------------------------------------------------------------------- air
  _air(dt, wx, wz, wish) {
    const g = this.game, inp = g.input, W = g.world;
    this.airT += dt;
    this.blocking = false;
    const ac = 1 - Math.exp(-3 * dt);
    const sp = 6.0;
    this.vel.x += (wx * sp * wish - this.vel.x) * ac * (wish > 0.1 ? 1 : 0.3);
    this.vel.z += (wz * sp * wish - this.vel.z) * ac * (wish > 0.1 ? 1 : 0.3);
    if (wish > 0.1) this._turnTo(Math.atan2(wx, wz), dt, 6);
    this.vel.y -= GRAV * dt;
    const r = W.move(this.pos.x, this.pos.z, this.pos.y, this.vel.x * dt, this.vel.z * dt, 0.38, 0.6);
    this.pos.x = r.x; this.pos.z = r.z;
    this.pos.y += this.vel.y * dt;
    if (r.blocked && r.wallH > 0.9 && wish > 0.3 && !this.tired && this.airT > 0.12) {
      const n = W.wallNormal(this.pos.x + wx * 0.6, this.pos.z + wz * 0.6);
      if (wx * -n[0] + wz * -n[1] > 0.5) { this._startClimb(n); return; }
    }
    if (inp.hit('Space') && this.hasGlider && this.airT > 0.15 && !this.tired && this.stamina > 0 && this.pos.y - W.ground(this.pos.x, this.pos.z) > 1.5) {
      this.setState('glide'); this.vel.y = Math.max(this.vel.y, -3); return;
    }
    const gy = W.ground(this.pos.x, this.pos.z);
    if (gy < WATER_LEVEL - 1.25 && this.pos.y < WATER_LEVEL - 0.9) { this._enterWater(); return; }
    if (this.pos.y <= gy) {
      const v = -this.vel.y;
      this.pos.y = gy; this.vel.y = 0;
      this.setState('ground');
      g.audio.play('land'); g.fx.dust(this.pos.x, gy + 0.1, this.pos.z, v > 12 ? 12 : 5);
      if (v > 19) { const d = 2 * (1 + Math.floor((v - 19) / 5)); this.damage(d, { x: this.pos.x + Math.sin(this.yaw), z: this.pos.z + Math.cos(this.yaw) }, { knock: 0, unblockable: true }); g.hud.flash('摔伤了！', '#ff7a5a'); }
      else if (v > 13) this.action = { type: 'hurt', t: 0.15, dur: 0.35 };
    }
  }

  _glide(dt, wx, wz, wish) {
    const g = this.game, inp = g.input, W = g.world;
    if (!this.drain(STAM.glide, dt) || this.tired || inp.hit('Space')) { this.setState('air'); this.airT = 1; return; }
    if (wish > 0.1) this._turnTo(Math.atan2(wx, wz), dt, 1.8);
    const [fx, fz] = this.facing();
    const sp = 8.5 + (inp.down('KeyW') ? 1.5 : 0) - (inp.down('KeyS') ? 4 : 0);
    const ac = 1 - Math.exp(-2.5 * dt);
    this.vel.x += (fx * sp - this.vel.x) * ac; this.vel.z += (fz * sp - this.vel.z) * ac;
    this.vel.y += (-2.4 - this.vel.y) * (1 - Math.exp(-3 * dt));
    const r = W.move(this.pos.x, this.pos.z, this.pos.y, this.vel.x * dt, this.vel.z * dt, 0.38, 0.6);
    this.pos.x = r.x; this.pos.z = r.z; this.pos.y += this.vel.y * dt;
    if (r.blocked && r.wallH > 0.9 && !this.tired) { this._startClimb(W.wallNormal(this.pos.x + fx * 0.6, this.pos.z + fz * 0.6)); return; }
    const gy = W.ground(this.pos.x, this.pos.z);
    if (gy < WATER_LEVEL - 1.25 && this.pos.y < WATER_LEVEL - 0.9) { this._enterWater(); return; }
    if (this.pos.y <= gy) { this.pos.y = gy; this.vel.y = 0; this.setState('ground'); g.audio.play('land'); }
  }

  // ------------------------------------------------------------------------------------------- climb
  _startClimb(n) {
    this.setState('climb');
    this.climbN = n;
    this.yaw = Math.atan2(-n[0], -n[1]);
    this.vel.set(0, 0, 0);
    this.wallPush = 0;
  }

  _climb(dt, ax) {
    const g = this.game, inp = g.input, W = g.world;
    const n = this.climbN;
    const fx = -n[0], fz = -n[1];
    const moving = Math.abs(ax.x) + Math.abs(ax.y) > 0.1;
    if (!this.drain(moving ? STAM.climb : STAM.climbIdle, dt) || this.tired) { this.setState('air'); this.airT = 1; this.vel.set(n[0] * 1.5, 0, n[1] * 1.5); this.fallFrom = this.pos.y; return; }
    // let go / climb jump
    if (inp.hit('ControlLeft', 'KeyC', 'AltLeft')) { this.setState('air'); this.airT = 1; this.vel.set(n[0] * 2.5, 0, n[1] * 2.5); return; }
    let up = ax.y * 1.7, side = -ax.x * 1.4;
    if (inp.hit('Space') && this.useStamina(STAM.climbJump)) { this.climbBoost = 0.35; g.audio.play('jump'); }
    if (this.climbBoost > 0) { this.climbBoost -= dt; up = 5; }
    this.climbAnim = (this.climbAnim || 0) + dt * (Math.abs(up) + Math.abs(side)) * 3.2;
    // vertical
    this.pos.y += up * dt;
    // top reached → mantle
    const px = this.pos.x + fx * 0.75, pz = this.pos.z + fz * 0.75;
    const top = W.ground(px, pz);
    if (top <= this.pos.y + 0.45) {
      const mx = this.pos.x + fx * 1.0, mz = this.pos.z + fz * 1.0;
      if (W.inBounds(mx, mz)) { this.pos.x = mx; this.pos.z = mz; }
      this.pos.y = Math.max(this.pos.y, W.ground(this.pos.x, this.pos.z));
      this.setState('ground'); this.action = { type: 'hurt', t: 0.2, dur: 0.32 }; // brief crouch on the ledge
      g.fx.dust(this.pos.x, this.pos.y + 0.1, this.pos.z, 4);
      return;
    }
    // sideways along the wall
    if (Math.abs(side) > 0.01) {
      const tx = -fz, tz = fx;
      const nx = this.pos.x + tx * side * dt, nz = this.pos.z + tz * side * dt;
      const ahead = W.ground(nx + fx * 0.75, nz + fz * 0.75);
      if (ahead > this.pos.y + 0.45 && W.ground(nx, nz) <= this.pos.y + 0.3 && W.inBounds(nx, nz)) {
        this.pos.x = nx; this.pos.z = nz;
        const n2 = W.wallNormal(nx + fx * 0.6, nz + fz * 0.6);
        this.climbN = [n[0] + (n2[0] - n[0]) * 0.15, n[1] + (n2[1] - n[1]) * 0.15];
        const l = Math.hypot(...this.climbN) || 1; this.climbN[0] /= l; this.climbN[1] /= l;
        this.yaw = Math.atan2(-this.climbN[0], -this.climbN[1]);
      }
    }
    // stay against the wall (the wall face can recede as we climb)
    for (let k = 0; k < 4 && W.ground(this.pos.x + fx * 0.5, this.pos.z + fz * 0.5) <= this.pos.y + 0.45; k++) { this.pos.x += fx * 0.1; this.pos.z += fz * 0.1; }
    const gy = W.ground(this.pos.x, this.pos.z);
    if (gy > this.pos.y) this.pos.y = gy;
    if (this.pos.y <= gy + 0.02 && up < 0) { this.setState('ground'); return; }
    if (gy < WATER_LEVEL - 1.25 && this.pos.y < WATER_LEVEL - 0.9) this._enterWater();
  }

  // ------------------------------------------------------------------------------------------- swim
  _enterWater() {
    const g = this.game;
    if (this.state !== 'swim') { g.audio.play('splash'); g.fx.splash(this.pos.x, WATER_LEVEL, this.pos.z, 30); }
    this.setState('swim'); this.vel.y = 0;
    this.trail && (this.trail.active = false);
  }

  _swim(dt, wx, wz, wish) {
    const g = this.game, inp = g.input, W = g.world;
    let sp = 3.4;
    if (inp.hit('ShiftLeft', 'ShiftRight', 'Space') && this.useStamina(STAM.swimDash)) { this.swimDash = 0.6; g.audio.play('stroke'); g.fx.splash(this.pos.x, WATER_LEVEL, this.pos.z, 8); }
    if (this.swimDash > 0) { this.swimDash -= dt; sp = 7; }
    if (wish > 0.1 && !this.drain(STAM.swim, dt)) { /* exhausted → drown */ }
    if (this.tired && this.stamina <= 0.01) { this.drownT = (this.drownT || 0) + dt; if (this.drownT > 1.2) { this.drownT = 0; this.tired = false; this.stamina = this.maxStamina * 0.5; g.audio.play('splash'); this.respawnSafe(2); return; } }
    const ac = 1 - Math.exp(-4 * dt);
    this.vel.x += (wx * sp * wish - this.vel.x) * ac; this.vel.z += (wz * sp * wish - this.vel.z) * ac;
    this.moveAmt = Math.hypot(this.vel.x, this.vel.z);
    if (wish > 0.1) this._turnTo(Math.atan2(wx, wz), dt, 6);
    const r = W.move(this.pos.x, this.pos.z, WATER_LEVEL - 0.95, this.vel.x * dt, this.vel.z * dt, 0.38, 0.6, false);
    this.pos.x = r.x; this.pos.z = r.z;
    this.pos.y += (WATER_LEVEL - 0.95 + Math.sin(g.time * 2.5) * 0.04 - this.pos.y) * Math.min(1, dt * 6);
    if (r.blocked && r.wallH > 0.9 && wish > 0.3 && !this.tired) {
      const n = W.wallNormal(this.pos.x + wx * 0.6, this.pos.z + wz * 0.6);
      if (wx * -n[0] + wz * -n[1] > 0.5) { this.pos.y = WATER_LEVEL - 0.95; this._startClimb(n); return; }
    }
    const gy = W.ground(this.pos.x, this.pos.z);
    if (gy >= WATER_LEVEL - 1.2) { this.pos.y = Math.max(gy, this.pos.y); this.setState('ground'); return; }
    this.swimStroke = (this.swimStroke || 0) + dt * (1 + this.moveAmt);
    if (this.moveAmt > 1 && Math.random() < dt * 8) g.fx.splash(this.pos.x, WATER_LEVEL + 0.05, this.pos.z, 2);
  }

  // ------------------------------------------------------------------------------------------- animation
  _animate(dt) {
    const g = this.game, a = this.action;
    const t = g.time;
    let pose, rate = 14;
    this.phase += dt * (this.moveAmt * (this.runAmt > 0.5 ? 1.25 : 1.6) + 0.0);
    const loco = locomotion(this.phase, Math.min(1, this.moveAmt / 3.5), this.runAmt, t, { armed: this.hasSword });
    switch (this.state) {
      case 'air': pose = this.vel.y > 0 ? HERO.jump : HERO.fall; rate = 8; break;
      case 'glide': pose = HERO.glide; rate = 8; break;
      case 'climb': {
        const c = this.climbAnim || 0, s = Math.sin(c);
        pose = { ...HERO.climb, shL: [-2.6 + s * 0.45, 0, 0.35], shR: [-2.6 - s * 0.45, 0, -0.35], hipL: [-0.9 - s * 0.35, 0, 0.15], hipR: [-0.9 + s * 0.35, 0, -0.15], kneeL: [1.3 + s * 0.3, 0, 0], kneeR: [1.3 - s * 0.3, 0, 0] };
        rate = 12; break;
      }
      case 'swim': {
        const s = Math.sin(this.swimStroke * 2.5);
        pose = { ...HERO.swim, shL: [-2.2 + s * 0.9, 0, 0.6], shR: [-2.2 - s * 0.9, 0, -0.6], hipL: [0.2 + s * 0.4, 0, 0.1], hipR: [0.2 - s * 0.4, 0, -0.1] };
        rate = 8; break;
      }
      default: pose = loco;
    }
    if (this.state === 'ground') {
      if (this.blocking) pose = blend(pose, HERO.block, 1, UPPER);
      if (this.chargeT > 0.25 && !a) pose = blend(pose, HERO.charge, Math.min(1, (this.chargeT - 0.25) * 4));
      if (a) {
        if (a.type === 'attack') { pose = blend(pose, sampleKeys(COMBO[a.idx].keys, a.t), 1); rate = 30; }
        else if (a.type === 'spin') { pose = blend(pose, sampleKeys(SPIN.keys, a.t), 1); rate = 30; }
        else if (a.type === 'roll') { pose = a.t < 0.42 ? HERO.roll : loco; rate = 20; }
        else if (a.type === 'hurt') { pose = HERO.hurt; rate = 18; }
        else if (a.type === 'interact') { pose = blend(loco, HERO.interact, 1, UPPER); }
        else if (a.type === 'raise') { pose = HERO.raise; rate = 10; }
      }
      if (!this.hasShield) pose = blend(pose, { shL: pose.shL, elL: [-0.3, 0, 0] }, 1, ['elL']);
    }
    this.poser.apply(pose, dt, rate);
    // roll: tumble the whole body
    if (a?.type === 'roll' && a.t < 0.42) { this.rig.j.hips.rotation.x = (a.t / 0.42) * Math.PI * 2; }
    // sword / shield visibility
    this.rig.sword.visible = this.hasSword;
    this.rig.shield.visible = this.hasShield;
    if (this.state === 'swim' || this.state === 'climb' || this.state === 'glide') { this.rig.sword.visible = false; }
    // sword trail sampling
    if (this.trail && (this.trail.active || this.trail.fade > 0)) {
      this.rig.root.updateMatrixWorld(true);
      this.trail.push(this.rig.swordTip.getWorldPosition(_v), this.rig.swordBase.getWorldPosition(_w));
    }
  }
}
