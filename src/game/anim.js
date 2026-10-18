// Procedural animation for the shared humanoid rig (models.js).
// A pose is { joint: [rx, ry, rz], hipsY: metres, bodyY: yaw offset }. The Poser eases every joint toward
// the target pose each frame, so states can switch instantly without popping.
const JOINTS = ['hips', 'spine', 'neck', 'head', 'shL', 'elL', 'handL', 'shR', 'elR', 'handR', 'hipL', 'kneeL', 'footL', 'hipR', 'kneeR', 'footR', 'cape'];
const PI = Math.PI;

export class Poser {
  constructor(rig) {
    this.rig = rig;
    this.cur = {}; this.hipsY = 0; this.hipY0 = rig.j.hips ? rig.j.hips.position.y : 0;
    for (const j of JOINTS) if (rig.j[j]) this.cur[j] = [0, 0, 0];
  }
  /** ease toward pose p with rate (1/s); rate Infinity snaps */
  apply(p, dt, rate = 14) {
    const k = rate === Infinity ? 1 : 1 - Math.exp(-rate * dt);
    for (const j in this.cur) {
      const t = p[j] || ZERO, c = this.cur[j];
      c[0] += (t[0] - c[0]) * k; c[1] += (t[1] - c[1]) * k; c[2] += (t[2] - c[2]) * k;
      this.rig.j[j].rotation.set(c[0], c[1], c[2]);
    }
    this.hipsY += ((p.hipsY || 0) - this.hipsY) * k;
    if (this.rig.j.hips) this.rig.j.hips.position.y = this.hipY0 + this.hipsY * (this.rig.dims?.s ?? 1);
  }
}
const ZERO = [0, 0, 0];

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const ease = (t) => t * t * (3 - 2 * t);
export const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** blend two poses (b over a) with weight w, optionally only for some joints */
export function blend(a, b, w, joints = null) {
  const o = { ...a };
  for (const j of joints || Object.keys(b)) {
    if (j === 'hipsY' || j === 'bodyY') { o[j] = lerp(a[j] || 0, b[j] || 0, w); continue; }
    if (b[j]) o[j] = lerp3(a[j] || ZERO, b[j], w);
  }
  return o;
}
export const UPPER = ['spine', 'neck', 'head', 'shL', 'elL', 'handL', 'shR', 'elR', 'handR'];
export const ARM_R = ['shR', 'elR', 'handR'];
export const ARM_L = ['shL', 'elL', 'handL'];

/** sample a keyframed action: keys = [[t, pose], ...] with t in seconds */
export function sampleKeys(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, p0] = keys[i - 1], [t1, p1] = keys[i];
      const u = ease((t - t0) / (t1 - t0));
      return blend(p0, p1, u);
    }
  }
  return keys[keys.length - 1][1];
}

// ----------------------------------------------------------------------------- locomotion
/**
 * @param phase gait phase (rad)  @param amt 0 idle … 1 moving  @param run 0 walk … 1 run
 * @param t time (s) for breathing  @param o { armed: hero holds sword + shield }
 */
export function locomotion(phase, amt, run, t, o = {}) {
  const s = Math.sin(phase), c = Math.cos(phase);
  const A = (0.45 + 0.4 * run) * amt;
  const K = (0.35 + 0.95 * run) * amt;
  const arm = (0.35 + 0.55 * run) * amt;
  const breathe = Math.sin(t * 1.8) * 0.02 * (1 - amt);
  const p = {
    hips: [0, s * 0.08 * amt, 0],
    spine: [0.04 + 0.18 * run * amt + breathe, -s * 0.12 * amt, 0],
    neck: [-0.05 * run * amt, s * 0.08 * amt, 0],
    head: [0, 0, 0],
    hipL: [-s * A - 0.1 * run * amt, 0, 0.03], kneeL: [K * Math.max(0, c) + 0.08 * amt, 0, 0], footL: [0.15 * amt * Math.max(0, -c), 0, 0],
    hipR: [s * A - 0.1 * run * amt, 0, -0.03], kneeR: [K * Math.max(0, -c) + 0.08 * amt, 0, 0], footR: [0.15 * amt * Math.max(0, c), 0, 0],
    shL: [s * arm, 0, 0.14], elL: [-0.25 - 0.6 * run * amt, 0, 0], handL: [0, 0, 0],
    shR: [-s * arm, 0, -0.14], elR: [-0.25 - 0.6 * run * amt, 0, 0], handR: [0, 0, 0],
    hipsY: -Math.abs(c) * (0.025 + 0.06 * run) * amt + breathe * 0.5,
    cape: [0.15 + (0.35 + 0.5 * run) * amt + Math.sin(t * 7) * 0.05 * amt, 0, 0],
  };
  if (o.armed) {
    // sword low in front, shield carried at the side
    p.shR = [-0.15 - s * arm * 0.5, 0, -0.2]; p.elR = [-0.6 - 0.3 * run * amt, 0, 0]; p.handR = [-1.0, 0, 0];
    p.shL = [-0.1 + s * arm * 0.4, 0, 0.18]; p.elL = [-1.1, 0, 0.1]; p.handL = [0, 0, 0];
  }
  return p;
}

// ----------------------------------------------------------------------------- hero actions
export const HERO = {
  block: { shL: [-1.35, 0, 0.1], elL: [0, 0, -1.45], handL: [0, 0, 0], spine: [0.08, 0.25, 0], shR: [-0.4, 0, -0.35], elR: [-0.9, 0, 0], handR: [-1.0, 0, 0] },
  jump: { hipL: [-0.9, 0, 0.05], kneeL: [1.3, 0, 0], hipR: [-0.2, 0, -0.05], kneeR: [0.5, 0, 0], shL: [-0.4, 0, 0.5], shR: [-0.4, 0, -0.5], elL: [-1.0, 0, 0], elR: [-0.8, 0, 0], handR: [-1, 0, 0], spine: [0.1, 0, 0], cape: [0.9, 0, 0] },
  fall: { hipL: [-0.4, 0, 0.1], kneeL: [0.5, 0, 0], hipR: [0.1, 0, -0.1], kneeR: [0.7, 0, 0], shL: [-0.2, 0, 1.1], shR: [-0.2, 0, -1.1], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0], handR: [-1, 0, 0], spine: [-0.05, 0, 0], cape: [1.6, 0, 0] },
  glide: { shL: [PI - 0.15, 0, 0.12], shR: [PI - 0.15, 0, -0.12], elL: [0, 0, 0], elR: [0, 0, 0], hipL: [-0.25, 0, 0.05], hipR: [0.1, 0, -0.05], kneeL: [0.4, 0, 0], kneeR: [0.6, 0, 0], spine: [0.15, 0, 0], handR: [0, 0, 0], cape: [1.2, 0, 0], hipsY: 0 },
  swim: { spine: [1.05, 0, 0], neck: [-0.9, 0, 0], shL: [-2.2, 0, 0.6], shR: [-2.2, 0, -0.6], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0], hipL: [0.2, 0, 0.1], hipR: [0.2, 0, -0.1], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0], handR: [0, 0, 0], cape: [1.3, 0, 0], hipsY: 0 },
  climb: { spine: [-0.1, 0, 0], neck: [-0.35, 0, 0], shL: [-2.6, 0, 0.35], shR: [-2.0, 0, -0.35], elL: [-0.6, 0, 0], elR: [-0.9, 0, 0], hipL: [-0.9, 0, 0.15], kneeL: [1.4, 0, 0], hipR: [-0.4, 0, -0.15], kneeR: [1.0, 0, 0], handR: [-1, 0, 0], cape: [0.3, 0, 0] },
  hurt: { spine: [-0.35, 0, 0], neck: [-0.3, 0, 0], shL: [-0.4, 0, 0.7], shR: [-0.4, 0, -0.7], elL: [-0.6, 0, 0], elR: [-0.6, 0, 0], hipL: [-0.3, 0, 0], kneeL: [0.5, 0, 0], hipR: [0.2, 0, 0], kneeR: [0.3, 0, 0], handR: [-1, 0, 0], cape: [0.8, 0, 0] },
  dead: { spine: [-0.6, 0, 0.2], neck: [-0.5, 0, 0], shL: [-0.3, 0, 1.3], shR: [-0.3, 0, -1.3], hipL: [-0.5, 0, 0.3], hipR: [-0.1, 0, -0.2], kneeL: [0.6, 0, 0], kneeR: [0.2, 0, 0], hipsY: -0.55 },
  charge: { shR: [-0.2, 0.8, -1.3], elR: [-0.3, 0, 0], handR: [-0.3, 0, 0], spine: [0.15, -0.6, 0], shL: [-0.6, 0, 0.6], elL: [-1.2, 0, 0], hipL: [-0.5, 0, 0.2], kneeL: [0.7, 0, 0], hipR: [0.3, 0, -0.2], kneeR: [0.6, 0, 0], hipsY: -0.12 },
  roll: { spine: [1.4, 0, 0], neck: [0.6, 0, 0], shL: [-1.8, 0, 0.3], shR: [-1.8, 0, -0.3], elL: [-1.6, 0, 0], elR: [-1.6, 0, 0], hipL: [-2.2, 0, 0.1], hipR: [-2.2, 0, -0.1], kneeL: [2.3, 0, 0], kneeR: [2.3, 0, 0], hipsY: -0.45, handR: [-1, 0, 0] },
  interact: { shR: [-1.2, 0, -0.1], elR: [-0.5, 0, 0], handR: [-1, 0, 0], spine: [0.35, 0, 0], neck: [0.3, 0, 0] },
  raise: { shR: [PI - 0.1, 0, -0.15], elR: [0, 0, 0], handR: [0, 0, 0], shL: [PI - 0.1, 0, 0.15], elL: [0, 0, 0], spine: [-0.1, 0, 0], neck: [-0.4, 0, 0] },
};

// three-hit sword combo, spin attack (durations in seconds; `hit` = active window)
export const COMBO = [
  { dur: 0.42, hit: [0.1, 0.24], keys: [
    [0, { shR: [-0.2, -0.9, -1.45], elR: [-0.5, 0, 0], handR: [-0.3, 0, 0], spine: [0.08, -0.55, 0] }],
    [0.1, { shR: [-0.15, -0.6, -1.5], elR: [-0.3, 0, 0], handR: [-0.3, 0, 0], spine: [0.1, -0.45, 0] }],
    [0.24, { shR: [-0.1, 2.0, -1.45], elR: [-0.2, 0, 0], handR: [-0.3, 0, 0], spine: [0.12, 0.55, 0] }],
    [0.42, { shR: [-0.15, 1.8, -1.2], elR: [-0.6, 0, 0], handR: [-0.6, 0, 0], spine: [0.08, 0.35, 0] }],
  ] },
  { dur: 0.42, hit: [0.1, 0.24], keys: [
    [0, { shR: [-0.6, 2.2, -1.4], elR: [-0.3, 0, 0], handR: [-0.3, 0, 0], spine: [0.08, 0.55, 0] }],
    [0.1, { shR: [-0.55, 2.0, -1.4], elR: [-0.2, 0, 0], handR: [-0.3, 0, 0], spine: [0.1, 0.5, 0] }],
    [0.24, { shR: [0.3, -0.7, -1.4], elR: [-0.2, 0, 0], handR: [-0.3, 0, 0], spine: [0.14, -0.55, 0] }],
    [0.42, { shR: [0.2, -0.4, -1.1], elR: [-0.6, 0, 0], handR: [-0.6, 0, 0], spine: [0.08, -0.3, 0] }],
  ] },
  { dur: 0.55, hit: [0.17, 0.3], lunge: 5, keys: [
    [0, { shR: [-1.0, 0, -0.3], elR: [-2.0, 0, 0], handR: [0, 0, 0], spine: [-0.05, -0.4, 0] }],
    [0.15, { shR: [-1.1, 0, -0.35], elR: [-2.1, 0, 0], handR: [0, 0, 0], spine: [-0.08, -0.5, 0] }],
    [0.25, { shR: [-1.55, 0, -0.1], elR: [-0.05, 0, 0], handR: [0, 0, 0], spine: [0.25, 0.2, 0], hipL: [-0.7, 0, 0], kneeL: [0.5, 0, 0], hipR: [0.4, 0, 0], kneeR: [0.2, 0, 0], hipsY: -0.1 }],
    [0.55, { shR: [-1.3, 0, -0.2], elR: [-0.4, 0, 0], handR: [-0.4, 0, 0], spine: [0.1, 0, 0] }],
  ] },
];
export const SPIN = { dur: 0.5, hit: [0.05, 0.42], keys: [
  [0, { shR: [0.1, 0.2, -1.5], elR: [0, 0, 0], handR: [0, 0, 0], shL: [-0.3, 0, 0.9], spine: [0.15, 0, 0], hipL: [-0.4, 0, 0.3], kneeL: [0.6, 0, 0], hipR: [0.2, 0, -0.3], kneeR: [0.5, 0, 0], hipsY: -0.15 }],
  [0.5, { shR: [0.1, 0.2, -1.5], elR: [0, 0, 0], handR: [0, 0, 0], shL: [-0.3, 0, 0.9], spine: [0.15, 0, 0], hipsY: -0.1 }],
] };

// ----------------------------------------------------------------------------- enemy humanoid actions
export const CHOP = { dur: 1.0, hit: [0.62, 0.74], keys: [
  [0, { shR: [-0.3, 0, -0.2], elR: [-0.6, 0, 0], handR: [-1, 0, 0] }],
  [0.5, { shR: [-2.8, 0, -0.25], elR: [-0.8, 0, 0], handR: [-0.6, 0, 0], spine: [-0.15, 0.2, 0], neck: [-0.15, 0, 0] }],
  [0.58, { shR: [-2.9, 0, -0.25], elR: [-0.9, 0, 0], handR: [-0.6, 0, 0], spine: [-0.18, 0.2, 0] }],
  [0.72, { shR: [-0.5, 0, -0.15], elR: [-0.1, 0, 0], handR: [-0.9, 0, 0], spine: [0.35, -0.1, 0], hipsY: -0.1 }],
  [1.0, { shR: [-0.4, 0, -0.2], elR: [-0.5, 0, 0], handR: [-1, 0, 0], spine: [0.1, 0, 0] }],
] };
export const SWEEP = { dur: 1.1, hit: [0.62, 0.8], keys: [
  [0, { shR: [-0.3, 0, -0.3], elR: [-0.6, 0, 0], handR: [-1, 0, 0] }],
  [0.5, { shR: [-0.4, -0.9, -1.5], elR: [-0.2, 0, 0], handR: [-0.2, 0, 0], spine: [0.05, -0.7, 0] }],
  [0.6, { shR: [-0.4, -1.0, -1.5], elR: [-0.2, 0, 0], handR: [-0.2, 0, 0], spine: [0.05, -0.75, 0] }],
  [0.8, { shR: [-0.2, 2.2, -1.5], elR: [-0.2, 0, 0], handR: [-0.2, 0, 0], spine: [0.15, 0.7, 0] }],
  [1.1, { shR: [-0.3, 0.6, -0.4], elR: [-0.5, 0, 0], handR: [-1, 0, 0], spine: [0.1, 0, 0] }],
] };
export const SLAM = { dur: 1.5, hit: [1.0, 1.08], keys: [
  [0, { shR: [-0.3, 0, -0.2], elR: [-0.6, 0, 0], shL: [-0.3, 0, 0.2] }],
  [0.8, { shR: [-3.0, 0, 0.3], elR: [-0.4, 0, 0], handR: [-0.3, 0, 0], shL: [-3.0, 0, -0.3], elL: [-0.4, 0, 0], spine: [-0.3, 0, 0], neck: [-0.3, 0, 0], hipsY: 0.05 }],
  [0.95, { shR: [-3.05, 0, 0.3], elR: [-0.4, 0, 0], shL: [-3.05, 0, -0.3], elL: [-0.4, 0, 0], spine: [-0.35, 0, 0] }],
  [1.05, { shR: [-0.9, 0, 0.1], elR: [0, 0, 0], handR: [-1.2, 0, 0], shL: [-0.9, 0, -0.1], elL: [0, 0, 0], spine: [0.7, 0, 0], neck: [0.2, 0, 0], hipL: [-0.9, 0, 0], kneeL: [1.0, 0, 0], hipR: [-0.6, 0, 0], kneeR: [1.2, 0, 0], hipsY: -0.3 }],
  [1.5, { shR: [-0.6, 0, -0.1], elR: [-0.3, 0, 0], shL: [-0.5, 0, 0.1], spine: [0.2, 0, 0] }],
] };
export const STAGGER = { spine: [-0.4, 0, 0.15], neck: [-0.3, 0, 0], shL: [-0.2, 0, 0.8], shR: [-0.2, 0, -0.8], elL: [-0.6, 0, 0], elR: [-0.6, 0, 0], hipL: [-0.3, 0, 0], kneeL: [0.4, 0, 0], hipsY: -0.05 };
export const TALK = (t) => ({ shR: [-0.6 + Math.sin(t * 2.3) * 0.25, 0, -0.25], elR: [-1.1 + Math.sin(t * 3.1) * 0.2, 0, 0], handR: [0, 0, 0], head: [Math.sin(t * 1.7) * 0.06, Math.sin(t * 1.1) * 0.12, 0] });
