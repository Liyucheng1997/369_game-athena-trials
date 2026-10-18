// Procedural characters and props for the game (no external assets, like the rest of Athenaion).
// Humanoids share one joint layout so the same pose code animates the hero, the Spartoi, the
// Minotaur and the NPCs:
//   root → body (yaw) → hips → spine → { neck → head, shL → elL → handL, shR → elR → handR }
//                            hips → { hipL → kneeL → footL, hipR → kneeR → footR }
// Local front is +Z. A limb hangs along -Y from its joint; rotation.x < 0 swings it forward.
import * as THREE from 'three';

const M = {};
function std(key, p) {
  if (!M[key]) M[key] = new THREE.MeshStandardMaterial(p);
  return M[key];
}
export const MAT = {
  get skin() { return std('skin', { color: 0xa87458, roughness: 0.6 }); },
  get bronze() { return std('bronze', { color: 0x9a7038, metalness: 0.85, roughness: 0.3 }); },
  get gold() { return std('gold', { color: 0xe0b050, metalness: 1, roughness: 0.25, emissive: 0x3a2400 }); },
  get crimson() { return std('crimson', { color: 0x8a1712, roughness: 0.8 }); },
  get linen() { return std('linen', { color: 0xe4dac4, roughness: 0.85 }); },
  get leather() { return std('leather', { color: 0x5b3a1f, roughness: 0.75 }); },
  get steel() { return std('steel', { color: 0xc9ccd2, metalness: 1, roughness: 0.22 }); },
  get bone() { return std('bone', { color: 0xd8ccae, roughness: 0.7 }); },
  get rust() { return std('rust', { color: 0x6b4a2e, metalness: 0.6, roughness: 0.6 }); },
  get dark() { return std('dark', { color: 0x1b1612, roughness: 0.9 }); },
  get wood() { return std('wood', { color: 0x6e4826, roughness: 0.8 }); },
  get marble() { return std('marble', { color: 0xe8e2d6, roughness: 0.5 }); },
  get terracotta() { return std('terracotta', { color: 0xb35a2c, roughness: 0.8 }); },
  get blackfig() { return std('blackfig', { color: 0x1d1510, roughness: 0.55 }); },
  get fur() { return std('fur', { color: 0x3d2a1c, roughness: 0.95 }); },
  get furDark() { return std('furDark', { color: 0x231811, roughness: 0.95 }); },
  get ivory() { return std('ivory', { color: 0xeee4c8, roughness: 0.4 }); },
  get feather() { return std('feather', { color: 0x4a3d33, roughness: 0.9, side: THREE.DoubleSide }); },
  get purple() { return std('purple', { color: 0x4b2a5e, roughness: 0.85 }); },
  get blue() { return std('blue', { color: 0x1e3a6e, roughness: 0.8 }); },
  get ochre() { return std('ochre', { color: 0xb8863a, roughness: 0.85 }); },
  get eyeRed() { return std('eyeRed', { color: 0x000000, emissive: 0xff3010, emissiveIntensity: 30 }); },
  get eyeGold() { return std('eyeGold', { color: 0x000000, emissive: 0xffb030, emissiveIntensity: 20 }); },
};

const seg = (len, r0, r1, n = 8) => { const g = new THREE.CylinderGeometry(r1, r0, len, n); g.translate(0, -len / 2, 0); return g; };
const ball = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m;
}
function joint(parent, name, x, y, z, rig) {
  const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); rig.j[name] = g; return g;
}

/** canvas texture helper */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

let _shieldTex, _gliderTex;
function owl(ctx, cx, cy, s, col) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.15, s * 0.42, s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx, cy - s * 0.42, s * 0.36, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - s * 0.36, cy - s * 0.5); ctx.lineTo(cx - s * 0.3, cy - s * 0.85); ctx.lineTo(cx - s * 0.12, cy - s * 0.62); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + s * 0.36, cy - s * 0.5); ctx.lineTo(cx + s * 0.3, cy - s * 0.85); ctx.lineTo(cx + s * 0.12, cy - s * 0.62); ctx.fill();
  ctx.fillStyle = '#0e1a33';
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sx * s * 0.15, cy - s * 0.44, s * 0.11, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = col;
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sx * s * 0.15, cy - s * 0.44, s * 0.045, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#0e1a33'; ctx.lineWidth = s * 0.03;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(cx, cy + s * (0.0 + i * 0.13), s * 0.25, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
}
function shieldTexture() {
  return (_shieldTex ||= canvasTex(512, 512, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = '#16305f'; ctx.fillRect(0, 0, w, w);
    // meander (Greek key) ring
    ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(c, c, 236, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(c, c, 196, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      ctx.save(); ctx.translate(c + Math.cos(a) * 216, c + Math.sin(a) * 216); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(-14, -10); ctx.lineTo(10, -10); ctx.lineTo(10, 4); ctx.lineTo(-4, 4); ctx.lineTo(-4, -2); ctx.stroke();
      ctx.restore();
    }
    owl(ctx, c, c + 20, 230, '#e2bb62');
  }));
}
function gliderTexture() {
  return (_gliderTex ||= canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#efe6d2'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1e3a6e'; ctx.fillRect(0, h - 46, w, 46); ctx.fillRect(0, 0, w, 22);
    ctx.strokeStyle = '#efe6d2'; ctx.lineWidth = 5;
    for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x + 6, h - 8); ctx.lineTo(x + 6, h - 36); ctx.lineTo(x + 30, h - 36); ctx.lineTo(x + 30, h - 18); ctx.lineTo(x + 16, h - 18); ctx.stroke(); }
    owl(ctx, w / 2, h / 2 - 6, 120, '#b8862f');
  }));
}

// ------------------------------------------------------------------------------------ humanoid skeleton
function humanoidBase(rig, o) {
  const s = o.scale ?? 1;
  const root = rig.root, body = rig.body;
  const hips = joint(body, 'hips', 0, o.hipY * s, 0, rig);
  const spine = joint(hips, 'spine', 0, 0.02 * s, 0, rig);
  const neck = joint(spine, 'neck', 0, o.neckY * s, 0, rig);
  const head = joint(neck, 'head', 0, 0, 0, rig);
  const shY = o.shY * s, shX = o.shX * s;
  const shL = joint(spine, 'shL', shX, shY, 0, rig), shR = joint(spine, 'shR', -shX, shY, 0, rig);
  const elL = joint(shL, 'elL', 0, -o.upper * s, 0, rig), elR = joint(shR, 'elR', 0, -o.upper * s, 0, rig);
  const handL = joint(elL, 'handL', 0, -o.fore * s, 0, rig), handR = joint(elR, 'handR', 0, -o.fore * s, 0, rig);
  const hipL = joint(hips, 'hipL', o.legX * s, -0.04 * s, 0, rig), hipR = joint(hips, 'hipR', -o.legX * s, -0.04 * s, 0, rig);
  const kneeL = joint(hipL, 'kneeL', 0, -o.thigh * s, 0, rig), kneeR = joint(hipR, 'kneeR', 0, -o.thigh * s, 0, rig);
  const footL = joint(kneeL, 'footL', 0, -o.shin * s, 0, rig), footR = joint(kneeR, 'footR', 0, -o.shin * s, 0, rig);
  rig.dims = { ...o, s };
  return { root, hips, spine, neck, head, shL, shR, elL, elR, handL, handR, hipL, hipR, kneeL, kneeR, footL, footR, s };
}

function newRig(name) {
  const root = new THREE.Group(); root.name = name;
  const body = new THREE.Group(); body.name = name + ':body'; root.add(body);
  return { root, body, j: {}, mats: [] };
}

// ------------------------------------------------------------------------------------ hero (hoplite)
export function buildHero() {
  const rig = newRig('hero');
  const B = humanoidBase(rig, { hipY: 0.94, neckY: 0.6, shY: 0.5, shX: 0.215, upper: 0.29, fore: 0.27, legX: 0.1, thigh: 0.44, shin: 0.44 });
  const { hips, spine, head, shL, shR, elL, elR, handL, handR, hipL, hipR, kneeL, kneeR, footL, footR } = B;
  // torso: linen chiton + bronze muscle cuirass
  // muscle cuirass (lathe profile: waist → ribcage → chest → shoulders), flattened front-to-back
  const prof = [[0.0, 0.0], [0.158, 0.0], [0.168, 0.08], [0.188, 0.2], [0.205, 0.32], [0.208, 0.4], [0.19, 0.48], [0.14, 0.54], [0.075, 0.58], [0.0, 0.585]];
  const chest = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 24); chest.scale(1, 1, 0.74);
  mesh(chest, MAT.bronze, spine);
  // sculpted chest plates + linea alba
  const plate = new THREE.SphereGeometry(0.095, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2); plate.rotateX(Math.PI / 2); plate.scale(1, 0.75, 0.32);
  mesh(plate, MAT.bronze, spine, 0.075, 0.36, 0.138); mesh(plate, MAT.bronze, spine, -0.075, 0.36, 0.138);
  mesh(new THREE.BoxGeometry(0.012, 0.2, 0.02), MAT.leather, spine, 0, 0.17, 0.122);
  const belt = new THREE.CylinderGeometry(0.17, 0.165, 0.07, 20); belt.scale(1, 1, 0.76); mesh(belt, MAT.leather, spine, 0, 0.03, 0);
  // linen chiton showing at the neck and as short sleeves
  const collar = new THREE.TorusGeometry(0.075, 0.025, 6, 14); mesh(collar, MAT.linen, spine, 0, 0.575, 0).rotation.x = Math.PI / 2;
  // skirt: pteruges (leather strips) over a crimson chiton
  const skirt = new THREE.CylinderGeometry(0.18, 0.27, 0.36, 14, 1, true); skirt.translate(0, -0.16, 0); skirt.scale(1, 1, 0.8);
  mesh(skirt, MAT.crimson, hips).material.side = THREE.DoubleSide;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const strip = new THREE.BoxGeometry(0.075, 0.22, 0.015); strip.translate(0, -0.11, 0);
    const m = mesh(strip, MAT.leather, hips, Math.sin(a) * 0.2, -0.01, Math.cos(a) * 0.17);
    m.rotation.y = a; m.rotation.x = Math.cos(a) * 0.15; m.rotation.z = -Math.sin(a) * 0.15;
  }
  // head + Corinthian helmet with a red horsehair crest
  const neckM = seg(0.1, 0.055, 0.05); mesh(neckM, MAT.skin, head, 0, 0.06, 0);
  mesh(ball(0.105), MAT.skin, head, 0, 0.13, 0.01);
  const helm = new THREE.SphereGeometry(0.128, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62); mesh(helm, MAT.bronze, head, 0, 0.15, 0);
  const cheek = new THREE.BoxGeometry(0.05, 0.12, 0.08);
  mesh(cheek, MAT.bronze, head, 0.085, 0.07, 0.07).rotation.y = -0.4; mesh(cheek, MAT.bronze, head, -0.085, 0.07, 0.07).rotation.y = 0.4;
  const nasal = new THREE.BoxGeometry(0.025, 0.09, 0.02); mesh(nasal, MAT.bronze, head, 0, 0.11, 0.125);
  const neckGuard = new THREE.CylinderGeometry(0.13, 0.15, 0.08, 14, 1, true, Math.PI * 0.6, Math.PI * 0.8);
  mesh(neckGuard, MAT.bronze, head, 0, 0.06, 0).material.side = THREE.DoubleSide;
  const crestH = new THREE.BoxGeometry(0.03, 0.04, 0.3); mesh(crestH, MAT.bronze, head, 0, 0.27, -0.02);
  const crest = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16, 1, false, 0, Math.PI); crest.rotateZ(Math.PI / 2); crest.rotateY(Math.PI / 2);
  crest.scale(1, 1.05, 1.25);
  mesh(crest, MAT.crimson, head, 0, 0.29, -0.04);
  // eyes
  const eye = ball(0.012, 6, 4);
  mesh(eye, MAT.dark, head, 0.035, 0.14, 0.1); mesh(eye, MAT.dark, head, -0.035, 0.14, 0.1);
  // cape (pivot at the shoulders, hangs behind)
  const cape = joint(spine, 'cape', 0, 0.5, -0.12, rig);
  const capeG = new THREE.PlaneGeometry(0.46, 1.0, 1, 6); capeG.translate(0, -0.5, 0);
  const capeMat = MAT.crimson.clone(); capeMat.side = THREE.DoubleSide; rig.mats.push(capeMat);
  mesh(capeG, capeMat, cape).rotation.y = Math.PI;
  // arms (skin) with bronze bracers
  for (const [sh, el, hand, sx] of [[shL, elL, handL, 1], [shR, elR, handR, -1]]) {
    mesh(ball(0.08, 14, 10), MAT.bronze, sh, 0, -0.01, 0).scale.set(1, 0.75, 1); // pauldron
    const sleeve = new THREE.CylinderGeometry(0.068, 0.078, 0.14, 12); sleeve.translate(0, -0.08, 0); mesh(sleeve, MAT.linen, sh);
    mesh(seg(0.29, 0.046, 0.055, 12), MAT.skin, sh);
    mesh(seg(0.27, 0.04, 0.05, 12), MAT.skin, el);
    mesh(seg(0.14, 0.048, 0.053, 12), MAT.leather, el, 0, -0.1, 0);
    mesh(ball(0.048, 8, 6), MAT.skin, hand, 0, -0.03, 0);
  }
  // legs: thighs, bronze greaves, sandals
  for (const [hip, knee, foot] of [[hipL, kneeL, footL], [hipR, kneeR, footR]]) {
    mesh(seg(0.44, 0.068, 0.088, 12), MAT.skin, hip);
    mesh(ball(0.06, 10, 8), MAT.skin, knee);
    mesh(seg(0.44, 0.045, 0.066, 12), MAT.skin, knee);
    mesh(seg(0.34, 0.056, 0.072, 14), MAT.bronze, knee, 0, -0.03, 0).scale.set(1, 1, 1.08);
    const sandal = new THREE.BoxGeometry(0.1, 0.05, 0.24); sandal.translate(0, -0.02, 0.05);
    mesh(sandal, MAT.leather, foot);
  }
  // sword (xiphos): grip in the right hand, blade along the hand's -Y (rotated forward by the pose)
  const sword = new THREE.Group(); sword.name = 'sword'; handR.add(sword); sword.position.set(0, -0.05, 0);
  mesh(seg(0.11, 0.018, 0.018), MAT.leather, sword, 0, 0.06, 0);
  mesh(new THREE.BoxGeometry(0.16, 0.03, 0.04), MAT.bronze, sword, 0, -0.05, 0);
  const blade = new THREE.CylinderGeometry(0.004, 0.032, 0.62, 4); blade.translate(0, -0.37, 0); blade.scale(1, 1, 0.22);
  mesh(blade, MAT.steel, sword);
  mesh(ball(0.025, 8, 6), MAT.bronze, sword, 0, 0.12, 0);
  rig.sword = sword;
  // trail anchor at the blade tip
  rig.swordTip = new THREE.Object3D(); rig.swordTip.position.set(0, -0.68, 0); sword.add(rig.swordTip);
  rig.swordBase = new THREE.Object3D(); rig.swordBase.position.set(0, -0.12, 0); sword.add(rig.swordBase);
  // shield (aspis) on the left forearm
  const shield = new THREE.Group(); shield.name = 'shield'; elL.add(shield);
  shield.position.set(0.09, -0.16, 0.02); shield.rotation.set(0, Math.PI / 2, 0);
  const face = new THREE.CylinderGeometry(0.44, 0.44, 0.04, 32); face.rotateX(Math.PI / 2);
  const faceMat = new THREE.MeshStandardMaterial({ map: shieldTexture(), roughness: 0.5, metalness: 0.3 });
  const mats = [MAT.bronze, faceMat, MAT.bronze];
  const fm = new THREE.Mesh(face, mats); shield.add(fm); fm.position.z = 0.03;
  const rim = new THREE.TorusGeometry(0.44, 0.03, 8, 32); mesh(rim, MAT.bronze, shield, 0, 0, 0.05);
  rig.shield = shield;
  // glider (Athena's wings), hidden until used: canopy above the hands
  const glider = new THREE.Group(); glider.name = 'glider'; rig.body.add(glider); glider.visible = false;
  const gg = new THREE.PlaneGeometry(2.6, 1.1, 12, 2);
  const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) { const x = gp.getX(i); gp.setY(i, gp.getY(i)); gp.setZ(i, -0.28 * (x / 1.3) ** 2); }
  gg.computeVertexNormals(); gg.rotateX(-Math.PI / 2 + 0.5);
  const gm = new THREE.MeshStandardMaterial({ map: gliderTexture(), side: THREE.DoubleSide, roughness: 0.8 });
  mesh(gg, gm, glider, 0, 2.35, 0.05);
  for (const sx of [-1, 1]) { const st = seg(0.75, 0.01, 0.01, 4); const m = mesh(st, MAT.wood, glider, sx * 0.18, 2.35, 0.05); m.rotation.z = sx * 0.22; }
  rig.glider = glider;
  return finish(rig);
}

// ------------------------------------------------------------------------------------ Spartoi (skeleton hoplite)
export function buildSkeleton({ captain = false } = {}) {
  const rig = newRig('spartos');
  const s = captain ? 1.18 : 1;
  const B = humanoidBase(rig, { scale: s, hipY: 0.94, neckY: 0.6, shY: 0.5, shX: 0.2, upper: 0.29, fore: 0.27, legX: 0.1, thigh: 0.44, shin: 0.44 });
  const bone = MAT.bone.clone(); rig.mats.push(bone);
  const { hips, spine, head, shL, shR, elL, elR, handL, handR, hipL, hipR, kneeL, kneeR, footL, footR } = B;
  // pelvis + spine + ribs
  mesh(new THREE.TorusGeometry(0.11 * s, 0.03 * s, 6, 12), bone, hips, 0, -0.03 * s, 0).rotation.x = Math.PI / 2;
  mesh(seg(0.5 * s, 0.025 * s, 0.025 * s), bone, spine, 0, 0.5 * s, -0.04 * s);
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.TorusGeometry((0.14 - i * 0.008) * s, 0.013 * s, 5, 14, Math.PI * 1.5);
    const m = mesh(rib, bone, spine, 0, (0.22 + i * 0.06) * s, 0); m.rotation.x = Math.PI / 2; m.rotation.z = Math.PI * 0.25 + Math.PI / 2; m.scale.set(1, 0.75, 1);
  }
  mesh(new THREE.BoxGeometry(0.42 * s, 0.03 * s, 0.05 * s), bone, spine, 0, 0.5 * s, -0.02 * s); // collarbones
  // skull with glowing eyes + rusty Corinthian helmet
  mesh(ball(0.1 * s), bone, head, 0, 0.13 * s, 0.01);
  const jaw = new THREE.BoxGeometry(0.11 * s, 0.05 * s, 0.09 * s); mesh(jaw, bone, head, 0, 0.05 * s, 0.04 * s);
  const eye = ball(0.022 * s, 6, 4);
  mesh(eye, MAT.eyeRed, head, 0.036 * s, 0.14 * s, 0.085 * s); mesh(eye, MAT.eyeRed, head, -0.036 * s, 0.14 * s, 0.085 * s);
  const helm = new THREE.SphereGeometry(0.125 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55); mesh(helm, MAT.rust, head, 0, 0.16 * s, 0);
  if (captain) {
    const crest = new THREE.BoxGeometry(0.03 * s, 0.2 * s, 0.38 * s); mesh(crest, MAT.dark, head, 0, 0.32 * s, -0.02);
    const plume = new THREE.BoxGeometry(0.05 * s, 0.12 * s, 0.4 * s); mesh(plume, MAT.purple, head, 0, 0.43 * s, -0.04);
  }
  for (const [sh, el, hand] of [[shL, elL, handL], [shR, elR, handR]]) {
    mesh(seg(0.29 * s, 0.022 * s, 0.026 * s), bone, sh); mesh(ball(0.035 * s, 6, 5), bone, el);
    mesh(seg(0.27 * s, 0.018 * s, 0.022 * s), bone, el); mesh(ball(0.035 * s, 6, 5), bone, hand, 0, -0.02, 0);
  }
  for (const [hip, knee, foot] of [[hipL, kneeL, footL], [hipR, kneeR, footR]]) {
    mesh(seg(0.44 * s, 0.028 * s, 0.032 * s), bone, hip); mesh(ball(0.04 * s, 6, 5), bone, knee);
    mesh(seg(0.44 * s, 0.022 * s, 0.028 * s), bone, knee);
    const f = new THREE.BoxGeometry(0.07 * s, 0.03 * s, 0.17 * s); f.translate(0, -0.01, 0.04 * s); mesh(f, bone, foot);
  }
  // rusty kopis + small round shield
  const sword = new THREE.Group(); handR.add(sword); sword.position.set(0, -0.04, 0);
  const blade = new THREE.BoxGeometry(0.05 * s, 0.6 * s, 0.012 * s); blade.translate(0, -0.34 * s, 0);
  mesh(blade, captain ? MAT.bronze : MAT.rust, sword);
  mesh(new THREE.BoxGeometry(0.12 * s, 0.025 * s, 0.03 * s), MAT.dark, sword, 0, -0.04, 0);
  rig.sword = sword;
  const shield = new THREE.Group(); elL.add(shield); shield.position.set(0.08 * s, -0.16 * s, 0.02); shield.rotation.y = Math.PI / 2;
  const sh = new THREE.CylinderGeometry(0.32 * s, 0.32 * s, 0.03, 20); sh.rotateX(Math.PI / 2); mesh(sh, MAT.rust, shield);
  mesh(new THREE.TorusGeometry(0.32 * s, 0.02 * s, 6, 20), MAT.dark, shield);
  rig.shield = shield;
  return finish(rig);
}

// ------------------------------------------------------------------------------------ Minotaur (boss)
export function buildMinotaur() {
  const rig = newRig('minotaur');
  const s = 2.1;
  const B = humanoidBase(rig, { scale: s, hipY: 0.92, neckY: 0.62, shY: 0.52, shX: 0.28, upper: 0.3, fore: 0.28, legX: 0.13, thigh: 0.43, shin: 0.43 });
  const fur = MAT.fur.clone(), skin = MAT.furDark.clone(); rig.mats.push(fur, skin);
  const { hips, spine, head, shL, shR, elL, elR, handL, handR, hipL, hipR, kneeL, kneeR, footL, footR } = B;
  const torso = new THREE.SphereGeometry(0.3 * s, 16, 12); torso.scale(1.1, 1.05, 0.8); mesh(torso, fur, spine, 0, 0.36 * s, 0);
  const belly = new THREE.SphereGeometry(0.22 * s, 12, 10); belly.scale(1, 1, 0.8); mesh(belly, fur, spine, 0, 0.12 * s, 0.03);
  const kilt = new THREE.CylinderGeometry(0.24 * s, 0.32 * s, 0.32 * s, 12, 1, true); kilt.translate(0, -0.12 * s, 0);
  mesh(kilt, MAT.leather, hips).material.side = THREE.DoubleSide;
  mesh(new THREE.TorusGeometry(0.25 * s, 0.03 * s, 6, 16), MAT.bronze, hips, 0, 0.02, 0).rotation.x = Math.PI / 2;
  // bull head: skull, snout, horns, nose ring, glowing eyes
  const skull = new THREE.SphereGeometry(0.15 * s, 14, 10); skull.scale(1, 1, 1.1); mesh(skull, skin, head, 0, 0.16 * s, 0);
  const snout = new THREE.CylinderGeometry(0.085 * s, 0.11 * s, 0.2 * s, 12); snout.rotateX(Math.PI / 2 - 0.35);
  mesh(snout, skin, head, 0, 0.09 * s, 0.14 * s);
  mesh(new THREE.TorusGeometry(0.04 * s, 0.008 * s, 6, 12), MAT.gold, head, 0, 0.02 * s, 0.22 * s);
  for (const sx of [-1, 1]) {
    const horn = new THREE.TorusGeometry(0.16 * s, 0.028 * s, 6, 12, Math.PI * 0.6);
    const h = mesh(horn, MAT.ivory, head, sx * 0.12 * s, 0.26 * s, 0); h.rotation.set(0, sx > 0 ? 0 : Math.PI, sx > 0 ? 0.2 : 0.2);
    const ear = new THREE.ConeGeometry(0.04 * s, 0.1 * s, 6); ear.rotateZ(sx * Math.PI / 2);
    mesh(ear, skin, head, sx * 0.17 * s, 0.17 * s, -0.02);
    mesh(ball(0.022 * s, 6, 4), MAT.eyeRed, head, sx * 0.075 * s, 0.19 * s, 0.11 * s);
  }
  // mane over the shoulders
  const mane = new THREE.SphereGeometry(0.22 * s, 12, 8); mane.scale(1.3, 0.7, 1); mesh(mane, MAT.furDark, spine, 0, 0.6 * s, -0.04);
  for (const [sh, el, hand] of [[shL, elL, handL], [shR, elR, handR]]) {
    mesh(ball(0.12 * s, 10, 8), fur, sh); mesh(seg(0.3 * s, 0.085 * s, 0.1 * s), fur, sh);
    mesh(seg(0.28 * s, 0.07 * s, 0.085 * s), fur, el);
    mesh(seg(0.1 * s, 0.075 * s, 0.075 * s), MAT.bronze, el, 0, -0.14 * s, 0);
    mesh(ball(0.07 * s, 8, 6), skin, hand, 0, -0.03, 0);
  }
  for (const [hip, knee, foot] of [[hipL, kneeL, footL], [hipR, kneeR, footR]]) {
    mesh(seg(0.43 * s, 0.1 * s, 0.13 * s), fur, hip); mesh(seg(0.43 * s, 0.065 * s, 0.09 * s), fur, knee);
    const hoof = new THREE.CylinderGeometry(0.07 * s, 0.08 * s, 0.07 * s, 8); mesh(hoof, MAT.dark, foot, 0, -0.01, 0.02);
  }
  // labrys (double axe) in the right hand
  const axe = new THREE.Group(); handR.add(axe); axe.position.set(0, -0.05, 0);
  mesh(seg(1.3 * s * 0.6, 0.025 * s, 0.025 * s), MAT.wood, axe, 0, 0.25 * s, 0);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, -0.05); bladeShape.quadraticCurveTo(0.28, -0.3, 0.32, 0); bladeShape.quadraticCurveTo(0.28, 0.3, 0, 0.05);
  const bg = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.02, bevelEnabled: false }); bg.scale(s * 0.9, s * 0.9, 1); bg.translate(0, 0, -0.01);
  const axeHead = new THREE.Group(); axe.add(axeHead); axeHead.position.set(0, -0.45 * s, 0);
  mesh(bg, MAT.bronze, axeHead).rotation.set(0, 0, 0);
  mesh(bg, MAT.bronze, axeHead).rotation.set(0, Math.PI, 0);
  rig.sword = axe;
  rig.axeHead = axeHead;
  return finish(rig);
}

// ------------------------------------------------------------------------------------ boar
export function buildBoar() {
  const rig = newRig('boar');
  const fur = MAT.fur.clone(); rig.mats.push(fur);
  const body = rig.body;
  const torso = joint(body, 'torso', 0, 0.62, 0, rig);
  const tg = new THREE.SphereGeometry(0.5, 14, 10); tg.scale(0.75, 0.78, 1.25); mesh(tg, fur, torso);
  const hump = new THREE.SphereGeometry(0.35, 10, 8); hump.scale(0.8, 0.7, 1); mesh(hump, MAT.furDark, torso, 0, 0.22, 0.18);
  for (let i = 0; i < 9; i++) { const b = new THREE.ConeGeometry(0.035, 0.18, 4); const m = mesh(b, MAT.furDark, torso, 0, 0.42 - Math.abs(i - 4) * 0.02, 0.45 - i * 0.11); m.rotation.x = -0.4; }
  const head = joint(torso, 'head', 0, 0.05, 0.55, rig);
  const hg = new THREE.ConeGeometry(0.28, 0.6, 10); hg.rotateX(Math.PI / 2); hg.scale(1, 0.95, 1); mesh(hg, fur, head, 0, -0.04, 0.22);
  const nose = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10); nose.rotateX(Math.PI / 2); mesh(nose, MAT.dark, head, 0, -0.06, 0.52);
  for (const sx of [-1, 1]) {
    const tusk = new THREE.ConeGeometry(0.025, 0.2, 6); const t = mesh(tusk, MAT.ivory, head, sx * 0.1, -0.1, 0.38); t.rotation.set(-0.6, 0, sx * -0.6);
    mesh(ball(0.025, 6, 4), MAT.eyeRed, head, sx * 0.13, 0.08, 0.2);
    const ear = new THREE.ConeGeometry(0.07, 0.16, 5); const e = mesh(ear, fur, head, sx * 0.16, 0.2, 0.05); e.rotation.set(-0.5, 0, sx * -0.5);
  }
  rig.legs = [];
  for (const [x, z, n] of [[0.22, 0.4, 'legFL'], [-0.22, 0.4, 'legFR'], [0.22, -0.4, 'legBL'], [-0.22, -0.4, 'legBR']]) {
    const l = joint(torso, n, x, -0.2, z, rig);
    mesh(seg(0.45, 0.05, 0.08), fur, l); mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.06, 6), MAT.dark, l, 0, -0.46, 0);
    rig.legs.push(l);
  }
  const tail = new THREE.CylinderGeometry(0.01, 0.02, 0.25, 5); const t = mesh(tail, MAT.furDark, torso, 0, 0.15, -0.65); t.rotation.x = 0.8;
  return finish(rig);
}

// ------------------------------------------------------------------------------------ harpy
export function buildHarpy() {
  const rig = newRig('harpy');
  const feather = MAT.feather.clone(); const skin = MAT.skin.clone(); rig.mats.push(feather, skin);
  const body = rig.body;
  const torso = joint(body, 'torso', 0, 0, 0, rig);
  const tg = new THREE.SphereGeometry(0.2, 12, 10); tg.scale(0.9, 1.4, 0.8); mesh(tg, skin, torso, 0, 0.1, 0);
  const lower = new THREE.ConeGeometry(0.22, 0.5, 10); lower.rotateX(Math.PI); mesh(lower, feather, torso, 0, -0.25, 0);
  const head = joint(torso, 'head', 0, 0.42, 0, rig);
  mesh(ball(0.12), skin, head);
  const hair = new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6); mesh(hair, MAT.dark, head, 0, 0.02, -0.02);
  const hairBack = new THREE.ConeGeometry(0.12, 0.4, 8); hairBack.rotateX(Math.PI); mesh(hairBack, MAT.dark, head, 0, -0.12, -0.08).rotation.x = 0.3;
  for (const sx of [-1, 1]) mesh(ball(0.02, 6, 4), MAT.eyeGold, head, sx * 0.045, 0.01, 0.1);
  rig.wings = [];
  for (const sx of [-1, 1]) {
    const w = joint(torso, sx > 0 ? 'wingL' : 'wingR', sx * 0.14, 0.25, -0.02, rig);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(1.1, 0.25); shape.lineTo(1.3, -0.05); shape.lineTo(1.05, -0.3); shape.lineTo(0.8, -0.2); shape.lineTo(0.6, -0.42); shape.lineTo(0.35, -0.3); shape.lineTo(0.15, -0.38); shape.lineTo(0, -0.15);
    const g = new THREE.ShapeGeometry(shape); if (sx < 0) g.scale(-1, 1, 1);
    mesh(g, feather, w).rotation.x = Math.PI / 2 - 0.2;
    rig.wings.push(w);
  }
  for (const sx of [-1, 1]) {
    const leg = joint(torso, sx > 0 ? 'legL' : 'legR', sx * 0.08, -0.4, 0, rig);
    mesh(seg(0.3, 0.02, 0.03), MAT.leather, leg);
    for (let k = -1; k <= 1; k++) { const c = new THREE.ConeGeometry(0.012, 0.09, 4); const m = mesh(c, MAT.dark, leg, k * 0.025, -0.32, 0.03); m.rotation.x = 1.9; }
  }
  return finish(rig);
}

// ------------------------------------------------------------------------------------ NPCs
export function buildRobed({ robe = MAT.linen, sash = MAT.purple, laurel = true, beard = false, hood = false } = {}) {
  const rig = newRig('npc');
  const B = humanoidBase(rig, { hipY: 0.92, neckY: 0.58, shY: 0.48, shX: 0.19, upper: 0.28, fore: 0.26, legX: 0.09, thigh: 0.43, shin: 0.43 });
  const { hips, spine, head, shL, shR, elL, elR, handL, handR } = B;
  const dress = new THREE.CylinderGeometry(0.17, 0.34, 1.0, 16, 1); dress.translate(0, -0.42, 0); mesh(dress, robe, hips);
  const top = new THREE.CylinderGeometry(0.19, 0.17, 0.52, 14); top.translate(0, 0.26, 0); top.scale(1, 1, 0.75); mesh(top, robe, spine);
  const s2 = new THREE.TorusGeometry(0.2, 0.03, 6, 14); const sm = mesh(s2, sash, spine, 0, 0.26, 0); sm.rotation.set(Math.PI / 2 + 0.6, 0, 0); sm.scale.set(1, 0.75, 1);
  mesh(seg(0.1, 0.05, 0.045), MAT.skin, head, 0, 0.06, 0);
  mesh(ball(0.1), MAT.skin, head, 0, 0.13, 0.01);
  const hair = new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); mesh(hair, MAT.dark, head, 0, 0.15, -0.01);
  if (hood) { const h = new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.7); mesh(h, robe, head, 0, 0.14, -0.02); }
  if (laurel) { const l = new THREE.TorusGeometry(0.105, 0.014, 6, 16); mesh(l, MAT.gold, head, 0, 0.19, 0).rotation.x = Math.PI / 2; }
  if (beard) { const b = new THREE.ConeGeometry(0.07, 0.16, 8); b.rotateX(Math.PI); mesh(b, MAT.linen, head, 0, 0.03, 0.07); }
  const eye = ball(0.011, 6, 4); mesh(eye, MAT.dark, head, 0.033, 0.14, 0.09); mesh(eye, MAT.dark, head, -0.033, 0.14, 0.09);
  for (const [sh, el, hand] of [[shL, elL, handL], [shR, elR, handR]]) {
    const sleeve = new THREE.CylinderGeometry(0.07, 0.1, 0.3, 8); sleeve.translate(0, -0.13, 0); mesh(sleeve, robe, sh);
    mesh(seg(0.26, 0.035, 0.042), MAT.skin, el); mesh(ball(0.04, 8, 6), MAT.skin, hand, 0, -0.02, 0);
  }
  return finish(rig);
}

function finish(rig) {
  rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return rig;
}

// ------------------------------------------------------------------------------------ props
export function buildChest() {
  const g = new THREE.Group(); g.name = 'chest';
  const base = new THREE.BoxGeometry(1.0, 0.5, 0.65); base.translate(0, 0.25, 0); mesh(base, MAT.wood, g);
  for (const x of [-0.4, 0, 0.4]) mesh(new THREE.BoxGeometry(0.06, 0.52, 0.67), MAT.bronze, g, x, 0.26, 0);
  const lid = new THREE.Group(); lid.position.set(0, 0.5, -0.325); g.add(lid);
  const lg = new THREE.CylinderGeometry(0.325, 0.325, 1.0, 12, 1, false, 0, Math.PI); lg.rotateZ(Math.PI / 2); lg.translate(0, 0, 0.325);
  mesh(lg, MAT.wood, lid);
  for (const x of [-0.4, 0, 0.4]) { const b = new THREE.CylinderGeometry(0.335, 0.335, 0.06, 12, 1, true, 0, Math.PI); b.rotateZ(Math.PI / 2); b.translate(x, 0, 0.325); mesh(b, MAT.bronze, lid).material.side = THREE.DoubleSide; }
  mesh(new THREE.BoxGeometry(0.14, 0.16, 0.04), MAT.gold, g, 0, 0.45, 0.34);
  g.userData.lid = lid;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

let _amphoraGeo;
export function buildPot() {
  if (!_amphoraGeo) {
    const pts = [[0.0, 0], [0.12, 0.02], [0.2, 0.15], [0.27, 0.4], [0.25, 0.6], [0.15, 0.78], [0.09, 0.86], [0.09, 0.98], [0.13, 1.02], [0.0, 1.02]].map(([x, y]) => new THREE.Vector2(x, y));
    _amphoraGeo = new THREE.LatheGeometry(pts, 16);
  }
  const g = new THREE.Group(); g.name = 'pot';
  mesh(_amphoraGeo, MAT.terracotta, g);
  const band = new THREE.CylinderGeometry(0.272, 0.272, 0.14, 16, 1, true); mesh(band, MAT.blackfig, g, 0, 0.45, 0).material.side = THREE.DoubleSide;
  for (const sx of [-1, 1]) { const h = new THREE.TorusGeometry(0.09, 0.018, 6, 10, Math.PI); const m = mesh(h, MAT.terracotta, g, sx * 0.14, 0.82, 0); m.rotation.z = sx * -Math.PI / 2; }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

let _heartGeo;
export function heartGeometry() {
  if (_heartGeo) return _heartGeo;
  const s = new THREE.Shape();
  s.moveTo(0, -0.25); s.bezierCurveTo(-0.05, -0.18, -0.3, -0.05, -0.3, 0.1); s.bezierCurveTo(-0.3, 0.25, -0.12, 0.3, 0, 0.16);
  s.bezierCurveTo(0.12, 0.3, 0.3, 0.25, 0.3, 0.1); s.bezierCurveTo(0.3, -0.05, 0.05, -0.18, 0, -0.25);
  _heartGeo = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  _heartGeo.translate(0, 0, -0.04);
  return _heartGeo;
}
export const PICKUP_MAT = {
  get heart() { return std('pk-heart', { color: 0xff2030, emissive: 0xff1020, emissiveIntensity: 2.5, roughness: 0.3 }); },
  get coin() { return std('pk-coin', { color: 0xffd060, metalness: 1, roughness: 0.2, emissive: 0x805010, emissiveIntensity: 1.5 }); },
  get relic() { return std('pk-relic', { color: 0xfff0c0, emissive: 0xffc860, emissiveIntensity: 6, roughness: 0.3 }); },
};

export function buildRelic(kind) {
  const g = new THREE.Group(); g.name = 'relic:' + kind;
  const mat = PICKUP_MAT.relic;
  if (kind === 'feather') {
    const shape = new THREE.Shape(); shape.moveTo(0, -0.45); shape.quadraticCurveTo(0.2, -0.1, 0.06, 0.45); shape.quadraticCurveTo(-0.15, 0.0, 0, -0.45);
    mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }), mat, g);
  } else if (kind === 'olive') {
    mesh(seg(0.9, 0.015, 0.02), MAT.gold, g, 0, 0.45, 0);
    for (let i = 0; i < 9; i++) { const l = new THREE.SphereGeometry(0.06, 6, 4); l.scale(0.5, 1.6, 0.2); const m = mesh(l, mat, g, (i % 2 ? 1 : -1) * 0.07, 0.35 - i * 0.08, 0); m.rotation.z = (i % 2 ? -1 : 1) * 0.7; }
  } else {
    const s = new THREE.Shape(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const r = i % 2 ? 0.3 : 0.42; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
    mesh(new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02 }), mat, g);
    mesh(ball(0.1), MAT.eyeGold, g, 0, 0, 0.08);
  }
  return g;
}

/** altar of Athena on the forecourt: marble block, three relic sockets, brazier */
export function buildAltar() {
  const g = new THREE.Group(); g.name = 'altar';
  const step = new THREE.BoxGeometry(4.2, 0.3, 2.6); step.translate(0, 0.15, 0); mesh(step, MAT.marble, g);
  const block = new THREE.BoxGeometry(3.2, 1.0, 1.6); block.translate(0, 0.8, 0); mesh(block, MAT.marble, g);
  const top = new THREE.BoxGeometry(3.5, 0.15, 1.9); top.translate(0, 1.37, 0); mesh(top, MAT.marble, g);
  for (const x of [-1.6, 1.6]) { const v = new THREE.CylinderGeometry(0.25, 0.25, 1.75, 12); v.rotateX(Math.PI / 2); v.scale(1, 1, 1.05); mesh(v, MAT.marble, g, x, 1.5, 0); }
  g.userData.sockets = [-0.9, 0, 0.9].map((x) => { const s = new THREE.Object3D(); s.position.set(x, 1.95, 0); g.add(s); mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.12, 10), MAT.bronze, g, x, 1.5, 0); return s; });
  // bronze brazier on a tripod stand behind the altar
  const bowl = new THREE.SphereGeometry(0.55, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); mesh(bowl, MAT.bronze, g, 0, 2.3, -1.75).material.side = THREE.DoubleSide;
  mesh(new THREE.TorusGeometry(0.55, 0.035, 6, 24), MAT.bronze, g, 0, 2.3, -1.75).rotation.x = Math.PI / 2;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2, leg = mesh(seg(2.0, 0.035, 0.045), MAT.bronze, g, Math.cos(a) * 0.22, 2.05, -1.75 + Math.sin(a) * 0.22);
    leg.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18);
  }
  mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 18), MAT.dark, g, 0, 2.05, -1.75); // embers bed
  g.userData.flamePos = new THREE.Vector3(0, 2.2, -1.75);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildStall() {
  const g = new THREE.Group();
  const table = new THREE.BoxGeometry(2.2, 0.08, 0.9); mesh(table, MAT.wood, g, 0, 0.9, 0);
  for (const [x, z] of [[-1, -0.38], [1, -0.38], [-1, 0.38], [1, 0.38]]) mesh(seg(0.9, 0.04, 0.04), MAT.wood, g, x, 0.9, z);
  for (const [x, z] of [[-1.05, -0.4], [1.05, -0.4]]) mesh(seg(2.2, 0.035, 0.035), MAT.wood, g, x, 2.2, z);
  const awn = new THREE.PlaneGeometry(2.4, 1.3, 6, 1); const a = mesh(awn, MAT.crimson.clone(), g, 0, 2.15, 0.15); a.rotation.x = -Math.PI / 2 + 0.35; a.material.side = THREE.DoubleSide;
  for (let i = 0; i < 3; i++) { const p = buildPot(); p.scale.setScalar(0.45); p.position.set(-0.6 + i * 0.6, 0.94, 0); g.add(p); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
