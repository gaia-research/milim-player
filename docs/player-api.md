# Milim Player API v0.2.0

This document is the authoritative public API contract for Milim Player
v0.2.0. The exported interface remains the frozen six-method interface: one
`mountMilim` factory and the five controller methods documented below.

The website imports exactly one release entry module and calls one factory:

```js
const milim = await mountMilim(canvas, {
  src: "/milim/releases/milim-web-0.2.0/release.json",
  reducedMotion: false,
  onStatus(event) {}
});
```

`mountMilim(canvas, options)` resolves only after the manifest, selected model,
selected scene, and minimum render resources are valid. Calls made through the
returned controller while assets finish decoding are queued in call order.

## Release compatibility and allowlist

Player v0.2.0 supports release compatibility majors `1` and `2`. A release's
model and scenes must use a `formatVersion` equal to its declared
`compatibility.major`; other majors fail with `MILIM_RELEASE_INCOMPATIBLE`.

`release.json` is the single runtime manifest. Its `files[]` inventory is the
release allowlist: the player entry, model, scene documents, fallbacks, model
textures, and scene resources used at runtime must resolve inside the release
directory and appear in that inventory. `release.json` itself must not appear
in `files[]`. No second manifest or public-repository commit identifier is
required at runtime.

## Controller

```ts
type MilimController = {
  set(state: Partial<DurableState>): Result<DurableState>;
  drive(controls: Partial<LiveControls>): Result<LiveControls>;
  perform(motion: "greet" | "point"): Promise<MotionResult>;
  setRunning(running: boolean): void;
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

`setRunning(false)` cancels future animation-frame work and pauses scene effects,
idle, blink, and motion clocks. Resuming does not accumulate hidden elapsed time.
`destroy()` is idempotent, releases resources/listeners, and settles an active
motion as interrupted.

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
