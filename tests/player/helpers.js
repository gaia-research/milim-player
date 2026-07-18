export function releaseFixture(overrides = {}) {
  const release = {
    format: "milim-release",
    formatVersion: 1,
    release: "milim-web-0.1.0",
    compatibility: { major: 1 },
    player: { version: "0.1.0", entry: "./player/index.js" },
    model: { id: "milim-v1", version: "1.0.0", url: "./models/milim/model.json" },
    scenes: [{ id: "lab", version: "1.0.0", url: "./scenes/lab/scene.json" }],
    defaults: { hair: "bob", outfit: "field", pose: "neutral", expression: "neutral", scene: "lab" },
    fallbacks: {
      desktop: "./fallbacks/desktop.png",
      tablet: "./fallbacks/tablet.png",
      mobile: "./fallbacks/mobile.png",
      reducedMotion: "./fallbacks/reduced.png",
    },
    files: [],
    source: { repository: "gaia-research/milim", commit: "abcdef0", releasedAt: "2026-07-16T00:00:00Z" },
    ...overrides,
  };
  if (!overrides.files) {
    const paths = new Set([
      release.player.entry,
      release.model.url,
      "./models/milim/base.png",
      "./models/milim/smile.png",
      "./models/milim/greet.png",
      "./models/milim/point.png",
      ...Object.values(release.fallbacks),
    ]);
    for (const scene of release.scenes) {
      paths.add(scene.url);
      const directory = scene.url.slice(0, scene.url.lastIndexOf("/") + 1);
      paths.add(`${directory}background.png`);
      paths.add(`${directory}reduced.png`);
    }
    release.files = [...paths].map((path) => ({ path, bytes: 1, sha256: "a".repeat(64) }));
  }
  return release;
}

export function modelFixture(overrides = {}) {
  return {
    format: "milim-model",
    formatVersion: 1,
    id: "milim-v1",
    version: "1.0.0",
    canvas: { width: 1024, height: 1024 },
    textures: [
      { id: "base", url: "./base.png" },
      { id: "smile", url: "./smile.png" },
      { id: "greet-sprite", url: "./greet.png" },
      { id: "point-sprite", url: "./point.png" },
    ],
    appearances: {
      hair: ["bob", "long"],
      outfit: ["field", "formal"],
      pose: ["neutral", "hero"],
    },
    expressions: [
      { id: "neutral", texture: "base", blendInMs: 0, blendOutMs: 0, reset: "neutral" },
      { id: "smile", texture: "smile", blendInMs: 100, blendOutMs: 100, reset: "neutral" },
    ],
    motions: [
      { id: "idle", durationMs: 1000, loop: true, tracks: { "transform.y": [0, 0.02, 0] }, returnMs: 0 },
      { id: "greet", texture: "greet-sprite", durationMs: 500, loop: false, tracks: { "transform.rotation": [0, 0.4] }, returnMs: 100 },
      { id: "point", texture: "point-sprite", durationMs: 300, loop: false, tracks: { "transform.x": [0, 0.25] }, returnMs: 50 },
    ],
    channels: ["head.x", "head.y", "head.z", "gaze.x", "gaze.y", "mouthOpen", "transform.x", "transform.y", "transform.rotation"],
    ...overrides,
  };
}

export function productionModelFixture(overrides = {}) {
  const mesh = {
    vertices: [
      { x: 0, y: 0, u: 0, v: 0 },
      { x: 2048, y: 0, u: 1, v: 0 },
      { x: 2048, y: 2048, u: 1, v: 1 },
      { x: 0, y: 2048, u: 0, v: 1 },
    ],
    triangles: [[0, 1, 2], [0, 2, 3]],
  };
  const textureIds = [
    "base-part", "hair-short", "hair-long", "outfit-field", "outfit-formal",
    "pose-neutral", "pose-hero", "face-smile",
  ];
  const part = (id, slot, drawOrder, deformers = []) => ({
    id,
    slot,
    texture: id,
    drawOrder,
    anchor: "root",
    mesh: structuredClone(mesh),
    masks: [],
    deformers,
    protected: false,
  });
  const expressions = ["neutral", "smile", "smirk", "awe"];
  const poses = ["neutral", "hero"];
  const transform = (at, x) => ({
    at,
    value: { translate: [x, 0], scale: [1, 1], rotation: 0, opacity: 1 },
  });
  return {
    format: "milim-model",
    formatVersion: 2,
    id: "milim-v1",
    version: "2.0.0",
    canvas: { width: 2048, height: 2048 },
    textures: textureIds.map((id) => ({ id, url: `./${id}.png`, width: 2048, height: 2048 })),
    anchors: [{ id: "root", x: 1024, y: 1024 }],
    masks: [],
    parts: [
      part("base-part", "base", 0, ["head-transform"]),
      part("outfit-field", "outfit", 10),
      part("outfit-formal", "outfit", 11),
      part("pose-neutral", "pose", 20),
      part("pose-hero", "pose", 21),
      part("hair-short", "hair", 30),
      part("hair-long", "hair", 31),
      part("face-smile", "expression", 40),
    ],
    deformers: [{
      id: "head-transform",
      kind: "transform",
      channel: "head.turn",
      parts: ["base-part"],
      keyforms: [transform(-1, -40), transform(0, 0), transform(1, 40)],
    }],
    appearances: {
      hair: [
        { id: "short", parts: ["hair-short"], requiredAnchors: ["root"], compatibleExpressions: expressions, compatiblePoses: poses },
        { id: "long", parts: ["hair-long"], requiredAnchors: ["root"], compatibleExpressions: expressions, compatiblePoses: poses },
      ],
      outfit: [
        { id: "field", parts: ["outfit-field"], requiredAnchors: ["root"], compatibleExpressions: expressions, compatiblePoses: poses },
        { id: "formal", parts: ["outfit-formal"], requiredAnchors: ["root"], compatibleExpressions: expressions, compatiblePoses: poses },
      ],
      pose: [
        { id: "neutral", parts: ["pose-neutral"], requiredAnchors: ["root"], compatibleExpressions: expressions, compatiblePoses: poses },
        { id: "hero", parts: ["pose-hero"], requiredAnchors: ["root"], compatibleExpressions: expressions, compatiblePoses: poses },
      ],
    },
    expressions: [
      { id: "neutral", channels: { "head.turn": 0 }, parts: { "face-smile": 0 }, blendInMs: 0, blendOutMs: 0, reset: "neutral" },
      { id: "smile", channels: { "head.turn": 0.25 }, parts: { "face-smile": 1 }, blendInMs: 100, blendOutMs: 100, reset: "neutral" },
      { id: "smirk", channels: { "head.turn": -0.2 }, parts: { "face-smile": 0.5 }, blendInMs: 80, blendOutMs: 80, reset: "neutral" },
      { id: "awe", channels: { "head.turn": 0.1 }, parts: { "face-smile": 0.75 }, blendInMs: 120, blendOutMs: 120, reset: "neutral" },
    ],
    motions: [
      { id: "idle-breathe", durationMs: 1000, loop: true, tracks: { "head.turn": [[0, 0], [1000, 0]] }, parts: {}, returnMs: 0 },
      { id: "idle-look", durationMs: 800, loop: true, tracks: { "head.turn": [[0, -0.1], [800, 0.1]] }, parts: {}, returnMs: 0 },
      { id: "greet", durationMs: 500, loop: false, tracks: { "head.turn": [[0, 0], [500, 0.8]] }, parts: { "pose-neutral": [[0, 1], [100, 0], [500, 0]], "pose-hero": [[0, 0], [100, 1], [500, 1]] }, returnMs: 100 },
      { id: "point", durationMs: 300, loop: false, tracks: { "head.turn": [[0, 0], [300, -0.6]] }, parts: { "pose-neutral": [[0, 1], [100, 0], [300, 0]], "pose-hero": [[0, 0], [100, 1], [300, 1]] }, returnMs: 50 },
    ],
    physics: [{
      id: "hair-spring",
      inputs: ["head.turn"],
      output: "hair.sway",
      mass: 1,
      stiffness: 20,
      damping: 4,
      gravity: 0,
      gain: 1,
      limit: 1,
      rest: 0,
    }],
    channels: ["head.turn", "hair.sway"],
    framing: Object.fromEntries(["desktop", "tablet", "mobile"].map((key) => [
      key,
      { x: 0.5, y: 0.5, scale: 1, safeZone: [0, 0, 1, 1] },
    ])),
    ...overrides,
  };
}

export function sceneFixture(overrides = {}) {
  return {
    format: "milim-scene",
    formatVersion: 1,
    id: "lab",
    version: "1.0.0",
    layers: [{ id: "background", url: "./background.png", depth: 0, opacity: 1 }],
    effects: { parallax: 0.2, lightSweep: 0.3, particles: 8, reflection: 0.1 },
    crops: {
      desktop: { x: 0.5, y: 0.5, scale: 1 },
      tablet: { x: 0.5, y: 0.5, scale: 1 },
      mobile: { x: 0.5, y: 0.5, scale: 1 },
    },
    reducedMotion: "./reduced.png",
    ...overrides,
  };
}

export function productionSceneFixture(overrides = {}) {
  return {
    format: "milim-scene",
    formatVersion: 2,
    id: "lab",
    version: "2.0.0",
    layers: [
      { id: "background", role: "background", url: "./background.png", depth: 0, opacity: 1, blend: "normal" },
      { id: "midground", role: "midground", url: "./midground.png", depth: 0.5, opacity: 1, blend: "normal" },
      { id: "foreground", role: "foreground", url: "./foreground.png", depth: 1, opacity: 1, blend: "normal" },
    ],
    effects: { parallax: 0.2, lightSweep: 0.3, particles: 8, reflection: 0.1, pointer: 0.1 },
    crops: Object.fromEntries(["desktop", "tablet", "mobile"].map((key) => [key, { x: 0.5, y: 0.5, scale: 1 }])),
    safeZones: Object.fromEntries(["desktop", "tablet", "mobile"].map((key) => [key, { x: 0.5, y: 0.5, scale: 1 }])),
    reducedMotion: "./reduced.png",
    ...overrides,
  };
}

export function productionReleaseFixture(overrides = {}) {
  const release = releaseFixture({
    release: "milim-web-0.2.0",
    compatibility: { major: 2 },
    player: { version: "0.2.0", entry: "./player/index.js" },
    model: { id: "milim-v1", version: "2.0.0", url: "./models/milim/model.json" },
    scenes: [{ id: "lab", version: "2.0.0", url: "./scenes/lab/scene.json" }],
    defaults: { hair: "short", outfit: "field", pose: "neutral", expression: "neutral", scene: "lab" },
    ...overrides,
  });
  if (!overrides.files) {
    const model = productionModelFixture();
    const scene = productionSceneFixture();
    const paths = new Set([
      release.player.entry,
      release.model.url,
      ...model.textures.map(({ url }) => `./models/milim/${url.slice(2)}`),
      ...Object.values(release.fallbacks),
      release.scenes[0].url,
      ...scene.layers.map(({ url }) => `./scenes/lab/${url.slice(2)}`),
      "./scenes/lab/reduced.png",
    ]);
    release.files = [...paths].map((path) => ({ path, bytes: 1, sha256: "b".repeat(64) }));
  }
  return release;
}

export function fakeCanvas() {
  const listeners = new Map();
  return {
    width: 0,
    height: 0,
    clientWidth: 320,
    clientHeight: 180,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    dispatch(type, event = {}) { listeners.get(type)?.(event); },
    listenerCount() { return listeners.size; },
  };
}

export function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function createScheduler() {
  let nextId = 1;
  const callbacks = new Map();
  const canceled = [];
  return {
    request(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancel(id) {
      canceled.push(id);
      callbacks.delete(id);
    },
    frame(time) {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback(time);
    },
    get pending() { return callbacks.size; },
    get canceled() { return [...canceled]; },
  };
}

export function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => structuredClone(body) };
}

export function runtimeFixture({ release, model, scene, renderer, scheduler } = {}) {
  const releaseURL = "https://cdn.example/milim/release.json";
  const modelURL = "https://cdn.example/milim/models/milim/model.json";
  const sceneURL = "https://cdn.example/milim/scenes/lab/scene.json";
  const responses = new Map([
    [releaseURL, releaseFixture(release)],
    [modelURL, modelFixture(model)],
    [sceneURL, sceneFixture(scene)],
  ]);
  const requested = [];
  const actualRenderer = renderer ?? createFakeRenderer();
  const actualScheduler = scheduler ?? createScheduler();
  return {
    releaseURL,
    modelURL,
    sceneURL,
    responses,
    requested,
    renderer: actualRenderer,
    scheduler: actualScheduler,
    runtime: {
      baseURL: "https://website.example/",
      async fetch(url) {
        requested.push(url);
        const body = responses.get(url);
        return body === undefined ? jsonResponse(null, { ok: false, status: 404 }) : jsonResponse(body);
      },
      createRenderer: () => actualRenderer,
      scheduler: actualScheduler,
    },
  };
}

export function productionRuntimeFixture({ release, model, scene, renderer, scheduler } = {}) {
  const releaseURL = "https://cdn.example/milim/release.json";
  const modelURL = "https://cdn.example/milim/models/milim/model.json";
  const sceneURL = "https://cdn.example/milim/scenes/lab/scene.json";
  const responses = new Map([
    [releaseURL, productionReleaseFixture(release)],
    [modelURL, productionModelFixture(model)],
    [sceneURL, productionSceneFixture(scene)],
  ]);
  const requested = [];
  const actualRenderer = renderer ?? createFakeRenderer();
  const actualScheduler = scheduler ?? createScheduler();
  return {
    releaseURL,
    modelURL,
    sceneURL,
    responses,
    requested,
    renderer: actualRenderer,
    scheduler: actualScheduler,
    runtime: {
      baseURL: "https://website.example/",
      async fetch(url) {
        requested.push(url);
        const body = responses.get(url);
        return body === undefined ? jsonResponse(null, { ok: false, status: 404 }) : jsonResponse(body);
      },
      createRenderer: () => actualRenderer,
      scheduler: actualScheduler,
    },
  };
}

export function createFakeRenderer({ allReady = Promise.resolve() } = {}) {
  const draws = [];
  const scenes = [];
  return {
    draws,
    scenes,
    destroyed: false,
    async initialize(model, scene) {
      this.model = model;
      this.scene = scene;
      return { allReady };
    },
    draw(frame) { draws.push(frame); },
    async setScene(scene) { scenes.push(scene); },
    destroy() { this.destroyed = true; },
  };
}
