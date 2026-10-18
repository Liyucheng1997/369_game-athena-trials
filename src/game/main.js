// 雅典娜之试炼 / Trials of Athena — a Zelda-like action adventure on top of the Athenaion world.
//   http://localhost:8080/game.html            (add ?scale=0.75 for a lower render resolution)
// Boot: engine (game quality) → full world build (all modules) → collision capture → game objects →
// shader warm-up → title screen. The frame loop renders one un-jittered sample per frame through the
// Athenaion HDR pipeline (bloom, AgX grade, lens effects) with cascaded shadows following the camera.
import * as THREE from 'three';
import { createEngine } from '../core/engine.js';
import { getQuality } from '../core/quality.js';
import { GRADE } from '../core/pipeline.js';
import { World } from './collision.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Combat, Harpy } from './enemies.js';
import { Items } from './items.js';
import { HUD, Dialog } from './hud.js';
import { Quest, PLACES } from './quest.js';
import { GameOptimizer } from './optimize.js';

const P = new URLSearchParams(location.search);

class Game {
  constructor() {
    this.time = 0; this.frame = 0;
    this.cutscene = false; this.paused = true; this.started = false;
    this.hitstopT = 0;
    this.enemies = [];
    this.timers = [];
    this.scale = Number(P.get('scale')) || 1;
  }

  /** render size: CSS pixels × scale, capped at ~1.15 MP (the CSS canvas upscales) — the world is heavy */
  size() {
    let w = innerWidth * Math.min(devicePixelRatio, 1), h = innerHeight * Math.min(devicePixelRatio, 1);
    const cap = Math.sqrt(Math.min(1, 1.15e6 / (w * h)));
    const s = this.scale * cap;
    return [Math.round(w * s), Math.round(h * s)];
  }

  async boot() {
    this.hud = new HUD(this);
    this.hud.show('screen-title');
    const quality = getQuality('game');
    const [w, h] = this.size();
    const engine = (this.engine = await createEngine({ width: w, height: h, quality, params: P }));
    window.engine = engine; window.game = this;
    document.body.classList.add('interactive');
    const t0 = performance.now();
    const { buildWorld } = await import('../world/index.js');
    const NAMES = { terrain: '大地与山脉', water: '海洋与潟湖', temple: '神殿', acropolis: '卫城', aqueducts: '水道与桥梁', sets: '圣域', statues: '雕像', city: '城市与港口', ruins: '遗迹', banners: '旗帜与火盆', vegetation: '柏树与橄榄树', flora: '花草与常春藤', waterfalls: '瀑布', clouds: '云', birds: '海鸥' };
    await buildWorld(engine, (name, f) => this.hud.loading(f * 0.8, `正在构建：${NAMES[name] || name}…`));
    engine.prepareScene();
    // a neutral game look: default sun (late afternoon), no per-shot auto levels
    engine.applyShot({ id: 'game', pos: [150, 60, 170], target: [60, 55, 80], fov: 55, near: 0.25, far: 30000 });
    GRADE.uAutoLevels.value = 0;
    this.hud.loading(0.84, '正在测量大地（碰撞）…');
    await tick();
    this.world = new World(engine); this.world.build();
    this.hud.loading(0.86, '正在为实时渲染优化场景…');
    await tick();
    this.opt = new GameOptimizer(engine); await this.opt.run();
    this.hud.buildMap(this.world, PLACES);

    this.input = new Input(engine.canvas);
    this.audio = new Audio();
    this.fx = new FX(engine);
    this.combat = new Combat(this);
    this.items = new Items(this);
    this.player = new Player(this);
    this.items._patch(this.player.root);
    this.player.trail = this.fx.trail([3, 4, 6]);
    this.cam = new CameraRig(this);
    this.dialog = new Dialog(this);
    this.quest = new Quest(this);
    this.hud.loading(0.88, '正在唤醒怪物…');
    await tick();
    this.quest.setup();
    const s = this.quest.start;
    this.player.spawn(s.x, s.y, s.z, Math.atan2(this.quest.oracle.pos.x - s.x, this.quest.oracle.pos.z - s.z));
    this.cam.yaw = this.player.yaw; this.cam.snap();

    // warm up: compile every program from the start position, then render a few frames
    this.hud.loading(0.92, '正在编译着色器…');
    await tick();
    engine.ensurePatched();
    this.updateCamera(0.016);
    await engine.renderer.compileAsync(engine.scene, engine.camera);
    for (let i = 0; i < 3; i++) { this.render(); await tick(); }
    console.log(`[game] ready in ${Math.round(performance.now() - t0)} ms`);
    this.hud.loading(1, '');
    this.hud.ready(() => this.start());
    window.__GAME_READY = true;
    if (P.get('debug')) (await import('./debug.js')).installDebug(this);

    this.input.onLockChange = (locked) => { if (!locked && this.started && !this.paused && !this.overlay) this.pause(true); };
    addEventListener('resize', () => this.resize());
    this.wireMenus();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  wireMenus() {
    const H = this.hud;
    H.$('btn-resume').onclick = () => this.pause(false);
    H.$('btn-retry').onclick = () => this.retry();
    H.$('btn-free').onclick = () => { this.overlay = null; H.show('screen-win', false); this.relock(); };
    H.$('set-sens').oninput = (e) => { this.cam.sens = 0.0016 * Number(e.target.value); };
    H.$('set-scale').onchange = (e) => { this.scale = Number(e.target.value); this.resize(); };
    H.$('set-music').oninput = (e) => { if (this.audio.music) this.audio.music.gain.value = Number(e.target.value); };
    H.$('set-sfx').oninput = (e) => { if (this.audio.sfx) this.audio.sfx.gain.value = Number(e.target.value); };
  }

  start() {
    this.started = true; this.paused = false;
    this.hud.show('screen-title', false);
    this.hud.ui.classList.remove('pre');
    this.audio.start();
    this.relock();
    this.hud.flash('与神谕女祭司交谈（走近后按 E）', '#ffd76a', 4);
  }

  relock() { if (this.started && !this.paused) this.input.lock(); }
  pause(on) {
    if (!this.started || this.overlay) return;
    this.paused = on;
    this.hud.show('screen-pause', on);
    if (on) { this.input.unlock(); this.audio.ctx?.suspend(); }
    else { this.audio.ctx?.resume(); this.input.lock(); this.last = performance.now(); }
  }
  showScreen(id) { this.overlay = id; this.hud.show(id, true); this.hud.$('toast').style.opacity = 0; this.hud.$('itemget').style.display = 'none'; this.input.unlock(); }

  onPlayerDeath() { this.after(1.8, () => this.showScreen('screen-over')); }
  /** game-time timer (pauses with the game) */
  after(sec, fn) { this.timers.push({ t: this.time + sec, fn }); }
  retry() {
    const P = this.player, q = this.quest;
    this.overlay = null; this.hud.show('screen-over', false);
    P.hp = P.maxHp; P.stamina = P.maxStamina; P.tired = false; P.invuln = 2;
    const c = q.checkpoint;
    P.spawn(c.x, this.world.ground(c.x, c.z), c.z, P.yaw);
    for (const e of this.enemies) if (e.alive) { e.set(e.boss ? 'dormant' : 'idle'); e.pos.copy(e.home); if (e instanceof Harpy) e.pos.y += e.alt; e.hp = e.maxHp; }
    this.combat.tokens.clear(); this.combat.engaged.clear();
    if (q.stage === 'boss' && this.quest.boss.alive) q.startBoss();
    this.cam.snap();
    this.relock();
  }

  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
  shake(a) { this.cam.trauma = Math.min(1, this.cam.trauma + a); }

  itemGet(kind) { this.quest.give(kind); this.player.action = { type: 'raise', t: 0, dur: 1.6 }; }

  resize() {
    const e = this.engine, [w, h] = this.size();
    if (w === e.width && h === e.height) return;
    e.width = w; e.height = h;
    e.renderer.setSize(w, h, false);
    e.pipeline.setSize(w, h);
    e.pipeline.lensFX?.resize(w, h);
    e.camera.aspect = w / h; e.camera.updateProjectionMatrix();
    e.lighting.refreshCSM();
  }

  // ------------------------------------------------------------------------------------------- frame
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const fpsEl = this.hud.$('fps');
    this._fpsAcc = (this._fpsAcc || 0) * 0.95 + dt * 0.05;
    if (this.frame % 20 === 0) fpsEl.textContent = `${Math.round(1 / this._fpsAcc)} fps · ${this.engine.width}×${this.engine.height}`;
    if (!this.started) { this.updateCamera(dt, true); this.render(); return; }
    if (this.paused || this.overlay) { this.input.endFrame(); if (this.overlay) { this.time += dt; this.updateCamera(dt); this.render(); } return; }
    if (this.hitstopT > 0) { this.hitstopT -= dt; dt *= 0.08; }
    this.time += dt;
    this.update(dt);
    this.render();
    this.input.endFrame();
  }

  update(dt) {
    const inp = this.input, P = this.player, H = this.hud;
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.time >= this.timers[i].t) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
    // global keys
    if (H.mapOpen) { if (inp.pressed.has('KeyM')) { H.toggleMap(false); this.audio.play('menu'); } }
    else if (inp.hit('KeyM') && !this.dialog.open) { H.toggleMap(true); this.audio.play('menu'); }
    if (H.mapOpen) inp.enabled = false;
    else inp.enabled = !this.dialog.open && !this.cutscene;
    this.dialog.update(dt);
    if (inp.enabled && P.alive) {
      if (inp.hit('KeyE') && H.interact) { H.interact.interact(); this.audio.play('menu'); }
      if (inp.hit('KeyQ', 'MouseMiddle')) this.toggleLock();
      if (inp.hit('KeyR') && P.potions > 0 && P.hp < P.maxHp && P.state === 'ground' && !P.busy) {
        P.potions--; P.heal(8); P.action = { type: 'interact', t: 0, dur: 0.8 }; this.audio.play('heart'); this.fx.heal(P.pos.x, P.pos.y, P.pos.z);
      }
    }
    P.update(dt);
    for (const e of this.enemies) {
      const d = Math.abs(e.pos.x - P.pos.x) + Math.abs(e.pos.z - P.pos.z);
      const active = d < 140 || e.boss || e.state !== 'idle';
      e.root.visible = (e.alive || e.deadT < 0.45) && !(e.boss && e.state === 'dormant') && d < 260;
      if (active) e.update(dt);
      // separation
      if (e.alive && active) for (const o of this.enemies) {
        if (o === e || !o.alive) continue;
        const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, dd = Math.hypot(dx, dz), rr = e.radius + o.radius;
        if (dd < rr && dd > 1e-3 && !(e instanceof Harpy)) { const k = (rr - dd) * 0.5 / dd; e.pos.x += dx * k; e.pos.z += dz * k; }
      }
    }
    this.items.update(dt);
    this.quest.update(dt);
    this.fx.update(dt, this.time);
    // lock marker
    const L = P.lock;
    this.fx.marker.visible = !!L;
    if (L) this.fx.marker.position.set(L.pos.x, L.pos.y + (L.height || 1.8) + 0.6, L.pos.z);
    // dialogue camera: over the hero's shoulder toward the speaker
    const N = this.talkTarget;
    if (this.dialog.open && N) {
      const P = this.player, dx = N.pos.x - P.pos.x, dz = N.pos.z - P.pos.z, l = Math.hypot(dx, dz) || 1;
      const sx = -dz / l, sz = dx / l;
      if (!this._talkCam) { this._talkCam = true; P.yaw = Math.atan2(dx, dz); }
      this.cam.override = {
        pos: new THREE.Vector3(P.pos.x - dx / l * 2.2 + sx * 1.3, P.pos.y + 2.0, P.pos.z - dz / l * 2.2 + sz * 1.3),
        look: new THREE.Vector3(N.pos.x - dx / l * 0.4, N.pos.y + 1.45, N.pos.z - dz / l * 0.4), rate: 5, fov: 45,
      };
    } else if (this._talkCam) { this._talkCam = false; this.talkTarget = null; this.cam.override = null; }
    this.updateCamera(dt);
    H.update(dt);
    this.audio.update(this.combat.inBattle);
  }

  toggleLock() {
    const P = this.player;
    if (P.lock) { P.lock = null; return; }
    let best = null, bs = Infinity;
    const cy = this.cam.yaw;
    for (const e of this.enemies) {
      if (!e.alive || e.state === 'dormant') continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > 22) continue;
      let a = Math.atan2(dx, dz) - cy; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
      const s = d + Math.abs(a) * 8;
      if (s < bs) { bs = s; best = e; }
    }
    if (best) { P.lock = best; this.audio.play('lock'); }
  }

  updateCamera(dt, title = false) {
    if (title) {
      // slow orbit over the acropolis behind the title screen
      const t = performance.now() / 1000, cam = this.engine.camera;
      cam.position.set(20 + Math.sin(t * 0.04) * 260, 120 + Math.sin(t * 0.03) * 20, -40 + Math.cos(t * 0.04) * 260);
      cam.lookAt(20, 60, -50);
      if (cam.fov !== 50) { cam.fov = 50; cam.near = 0.25; cam.updateProjectionMatrix(); this.engine.lighting.refreshCSM(); }
      return;
    }
    this.cam.update(dt);
  }

  render() {
    const e = this.engine;
    e.setTime(this.time + 30);
    e.camera.updateMatrixWorld(true);
    this.opt?.update(e.camera);
    const H = e.height, fov = (e.camera.fov * Math.PI) / 180;
    if (this.fx) { const s = H / (2 * Math.tan(fov / 2)); this.fx.add.mat.uniforms.uScale.value = s; this.fx.soft.mat.uniforms.uScale.value = s; }
    e.pipeline.begin();
    e.renderSample(0, { jitter: false, softShadows: false });
    e.pipeline.resolve(null, this.frame++);
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const game = new Game();
game.boot().catch((err) => {
  console.error(err);
  const m = document.getElementById('loading-msg'); if (m) { m.textContent = '启动失败：' + (err.message || err); m.style.color = '#ff8a7a'; }
});
