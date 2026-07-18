import assert from "node:assert/strict";
import test from "node:test";

import { createSpringPhysics } from "../../player/physics.js";

test("spring physics produces the same bounded output across equivalent render-frame chunking", () => {
  const definition = {
    id: "hair-spring",
    inputs: ["head.turn"],
    output: "hair.sway",
    mass: 1,
    stiffness: 20,
    damping: 4,
    gravity: 0,
    gain: 1,
    limit: 0.75,
    rest: 0,
  };
  const oneFrame = createSpringPhysics([definition]);
  const twoFrames = createSpringPhysics([definition]);

  const oneOutput = oneFrame.advance(1000 / 60, { "head.turn": 1 });
  twoFrames.advance(1000 / 120, { "head.turn": 1 });
  const twoOutput = twoFrames.advance(1000 / 120, { "head.turn": 1 });

  assert.ok(oneOutput["hair.sway"] > 0);
  assert.ok(oneOutput["hair.sway"] <= 0.75);
  assert.ok(Math.abs(oneOutput["hair.sway"] - twoOutput["hair.sway"]) < 1e-12);
});

test("reduced motion keeps every spring output neutral without accumulating hidden integration", () => {
  const physics = createSpringPhysics([{
    id: "hair-spring",
    inputs: ["head.turn"],
    output: "hair.sway",
    mass: 1,
    stiffness: 20,
    damping: 4,
    gravity: 1,
    gain: 1,
    limit: 1,
    rest: 0.25,
  }], { reducedMotion: true });

  assert.deepEqual(physics.advance(10_000, { "head.turn": 1 }), { "hair.sway": 0 });
  assert.deepEqual(physics.sample(), { "hair.sway": 0 });
});
