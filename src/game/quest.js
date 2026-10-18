// The adventure: places, NPCs, enemy camps, chests, the three relics, the altar and the Minotaur.
// Coordinates are world metres (see src/world/layout.js); every spot is snapped to walkable ground with
// world.findSpot at startup, so moving a building in the layout does not strand quest objects.
import * as THREE from 'three';
import { Spartos, Boar, Harpy, Minotaur } from './enemies.js';
import { buildAltar, buildStall, MAT } from './models.js';

export const PLACES = [
  { name: '雅典娜神殿', x: 20, z: -64, big: true }, { name: '神谕遗迹', x: 172, z: 170, big: true },
  { name: '圆殿小岛', x: -14, z: 140 }, { name: '西城', x: -420, z: 60, big: true }, { name: '山巅神殿', x: -424, z: -305 },
  { name: '大阶梯', x: 40, z: 50 }, { name: '潟湖', x: -70, z: 170 }, { name: '高架水道', x: -200, z: -165 },
  { name: '东侧圣域', x: 80, z: -70 }, { name: '港湾区', x: -250, z: 140 }, { name: '南方原野', x: 80, z: 330 },
];

const RELICS = {
  feather: { name: '智慧之羽', icon: '🪶', where: '圆殿小岛', desc: '女神的猫头鹰留下的羽毛，闪烁着智慧的光辉。' },
  olive: { name: '橄榄圣枝', icon: '🌿', where: '西城广场', desc: '雅典城邦的第一株橄榄树的枝条，女神赐予城邦的礼物。' },
  aegis: { name: '神盾碎片', icon: '🛡️', where: '山巅神殿', desc: '埃癸斯神盾的碎片，美杜莎的目光仍在其中凝视。' },
};

export class Quest {
  constructor(game) {
    this.game = game;
    this.stage = 'wake';  // wake → arm → relics → altar → boss → done
    this.got = new Set();
    this.camps = {};
    this.flags = {};
  }

  spot(x, z, o) { return this.game.world.findSpot(x, z, o); }

  setup() {
    const g = this.game, W = g.world, I = g.items;
    // ---------------------------------------------------------------- start: the ruins terrace
    const start = this.spot(150, 158, { maxR: 20 });
    this.start = new THREE.Vector3(...start);
    const oracleP = this.spot(start[0] - 3.5, start[2] - 2.5, { maxR: 8 });
    this.oracle = I.addNPC({ name: '女祭司皮提亚', pos: oracleP, yaw: Math.atan2(start[0] - oracleP[0], start[2] - oracleP[2]), look: { hood: true, laurel: true }, talk: () => this.talkOracle() });
    const ch = this.spot(start[0] + 3, start[2] - 3.5, { maxR: 8 });
    this.startChest = I.addChest(ch[0], ch[1], ch[2], Math.atan2(start[0] - ch[0], start[2] - ch[2]), 'arms');
    for (let i = 0; i < 5; i++) { const p = this.spot(start[0] - 8 + i * 1.3, start[2] + 6, { maxR: 6 }); I.addPot(...p); }
    this.checkpoint = this.start.clone();

    // ---------------------------------------------------------------- merchant on the quay at the stair foot
    const mq = this.spot(36, 96, { maxR: 20 });
    const stall = buildStall(); stall.position.set(...mq); stall.rotation.y = Math.PI * 0.9; I._patch(stall);
    const mp = this.spot(mq[0] + 0.3, mq[2] - 1.4, { maxR: 4 });
    this.merchant = I.addNPC({ name: '商人狄奥多罗斯', pos: mp, yaw: Math.PI, look: { robe: MAT.ochre, sash: MAT.blue, laurel: false, beard: true }, talk: () => this.talkMerchant() });
    for (let i = 0; i < 4; i++) I.addPot(...this.spot(mq[0] - 4 - i, mq[2] + 2, { maxR: 5 }));

    // ---------------------------------------------------------------- relic 1: island tholos (harpies)
    const isl = this.spot(-14 + 6, 128 + 6, { maxR: 16, flat: 0.8, y: 6.5, dy: 2.5 }); // island rock, not the tholos roof
    this.relicFeather = I.addRelic('feather', RELICS.feather.name, ...isl, (r) => this.takeRelic('feather', r));
    this.camps.feather = [0, 1, 2].map((k) => this.add(new Harpy(g, { pos: [isl[0] + Math.cos(k * 2.1) * 6, isl[1], isl[2] + Math.sin(k * 2.1) * 6], leash: 60 })));
    this.relicFeather.guarded = () => this.camps.feather.some((e) => e.alive);

    // ---------------------------------------------------------------- relic 2: the west city square (Spartoi)
    const cp = this.spot(-350, 50, { maxR: 30, natural: true, flat: 0.4 });
    this.relicOlive = I.addRelic('olive', RELICS.olive.name, ...cp, (r) => this.takeRelic('olive', r));
    this.camps.olive = [];
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; this.camps.olive.push(this.add(new Spartos(g, { pos: this.spot(cp[0] + Math.cos(a) * 7, cp[2] + Math.sin(a) * 7, { maxR: 14, natural: true }) }))); }
    this.camps.olive.push(this.add(new Spartos(g, { pos: this.spot(cp[0] + 3, cp[2] - 3, { maxR: 12, natural: true }), captain: true })));
    this.relicOlive.guarded = () => this.camps.olive.some((e) => e.alive);
    for (let i = 0; i < 6; i++) I.addPot(...this.spot(cp[0] - 10 + i * 1.2, cp[2] + 10, { maxR: 8 }));
    const cc = this.spot(cp[0] - 14, cp[2] - 8, { maxR: 12 }); I.addChest(cc[0], cc[1], cc[2], 0.5, 'potion2');

    // ---------------------------------------------------------------- relic 3: the hill temple crag (boars + Spartoi)
    const hp = this.spot(-424, -270, { maxR: 30 });
    this.relicAegis = I.addRelic('aegis', RELICS.aegis.name, ...hp, (r) => this.takeRelic('aegis', r));
    this.camps.aegis = [
      this.add(new Spartos(g, { pos: this.spot(hp[0] + 5, hp[2] + 3, { maxR: 12, natural: true }), captain: true })),
      this.add(new Spartos(g, { pos: this.spot(hp[0] - 5, hp[2] + 4, { maxR: 12, natural: true }) })),
      this.add(new Spartos(g, { pos: this.spot(hp[0] + 1, hp[2] - 6, { maxR: 12, natural: true }) })),
    ];
    this.relicAegis.guarded = () => this.camps.aegis.some((e) => e.alive);

    // ---------------------------------------------------------------- wilderness
    for (const [x, z] of [[120, 320], [40, 300], [-30, 340], [230, 20], [210, -80], [-330, -150], [-300, -60]]) {
      const p = this.spot(x, z, { maxR: 30, natural: true });
      this.add(new Boar(g, { pos: p }));
    }
    for (const [x, z] of [[-160, -140], [-180, 20], [60, -130], [100, 250]]) {
      const p = this.spot(x, z, { maxR: 30, natural: true });
      this.add(new Spartos(g, { pos: p }));
      this.add(new Spartos(g, { pos: this.spot(p[0] + 3, p[2] + 2, { maxR: 8, natural: true }) }));
    }
    // treasure for explorers
    const aq = this.spot(-200, -152, { maxR: 6, flat: 1.2 }); I.addChest(aq[0], aq[1], aq[2], 1.2, 'heart');
    const nb = this.spot(40, -130, { maxR: 12 }); I.addChest(nb[0], nb[1], nb[2], 0, 'coins100');
    const sf = this.spot(60, 330, { maxR: 20 }); I.addChest(sf[0], sf[1], sf[2], 2, 'stamina');
    for (const [x, z] of [[24, -16], [40, -16], [100, -60], [-10, -120], [-330, 90], [-380, 20]]) for (let i = 0; i < 3; i++) I.addPot(...this.spot(x + i * 1.3, z, { maxR: 6 }));

    // ---------------------------------------------------------------- altar + boss arena in the east precinct
    const al = this.spot(66, -75, { maxR: 12, flat: 0.3 });
    this.altar = buildAltar(); this.altar.position.set(...al); this.altar.rotation.y = -Math.PI / 2; I._patch(this.altar);
    this.altarPos = new THREE.Vector3(...al);
    I.interactables.push({
      pos: this.altarPos, radius: 3.4,
      active: () => this.stage === 'altar' || this.stage === 'relics',
      prompt: () => (this.got.size >= 3 ? '供奉三件圣物' : `雅典娜祭坛（圣物 ${this.got.size}/3）`),
      interact: () => this.useAltar(),
    });
    const bp = this.spot(al[0] + 18, al[2], { maxR: 14, flat: 0.3, y: al[1], dy: 0.8 });
    this.boss = this.add(new Minotaur(g, { pos: bp, yaw: -Math.PI / 2 }));
    this.boss.root.visible = false;
  }

  add(e) { const g = this.game; g.enemies.push(e); g.items._patch(e.root); return e; }

  // --------------------------------------------------------------------------------------------- dialogue
  talkOracle() {
    const g = this.game, N = '女祭司皮提亚';
    if (this.stage === 'wake') {
      g.dialog.show([
        { name: N, text: '旅人，你终于醒了。浪涛把你送到了这片遗迹……这是众神的安排。' },
        { name: N, text: '我是德尔斐的神谕女祭司皮提亚。看那边——雅典娜神殿的圣火，已经熄灭了。' },
        { name: N, text: '米诺陶洛斯挣脱了克里特的迷宫，盘踞在卫城东侧的圣域。没有圣火的庇护，龙牙骷髅兵从大地中爬出，鹰身女妖在潟湖上空盘旋。' },
        { name: N, text: '你必须寻回女神的三件圣物：圆殿小岛上的【智慧之羽】，西城广场的【橄榄圣枝】，以及西北山巅神殿的【神盾碎片】。' },
        { name: N, text: '把它们供奉到卫城东侧圣域的祭坛上，圣火便会重燃，女神的力量会助你击败那头怪物。' },
        { name: N, text: '我身旁的宝箱里有剑、盾，还有女神赐予的羽翼。从高处跃下，在空中再次起跳，便能乘风滑翔。去吧！' },
      ], () => { this.stage = 'arm'; g.audio.play('menu'); });
      return;
    }
    const left = Object.keys(RELICS).filter((k) => !this.got.has(k)).map((k) => `${RELICS[k].name}（${RELICS[k].where}）`);
    const lines = this.stage === 'done'
      ? [{ name: N, text: '圣火重燃，阿提卡再次沐浴在女神的光辉之中。英雄，你的名字将被刻在神殿的石柱上。' }]
      : left.length
        ? [{ name: N, text: `还剩下：${left.join('、')}。按 M 打开地图，金色菱形标记着它们的位置。` }, { name: N, text: '记住：被围攻时举盾，看准敌人挥砍的瞬间防御，可以震开它们。' }]
        : [{ name: N, text: '三件圣物都已在你手中！去卫城东侧圣域的祭坛吧。愿雅典娜护佑你。' }];
    g.dialog.show(lines);
  }

  talkMerchant() {
    const g = this.game, P = g.player, N = '商人狄奥多罗斯';
    const shop = () => [{
      name: N, text: `需要些什么？你有 ${P.coins} 德拉克马。`,
      choices: [
        { text: '治疗药水（恢复4颗心）— 20 德拉克马', then: () => this.buy(20, () => { P.potions++; return '药水一瓶！按 R 饮用。'; }) },
        ...(this.flags.boughtHeart ? [] : [{ text: '心之容器（最大生命+1）— 120 德拉克马', then: () => this.buy(120, () => { this.flags.boughtHeart = true; P.maxHp += 2; P.hp = P.maxHp; return '心之容器！你的生命上限提升了。'; }) }]),
        ...(this.flags.boughtStam ? [] : [{ text: '体力之瓶（体力上限+25）— 100 德拉克马', then: () => this.buy(100, () => { this.flags.boughtStam = true; P.maxStamina += 25; P.stamina = P.maxStamina; return '体力之瓶！你能攀爬和滑翔得更久了。'; }) }]),
        { text: '没事了', then: () => [{ name: N, text: '愿赫尔墨斯保佑你的钱袋！' }] },
      ],
    }];
    this.shop = shop;
    g.dialog.show([{ name: N, text: '哟，旅人！海路断了，我的货可都积压着呢。打碎陶罐、打倒怪物都能找到德拉克马。' }, ...shop()]);
  }

  buy(cost, give) {
    const g = this.game, P = g.player, N = '商人狄奥多罗斯';
    if (P.coins < cost) { g.audio.play('stamina'); return [{ name: N, text: '钱不够啊，朋友。去打碎几个陶罐吧！' }, ...this.shop()]; }
    P.coins -= cost; g.audio.play('coin');
    const msg = give();
    g.audio.play('heart');
    return [{ name: N, text: msg }, ...this.shop()];
  }

  // --------------------------------------------------------------------------------------------- items
  give(kind) {
    const g = this.game, P = g.player, H = g.hud;
    switch (kind) {
      case 'arms':
        P.hasSword = P.hasShield = P.hasGlider = true;
        H.itemGet('⚔️', '获得了 青铜剑、圆盾 与 雅典娜之翼！', '左键挥剑，长按蓄力回旋斩 · 右键举盾<br>空中再按空格展开滑翔翼');
        if (this.stage === 'arm' || this.stage === 'wake') this.stage = 'relics';
        break;
      case 'heart': P.maxHp += 2; P.hp = P.maxHp; H.itemGet('❤️', '获得了 心之容器！', '生命上限 +1'); break;
      case 'stamina': P.maxStamina += 25; P.stamina = P.maxStamina; H.itemGet('💚', '获得了 体力之瓶！', '体力上限提升'); break;
      case 'potion2': P.potions += 2; H.itemGet('🏺', '获得了 治疗药水 ×2', '按 R 饮用，恢复 4 颗心'); break;
      case 'coins100': P.coins += 100; H.itemGet('🪙', '获得了 100 德拉克马！', '可以在大阶梯下的商人那里购物'); break;
    }
  }

  takeRelic(kind, r) {
    const g = this.game, P = g.player, R = RELICS[kind];
    this.got.add(kind);
    P.maxHp += 2; P.hp = P.maxHp; P.maxStamina += 15; P.stamina = P.maxStamina;
    P.action = { type: 'raise', t: 0, dur: 2.2 };
    g.audio.play('relic');
    g.fx.heal(P.pos.x, P.pos.y, P.pos.z);
    g.hud.itemGet(R.icon, `获得了【${R.name}】！（${this.got.size}/3）`, `${R.desc}<br>圣物的力量涌入你的身体：生命上限 +1，体力上限提升`, 4.5);
    this.checkpoint = P.pos.clone();
    if (this.got.size >= 3) { this.stage = 'altar'; g.after(4.6, () => g.hud.flash('三件圣物已集齐！前往卫城东侧圣域的祭坛', '#ffd76a', 5)); }
  }

  useAltar() {
    const g = this.game;
    if (this.got.size < 3) { g.dialog.show([{ name: '', text: `祭坛上刻着三个凹槽，形如羽毛、橄榄枝与盾。（已获得 ${this.got.size}/3）` }]); return; }
    this.stage = 'boss';
    this.checkpoint = this.altarPos.clone().add(new THREE.Vector3(-6, 0, 0));
    // place the relics in the sockets
    const kinds = ['feather', 'olive', 'aegis'], relics = [this.relicFeather, this.relicOlive, this.relicAegis];
    this.altar.userData.sockets.forEach((s, i) => { const r = relics[i].relic; r.visible = true; r.position.set(0, 0, 0); r.scale.setScalar(0.6); s.add(r); });
    g.audio.play('relic');
    this.startBoss();
  }

  startBoss() {
    const g = this.game, B = this.boss;
    B.root.visible = true; B.alive = true; B.hp = B.maxHp; B.rage = false; B.puffed = false; B.deadT = 0; B.root.scale.setScalar(1);
    B.pos.copy(B.home); B.yaw = Math.atan2(g.player.pos.x - B.pos.x, g.player.pos.z - B.pos.z); B.set('intro');
    g.cutscene = true;
    const look = B.pos.clone().add(new THREE.Vector3(0, 3.5, 0));
    const cpos = B.pos.clone().add(new THREE.Vector3(Math.sin(B.yaw) * 9, 3.2, Math.cos(B.yaw) * 9));
    g.cam.override = { pos: cpos, look, rate: 2.5, fov: 42 };
    g.audio.play('boss');
    g.after(0.9, () => { g.audio.play('roar'); g.shake(0.8); g.hud.flash('米诺陶洛斯 —— 迷宫之主', '#ff9a6a', 3); });
    g.after(3.2, () => { g.cam.override = null; g.cutscene = false; B.set('chase'); g.combat.aggro(B); g.player.lock = B; });
  }

  onBossDefeated() {
    const g = this.game, P = g.player;
    this.stage = 'done';
    g.hud.boss(null);
    g.cutscene = true;
    const a = this.altarPos;
    g.cam.override = { pos: new THREE.Vector3(a.x + 10, a.y + 5, a.z + 8), look: new THREE.Vector3(a.x, a.y + 2, a.z), rate: 1.5, fov: 45 };
    this.flame = true;
    g.audio.play('victory');
    g.after(5, () => {
      g.cam.override = null; g.cutscene = false;
      const t = Math.floor(P.stats.time), m = Math.floor(t / 60), s = t % 60;
      g.hud.$('win-text').innerHTML = `祭坛的圣火再次燃起，雅典娜的光辉照耀着阿提卡。<br>米诺陶洛斯化作尘土，骷髅兵与鹰身女妖也随之消散。<br><br>用时 ${m} 分 ${s} 秒　·　击败敌人 ${P.stats.kills}　·　倒下 ${P.stats.deaths} 次　·　德拉克马 ${P.coins}`;
      g.showScreen('screen-win');
      for (const e of g.enemies) if (e.alive && !e.boss) e.vanish();
    });
  }

  update(dt) {
    const g = this.game;
    if (this.flame) for (let i = 0; i < 4; i++) { const p = this.altar.userData.flamePos.clone().applyMatrix4(this.altar.matrixWorld); g.fx.flame(p.x, p.y, p.z); }
    if (this.stage === 'boss') {
      g.hud.boss(this.boss);
      if (!this.boss.alive && !this.bossDone) { this.bossDone = true; g.after(1.5, () => this.onBossDefeated()); }
    }
  }

  // --------------------------------------------------------------------------------------------- UI
  markers() {
    const m = [];
    if (this.stage === 'wake') m.push({ x: this.oracle.pos.x, z: this.oracle.pos.z, color: '#7ac8ff' });
    else if (this.stage === 'arm') m.push({ x: this.startChest.pos.x, z: this.startChest.pos.z });
    else if (this.stage === 'relics') {
      for (const r of [this.relicFeather, this.relicOlive, this.relicAegis]) if (!r.taken) m.push({ x: r.pos.x, z: r.pos.z });
    } else if (this.stage === 'altar' || this.stage === 'boss') m.push({ x: this.altarPos.x, z: this.altarPos.z, color: '#ff8a5a' });
    return m;
  }

  objectiveHTML() {
    const s = this.stage;
    const head = '<div class="t">当前任务</div>';
    if (s === 'wake') return head + '与神谕女祭司交谈';
    if (s === 'arm') return head + '打开女祭司身旁的宝箱';
    if (s === 'relics') return head + '寻回雅典娜的三件圣物' + Object.entries(RELICS).map(([k, r]) => `<div class="${this.got.has(k) ? 'done' : ''}">${r.icon} ${r.name} · ${r.where}</div>`).join('');
    if (s === 'altar') return head + '前往卫城东侧圣域，在祭坛供奉三件圣物';
    if (s === 'boss') return head + '击败米诺陶洛斯！<div style="opacity:.7;font-size:12px">冲锋撞墙后它会晕眩 · 跳跃躲避冲击波</div>';
    return head + '自由探索阿提卡';
  }
}
