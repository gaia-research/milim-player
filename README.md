# Milim Player

Public, dependency-free browser runtime for compiled Milim character releases.

Version 0.2.0 supports Milim release compatibility majors 1 and 2 through the
unchanged six-method public interface. The authoritative contract is
[docs/player-api.md](docs/player-api.md).

This repository owns only the player API, renderer, lifecycle, validation, and
public-safe test fixtures. Editable Milim art, models, scenes, Studio, compiler,
release assembly, and unpublished production evidence remain in the private
`gaia-research/milim` pipeline.

The initial runtime is under review through a focused draft pull request. Its
source was extracted from the frozen Sol player lane at
`f429da50abf3df3bb9079eb2b6f57ad9b7694fcd` without private art, models,
scenes, Studio, compiler, or release evidence.

Each compiled release has one `release.json`. Its `files[]` inventory is the
runtime resource allowlist; there is no second manifest. See
[PROVENANCE.md](PROVENANCE.md) for the public extraction and licensing scope.

Run the dependency-free unit suite with `npm test`. Compiled-release
compatibility remains an integration gate in the private pipeline and the Gaia
Research website; it is deliberately not coupled to private fixtures here.

## License

Milim Player is licensed under the [Apache License 2.0](LICENSE). Copyright
2026 Marcus Rafael B. Tiongson.

The license covers this runtime source only. It does not grant rights to Milim
character art, model and scene packs, Gaia Research branding, or private
production-pipeline materials.
