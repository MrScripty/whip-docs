# Whip Docs python grammar source package

Derived from the exact official source in `source-provenance.json`; upstream MIT
license and author notices are retained. `whip.patch` records Whip-owned changes
and intentional inherited corpus AST updates. Original changed inputs live in
`upstream/`; added Whip AST cases live in `test/corpus/whip-modern.txt`.

Generated C is committed. Cargo compiles that C without npm, Node, network fetch
or generation during application build/startup. `IDENTITY` hashes the complete
`owned-provenance.json` manifest, which binds source, build, corpus, patch and
generated-output hashes. The verifier rejects missing or unrecorded package files.

Use `python3 scripts/verify-owned-grammars.py` from the repository root for offline
verification, or add `--regenerate --cli /path/to/tree-sitter` with the pinned
CLI 0.25.10 to compare fresh output in temporary directories. Generation uses
`tree-sitter generate --abi 15`; Node is a generation-only tool. Qualification and
remaining limits are in `verification/owned-grammars.md`.
