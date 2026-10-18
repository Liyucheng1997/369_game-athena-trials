// DOM HUD: hearts, stamina wheel, drachmae, minimap + world map, objective, interaction prompt, dialogue,
// item-get banner, toasts, boss bar, damage vignette, and the title / pause / game-over / victory screens.
const CSS = `
:root { --gold:#e7c26a; --ink:#f3ead6; --shade:rgba(12,10,8,.62); }
#game-ui { position:fixed; inset:0; pointer-events:none; font-family:"Noto Serif SC","Songti SC","STSong","SimSun",serif; color:var(--ink); user-select:none; }
#game-ui * { box-sizing:border-box; }
#game-ui.pre #hud-tl, #game-ui.pre #minimap-wrap, #game-ui.pre #stamina, #game-ui.pre #hint, #game-ui.pre #prompt { display:none !important; }
.panel { background:var(--shade); border:1px solid rgba(231,194,106,.35); border-radius:8px; backdrop-filter:blur(3px); }
#hud-tl { position:absolute; left:22px; top:18px; }
#hearts { display:flex; flex-wrap:wrap; gap:3px; max-width:330px; filter:drop-shadow(0 2px 2px rgba(0,0,0,.6)); }
#hearts svg { width:30px; height:28px; }
#purse { margin-top:8px; display:flex; gap:16px; font-size:18px; text-shadow:0 2px 3px #000; align-items:center; }
#purse b { color:var(--gold); font-weight:600; }
.coin-ico { display:inline-block; width:16px; height:16px; border-radius:50%; background:radial-gradient(circle at 35% 35%,#fff3b8,#d8a535 55%,#8a5c12); vertical-align:-2px; margin-right:4px; box-shadow:0 0 6px rgba(255,200,80,.5); }
#stamina { position:absolute; left:calc(50% + 70px); top:calc(50% - 90px); width:54px; height:54px; transition:opacity .4s; }
#minimap-wrap { position:absolute; right:22px; top:18px; width:200px; }
#minimap { width:200px; height:200px; border-radius:50%; border:3px solid rgba(231,194,106,.7); box-shadow:0 0 0 2px rgba(0,0,0,.5), 0 4px 18px rgba(0,0,0,.5); display:block; }
#objective { margin-top:12px; padding:10px 12px; font-size:14px; line-height:1.55; }
#objective .t { color:var(--gold); font-size:12px; letter-spacing:.2em; margin-bottom:3px; }
#objective .done { opacity:.45; text-decoration:line-through; }
#prompt { position:absolute; left:50%; bottom:22%; transform:translateX(-50%); padding:8px 16px; font-size:17px; display:none; }
#prompt kbd { display:inline-block; min-width:26px; padding:1px 7px; margin-right:8px; border-radius:5px; background:var(--gold); color:#1a1208; font-family:ui-monospace,monospace; font-weight:700; text-align:center; }
#dialog { position:absolute; left:50%; bottom:5%; transform:translateX(-50%); width:min(820px,92vw); min-height:130px; padding:18px 26px 22px; display:none; pointer-events:auto; }
#dialog .name { position:absolute; top:-15px; left:22px; padding:3px 14px; background:#2c2014; border:1px solid var(--gold); border-radius:6px; color:var(--gold); font-size:15px; letter-spacing:.1em; }
#dialog .text { font-size:19px; line-height:1.75; min-height:66px; }
#dialog .next { position:absolute; right:18px; bottom:10px; color:var(--gold); animation:bob 1s infinite; }
#dialog .choices { margin-top:8px; display:flex; flex-direction:column; gap:6px; }
#dialog .choices button { pointer-events:auto; text-align:left; font:inherit; font-size:16px; color:var(--ink); background:rgba(255,255,255,.06); border:1px solid rgba(231,194,106,.35); border-radius:6px; padding:7px 12px; cursor:pointer; }
#dialog .choices button:hover, #dialog .choices button.sel { background:rgba(231,194,106,.25); border-color:var(--gold); }
@keyframes bob { 50% { transform:translateY(3px); } }
#itemget { position:absolute; left:50%; top:24%; transform:translateX(-50%); text-align:center; display:none; padding:20px 40px; min-width:360px; }
#itemget .icon { font-size:54px; filter:drop-shadow(0 0 14px rgba(255,210,120,.9)); }
#itemget .title { font-size:28px; color:var(--gold); margin:6px 0; letter-spacing:.08em; }
#itemget .desc { font-size:15px; opacity:.9; line-height:1.6; }
#toast { position:absolute; left:50%; top:13%; transform:translateX(-50%); font-size:22px; text-shadow:0 2px 6px #000, 0 0 12px rgba(0,0,0,.7); opacity:0; transition:opacity .25s; white-space:nowrap; }
#bossbar { position:absolute; left:50%; bottom:6%; transform:translateX(-50%); width:min(640px,80vw); display:none; text-align:center; }
#bossbar .n { font-size:18px; letter-spacing:.3em; color:#ffd2b0; text-shadow:0 2px 4px #000; margin-bottom:5px; }
#bossbar .b { height:14px; border:2px solid #2a1a10; background:#1a0e0a; border-radius:3px; overflow:hidden; box-shadow:0 0 0 1px var(--gold); }
#bossbar .f { height:100%; width:100%; background:linear-gradient(#ff6a4a,#a01810); transition:width .2s; }
#vignette { position:absolute; inset:0; background:radial-gradient(ellipse at center, transparent 55%, rgba(200,10,10,.55)); opacity:0; transition:opacity .5s; }
#lowhp { position:absolute; inset:0; background:radial-gradient(ellipse at center, transparent 60%, rgba(160,0,0,.35)); opacity:0; }
#hint { position:absolute; left:22px; bottom:16px; font-size:12px; line-height:1.7; opacity:.75; text-shadow:0 1px 2px #000; white-space:pre; font-family:ui-monospace,Consolas,monospace; }
#fps { position:absolute; right:22px; bottom:12px; font:11px ui-monospace,monospace; opacity:.5; }
.screen { position:absolute; inset:0; display:none; place-items:center; pointer-events:auto; background:radial-gradient(ellipse at center, rgba(10,8,6,.45), rgba(5,4,3,.88)); }
.screen .box { text-align:center; max-width:760px; padding:30px; }
.screen h1 { font-size:58px; margin:0; letter-spacing:.18em; color:var(--gold); text-shadow:0 0 30px rgba(231,194,106,.45), 0 4px 6px #000; font-weight:700; }
.screen h2 { font-size:18px; margin:6px 0 26px; letter-spacing:.5em; opacity:.8; font-weight:400; }
.screen p { font-size:16px; line-height:1.85; opacity:.92; }
.btn { pointer-events:auto; font:inherit; font-size:19px; letter-spacing:.2em; color:#1d140a; background:linear-gradient(#f2d488,#c99a3e); border:none; border-radius:6px; padding:11px 34px; margin:8px; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.5); }
.btn:hover { filter:brightness(1.12); }
.btn.ghost { background:rgba(255,255,255,.08); color:var(--ink); border:1px solid rgba(231,194,106,.5); }
.controls { display:grid; grid-template-columns:auto auto; gap:4px 22px; text-align:left; margin:18px auto; width:max-content; font-size:14px; }
.controls kbd { font-family:ui-monospace,monospace; color:var(--gold); }
.meander { height:12px; margin:14px auto; width:320px; background:repeating-linear-gradient(90deg, var(--gold) 0 2px, transparent 2px 10px); opacity:.5; mask:linear-gradient(90deg,transparent,#000 20%,#000 80%,transparent); }
#loading-bar { width:420px; height:6px; background:rgba(255,255,255,.12); border-radius:3px; overflow:hidden; margin:18px auto 8px; }
#loading-bar div { height:100%; width:0; background:linear-gradient(90deg,#c99a3e,#f2d488); transition:width .3s; }
#loading-msg { font-size:13px; opacity:.7; font-family:ui-monospace,monospace; }
#mapview { position:absolute; inset:0; display:none; place-items:center; background:rgba(6,5,4,.82); pointer-events:auto; }
#mapview canvas { max-width:92vw; max-height:84vh; border:2px solid rgba(231,194,106,.6); border-radius:6px; box-shadow:0 10px 40px #000; }
#mapview .cap { position:absolute; top:3%; left:50%; transform:translateX(-50%); font-size:22px; letter-spacing:.4em; color:var(--gold); }
.settings { display:grid; grid-template-columns:auto 220px; gap:10px 16px; margin:16px auto; width:max-content; text-align:left; align-items:center; font-size:15px; }
.settings input { width:100%; accent-color:#d8ad52; pointer-events:auto; }
`;

const HEART = (fill) => `<svg viewBox="0 0 32 30"><defs><clipPath id="h"><path d="M16 28 C 6 20 1 15 1 9 A 7.5 7.5 0 0 1 16 5 A 7.5 7.5 0 0 1 31 9 C 31 15 26 20 16 28 Z"/></clipPath></defs>
<path d="M16 28 C 6 20 1 15 1 9 A 7.5 7.5 0 0 1 16 5 A 7.5 7.5 0 0 1 31 9 C 31 15 26 20 16 28 Z" fill="#3a0d0d" stroke="#f3ead6" stroke-width="1.6"/>
${fill > 0 ? `<rect x="0" y="0" width="${fill >= 1 ? 32 : 16}" height="30" fill="#e8243a" clip-path="url(#h)"/>` : ''}
${fill > 0 ? `<path d="M7 9 Q 8 6 11 6" stroke="#ffb0b8" stroke-width="2" fill="none" stroke-linecap="round" clip-path="url(#h)"/>` : ''}</svg>`;

export class HUD {
  constructor(game) {
    this.game = game;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const ui = document.createElement('div'); ui.id = 'game-ui'; ui.className = 'pre';
    ui.innerHTML = `
      <div id="lowhp"></div><div id="vignette"></div>
      <div id="hud-tl"><div id="hearts"></div><div id="purse"><span><i class="coin-ico"></i><b id="coins">0</b></span><span id="potions" title="R 饮用">🏺 <b id="potn">0</b></span></div></div>
      <svg id="stamina" viewBox="0 0 54 54"><circle cx="27" cy="27" r="22" fill="rgba(0,0,0,.35)" stroke="rgba(0,0,0,.4)" stroke-width="7"/><circle id="stam-arc" cx="27" cy="27" r="22" fill="none" stroke="#7fe36a" stroke-width="6" stroke-linecap="round" transform="rotate(-90 27 27)"/></svg>
      <div id="minimap-wrap"><canvas id="minimap" width="200" height="200"></canvas><div id="objective" class="panel"></div></div>
      <div id="prompt" class="panel"></div>
      <div id="toast"></div>
      <div id="bossbar"><div class="n"></div><div class="b"><div class="f"></div></div></div>
      <div id="dialog" class="panel"><div class="name"></div><div class="text"></div><div class="choices"></div><div class="next">▼</div></div>
      <div id="itemget" class="panel"><div class="icon"></div><div class="title"></div><div class="desc"></div></div>
      <div id="hint">WASD 移动  Shift 冲刺  空格 跳跃/滑翔  鼠标左键 攻击(长按蓄力回旋斩)\n右键 举盾(看准时机=完美防御)  Ctrl/C 翻滚  Q 锁定  E 互动  R 喝药  M 地图  Esc 暂停</div>
      <div id="fps"></div>
      <div id="mapview"><div class="cap">阿 提 卡 地 图</div><canvas id="bigmap"></canvas></div>
      <div id="screen-title" class="screen"><div class="box">
        <h1>雅典娜之试炼</h1><h2>TRIALS · OF · ATHENA</h2><div class="meander"></div>
        <p id="title-text">雅典卫城的圣火熄灭了。<br>米诺陶洛斯挣脱了迷宫，盘踞在女神的神殿之前。<br>寻回三件圣物，重燃祭坛之火。</p>
        <div id="loading-bar"><div></div></div><div id="loading-msg">正在构建世界……</div>
        <div id="title-buttons" style="display:none"><button class="btn" id="btn-start">开始冒险</button></div>
        <div class="controls" id="title-controls" style="display:none">
          <kbd>WASD</kbd><span>移动　<kbd>Shift</kbd> 冲刺（消耗体力）</span>
          <kbd>鼠标</kbd><span>转动视角　<kbd>滚轮</kbd> 缩放</span>
          <kbd>空格</kbd><span>跳跃；空中再按 = 展开滑翔翼</span>
          <kbd>左键</kbd><span>剑击连段；长按蓄力，松开 = 回旋斩</span>
          <kbd>右键</kbd><span>举盾防御；受击瞬间举盾 = 完美防御</span>
          <kbd>Ctrl / C</kbd><span>翻滚闪避；攀爬时 = 松手</span>
          <kbd>Q</kbd><span>锁定最近的敌人（锁定时 空格+方向 = 闪避）</span>
          <kbd>E</kbd><span>交谈 / 打开 / 拾取</span>
          <kbd>R</kbd><span>饮用治疗药水</span>
          <kbd>M</kbd><span>地图　<kbd>Esc</kbd> 暂停</span>
          <span></span><span>走向任何墙壁即可攀爬（消耗体力）</span>
        </div>
      </div></div>
      <div id="screen-pause" class="screen"><div class="box">
        <h1 style="font-size:44px">暂 停</h1><div class="meander"></div>
        <div class="settings">
          <span>鼠标灵敏度</span><input id="set-sens" type="range" min="0.6" max="3" step="0.1" value="1.4">
          <span>渲染分辨率</span><input id="set-scale" type="range" min="0.5" max="1" step="0.05" value="1">
          <span>音乐</span><input id="set-music" type="range" min="0" max="1" step="0.05" value="0.32">
          <span>音效</span><input id="set-sfx" type="range" min="0" max="1" step="0.05" value="0.9">
        </div>
        <button class="btn" id="btn-resume">继续</button>
        <div class="controls" style="margin-top:22px">
          <kbd>WASD / Shift / 空格</kbd><span>移动 / 冲刺 / 跳跃·滑翔</span>
          <kbd>左键 / 右键</kbd><span>攻击(长按回旋斩) / 举盾</span>
          <kbd>Ctrl / Q / E / R / M</kbd><span>翻滚 / 锁定 / 互动 / 喝药 / 地图</span>
        </div>
      </div></div>
      <div id="screen-over" class="screen"><div class="box"><h1 style="color:#e86a5a">你 倒 下 了</h1><div class="meander"></div><p>命运三女神尚未剪断你的丝线。</p><button class="btn" id="btn-retry">重新站起</button></div></div>
      <div id="screen-win" class="screen"><div class="box"><h1>圣火重燃</h1><h2>VICTORY</h2><div class="meander"></div><p id="win-text"></p><button class="btn ghost" id="btn-free">继续探索阿提卡</button></div></div>
    `;
    document.body.appendChild(ui);
    this.ui = ui;
    this.$ = (id) => ui.querySelector('#' + id);
    this.mini = this.$('minimap').getContext('2d');
    this._hp = -1; this._max = -1; this._coins = -1;
    this.toastT = 0;
  }

  // ------------------------------------------------------------------------------- screens
  show(id, on = true) { this.$(id).style.display = on ? 'grid' : 'none'; }
  loading(frac, msg) { this.$('loading-bar').firstElementChild.style.width = `${Math.round(frac * 100)}%`; if (msg) this.$('loading-msg').textContent = msg; }
  ready(onStart) {
    this.$('loading-bar').style.display = 'none'; this.$('loading-msg').style.display = 'none';
    this.$('title-buttons').style.display = 'block'; this.$('title-controls').style.display = 'grid';
    this.$('btn-start').onclick = onStart;
  }

  // ------------------------------------------------------------------------------- map
  buildMap(world, places) {
    const S = 2, W = Math.floor(world.W / S), H = Math.floor(world.H / S);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'), img = ctx.createImageData(W, H), d = world.data, CW = world.W;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k0 = (j * S) * CW + i * S;
      const h = d[k0], hx = d[Math.min(k0 + S, d.length - 1)], hz = d[Math.min(k0 + S * CW, d.length - 1)];
      let sh = 0.78 + ((h - hx) * 0.6 - (h - hz) * 0.6) * 0.18;
      sh = Math.max(0.35, Math.min(1.25, sh));
      let r, g, b;
      if (h < -0.3) { const t = Math.min(1, -h / 10); r = 70 - 35 * t; g = 130 - 50 * t; b = 150 - 30 * t; sh = 1; }
      else { const t = Math.min(1, h / 150); r = 168 + 40 * t; g = 160 + 30 * t; b = 120 + 50 * t; if (h < 1.5) { r = 200; g = 190; b = 150; } }
      const k = (j * W + i) * 4;
      img.data[k] = r * sh; img.data[k + 1] = g * sh; img.data[k + 2] = b * sh; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // parchment tint + vignette
    ctx.fillStyle = 'rgba(120,90,40,0.12)'; ctx.fillRect(0, 0, W, H);
    const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(40,25,10,0.55)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    this.map = { canvas: c, W, H, S, bounds: world.bounds, places };
    const big = this.$('bigmap'); big.width = W; big.height = H;
  }
  w2m(x, z) { const b = this.map.bounds; return [(x - b[0]) / (b[2] - b[0]) * this.map.W, (z - b[1]) / (b[3] - b[1]) * this.map.H]; }

  _markers(ctx, s, toPx) {
    const g = this.game;
    for (const m of g.quest.markers()) {
      const [x, y] = toPx(m.x, m.z);
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = m.color || '#ffd35a'; ctx.strokeStyle = '#2a1a08'; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(0, -9 * s); ctx.lineTo(7 * s, 0); ctx.lineTo(0, 9 * s); ctx.lineTo(-7 * s, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  drawMinimap() {
    const g = this.game, P = g.player, ctx = this.mini, M = this.map;
    if (!M) return;
    const R = 100, range = 110; // metres radius shown
    const [px, py] = this.w2m(P.pos.x, P.pos.z);
    const mpm = M.W / (M.bounds[2] - M.bounds[0]); // map px per metre
    const sc = R / (range * mpm);
    ctx.save();
    ctx.clearRect(0, 0, 200, 200);
    ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#2b4a5a'; ctx.fillRect(0, 0, 200, 200);
    ctx.translate(R, R); ctx.scale(sc, sc); ctx.translate(-px, -py);
    ctx.drawImage(M.canvas, 0, 0);
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.clip();
    const toPx = (x, z) => { const [mx, my] = this.w2m(x, z); return [R + (mx - px) * sc, R + (my - py) * sc]; };
    // enemies
    for (const e of g.enemies) {
      if (!e.alive || e.state === 'dormant') continue;
      const [x, y] = toPx(e.pos.x, e.pos.z);
      if (Math.hypot(x - R, y - R) > R) continue;
      ctx.fillStyle = e.boss ? '#ff3a2a' : '#e8503a'; ctx.beginPath(); ctx.arc(x, y, e.boss ? 6 : 3.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const n of g.items.npcs) { const [x, y] = toPx(n.pos.x, n.pos.z); ctx.fillStyle = '#6ab8ff'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
    // objective markers (clamped to the rim)
    for (const m of g.quest.markers()) {
      let [x, y] = toPx(m.x, m.z); const dx = x - R, dy = y - R, l = Math.hypot(dx, dy);
      if (l > R - 10) { x = R + dx / l * (R - 10); y = R + dy / l * (R - 10); }
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = m.color || '#ffd35a'; ctx.strokeStyle = '#2a1a08'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 0); ctx.lineTo(0, 7); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    // camera cone + hero arrow
    const cy = g.cam.yaw;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.moveTo(R, R); ctx.arc(R, R, 60, Math.PI / 2 - cy - 0.6, Math.PI / 2 - cy + 0.6); ctx.closePath(); ctx.fill();
    ctx.translate(R, R); ctx.rotate(-P.yaw + Math.PI);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#e7c26a'; ctx.font = 'bold 14px serif'; ctx.textAlign = 'center'; ctx.fillText('北', R, 16);
  }

  drawBigMap() {
    const g = this.game, M = this.map, c = this.$('bigmap'), ctx = c.getContext('2d');
    ctx.drawImage(M.canvas, 0, 0);
    ctx.textAlign = 'center';
    for (const p of M.places) {
      const [x, y] = this.w2m(p.x, p.z);
      ctx.font = `${p.big ? 'bold 20px' : '15px'} "Noto Serif SC", serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(30,20,8,.8)'; ctx.strokeText(p.name, x, y); ctx.fillStyle = '#f6e7c0'; ctx.fillText(p.name, x, y);
    }
    this._markers(ctx, 1.4, (x, z) => this.w2m(x, z));
    const P = g.player, [px, py] = this.w2m(P.pos.x, P.pos.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-P.yaw + Math.PI);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  toggleMap(on) { this.mapOpen = on; this.$('mapview').style.display = on ? 'grid' : 'none'; if (on) this.drawBigMap(); }

  // ------------------------------------------------------------------------------- feedback
  flash(text, color = '#f3ead6', dur = 2.2) { const t = this.$('toast'); t.textContent = text; t.style.color = color; t.style.opacity = 1; this.toastT = dur; }
  hurt() { const v = this.$('vignette'); v.style.transition = 'none'; v.style.opacity = 1; requestAnimationFrame(() => { v.style.transition = 'opacity .6s'; v.style.opacity = 0; }); }

  itemGet(icon, title, desc, dur = 3.2) {
    const el = this.$('itemget');
    el.querySelector('.icon').textContent = icon; el.querySelector('.title').textContent = title; el.querySelector('.desc').innerHTML = desc;
    el.style.display = 'block'; this.itemT = dur;
  }

  boss(e) {
    const el = this.$('bossbar');
    if (!e) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.querySelector('.n').textContent = e.kind;
    el.querySelector('.f').style.width = `${Math.max(0, e.hp / e.maxHp) * 100}%`;
  }

  // ------------------------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game, P = g.player;
    if (P.hp !== this._hp || P.maxHp !== this._max) {
      this._hp = P.hp; this._max = P.maxHp;
      let s = ''; for (let i = 0; i < P.maxHp / 2; i++) { const f = Math.max(0, Math.min(2, P.hp - i * 2)) / 2; s += HEART(f); }
      this.$('hearts').innerHTML = s;
      this.$('lowhp').style.opacity = P.hp <= 2 && P.alive ? 1 : 0;
    }
    if (P.coins !== this._coins) { this._coins = P.coins; this.$('coins').textContent = P.coins; }
    this.$('potn').textContent = P.potions; this.$('potions').style.opacity = P.potions ? 1 : 0.35;
    // stamina wheel
    const st = this.$('stamina'), arc = this.$('stam-arc');
    const f = P.stamina / P.maxStamina, C = 2 * Math.PI * 22;
    arc.setAttribute('stroke-dasharray', `${C * f} ${C}`);
    arc.setAttribute('stroke', P.tired ? '#e8503a' : f < 0.25 ? '#f2c94c' : '#7fe36a');
    this._stamVis = f < 0.999 || P.tired ? 1 : Math.max(0, (this._stamVis ?? 0) - dt * 1.5);
    st.style.opacity = this._stamVis;
    // prompt
    const it = !g.dialog.open && P.alive && !g.cutscene ? g.items.nearest() : null;
    const pr = this.$('prompt');
    if (it) { pr.innerHTML = `<kbd>E</kbd>${it.prompt()}`; pr.style.display = 'block'; } else pr.style.display = 'none';
    this.interact = it;
    // objective
    const obj = g.quest.objectiveHTML();
    if (obj !== this._obj) { this._obj = obj; this.$('objective').innerHTML = obj; }
    // toast / item banner timers
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.$('toast').style.opacity = 0; }
    if (this.itemT > 0) { this.itemT -= dt; if (this.itemT <= 0) this.$('itemget').style.display = 'none'; }
    if (this.mapOpen && Math.random() < 0.2) this.drawBigMap();
    this._mmT = (this._mmT || 0) - dt;
    if (this._mmT <= 0) { this._mmT = 1 / 30; this.drawMinimap(); }
  }
}

// ----------------------------------------------------------------------------------------- dialogue
export class Dialog {
  constructor(game) {
    this.game = game; this.open = false;
    const ui = game.hud.ui;
    this.el = ui.querySelector('#dialog'); this.nameEl = this.el.querySelector('.name'); this.textEl = this.el.querySelector('.text');
    this.choicesEl = this.el.querySelector('.choices'); this.nextEl = this.el.querySelector('.next');
    this.el.addEventListener('mousedown', (e) => { if (e.target.tagName !== 'BUTTON') this.advance(); });
  }
  /** lines: [{ name, text, choices?: [{ text, then: () => lines|void }] }] */
  show(lines, onDone) {
    this.lines = lines; this.i = 0; this.onDone = onDone; this.open = true;
    this.el.style.display = 'block';
    this._line();
  }
  _line() {
    const L = this.lines[this.i];
    this.nameEl.textContent = L.name || ''; this.nameEl.style.display = L.name ? 'block' : 'none';
    this.full = L.text; this.shown = 0; this.textEl.textContent = '';
    this.choicesEl.innerHTML = ''; this.nextEl.style.display = 'none'; this.sel = 0;
  }
  _showChoices() {
    const L = this.lines[this.i];
    if (!L.choices) { this.nextEl.style.display = 'block'; return; }
    L.choices.forEach((c, k) => {
      const b = document.createElement('button'); b.textContent = c.text; if (k === 0) b.classList.add('sel');
      b.onclick = () => this.choose(k);
      this.choicesEl.appendChild(b);
    });
  }
  choose(k) {
    const L = this.lines[this.i]; const c = L.choices[k];
    this.game.audio.play('menu');
    const more = c.then?.();
    if (Array.isArray(more) && more.length) { this.lines = more; this.i = 0; this._line(); }
    else this.close();
  }
  advance() {
    if (!this.open) return;
    if (this.shown < this.full.length) { this.shown = this.full.length; this.textEl.textContent = this.full; this._showChoices(); return; }
    if (this.lines[this.i].choices) return;
    this.i++;
    if (this.i >= this.lines.length) this.close(); else this._line();
  }
  close() {
    this.open = false; this.el.style.display = 'none';
    const f = this.onDone; this.onDone = null; f?.();
    this.game.relock();
  }
  update(dt) {
    if (!this.open) return;
    const inp = this.game.input;
    if (this.shown < this.full.length) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(this.full.length, this.shown + dt * 38);
      if (Math.floor(this.shown) !== before && before % 3 === 0) this.game.audio.play('talk');
      this.textEl.textContent = this.full.slice(0, Math.floor(this.shown));
      if (this.shown >= this.full.length) this._showChoices();
    }
    const L = this.lines[this.i];
    if (L.choices && this.shown >= this.full.length) {
      const n = L.choices.length;
      if (inp.pressed.has('KeyW') || inp.pressed.has('ArrowUp')) this.sel = (this.sel + n - 1) % n;
      if (inp.pressed.has('KeyS') || inp.pressed.has('ArrowDown')) this.sel = (this.sel + 1) % n;
      [...this.choicesEl.children].forEach((b, k) => b.classList.toggle('sel', k === this.sel));
      if (inp.pressed.has('KeyE') || inp.pressed.has('Space') || inp.pressed.has('Enter')) this.choose(this.sel);
    } else if (inp.pressed.has('KeyE') || inp.pressed.has('Space') || inp.pressed.has('Enter') || inp.pressed.has('MouseLeft')) this.advance();
  }
}
