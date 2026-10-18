// Quality presets. Modules must scale their density/resolution with these numbers so the
// interactive preview stays usable on an integrated GPU while offline renders go all out.
export const QUALITY = {
  preview: {
    name: 'preview', spp: 1, msaa: 4,
    shadowMapSize: 2048, cascades: 3, shadowMaxFar: 1400, softShadows: false,
    terrainRes: 0.5,      // multiplier on terrain mesh resolution
    density: 0.45,        // vegetation / city / props instance density multiplier
    detail: 0.5,          // geometric detail multiplier (segments, sculpt resolution)
    cloudSteps: 16, bloom: true, ao: false,
  },
  high: {
    name: 'high', spp: 12, msaa: 4,
    shadowMapSize: 4096, cascades: 4, shadowMaxFar: 2400, softShadows: true,
    terrainRes: 1.0, density: 1.0, detail: 1.0,
    cloudSteps: 32, bloom: true, ao: true,
  },
  ultra: {
    name: 'ultra', spp: 48, msaa: 4,
    shadowMapSize: 4096, cascades: 4, shadowMaxFar: 3200, softShadows: true,
    terrainRes: 1.0, density: 1.0, detail: 1.0,
    cloudSteps: 64, bloom: true, ao: true,
  },
  // real-time game (src/game): preview content, tighter shadow range (crisper near the hero), the terrain is
  // meshed for the whole playable area (terrainMesh 'game', see terrain/meshgeo.js PLAN_OPTS)
  game: {
    name: 'preview', game: true, terrainMesh: 'game', spp: 1, msaa: 4,
    shadowMapSize: 2048, cascades: 2, shadowMaxFar: 300, softShadows: false,
    terrainRes: 0.5, density: 0.45, detail: 0.5,
    cloudSteps: 16, bloom: true, ao: false,
  },
};

export function getQuality(name) { return { ...(QUALITY[name] || QUALITY.preview) }; }
