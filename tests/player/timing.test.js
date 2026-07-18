import assert from "node:assert/strict";
import test from "node:test";

import { createMilimCore } from "../../player/core.js";
import { mountMilimWithRuntime } from "../../player/mount.js";
import {
  fakeCanvas,
  modelFixture,
  productionModelFixture,
  productionReleaseFixture,
  productionRuntimeFixture,
  releaseFixture,
} from "./helpers.js";

test("production expressions blend semantic channels and part opacity at authored timing", async () => {
  const fixture = productionRuntimeFixture();
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);
  await Promise.resolve();
  controller.set({ expression: "smile" });

  fixture.scheduler.frame(0);
  fixture.scheduler.frame(50);
  const frame = fixture.renderer.draws.at(-1);

  assert.ok(Math.abs(frame.channels["head.turn"] - 0.125) < 1e-12);
  assert.equal(frame.partOpacities["face-smile"], 0.5);
  controller.destroy();
});

test("rapid production expression replacement continues from the currently blended semantic state", () => {
  const core = createMilimCore({
    model: productionModelFixture(),
    release: productionReleaseFixture(),
  });
  core.setReady();
  core.api.set({ expression: "smile" });
  const before = core.advance(40);
  core.api.set({ expression: "smirk" });

  const interrupted = core.frame();
  assert.equal(interrupted.channels["head.turn"], before.channels["head.turn"]);
  assert.equal(interrupted.partOpacities["face-smile"], before.partOpacities["face-smile"]);
  const crossing = core.advance(40);
  assert.ok(Math.abs(crossing.channels["head.turn"] - -0.02) < 1e-12);
  assert.ok(Math.abs(crossing.partOpacities["face-smile"] - 0.44) < 1e-12);
  core.api.destroy();
});

test("production motions animate authored replacement-part visibility", async () => {
  const fixture = productionRuntimeFixture();
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);
  await Promise.resolve();
  controller.perform("greet");

  fixture.scheduler.frame(0);
  fixture.scheduler.frame(100);
  const frame = fixture.renderer.draws.at(-1);

  assert.equal(frame.partOpacities["pose-neutral"], 0);
  assert.equal(frame.partOpacities["pose-hero"], 1);
  assert.deepEqual(frame.motionPartOpacities, { "pose-neutral": 0, "pose-hero": 1 });
  controller.destroy();
});

test("production motion return crossfades replacement parts back to the durable appearance pack", () => {
  const core = createMilimCore({
    model: productionModelFixture(),
    release: productionReleaseFixture(),
  });
  core.setReady();
  core.api.perform("greet");
  core.advance(500);

  const returning = core.advance(50);

  assert.equal(returning.partOpacities["pose-neutral"], 0.5);
  assert.equal(returning.partOpacities["pose-hero"], 0.5);
  core.api.destroy();
});

test("interrupting a production motion crossfades from the sampled composed channels and part visibility", async () => {
  const core = createMilimCore({
    model: productionModelFixture(),
    release: productionReleaseFixture(),
  });
  core.setReady();
  const greet = core.api.perform("greet");
  const before = core.advance(250);
  const point = core.api.perform("point");

  assert.deepEqual(await greet, { status: "interrupted" });
  const interrupted = core.frame();
  assert.equal(interrupted.channels["head.turn"], before.channels["head.turn"]);
  assert.equal(interrupted.partOpacities["pose-neutral"], before.partOpacities["pose-neutral"]);
  assert.equal(interrupted.partOpacities["pose-hero"], before.partOpacities["pose-hero"]);

  const crossing = core.advance(25);
  assert.ok(crossing.channels["head.turn"] < before.channels["head.turn"]);
  assert.ok(crossing.channels["head.turn"] > -0.05);
  assert.ok(crossing.partOpacities["pose-neutral"] > 0);
  assert.ok(crossing.partOpacities["pose-neutral"] < 0.75);
  core.advance(325);
  assert.deepEqual(await point, { status: "completed" });
});

test("production composition publishes fixed-step spring outputs after motion channels", () => {
  const core = createMilimCore({
    model: productionModelFixture(),
    release: productionReleaseFixture(),
  });
  core.setReady();
  core.api.perform("greet");

  const frame = core.advance(100);

  assert.ok(frame.channels["head.turn"] > 0);
  assert.ok(frame.channels["hair.sway"] > 0);
  assert.ok(frame.channels["hair.sway"] <= 1);
  core.api.destroy();
});

test("production spring state freezes while paused and resumes without hidden-time accumulation", () => {
  const core = createMilimCore({
    model: productionModelFixture(),
    release: productionReleaseFixture(),
  });
  core.setReady();
  core.api.perform("greet");
  const beforePause = core.advance(100).channels["hair.sway"];

  core.api.setRunning(false);
  const whilePaused = core.advance(10_000).channels["hair.sway"];
  core.api.setRunning(true);
  const afterResume = core.advance(100).channels["hair.sway"];

  assert.equal(whilePaused, beforePause);
  assert.ok(afterResume > whilePaused);
  core.api.destroy();
});

test("reduced-motion production composition keeps integrated physics neutral", () => {
  const core = createMilimCore({
    model: productionModelFixture(),
    release: productionReleaseFixture(),
    reducedMotion: true,
  });
  core.setReady();
  core.api.drive({ head: { x: 1 } });

  assert.equal(core.advance(10_000).channels["hair.sway"], 0);
  core.api.destroy();
});

test("calls made before decode readiness apply in call order once ready", async () => {
  const core = coreFixture();
  const before = core.frame();

  core.api.set({ pose: "hero" });
  core.api.drive({ head: { x: 0.25 } });
  const motion = core.api.perform("greet");
  core.api.set({ expression: "smile" });

  assert.equal(before.appearance.pose, "neutral");
  assert.equal(core.frame().appearance.pose, "neutral");
  core.setReady();
  const after = core.frame();
  assert.equal(after.appearance.pose, "hero");
  assert.equal(after.expression, "smile");
  assert.equal(after.head.x, 0.25);

  core.advance(600);
  assert.deepEqual(await motion, { status: "completed" });
});

test("composition applies drive, idle, expression, one-shot, and secondary response in frozen order", () => {
  const model = modelFixture({
    motions: [
      { id: "idle", durationMs: 1000, loop: true, tracks: { "head.x": [0.4] }, returnMs: 0 },
      { id: "greet", durationMs: 500, loop: false, tracks: { "head.x": [0.8] }, returnMs: 100 },
      { id: "point", durationMs: 300, loop: false, tracks: {}, returnMs: 50 },
    ],
  });
  const core = coreFixture(model);
  core.setReady();
  core.api.drive({ head: { x: 0.2 } });
  core.api.set({ expression: "smile" });
  core.api.perform("greet");

  const frame = core.advance(250);
  assert.equal(frame.head.x, 0.8, "one-shot overrides idle, which overrides drive");
  assert.equal(frame.expressionTexture, "smile");
  assert.ok(Math.abs(frame.secondary.hairSway - 0.144) < Number.EPSILON, "secondary response sees the composed head value");
});

test("expression blend-in exposes in-progress semantic opacity", () => {
  const core = coreFixture();
  core.setReady();
  core.api.set({ expression: "smile" });

  const frame = core.advance(50);
  assert.equal(frame.expressionTexture, "smile");
  assert.deepEqual(frame.expressionLayers, [
    { expression: "smile", texture: "smile", opacity: 0.5 },
  ]);
});

test("expression crossfade completes at the authored timing", () => {
  const core = coreFixture();
  core.setReady();
  core.api.set({ expression: "smile" });

  const frame = core.advance(100);
  assert.equal(frame.expressionTexture, "smile");
  assert.deepEqual(frame.expressionLayers, [
    { expression: "smile", texture: "smile", opacity: 1 },
  ]);
});

test("rapid expression replacement preserves current opacity and interrupts deterministically", () => {
  const baseModel = modelFixture();
  const model = modelFixture({
    textures: [...baseModel.textures, { id: "focus", url: "./focus.png" }],
    expressions: [
      { id: "neutral", texture: "base", blendInMs: 0, blendOutMs: 0, reset: "neutral" },
      { id: "smile", texture: "smile", blendInMs: 100, blendOutMs: 100, reset: "neutral" },
      { id: "focus", texture: "focus", blendInMs: 200, blendOutMs: 80, reset: "neutral" },
    ],
  });
  const core = coreFixture(model);
  core.setReady();
  core.api.set({ expression: "smile" });
  core.advance(40);

  core.api.set({ expression: "focus" });
  assert.deepEqual(core.frame().expressionLayers, [
    { expression: "smile", texture: "smile", opacity: 0.4 },
  ]);

  const frame = core.advance(40);
  assert.equal(frame.expressionTexture, "focus");
  assert.equal(frame.expressionLayers[0].expression, "smile");
  assert.ok(Math.abs(frame.expressionLayers[0].opacity - 0.24) < 1e-12);
  assert.deepEqual(frame.expressionLayers[1], {
    expression: "focus",
    texture: "focus",
    opacity: 0.2,
  });
});

test("resetting to neutral uses the outgoing expression blend-out", () => {
  const core = coreFixture();
  core.setReady();
  core.api.set({ expression: "smile" });
  core.advance(100);

  core.api.set({ expression: "neutral" });
  const frame = core.advance(50);
  assert.equal(frame.expression, "neutral");
  assert.equal(frame.expressionTexture, "base");
  assert.deepEqual(frame.expressionLayers, [
    { expression: "smile", texture: "smile", opacity: 0.5 },
    { expression: "neutral", texture: "base", opacity: 1 },
  ]);
});

test("expression timing freezes while paused and resolves immediately in reduced motion", () => {
  const core = coreFixture();
  core.setReady();
  core.api.set({ expression: "smile" });
  core.advance(40);
  core.api.setRunning(false);
  core.advance(5_000);
  assert.deepEqual(core.frame().expressionLayers, [
    { expression: "smile", texture: "smile", opacity: 0.4 },
  ]);
  core.api.setRunning(true);
  assert.equal(core.advance(60).expressionLayers[0].opacity, 1);

  const reduced = createMilimCore({
    model: modelFixture(),
    release: releaseFixture(),
    reducedMotion: true,
  });
  reduced.setReady();
  reduced.api.set({ expression: "smile" });
  assert.deepEqual(reduced.frame().expressionLayers, [
    { expression: "smile", texture: "smile", opacity: 1 },
  ]);
});

test("starting another one-shot interrupts the first and completion includes return-to-idle time", async () => {
  const core = coreFixture();
  core.setReady();
  const first = core.api.perform("greet");
  const second = core.api.perform("point");

  assert.deepEqual(await first, { status: "interrupted" });
  core.advance(349);
  let settled = false;
  second.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  core.advance(1);
  assert.deepEqual(await second, { status: "completed" });
});

test("pausing freezes idle and motion clocks and resuming does not accumulate hidden time", async () => {
  const core = coreFixture();
  core.setReady();
  const motion = core.api.perform("greet");
  core.advance(200);
  const pausedAt = core.frame().clockMs;
  core.api.setRunning(false);
  core.advance(5_000);

  assert.equal(core.frame().clockMs, pausedAt);
  core.api.setRunning(true);
  core.advance(399);
  let settled = false;
  motion.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  core.advance(1);
  assert.deepEqual(await motion, { status: "completed" });
});

test("destroy interrupts a queued or active motion exactly once", async () => {
  const queued = coreFixture();
  const queuedMotion = queued.api.perform("greet");
  queued.api.destroy();
  queued.api.destroy();
  assert.deepEqual(await queuedMotion, { status: "interrupted" });

  const active = coreFixture();
  active.setReady();
  const activeMotion = active.api.perform("point");
  active.api.destroy();
  assert.deepEqual(await activeMotion, { status: "interrupted" });
});

test("unsupported semantic motion rejects with the stable motion error", async () => {
  const core = coreFixture();
  core.setReady();
  await assert.rejects(core.api.perform("dance"), {
    code: "MILIM_UNSUPPORTED_MOTION",
    detail: { motion: "dance" },
  });
});

test("a normalized top-level motion texture selects the flattened motion sprite", () => {
  const model = modelFixture({
    textures: [
      { id: "base", url: "./base.png" },
      { id: "greet-sprite", url: "./greet.png" },
    ],
    motions: [
      { id: "idle-look", durationMs: 1000, loop: true, tracks: { "head.turn": [[0, 0.4], [1000, 0.4]] }, returnMs: 0 },
      { id: "greet", texture: "greet-sprite", durationMs: 500, loop: false, tracks: { "head.turn": [[0, 0.8], [500, 0.8]] }, returnMs: 100 },
      { id: "point", durationMs: 300, loop: false, tracks: {}, returnMs: 50 },
    ],
    channels: ["head.turn", "eyes.look.x", "mouth.open"],
  });
  const core = coreFixture(model);
  core.setReady();
  core.api.perform("greet");
  const frame = core.advance(250);

  assert.equal(frame.head.x, 0.8);
  assert.equal(frame.motionTexture, "greet-sprite");
  assert.equal(frame.motionOpacity, 1);
});

test("interrupting a textured one-shot selects the replacement motion texture", async () => {
  const model = modelFixture({
    textures: [
      { id: "base", url: "./base.png" },
      { id: "greet-sprite", url: "./greet.png" },
      { id: "point-sprite", url: "./point.png" },
    ],
    motions: [
      { id: "idle-look", durationMs: 1000, loop: true, tracks: {}, returnMs: 0 },
      { id: "greet", texture: "greet-sprite", durationMs: 500, loop: false, tracks: {}, returnMs: 100 },
      { id: "point", texture: "point-sprite", durationMs: 300, loop: false, tracks: {}, returnMs: 50 },
    ],
  });
  const core = coreFixture(model);
  core.setReady();
  const greet = core.api.perform("greet");
  assert.equal(core.frame().motionTexture, "greet-sprite");

  const point = core.api.perform("point");
  assert.deepEqual(await greet, { status: "interrupted" });
  assert.equal(core.frame().motionTexture, "point-sprite");
  core.advance(350);
  assert.deepEqual(await point, { status: "completed" });
});

test("a motion return crossfades to the current expression and idle channels", async () => {
  const model = modelFixture({
    textures: [
      { id: "base", url: "./base.png" },
      { id: "smile", url: "./smile.png" },
      { id: "greet-sprite", url: "./greet.png" },
    ],
    motions: [
      { id: "idle-look", durationMs: 1000, loop: true, tracks: { "head.turn": [[0, 0.2], [1000, 0.2]] }, returnMs: 0 },
      { id: "greet", texture: "greet-sprite", durationMs: 500, loop: false, tracks: { "head.turn": [[0, 0.8], [500, 0.8]] }, returnMs: 100 },
      { id: "point", durationMs: 300, loop: false, tracks: {}, returnMs: 50 },
    ],
    channels: ["head.turn"],
  });
  const core = coreFixture(model);
  core.setReady();
  core.api.set({ expression: "smile" });
  const greet = core.api.perform("greet");
  core.advance(500);

  const returning = core.advance(50);
  assert.equal(returning.expressionTexture, "smile");
  assert.equal(returning.motionTexture, "greet-sprite");
  assert.equal(returning.motionOpacity, 0.5);
  assert.equal(returning.head.x, 0.5);

  const returned = core.advance(50);
  assert.deepEqual(await greet, { status: "completed" });
  assert.equal(returned.expressionTexture, "smile");
  assert.equal(returned.motionTexture, null);
  assert.equal(returned.motionOpacity, 0);
  assert.equal(returned.head.x, 0.2);
});

function coreFixture(model = modelFixture()) {
  return createMilimCore({ model, release: releaseFixture() });
}
