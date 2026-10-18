// Keyboard + mouse (pointer lock) input. Edge-triggered "pressed" flags are cleared by endFrame().
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, left: false, right: false, middle: false };
    this.locked = false;
    this.enabled = true;
    addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'AltLeft', 'AltRight', 'KeyF'].includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); this.released.add(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      const b = ['MouseLeft', 'MouseMiddle', 'MouseRight'][e.button];
      if (b) { this.keys.add(b); this.pressed.add(b); }
    });
    addEventListener('mouseup', (e) => {
      const b = ['MouseLeft', 'MouseMiddle', 'MouseRight'][e.button];
      if (b) { this.keys.delete(b); this.released.add(b); }
    });
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    const quiet = (p) => p?.catch?.(() => {});
    try { quiet(this.canvas.requestPointerLock({ unadjustedMovement: true })?.catch?.(() => quiet(this.canvas.requestPointerLock()))); }
    catch { try { quiet(this.canvas.requestPointerLock()); } catch { /* not allowed here */ } }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(...codes) { return this.enabled && codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return this.enabled && codes.some((c) => this.pressed.has(c)); }
  up(...codes) { return this.enabled && codes.some((c) => this.released.has(c)); }

  /** movement axes in [-1, 1]: x = right, y = forward */
  axes() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0;
  }
}
