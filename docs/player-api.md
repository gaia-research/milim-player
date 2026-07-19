# Milim Player API v0.3.0

This document is the authoritative public API contract for Milim Player
v0.3.0. The exported interface is one `mountMilim` factory and the six
controller methods documented below: the five frozen v0.2.0 methods plus
`setSceneRunning`, which gives the background scene an independent lifecycle
and animation clock.

The website imports exactly one release entry module and calls one factory:

```js
const milim = await mountMilim(canvas, {
  src: "/milim/releases/milim-web-0.3.0/release.json",
  reducedMotion: false,
  onStatus(event) {}
});
```

`mountMilim(canvas, options)` resolves only after the manifest, selected model,
selected scene, and minimum render resources are valid. Calls made through the
returned controller while assets finish decoding are queued in call order.

## Release compatibility and allowlist

Player v0.3.0 supports release compatibility majors `1` and `2`. A release's
model and scenes must use a `formatVersion` equal to its declared
`compatibility.major`; other majors fail with `MILIM_RELEASE_INCOMPATIBLE`.

Every release declares its public runtime provenance in `player`:

```json
{
  "repository": "gaia-research/milim-player",
  "version": "0.3.0",
  "commit": "<full lowercase 40-character commit>",
  "entry": "./player/index.js",
  "license": "Apache-2.0"
}
```

`version` is a semantic version and `entry` must be a safe release-relative
path. The generic public runtime validates this identity and shape but does not
hardcode one current commit; release assembly and the website own the exact
commit lock for each published release.

`release.json` is the single runtime manifest. Its `files[]` inventory is the
release allowlist: the player entry, model, scene documents, fallbacks, model
textures, and scene resources used at runtime must resolve inside the release
directory and appear in that inventory. `release.json` itself must not appear
in `files[]`. No second manifest is required at runtime.

## Controller

```ts
type MilimController = {
  set(state: Partial<DurableState>): Result<DurableState>;
  drive(controls: Partial<LiveControls>): Result<LiveControls>;
  perform(motion: "greet" | "point"): Promise<MotionResult>;
  setRunning(running: boolean): void;
  setSceneRunning(running: boolean): void;
  destroy(): void;
};
```

### `set(partial)`

Durable keys are `expression`, `hair`, `outfit`, `pose`, and `scene`. The call is
atomic: an unsupported value returns `{ ok: false, error }` and preserves the
last valid state. Scene changes crossfade inside the player.

### `drive(partial)`

Live controls are normalized and clamped:

- `gaze: { x, y }` in `[-1, 1]`;
- `head: { x, y, z }` in `[-1, 1]`;
- `mouthOpen` in `[0, 1]`.

Unknown controls return a structured error. Reduced-motion mode accepts calls
but resolves to static neutral controls.

### `perform(name)`

Only semantic one-shot motions are public. Starting a second motion interrupts
the first, whose promise resolves `{ status: "interrupted" }`. Completed motions
resolve `{ status: "completed" }`. A motion always blends back to current idle.

### Lifecycle

The character and the background scene keep separate animation clocks.
`frame.clockMs` drives idle, blink, expressions, motion, and physics;
`frame.sceneClockMs` drives scene layers, scene crossfades, light sweeps, and
particles.

`setRunning(false)` pauses the character clock. `setSceneRunning(false)` pauses
the scene clock. Until the first `setSceneRunning` call the scene follows the
character running state, so callers written against v0.2.0 keep their exact
single-clock behavior. After the first `setSceneRunning` call the two
lifecycles are independent: pausing either rig neither stops nor jumps the
other, and resuming a rig never accumulates hidden elapsed time.
Animation-frame work is scheduled only while at least one rig is running.
Document visibility loss and WebGL context loss suspend both rigs; each resumes
from its own paused clock.

`destroy()` is idempotent, releases resources/listeners, stops both clocks, and
settles an active motion as interrupted.

## Structured errors

Errors have `{ code, message, detail? }`. Stable v1 codes are:

- `MILIM_RELEASE_LOAD_FAILED`
- `MILIM_RELEASE_INCOMPATIBLE`
- `MILIM_MODEL_INVALID`
- `MILIM_SCENE_INVALID`
- `MILIM_RENDERER_UNAVAILABLE`
- `MILIM_UNSUPPORTED_STATE`
- `MILIM_UNSUPPORTED_CONTROL`
- `MILIM_UNSUPPORTED_MOTION`
- `MILIM_DESTROYED`

The adapter may show the static fallback for load, compatibility, model, scene,
or renderer errors. It must not inspect renderer internals.

## Composition order

Every frame resolves: neutral -> durable appearance/scene -> live drive -> idle
and blink -> expression -> one-shot motion -> secondary response -> final draw.
Website code cannot change this precedence.
