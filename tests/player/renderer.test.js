import assert from "node:assert/strict";
import test from "node:test";

import { createMilimCore } from "../../player/core.js";
import {
  createWebGL2Renderer,
  renderSize,
  sceneCropTransform,
} from "../../player/webgl2-renderer.js";
import {
  modelFixture,
  productionModelFixture,
  productionReleaseFixture,
  productionSceneFixture,
  releaseFixture,
  sceneFixture,
} from "./helpers.js";

test("renderer reports a clear stable error when WebGL2 is unavailable", () => {
  assert.throws(
    () => createWebGL2Renderer({ getContext: () => null }),
    { code: "MILIM_RENDERER_UNAVAILABLE", message: "Milim WebGL2 renderer is unavailable" },
  );
});

test("render sizing caps device pixel ratio at 2", () => {
  assert.deepEqual(renderSize(320, 180, 4), { width: 640, height: 360, dpr: 2 });
  assert.deepEqual(renderSize(0, 0, 0.5), { width: 1, height: 1, dpr: 1 });
});

test("non-centered scene crops cover the full clip-space viewport", () => {
  const transform = sceneCropTransform({ x: 0.72, y: 0.5, scale: 1 });

  assert.ok(Math.abs(transform.translation[0] + 0.44) < Number.EPSILON);
  assert.equal(transform.translation[1], 0);
  assert.ok(transform.translation[0] - transform.scale[0] <= -1);
  assert.ok(transform.translation[0] + transform.scale[0] >= 1);
  assert.ok(transform.translation[1] - transform.scale[1] <= -1);
  assert.ok(transform.translation[1] + transform.scale[1] >= 1);
});

test("plane shaders interpolate mesh UVs at high precision", () => {
  const gl = fakeWebGL2();
  const renderer = createWebGL2Renderer(fakeWebGLCanvas(gl), {
    platform: { devicePixelRatio: () => 1, ResizeObserver: null, window: null },
  });

  assert.ok(gl.calls.shaderSources.some(({ type, source }) => (
    type === gl.VERTEX_SHADER && source.includes("out highp vec2 v_uv;")
  )));
  assert.ok(gl.calls.shaderSources.some(({ type, source }) => (
    type === gl.FRAGMENT_SHADER && source.includes("in highp vec2 v_uv;")
  )));
  renderer.destroy();
});

test("WebGL2 renderer decodes native textures, draws planes and particles, restores context, and releases resources", async () => {
  const gl = fakeWebGL2();
  const canvas = fakeWebGLCanvas(gl);
  const images = [];
  const contextStates = [];
  let observerDisconnected = false;
  class FakeResizeObserver {
    constructor(callback) { this.callback = callback; }
    observe(target) { this.target = target; }
    disconnect() { observerDisconnected = true; }
  }
  const renderer = createWebGL2Renderer(canvas, {
    onContextState(active) { contextStates.push(active); },
    platform: {
      async decodeImage(url) {
        const image = { url, closed: false, close() { this.closed = true; } };
        images.push(image);
        return image;
      },
      devicePixelRatio: () => 3,
      ResizeObserver: FakeResizeObserver,
      window: null,
    },
  });
  const model = resolvedModel();
  const scene = resolvedScene();
  const initialized = await renderer.initialize(model, scene);
  await initialized.allReady;

  assert.equal(canvas.width, 640);
  assert.equal(canvas.height, 360);
  assert.equal(gl.calls.texImage2D, 5);

  const core = createMilimCore({ model, release: releaseFixture() });
  core.setReady();
  renderer.draw(core.advance(16));
  assert.ok(gl.calls.drawArrays.some(({ mode }) => mode === gl.TRIANGLES));
  assert.ok(gl.calls.drawArrays.some(({ mode }) => mode === gl.POINTS));

  let prevented = false;
  canvas.dispatch("webglcontextlost", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(contextStates, [false]);
  const uploadsBeforeRestore = gl.calls.texImage2D;
  canvas.dispatch("webglcontextrestored");
  assert.deepEqual(contextStates, [false, true]);
  assert.equal(gl.calls.texImage2D, uploadsBeforeRestore + 5);

  renderer.destroy();
  renderer.destroy();
  assert.equal(canvas.listenerCount(), 0);
  assert.equal(observerDisconnected, true);
  assert.ok(images.every(({ closed }) => closed));
  assert.ok(gl.calls.deleteProgram >= 3, "plane, mesh, and particle programs are released");
});

test("scene planes and particles animate on the independent scene clock", async () => {
  const gl = fakeWebGL2();
  const canvas = fakeWebGLCanvas(gl);
  const renderer = createWebGL2Renderer(canvas, {
    onContextState() {},
    platform: {
      async decodeImage(url) {
        return { url, close() {} };
      },
      devicePixelRatio: () => 1,
      ResizeObserver: class { observe() {} disconnect() {} },
      window: null,
    },
  });
  const model = resolvedModel();
  const scene = resolvedScene();
  const initialized = await renderer.initialize(model, scene);
  await initialized.allReady;

  const core = createMilimCore({ model, release: releaseFixture() });
  core.setReady();
  core.advance(16);
  core.api.setSceneRunning(true);
  core.api.setRunning(false);
  gl.calls.uniform1f.length = 0;
  renderer.draw(core.advance(16));

  const times = gl.calls.uniform1f.filter(({ name }) => name === "u_time").map(({ value }) => value);
  assert.ok(times.includes(32), "scene planes and particles receive the advanced scene clock");
  assert.ok(times.includes(16), "the paused character keeps its frozen clock");
  renderer.destroy();
  core.api.destroy();
});

test("minimum model and scene texture decode failures retain their owning error codes", async () => {
  const modelRenderer = rendererWithDecoder(async (url) => {
    if (url.includes("base.png")) throw new Error("bad model image");
    return {};
  });
  await assert.rejects(modelRenderer.renderer.initialize(resolvedModel(), resolvedScene()), {
    code: "MILIM_MODEL_INVALID",
  });
  modelRenderer.renderer.destroy();

  const sceneRenderer = rendererWithDecoder(async (url) => {
    if (url.includes("background.png")) throw new Error("bad scene image");
    return {};
  });
  await assert.rejects(sceneRenderer.renderer.initialize(resolvedModel(), resolvedScene()), {
    code: "MILIM_SCENE_INVALID",
  });
  sceneRenderer.renderer.destroy();
});

test("reduced-motion rendering decodes the compiled static scene and emits no particles", async () => {
  const gl = fakeWebGL2();
  const canvas = fakeWebGLCanvas(gl);
  const decoded = [];
  const renderer = createWebGL2Renderer(canvas, {
    reducedMotion: true,
    platform: {
      async decodeImage(url) { decoded.push(url); return {}; },
      devicePixelRatio: () => 1,
      ResizeObserver: null,
      window: null,
    },
  });
  const model = resolvedModel();
  const scene = resolvedScene();
  const initialized = await renderer.initialize(model, scene, { defaults: releaseFixture().defaults });
  await initialized.allReady;
  assert.ok(decoded.includes(scene.reducedMotion));
  assert.equal(decoded.some((url) => url.includes("background.png")), false);

  const core = createMilimCore({ model, release: releaseFixture(), reducedMotion: true });
  core.setReady();
  gl.calls.drawArrays.length = 0;
  renderer.draw(core.advance(16));
  assert.equal(gl.calls.drawArrays.some(({ mode }) => mode === gl.POINTS), false);
  renderer.destroy();
});

test("renderer draws semantic expression layers at their composed opacities", async () => {
  const gl = fakeWebGL2();
  const canvas = fakeWebGLCanvas(gl);
  const renderer = createWebGL2Renderer(canvas, {
    platform: {
      async decodeImage() { return {}; },
      devicePixelRatio: () => 1,
      ResizeObserver: null,
      window: null,
    },
  });
  const model = resolvedModel();
  const initialized = await renderer.initialize(model, resolvedScene(), {
    defaults: releaseFixture().defaults,
  });
  await initialized.allReady;
  const core = createMilimCore({ model, release: releaseFixture() });
  core.setReady();
  core.api.set({ expression: "smile" });

  gl.calls.uniform1f.length = 0;
  renderer.draw(core.advance(50));
  const opacities = gl.calls.uniform1f
    .filter(({ name }) => name === "u_opacity")
    .map(({ value }) => value);
  assert.ok(opacities.includes(0.5));
  renderer.destroy();
});

test("duplicate texture URLs decode and upload once", async () => {
  const gl = fakeWebGL2();
  const canvas = fakeWebGLCanvas(gl);
  const decoded = [];
  const renderer = createWebGL2Renderer(canvas, {
    platform: {
      async decodeImage(url) { decoded.push(url); return {}; },
      devicePixelRatio: () => 1,
      ResizeObserver: null,
      window: null,
    },
  });
  const model = resolvedModel();
  model.textures[1].url = model.textures[0].url;
  const initialized = await renderer.initialize(model, resolvedScene());
  await initialized.allReady;

  assert.equal(decoded.filter((url) => url === model.textures[0].url).length, 1);
  assert.equal(gl.calls.texImage2D, 4);
  renderer.destroy();
});

test("production parts draw back-to-front with only the selected appearance packs", async () => {
  const gl = fakeWebGL2();
  const renderer = createWebGL2Renderer(fakeWebGLCanvas(gl), {
    platform: {
      async decodeImage(url) { return { url }; },
      devicePixelRatio: () => 1,
      ResizeObserver: null,
      window: null,
    },
  });
  const model = resolvedProductionModel();
  const release = productionReleaseFixture();
  const scene = resolvedProductionScene();
  scene.effects = { ...scene.effects, reflection: 0 };
  const initialized = await renderer.initialize(model, scene, { defaults: release.defaults });
  await initialized.allReady;
  const core = createMilimCore({ model, release });
  core.setReady();

  gl.calls.drawArrays.length = 0;
  renderer.draw(core.advance(16));
  const drawnParts = gl.calls.drawArrays
    .filter(({ mode, texture }) => mode === gl.TRIANGLES && texture?.includes("/models/milim/"))
    .map(({ texture }) => texture.slice(texture.lastIndexOf("/") + 1));

  assert.deepEqual(drawnParts, [
    "base-part.png",
    "outfit-field.png",
    "pose-neutral.png",
    "hair-short.png",
  ]);
  core.api.set({ hair: "long", outfit: "formal", pose: "hero" });
  gl.calls.drawArrays.length = 0;
  renderer.draw(core.frame());
  const switchedParts = gl.calls.drawArrays
    .filter(({ mode, texture }) => mode === gl.TRIANGLES && texture?.includes("/models/milim/"))
    .map(({ texture }) => texture.slice(texture.lastIndexOf("/") + 1));
  assert.deepEqual(switchedParts, [
    "base-part.png",
    "outfit-formal.png",
    "pose-hero.png",
    "hair-long.png",
  ]);
  renderer.destroy();
});

test("production initialization decodes every independently replaceable transparent part texture", async () => {
  const decoded = [];
  const renderer = createWebGL2Renderer(fakeWebGLCanvas(fakeWebGL2()), {
    platform: {
      async decodeImage(url) { decoded.push(url); return { url }; },
      devicePixelRatio: () => 1,
      ResizeObserver: null,
      window: null,
    },
  });
  const model = resolvedProductionModel();
  const initialized = await renderer.initialize(model, resolvedProductionScene(), {
    defaults: productionReleaseFixture().defaults,
  });
  await initialized.allReady;

  assert.deepEqual(
    decoded.filter((url) => url.includes("/models/milim/")).sort(),
    model.textures.map(({ url }) => url).sort(),
  );
  renderer.destroy();
});

test("production rendering includes an unselected replacement part while its motion visibility is active", async () => {
  const gl = fakeWebGL2();
  const renderer = createWebGL2Renderer(fakeWebGLCanvas(gl), {
    platform: {
      async decodeImage(url) { return { url }; },
      devicePixelRatio: () => 1,
      ResizeObserver: null,
      window: null,
    },
  });
  const model = resolvedProductionModel();
  const release = productionReleaseFixture();
  const scene = resolvedProductionScene();
  scene.effects = { ...scene.effects, reflection: 0 };
  const initialized = await renderer.initialize(model, scene, { defaults: release.defaults });
  await initialized.allReady;
  const core = createMilimCore({ model, release });
  core.setReady();
  core.api.perform("greet");

  gl.calls.drawArrays.length = 0;
  renderer.draw(core.advance(100));
  const drawn = gl.calls.drawArrays.map(({ texture }) => texture);

  assert.ok(drawn.some((texture) => texture?.endsWith("/pose-hero.png")));
  renderer.destroy();
});

test("production meshes apply transform and per-vertex warp keyforms on every draw", async () => {
  const gl = fakeWebGL2();
  const renderer = createWebGL2Renderer(fakeWebGLCanvas(gl), {
    platform: {
      async decodeImage(url) { return { url }; },
      devicePixelRatio: () => 1,
      ResizeObserver: null,
      window: null,
    },
  });
  const model = resolvedProductionModel();
  model.motions[0].tracks = {};
  model.motions[1].tracks = {};
  model.deformers[0].channel = "eyes.look.x";
  const offsets = (x) => [[x, 0], [0, 0], [0, 0], [0, 0]];
  model.deformers.push({
    id: "head-warp",
    kind: "warp",
    channel: "eyes.look.x",
    parts: ["base-part"],
    keyforms: [
      { at: -1, offsets: offsets(-100) },
      { at: 0, offsets: offsets(0) },
      { at: 1, offsets: offsets(100) },
    ],
  });
  model.parts[0].deformers.push("head-warp");
  const release = productionReleaseFixture();
  const scene = resolvedProductionScene();
  scene.effects = { ...scene.effects, reflection: 0 };
  const initialized = await renderer.initialize(model, scene, { defaults: release.defaults });
  await initialized.allReady;
  const core = createMilimCore({ model, release });
  core.setReady();

  gl.calls.bufferData.length = 0;
  renderer.draw(core.advance(0));
  const neutralMesh = gl.calls.bufferData[0];
  core.api.drive({ gaze: { x: 1 } });
  gl.calls.bufferData.length = 0;
  renderer.draw(core.advance(0));
  const deformedMesh = gl.calls.bufferData[0];

  assert.equal(neutralMesh.values.length, 24);
  assert.ok(Math.abs(neutralMesh.values[0] - -1) < 1e-12);
  assert.ok(Math.abs(deformedMesh.values[0] - -0.86328125) < 1e-12);
  assert.equal(deformedMesh.usage, gl.DYNAMIC_DRAW);
  renderer.destroy();
});

test("production include and exclude masks constrain their target through the stencil buffer", async () => {
  const gl = fakeWebGL2();
  const renderer = createWebGL2Renderer(fakeWebGLCanvas(gl), {
    platform: {
      async decodeImage(url) { return { url }; },
      devicePixelRatio: () => 1,
      ResizeObserver: null,
      window: null,
    },
  });
  const model = resolvedProductionModel();
  model.masks = [
    { id: "body-include", mode: "include", sourcePart: "base-part" },
    { id: "hair-exclude", mode: "exclude", sourcePart: "hair-short" },
  ];
  model.parts.find(({ id }) => id === "outfit-field").masks = ["body-include", "hair-exclude"];
  const release = productionReleaseFixture();
  const scene = resolvedProductionScene();
  scene.effects = { ...scene.effects, reflection: 0 };
  const initialized = await renderer.initialize(model, scene, { defaults: release.defaults });
  await initialized.allReady;
  const core = createMilimCore({ model, release });
  core.setReady();

  renderer.draw(core.advance(0));

  assert.deepEqual(gl.calls.stencilFunc, [
    { func: gl.EQUAL, ref: 0, mask: 0xff },
    { func: gl.ALWAYS, ref: 0, mask: 0xff },
    { func: gl.EQUAL, ref: 1, mask: 0xff },
  ]);
  assert.deepEqual(gl.calls.colorMask, [
    [false, false, false, false],
    [true, true, true, true],
  ]);
  renderer.destroy();
});

function resolvedModel() {
  const model = modelFixture();
  return {
    ...model,
    textures: model.textures.map((texture) => ({ ...texture, url: `https://cdn.example/${texture.id}.png` })),
  };
}

function resolvedScene(overrides = {}) {
  const scene = sceneFixture(overrides);
  return {
    ...scene,
    layers: scene.layers.map((layer) => ({ ...layer, url: `https://cdn.example/${scene.id}/${layer.id}.png` })),
    reducedMotion: `https://cdn.example/${scene.id}/reduced.png`,
  };
}

function resolvedProductionModel() {
  const model = productionModelFixture();
  return {
    ...model,
    textures: model.textures.map((texture) => ({
      ...texture,
      url: `https://cdn.example/milim/models/milim/${texture.id}.png`,
    })),
  };
}

function resolvedProductionScene() {
  const scene = productionSceneFixture();
  return {
    ...scene,
    layers: scene.layers.map((layer) => ({
      ...layer,
      url: `https://cdn.example/milim/scenes/lab/${layer.id}.png`,
    })),
    reducedMotion: "https://cdn.example/milim/scenes/lab/reduced.png",
  };
}

function fakeWebGLCanvas(gl) {
  const listeners = new Map();
  return {
    width: 0,
    height: 0,
    clientWidth: 320,
    clientHeight: 180,
    getContext(name) { return name === "webgl2" ? gl : null; },
    getBoundingClientRect() { return { width: 320, height: 180 }; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    dispatch(type, event = {}) { listeners.get(type)?.(event); },
    listenerCount() { return listeners.size; },
  };
}

function fakeWebGL2() {
  const calls = {
    texImage2D: 0,
    drawArrays: [],
    deleteProgram: 0,
    uniform1f: [],
    bufferData: [],
    stencilFunc: [],
    colorMask: [],
    shaderSources: [],
  };
  let id = 0;
  let boundTexture = null;
  return {
    calls,
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    DYNAMIC_DRAW: 61,
    FLOAT: 7,
    TEXTURE_2D: 8,
    TEXTURE_MIN_FILTER: 9,
    TEXTURE_MAG_FILTER: 10,
    TEXTURE_WRAP_S: 11,
    TEXTURE_WRAP_T: 12,
    LINEAR: 13,
    CLAMP_TO_EDGE: 14,
    RGBA: 15,
    UNSIGNED_BYTE: 16,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 17,
    TEXTURE0: 18,
    TRIANGLES: 19,
    POINTS: 20,
    COLOR_BUFFER_BIT: 21,
    BLEND: 22,
    ONE: 23,
    ONE_MINUS_SRC_ALPHA: 24,
    STENCIL_TEST: 25,
    STENCIL_BUFFER_BIT: 26,
    EQUAL: 27,
    ALWAYS: 28,
    KEEP: 29,
    INCR: 30,
    REPLACE: 31,
    createShader: (type) => ({ id: ++id, type }),
    shaderSource(shader, source) { calls.shaderSources.push({ type: shader.type, source }); },
    compileShader() {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader() {},
    createProgram: () => ({ id: ++id }),
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram() { calls.deleteProgram += 1; },
    createVertexArray: () => ({ id: ++id }),
    createBuffer: () => ({ id: ++id }),
    bindVertexArray() {},
    bindBuffer() {},
    bufferData(_target, values, usage) { calls.bufferData.push({ values: [...values], usage }); },
    getAttribLocation: () => 0,
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    getUniformLocation: (_program, name) => ({ name }),
    createTexture: () => ({ id: ++id }),
    bindTexture(_target, texture) { boundTexture = texture; },
    pixelStorei() {},
    texParameteri() {},
    texImage2D(...args) {
      calls.texImage2D += 1;
      if (boundTexture) boundTexture.image = args.at(-1);
    },
    viewport() {},
    clearColor() {},
    clear() {},
    clearStencil() {},
    enable() {},
    disable() {},
    colorMask(...values) { calls.colorMask.push(values); },
    stencilMask() {},
    stencilFunc(func, ref, mask) { calls.stencilFunc.push({ func, ref, mask }); },
    stencilOp() {},
    blendFunc() {},
    useProgram() {},
    activeTexture() {},
    uniform1i() {},
    uniform2fv() {},
    uniform1f(location, value) { calls.uniform1f.push({ name: location.name, value }); },
    drawArrays(mode, first, count) {
      calls.drawArrays.push({ mode, first, count, texture: boundTexture?.image?.url });
    },
    deleteTexture() {},
    deleteBuffer() {},
    deleteVertexArray() {},
  };
}

function rendererWithDecoder(decodeImage) {
  const gl = fakeWebGL2();
  const canvas = fakeWebGLCanvas(gl);
  return {
    renderer: createWebGL2Renderer(canvas, {
      platform: {
        decodeImage,
        devicePixelRatio: () => 1,
        ResizeObserver: null,
        window: null,
      },
    }),
  };
}
