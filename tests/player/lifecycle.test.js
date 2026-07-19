import assert from "node:assert/strict";
import test from "node:test";

import { mountMilimWithRuntime } from "../../player/mount.js";
import {
  createDeferred,
  createScheduler,
  fakeCanvas,
  productionRuntimeFixture,
  runtimeFixture,
} from "./helpers.js";

test("setRunning suspends animation frames and resume drops hidden elapsed time", async () => {
  const scheduler = createScheduler();
  const fixture = runtimeFixture({ scheduler });
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);
  await Promise.resolve();

  assert.equal(scheduler.pending, 1);
  scheduler.frame(100);
  scheduler.frame(116);
  assert.equal(fixture.renderer.draws.at(-1).clockMs, 16);

  controller.setRunning(false);
  assert.equal(scheduler.pending, 0);
  const drawsWhilePaused = fixture.renderer.draws.length;
  scheduler.frame(10_000);
  assert.equal(fixture.renderer.draws.length, drawsWhilePaused);

  controller.setRunning(true);
  assert.equal(scheduler.pending, 1);
  scheduler.frame(10_000);
  assert.equal(fixture.renderer.draws.at(-1).clockMs, 16);
  scheduler.frame(10_016);
  assert.equal(fixture.renderer.draws.at(-1).clockMs, 32);
  controller.destroy();
});

test("pre-decode calls stay queued while minimum-ready frames render, then flush in order", async () => {
  const decoded = createDeferred();
  const scheduler = createScheduler();
  const fixture = runtimeFixture({
    scheduler,
    renderer: undefined,
  });
  fixture.renderer.initialize = async function initialize(model, scene) {
    this.model = model;
    this.scene = scene;
    return { allReady: decoded.promise };
  };
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);
  controller.set({ pose: "hero" });
  controller.drive({ gaze: { x: 1 } });
  scheduler.frame(0);
  assert.equal(fixture.renderer.draws.at(-1).appearance.pose, "neutral");
  assert.equal(fixture.renderer.draws.at(-1).gaze.x, 0);

  decoded.resolve();
  await decoded.promise;
  await Promise.resolve();
  scheduler.frame(16);
  assert.equal(fixture.renderer.draws.at(-1).appearance.pose, "hero");
  assert.equal(fixture.renderer.draws.at(-1).gaze.x, 1);
  controller.destroy();
});

test("context loss and document inactivity suspend frames until active again", async () => {
  const scheduler = createScheduler();
  const fixture = runtimeFixture({ scheduler });
  const visibility = fakeVisibility();
  let rendererHooks;
  fixture.runtime.visibility = visibility;
  fixture.runtime.createRenderer = (_canvas, hooks) => {
    rendererHooks = hooks;
    return fixture.renderer;
  };
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);
  await Promise.resolve();
  scheduler.frame(100);
  scheduler.frame(116);
  const clock = fixture.renderer.draws.at(-1).clockMs;

  rendererHooks.onContextState(false);
  assert.equal(scheduler.pending, 0);
  rendererHooks.onContextState(true);
  scheduler.frame(5_000);
  assert.equal(fixture.renderer.draws.at(-1).clockMs, clock);

  visibility.setHidden(true);
  assert.equal(scheduler.pending, 0);
  visibility.setHidden(false);
  scheduler.frame(9_000);
  assert.equal(fixture.renderer.draws.at(-1).clockMs, clock);

  controller.destroy();
  assert.equal(visibility.listenerCount(), 0);
});

test("production physics remains frozen across context loss and resumes from the restored frame", async () => {
  const scheduler = createScheduler();
  const fixture = productionRuntimeFixture({ scheduler });
  let rendererHooks;
  fixture.runtime.createRenderer = (_canvas, hooks) => {
    rendererHooks = hooks;
    return fixture.renderer;
  };
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);
  await Promise.resolve();
  controller.perform("greet");
  scheduler.frame(0);
  scheduler.frame(100);
  const beforeLoss = fixture.renderer.draws.at(-1).channels["hair.sway"];

  rendererHooks.onContextState(false);
  rendererHooks.onContextState(true);
  scheduler.frame(10_000);
  const restored = fixture.renderer.draws.at(-1).channels["hair.sway"];

  assert.equal(restored, beforeLoss);
  scheduler.frame(10_100);
  assert.notEqual(fixture.renderer.draws.at(-1).channels["hair.sway"], restored);
  controller.destroy();
});

function fakeVisibility() {
  let listener;
  return {
    hidden: false,
    addEventListener(type, next) { if (type === "visibilitychange") listener = next; },
    removeEventListener(type, next) { if (type === "visibilitychange" && listener === next) listener = undefined; },
    setHidden(hidden) { this.hidden = hidden; listener?.(); },
    listenerCount() { return listener ? 1 : 0; },
  };
}

test("scene clock advances while the character is paused and neither clock jumps on resume", async () => {
  const scheduler = createScheduler();
  const fixture = runtimeFixture({ scheduler });
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);
  await Promise.resolve();
  scheduler.frame(100);
  scheduler.frame(116);
  assert.equal(fixture.renderer.draws.at(-1).clockMs, 16);
  assert.equal(fixture.renderer.draws.at(-1).sceneClockMs, 16);

  controller.setSceneRunning(true);
  controller.setRunning(false);
  assert.equal(scheduler.pending, 1);
  scheduler.frame(1_000);
  scheduler.frame(1_016);
  assert.equal(fixture.renderer.draws.at(-1).clockMs, 16);
  assert.equal(fixture.renderer.draws.at(-1).sceneClockMs, 32);

  controller.setRunning(true);
  scheduler.frame(5_000);
  scheduler.frame(5_016);
  assert.equal(fixture.renderer.draws.at(-1).clockMs, 32);
  assert.equal(fixture.renderer.draws.at(-1).sceneClockMs, 48);
  controller.destroy();
});

test("character clock advances while the scene is paused and the scene resumes without a jump", async () => {
  const scheduler = createScheduler();
  const fixture = runtimeFixture({ scheduler });
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);
  await Promise.resolve();
  scheduler.frame(100);
  scheduler.frame(116);

  controller.setSceneRunning(false);
  assert.equal(scheduler.pending, 1);
  scheduler.frame(1_000);
  scheduler.frame(1_016);
  assert.equal(fixture.renderer.draws.at(-1).clockMs, 32);
  assert.equal(fixture.renderer.draws.at(-1).sceneClockMs, 16);

  controller.setSceneRunning(true);
  scheduler.frame(2_000);
  scheduler.frame(2_016);
  assert.equal(fixture.renderer.draws.at(-1).clockMs, 48);
  assert.equal(fixture.renderer.draws.at(-1).sceneClockMs, 32);
  controller.destroy();
});

test("scene follows setRunning until the first setSceneRunning call", async () => {
  const scheduler = createScheduler();
  const fixture = runtimeFixture({ scheduler });
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);
  await Promise.resolve();
  scheduler.frame(100);
  scheduler.frame(116);

  controller.setRunning(false);
  assert.equal(scheduler.pending, 0);
  scheduler.frame(10_000);
  controller.setRunning(true);
  scheduler.frame(20_000);
  scheduler.frame(20_016);
  assert.equal(fixture.renderer.draws.at(-1).clockMs, 32);
  assert.equal(fixture.renderer.draws.at(-1).sceneClockMs, 32);
  controller.destroy();
});

test("destroy stops both clocks and scene lifecycle calls become no-ops", async () => {
  const scheduler = createScheduler();
  const fixture = runtimeFixture({ scheduler });
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);
  await Promise.resolve();
  scheduler.frame(0);

  controller.destroy();
  controller.setSceneRunning(true);
  controller.setRunning(true);
  assert.equal(scheduler.pending, 0);
});
