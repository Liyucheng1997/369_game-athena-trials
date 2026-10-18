// Debug helpers (game.html?debug=1): step the simulation deterministically from the console / test tools,
// independent of requestAnimationFrame (which browsers throttle in background windows).
//   __step(n, { press:['KeyE'], hold:['KeyW'], dt })   run n update+render frames
//   __tp(x, z)                                          teleport the hero onto the ground at (x, z)
//   __give()                                            sword, shield, glider
export function installDebug(g) {
  window.__step = (n = 1, { press = [], hold = [], dt = 1 / 60, render = false } = {}) => {
    g.paused = true;
    for (const k of hold) g.input.keys.add(k);
    for (let i = 0; i < n; i++) {
      if (i === 0) for (const k of press) g.input.pressed.add(k);
      g.time += dt; g.update(dt);
      if (render || i === n - 1) g.render();
      g.input.endFrame();
    }
    for (const k of hold) g.input.keys.delete(k);
  };
  window.__tp = (x, z, yaw) => {
    const y = g.world.ground(x, z);
    g.player.spawn(x, y, z, yaw ?? g.player.yaw); g.cam.snap();
    return [x, +y.toFixed(2), z];
  };
  window.__give = () => { const P = g.player; P.hasSword = P.hasShield = P.hasGlider = true; if (g.quest.stage === 'wake' || g.quest.stage === 'arm') g.quest.stage = 'relics'; };
  window.__resume = () => { g.paused = false; g.last = performance.now(); };
  console.log('[game] debug helpers: __step, __tp, __give, __resume');
}
