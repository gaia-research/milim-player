import assert from "node:assert/strict";
import test from "node:test";

import { mountMilimWithRuntime } from "../../player/mount.js";
import { fakeCanvas, productionRuntimeFixture, runtimeFixture } from "./helpers.js";

test("set selects production appearance pack IDs atomically through the unchanged durable-state interface", async () => {
  const fixture = productionRuntimeFixture();
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);

  assert.deepEqual(controller.set({ hair: "long", outfit: "formal", pose: "hero" }), {
    ok: true,
    value: {
      expression: "neutral",
      hair: "long",
      outfit: "formal",
      pose: "hero",
      scene: "lab",
    },
  });
  const unsupported = controller.set({ hair: "missing", outfit: "field" });
  assert.equal(unsupported.error.code, "MILIM_UNSUPPORTED_STATE");
  assert.equal(controller.set({ expression: "smile" }).value.hair, "long");
  controller.destroy();
});

test("set accepts supported durable variants and atomically preserves state on failure", async () => {
  const fixture = runtimeFixture();
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);

  assert.deepEqual(controller.set({ hair: "long", outfit: "formal" }), {
    ok: true,
    value: {
      expression: "neutral",
      hair: "long",
      outfit: "formal",
      pose: "neutral",
      scene: "lab",
    },
  });

  const unsupported = controller.set({ hair: "missing", pose: "hero" });
  assert.equal(unsupported.ok, false);
  assert.deepEqual(unsupported.error, {
    code: "MILIM_UNSUPPORTED_STATE",
    message: "Milim state value is unsupported",
    detail: { key: "hair", value: "missing" },
  });

  assert.deepEqual(controller.set({ expression: "smile" }).value, {
    expression: "smile",
    hair: "long",
    outfit: "formal",
    pose: "neutral",
    scene: "lab",
  });
  controller.destroy();
});

test("drive clamps live controls and rejects unknown controls atomically", async () => {
  const fixture = runtimeFixture();
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);

  assert.deepEqual(controller.drive({
    gaze: { x: -5, y: 0.25 },
    head: { x: 2, y: -2, z: 0.5 },
    mouthOpen: 4,
  }), {
    ok: true,
    value: {
      gaze: { x: -1, y: 0.25 },
      head: { x: 1, y: -1, z: 0.5 },
      mouthOpen: 1,
    },
  });

  const unsupported = controller.drive({ gaze: { z: 0.5 }, mouthOpen: 0 });
  assert.deepEqual(unsupported, {
    ok: false,
    error: {
      code: "MILIM_UNSUPPORTED_CONTROL",
      message: "Milim live control is unsupported",
      detail: { key: "gaze.z", value: 0.5 },
    },
  });
  assert.deepEqual(controller.drive({ head: { z: -0.25 } }).value, {
    gaze: { x: -1, y: 0.25 },
    head: { x: 1, y: -1, z: -0.25 },
    mouthOpen: 1,
  });
  controller.destroy();
});

test("reduced motion accepts drive calls but always returns neutral live controls", async () => {
  const fixture = runtimeFixture();
  const controller = await mountMilimWithRuntime(
    fakeCanvas(),
    { src: fixture.releaseURL, reducedMotion: true },
    fixture.runtime,
  );

  assert.deepEqual(controller.drive({ gaze: { x: 1 }, mouthOpen: 1 }).value, {
    gaze: { x: 0, y: 0 },
    head: { x: 0, y: 0, z: 0 },
    mouthOpen: 0,
  });
  assert.deepEqual(await controller.perform("greet"), { status: "completed" });
  controller.destroy();
});

test("destroy is idempotent and subsequent state, control, and motion calls fail stably", async () => {
  const fixture = runtimeFixture();
  const controller = await mountMilimWithRuntime(fakeCanvas(), { src: fixture.releaseURL }, fixture.runtime);
  controller.destroy();
  controller.destroy();

  assert.equal(fixture.renderer.destroyed, true);
  assert.equal(controller.set({ pose: "hero" }).error.code, "MILIM_DESTROYED");
  assert.equal(controller.drive({ mouthOpen: 1 }).error.code, "MILIM_DESTROYED");
  await assert.rejects(controller.perform("greet"), { code: "MILIM_DESTROYED" });
});

test("destroy suppresses decode-completion status emitted by pending resources", async () => {
  let resolveDecode;
  const pendingDecode = new Promise((resolve) => { resolveDecode = resolve; });
  const statuses = [];
  const fixture = runtimeFixture();
  fixture.renderer.initialize = async () => ({ allReady: pendingDecode });
  const controller = await mountMilimWithRuntime(
    fakeCanvas(),
    { src: fixture.releaseURL, onStatus: (status) => statuses.push(status) },
    fixture.runtime,
  );
  controller.destroy();
  resolveDecode();
  await pendingDecode;
  await Promise.resolve();
  assert.equal(statuses.some(({ type }) => type === "decoded"), false);
});
