import assert from "node:assert/strict";
import test from "node:test";

import { mountMilimWithRuntime } from "../../player/mount.js";
import { loadBundle } from "../../player/load.js";
import {
  fakeCanvas,
  modelFixture,
  productionModelFixture,
  productionReleaseFixture,
  productionSceneFixture,
  releaseFixture,
  runtimeFixture,
  sceneFixture,
} from "./helpers.js";

test("mount accepts a compatibility-2 production bundle and resolves every part texture", async () => {
  const releaseURL = "https://cdn.example/milim/release.json";
  const modelURL = "https://cdn.example/milim/models/milim/model.json";
  const sceneURL = "https://cdn.example/milim/scenes/lab/scene.json";
  const responses = new Map([
    [releaseURL, productionReleaseFixture()],
    [modelURL, productionModelFixture()],
    [sceneURL, productionSceneFixture()],
  ]);
  let initialized;
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: releaseURL }, {
    baseURL: "https://website.example/",
    async fetch(url) {
      const body = responses.get(url);
      return body
        ? { ok: true, json: async () => structuredClone(body) }
        : { ok: false, status: 404, json: async () => null };
    },
    createRenderer: () => ({
      async initialize(model, scene) {
        initialized = { model, scene };
        return { allReady: Promise.resolve() };
      },
      draw() {},
      destroy() {},
    }),
    scheduler: idleScheduler(),
  });

  assert.equal(initialized.model.formatVersion, 2);
  assert.equal(initialized.scene.formatVersion, 2);
  assert.ok(initialized.model.textures.every(({ url }) => url.startsWith("https://cdn.example/milim/models/milim/")));
  controller.destroy();
});

test("mount loads the release, model, and default scene relative to each owning JSON", async () => {
  const releaseURL = "https://cdn.example/milim/release.json";
  const modelURL = "https://cdn.example/milim/models/milim/model.json";
  const sceneURL = "https://cdn.example/milim/scenes/lab/scene.json";
  const responses = new Map([
    [releaseURL, releaseFixture()],
    [modelURL, modelFixture()],
    [sceneURL, sceneFixture()],
  ]);
  const requested = [];
  let initialized;

  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: releaseURL }, {
    baseURL: "https://website.example/",
    fetch: async (url) => {
      requested.push(url);
      const body = responses.get(url);
      return body
        ? { ok: true, json: async () => structuredClone(body) }
        : { ok: false, status: 404, json: async () => null };
    },
    createRenderer: () => ({
      async initialize(model, scene) {
        initialized = { model, scene };
        return { allReady: Promise.resolve() };
      },
      draw() {},
      destroy() {},
    }),
    scheduler: idleScheduler(),
  });

  assert.deepEqual(requested, [releaseURL, modelURL, sceneURL]);
  assert.equal(initialized.model.textures[0].url, "https://cdn.example/milim/models/milim/base.png");
  assert.equal(initialized.scene.layers[0].url, "https://cdn.example/milim/scenes/lab/background.png");
  assert.equal(initialized.scene.reducedMotion, "https://cdn.example/milim/scenes/lab/reduced.png");

  controller.destroy();
});

test("unsupported compatibility majors reject before model or scene loading", async () => {
  const fixture = runtimeFixture({ release: { compatibility: { major: 3 } } });

  await assert.rejects(
    mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime),
    {
      code: "MILIM_RELEASE_INCOMPATIBLE",
      detail: { supportedMajors: [1, 2], actualMajor: 3 },
    },
  );
  assert.deepEqual(fixture.requested, [fixture.releaseURL]);
});

test("production model validation rejects a part with an unknown texture", async () => {
  const releaseURL = "https://cdn.example/milim/release.json";
  const modelURL = "https://cdn.example/milim/models/milim/model.json";
  const sceneURL = "https://cdn.example/milim/scenes/lab/scene.json";
  const model = productionModelFixture();
  model.parts[0].texture = "missing-texture";
  const responses = new Map([
    [releaseURL, productionReleaseFixture()],
    [modelURL, model],
    [sceneURL, productionSceneFixture()],
  ]);

  await assertMilimReject(loadBundle(releaseURL, {
    baseURL: "https://website.example/",
    fetch: async (url) => {
      const body = responses.get(url);
      return body
        ? { ok: true, json: async () => structuredClone(body) }
        : { ok: false, status: 404, json: async () => null };
    },
  }), "MILIM_MODEL_INVALID", "$.parts[0].texture");
});

test("production model validation rejects warp keyforms that do not match their part mesh", async () => {
  const releaseURL = "https://cdn.example/milim/release.json";
  const modelURL = "https://cdn.example/milim/models/milim/model.json";
  const sceneURL = "https://cdn.example/milim/scenes/lab/scene.json";
  const model = productionModelFixture();
  const offsets = (count) => Array.from({ length: count }, () => [0, 0]);
  model.deformers[0] = {
    id: "head-transform",
    kind: "warp",
    channel: "head.turn",
    parts: ["base-part"],
    keyforms: [
      { at: -1, offsets: offsets(4) },
      { at: 0, offsets: offsets(4) },
      { at: 1, offsets: offsets(5) },
    ],
  };
  const responses = new Map([
    [releaseURL, productionReleaseFixture()],
    [modelURL, model],
    [sceneURL, productionSceneFixture()],
  ]);

  await assertMilimReject(loadBundle(releaseURL, {
    baseURL: "https://website.example/",
    fetch: async (url) => {
      const body = responses.get(url);
      return body
        ? { ok: true, json: async () => structuredClone(body) }
        : { ok: false, status: 404, json: async () => null };
    },
  }), "MILIM_MODEL_INVALID", "$.deformers[0].keyforms[2].offsets");
});

test("production model validation rejects clockwise mesh triangles", async () => {
  const model = productionModelFixture();
  model.parts[0].mesh.triangles[0] = [0, 2, 1];

  await assertMilimReject(
    loadProductionModel(model),
    "MILIM_MODEL_INVALID",
    "$.parts[0].mesh.triangles[0]",
  );
});

test("production model validation rejects dangling mesh, rig, appearance, mixer, and physics references", async () => {
  const cases = [
    [(model) => { model.parts[0].anchor = "missing-anchor"; }, "$.parts[0].anchor"],
    [(model) => { model.parts[0].mesh.triangles[0][2] = 99; }, "$.parts[0].mesh.triangles[0][2]"],
    [(model) => { model.masks.push({ id: "face-mask", mode: "include", sourcePart: "missing-part" }); }, "$.masks[0].sourcePart"],
    [(model) => { model.parts[0].deformers = ["missing-deformer"]; }, "$.parts[0].deformers[0]"],
    [(model) => { model.deformers[0].channel = "missing.channel"; }, "$.deformers[0].channel"],
    [(model) => { model.deformers[0].parts = ["missing-part"]; }, "$.deformers[0].parts[0]"],
    [(model) => { model.deformers[0].keyforms[1].at = 0.5; }, "$.deformers[0].keyforms"],
    [(model) => { model.appearances.hair[0].parts = ["missing-part"]; }, "$.appearances.hair[0].parts[0]"],
    [(model) => { model.appearances.hair[0].requiredAnchors = ["missing-anchor"]; }, "$.appearances.hair[0].requiredAnchors[0]"],
    [(model) => { model.appearances.hair[0].compatibleExpressions = ["missing-expression"]; }, "$.appearances.hair[0].compatibleExpressions[0]"],
    [(model) => { model.appearances.hair[0].compatiblePoses = ["missing-pose"]; }, "$.appearances.hair[0].compatiblePoses[0]"],
    [(model) => { model.expressions[0].channels["missing.channel"] = 1; }, "$.expressions[0].channels.missing.channel"],
    [(model) => { model.expressions[0].parts["missing-part"] = 1; }, "$.expressions[0].parts.missing-part"],
    [(model) => { model.motions[0].tracks["missing.channel"] = [[0, 0], [1000, 1]]; }, "$.motions[0].tracks.missing.channel"],
    [(model) => { model.motions[0].parts["missing-part"] = [[0, 0], [1000, 1]]; }, "$.motions[0].parts.missing-part"],
    [(model) => { model.physics[0].inputs = ["missing.channel"]; }, "$.physics[0].inputs[0]"],
    [(model) => { model.physics[0].output = "missing.channel"; }, "$.physics[0].output"],
  ];

  for (const [mutate, path] of cases) {
    const model = productionModelFixture();
    mutate(model);
    await assertMilimReject(loadProductionModel(model), "MILIM_MODEL_INVALID", path);
  }
});

test("release transport and JSON failures use MILIM_RELEASE_LOAD_FAILED", async () => {
  const fixture = runtimeFixture();
  fixture.runtime.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(
    mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime),
    { code: "MILIM_RELEASE_LOAD_FAILED" },
  );

  fixture.runtime.fetch = async () => ({ ok: true, json: async () => { throw new SyntaxError("bad JSON"); } });
  await assert.rejects(
    mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime),
    { code: "MILIM_RELEASE_LOAD_FAILED" },
  );
});

test("invalid model and scene documents reject with their owning stable codes", async () => {
  const invalidModel = runtimeFixture();
  invalidModel.responses.set(invalidModel.modelURL, { format: "wrong" });
  await assertMilimReject(
    mountMilimWithRuntime(fakeCanvas(), { src: invalidModel.releaseURL }, invalidModel.runtime),
    "MILIM_MODEL_INVALID",
    "$.formatVersion",
  );

  const invalidScene = runtimeFixture();
  invalidScene.responses.set(invalidScene.sceneURL, sceneFixture({ effects: { particles: 65 } }));
  await assertMilimReject(
    mountMilimWithRuntime(fakeCanvas(), { src: invalidScene.releaseURL }, invalidScene.runtime),
    "MILIM_SCENE_INVALID",
    "$.effects.parallax",
  );
});

test("model and scene asset URLs cannot escape the immutable release directory", async () => {
  const modelEscape = runtimeFixture({ model: { textures: [{ id: "base", url: "../../../../outside.png" }] } });
  await assert.rejects(
    mountMilimWithRuntime(fakeCanvas(), { src: modelEscape.releaseURL }, modelEscape.runtime),
    { code: "MILIM_MODEL_INVALID" },
  );

  const sceneEscape = runtimeFixture({ scene: { layers: [{ id: "background", url: "../../../../outside.png", depth: 0, opacity: 1 }] } });
  await assert.rejects(
    mountMilimWithRuntime(fakeCanvas(), { src: sceneEscape.releaseURL }, sceneEscape.runtime),
    { code: "MILIM_SCENE_INVALID" },
  );
});

test("renderer construction failures use MILIM_RENDERER_UNAVAILABLE", async () => {
  const fixture = runtimeFixture();
  fixture.runtime.createRenderer = () => { throw new Error("WebGL2 missing"); };

  await assert.rejects(
    mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime),
    { code: "MILIM_RENDERER_UNAVAILABLE" },
  );
});

test("missing requestAnimationFrame support is renderer-unavailable and cleans minimum resources", async () => {
  const fixture = runtimeFixture();
  fixture.runtime.scheduler = {};
  await assert.rejects(
    mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime),
    { code: "MILIM_RENDERER_UNAVAILABLE" },
  );
  assert.equal(fixture.renderer.destroyed, true);
});

test("catalog mismatches and broken model references use model or scene invalid errors", async () => {
  const modelMismatch = runtimeFixture({ model: { version: "2.0.0" } });
  await assert.rejects(
    mountMilimWithRuntime(fakeCanvas(), { src: modelMismatch.releaseURL }, modelMismatch.runtime),
    { code: "MILIM_MODEL_INVALID" },
  );

  const brokenExpression = runtimeFixture({
    model: {
      expressions: [{ id: "neutral", texture: "missing", blendInMs: 0, blendOutMs: 0, reset: "neutral" }],
    },
  });
  await assert.rejects(
    mountMilimWithRuntime(fakeCanvas(), { src: brokenExpression.releaseURL }, brokenExpression.runtime),
    { code: "MILIM_MODEL_INVALID" },
  );

  const sceneMismatch = runtimeFixture({ scene: { version: "2.0.0" } });
  await assert.rejects(
    mountMilimWithRuntime(fakeCanvas(), { src: sceneMismatch.releaseURL }, sceneMismatch.runtime),
    { code: "MILIM_SCENE_INVALID" },
  );
});

test("model loading accepts an optional top-level motion texture", async () => {
  const fixture = runtimeFixture();
  fixture.responses.set(fixture.modelURL, modelFixture({
    motions: [
      { id: "idle", durationMs: 1000, loop: true, tracks: { "transform.y": [0, 0.02, 0] }, returnMs: 0 },
      { id: "greet", texture: "smile", durationMs: 500, loop: false, tracks: { "transform.rotation": [0, 0.4] }, returnMs: 100 },
      { id: "point", texture: "base", durationMs: 300, loop: false, tracks: { "transform.x": [0, 0.25] }, returnMs: 50 },
    ],
  }));

  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);
  controller.destroy();
});

test("model loading rejects legacy texture entries inside semantic tracks", async () => {
  const fixture = runtimeFixture();
  fixture.responses.set(fixture.modelURL, modelFixture({
    motions: [
      { id: "idle", durationMs: 1000, loop: true, tracks: {}, returnMs: 0 },
      { id: "greet", durationMs: 500, loop: false, tracks: { texture: "smile" }, returnMs: 100 },
      { id: "point", durationMs: 300, loop: false, tracks: {}, returnMs: 50 },
    ],
  }));

  await assertMilimReject(
    mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime),
    "MILIM_MODEL_INVALID",
    "$.motions[1].tracks.texture",
  );
});

test("model loading rejects a motion texture absent from the texture catalog", async () => {
  const fixture = runtimeFixture();
  fixture.responses.set(fixture.modelURL, modelFixture({
    motions: [
      { id: "idle", durationMs: 1000, loop: true, tracks: {}, returnMs: 0 },
      { id: "greet", texture: "missing", durationMs: 500, loop: false, tracks: {}, returnMs: 100 },
      { id: "point", durationMs: 300, loop: false, tracks: {}, returnMs: 50 },
    ],
  }));

  await assertMilimReject(
    mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime),
    "MILIM_MODEL_INVALID",
    "$.motions[1].texture",
  );
});

test("release documents reject unknown fields through the stable release error", async () => {
  const fixture = runtimeFixture({ release: { extra: true } });
  await assertMilimReject(
    mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime),
    "MILIM_RELEASE_LOAD_FAILED",
    "$.extra",
  );
});

test("release inventory excludes release.json and must list every runtime-known resource", async () => {
  const selfListed = runtimeFixture({
    release: { files: [{ path: "./release.json", bytes: 1, sha256: "a".repeat(64) }] },
  });
  await assert.rejects(
    mountMilimWithRuntime(fakeCanvas(), { src: selfListed.releaseURL }, selfListed.runtime),
    { code: "MILIM_RELEASE_LOAD_FAILED" },
  );

  const complete = releaseFixture();
  const missingModel = runtimeFixture({
    release: { files: complete.files.filter(({ path }) => path !== complete.model.url) },
  });
  await assert.rejects(
    mountMilimWithRuntime(fakeCanvas(), { src: missingModel.releaseURL }, missingModel.runtime),
    { code: "MILIM_RELEASE_LOAD_FAILED" },
  );
  assert.deepEqual(missingModel.requested, [missingModel.releaseURL]);
});

test("a relative release src resolves against the runtime base URL", async () => {
  const fixture = runtimeFixture();
  const controller = await mountMilimWithRuntime(
    fakeCanvas(),
    { src: "./milim/release.json" },
    { ...fixture.runtime, baseURL: "https://cdn.example/" },
  );
  assert.equal(fixture.requested[0], fixture.releaseURL);
  controller.destroy();
});

test("a supported scene change lazily loads its JSON relative to the release and assets relative to that scene", async () => {
  const scenes = [
    { id: "lab", version: "1.0.0", url: "./scenes/lab/scene.json" },
    { id: "halo", version: "1.1.0", url: "./scenes/halo/scene.json" },
  ];
  const fixture = runtimeFixture({ release: { scenes } });
  const haloURL = "https://cdn.example/milim/scenes/halo/scene.json";
  fixture.responses.set(haloURL, sceneFixture({ id: "halo", version: "1.1.0" }));
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);
  await Promise.resolve();

  assert.equal(controller.set({ scene: "halo" }).ok, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.requested.at(-1), haloURL);
  assert.equal(fixture.renderer.scenes[0].id, "halo");
  assert.equal(fixture.renderer.scenes[0].layers[0].url, "https://cdn.example/milim/scenes/halo/background.png");

  const unsupported = controller.set({ scene: "missing" });
  assert.equal(unsupported.error.code, "MILIM_UNSUPPORTED_STATE");
  assert.equal(controller.set({ expression: "smile" }).value.scene, "halo");
  controller.destroy();
});

function idleScheduler() {
  return { request() { return 1; }, cancel() {} };
}

function loadProductionModel(model) {
  const releaseURL = "https://cdn.example/milim/release.json";
  const responses = new Map([
    [releaseURL, productionReleaseFixture()],
    ["https://cdn.example/milim/models/milim/model.json", model],
    ["https://cdn.example/milim/scenes/lab/scene.json", productionSceneFixture()],
  ]);
  return loadBundle(releaseURL, {
    baseURL: "https://website.example/",
    fetch: async (url) => {
      const body = responses.get(url);
      return body
        ? { ok: true, json: async () => structuredClone(body) }
        : { ok: false, status: 404, json: async () => null };
    },
  });
}

async function assertMilimReject(promise, code, path) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    assert.equal(error.detail.path, path);
    return true;
  });
}
