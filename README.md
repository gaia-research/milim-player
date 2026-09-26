# Milim Player

> **Prototype/reference runtime.** Production Milim is moving to **Rive** under
> [gaia-research/milim#16](https://github.com/gaia-research/milim/issues/16).
> This repository is retained for the semantic API, lifecycle, renderer, and
> production lessons it proved. It is no longer the required production runtime.

Milim Player is a public, dependency-free browser-runtime experiment created
during the first Milim pipeline.

Version 0.3.1 supports Milim release compatibility majors 1 and 2 through the
seven-method public interface: the six frozen v0.2.0 methods plus
`setSceneRunning`, which controls the background scene's independent lifecycle
and animation clock. The authoritative historical contract remains in
[docs/player-api.md](docs/player-api.md).

## What remains valuable

The reboot should selectively reuse the product ideas that survived contact
with real implementation:

- a small semantic character API instead of website code knowing rig internals
- durable expression / gesture names
- clean lifecycle and destroy semantics
- offscreen and visibility suspension
- reduced-motion and static fallbacks
- responsive browser acceptance
- explicit production provenance

Those ideas can sit over the official Rive runtime without Gaia owning meshes,
deformers, shaders, physics, or a custom model format.

## What not to do

Do not extend this repository into a competing Rive/Live2D engine merely because
the prototype already contains renderer code. New custom-runtime work should
require a concrete production need that the Rive stack cannot reasonably meet.

The historical source, tests, and branches stay available for archaeology and
selective extraction.

## Current production direction

The durable agent brief lives in the private Milim repository:

`docs/MILIM-ALIVE-SHIPPING-BRIEF.md`

Production character authoring uses Rive CLI/RML and, where useful, the official
Rive desktop MCP/editor. The Gaia Research website should consume an official
Rive runtime behind a thin semantic adapter.

## Historical API

The old website imported one release entry module and used the controller
documented in [docs/player-api.md](docs/player-api.md). That interface remains a
useful reference for naming and behavior, not a compatibility requirement for
the Rive implementation.

Run the historical dependency-free unit suite with `npm test`.

## License

Milim Player is licensed under the [Apache License 2.0](LICENSE). Copyright
2026 Marcus Rafael B. Tiongson.

The license covers this runtime source only. It does not grant rights to Milim
character art, model and scene packs, Gaia Research branding, or private
production-pipeline materials.
