# Milim Player

Public, dependency-free browser runtime for compiled Milim character releases.

This repository owns only the player API, renderer, lifecycle, validation, and
public-safe test fixtures. Editable Milim art, models, scenes, Studio, compiler,
release assembly, and unpublished production evidence remain in the private
`gaia-research/milim` pipeline.

The initial runtime is under review through a focused draft pull request. Its
source was extracted from the frozen Sol player lane at
`f429da50abf3df3bb9079eb2b6f57ad9b7694fcd` without private art, models,
scenes, Studio, compiler, or release evidence.

Run the dependency-free unit suite with `npm test`. Compiled-release
compatibility remains an integration gate in the private pipeline and the Gaia
Research website; it is deliberately not coupled to private fixtures here.

Publication currently grants repository visibility only. A reusable software
license must be selected explicitly before the first supported release.

